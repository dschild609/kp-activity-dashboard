import os
import json
import re
import time
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from google.cloud import firestore
from googleapiclient.discovery import build
from google.oauth2 import service_account

app = FastAPI()

SHEET_ID = "1Hr7xZL9Jf0UV1cFze_CgGwQUZvWSRQGOa22bdUexsvc"
OFFICE_TABS = [
    "ARL", "ATL", "CAR", "DENT", "DUNC", "FTW", "GARL",
    "GRAN", "HNC", "IRV", "KC", "MEM", "NHOU", "PAS",
    "PHX", "SAG", "WHOU",
]

_cache: dict = {"data": None, "ts": 0}
CACHE_TTL = 600  # 10 minutes


def _get_db() -> firestore.Client:
    creds_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if creds_json:
        import google.auth.credentials
        from google.oauth2 import service_account

        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(info)
        return firestore.Client(credentials=creds, project=info["project_id"])
    return firestore.Client()


@lru_cache(maxsize=1)
def get_db() -> firestore.Client:
    return _get_db()


def _get_sheets():
    creds_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if creds_json:
        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
        )
    else:
        creds = service_account.Credentials.from_service_account_file(
            os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", ""),
            scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
        )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


@lru_cache(maxsize=1)
def get_sheets():
    return _get_sheets()


def _parse_int(cell) -> int:
    try:
        return int(float(str(cell).replace(",", "").replace("$", "")))
    except (ValueError, TypeError):
        return 0


def _parse_money(cell) -> float:
    try:
        return float(str(cell).replace(",", "").replace("$", ""))
    except (ValueError, TypeError):
        return 0.0


def _find_current_row_office(rows):
    """Walk bottom-up; return index of first row with col E (index 4) > 0."""
    for ri in range(len(rows) - 1, 0, -1):
        row = rows[ri]
        if len(row) > 4 and row[4] and str(row[4]).strip():
            try:
                if float(str(row[4]).replace(",", "")) > 0:
                    return ri
            except (ValueError, IndexError):
                continue
    return None


def _find_current_row_sales(rows, hc_cols):
    """Walk bottom-up; return first row where any sales rep HC col > 0."""
    for ri in range(len(rows) - 1, 0, -1):
        row = rows[ri]
        for ci in hc_cols:
            if ci < len(row) and row[ci] and str(row[ci]).strip():
                try:
                    if int(str(row[ci]).replace(",", "")) > 0:
                        return ri
                except (ValueError, IndexError):
                    pass
    return None


_AGG_RE = re.compile(
    r"(total|sum|avg|average|hours|headcount|all[- ]time|growth|goal"
    r"|prior|target|budget)",
    re.IGNORECASE,
)
_PRIOR_SUFFIX = " 2025"
_REC_COL_START = 8  # Col I


def get_sheet_data() -> dict:
    """One batchGet → prior_year_hc + top_recruiters + top_sales."""
    svc = get_sheets()
    ranges = [f"{tab}!A1:AZ200" for tab in OFFICE_TABS]
    ranges.append("Sales!A1:Z100")
    result = (
        svc.spreadsheets()
        .values()
        .batchGet(spreadsheetId=SHEET_ID, ranges=ranges)
        .execute()
    )

    value_ranges = result.get("valueRanges", [])
    office_ranges = value_ranges[: len(OFFICE_TABS)]
    sales_range = value_ranges[len(OFFICE_TABS)] if len(value_ranges) > len(OFFICE_TABS) else None

    # ── Office tabs → prior-year HC + top recruiters ──
    total_prior_hc = 0
    all_recruiters = []

    for vr in office_ranges:
        rows = vr.get("values", [])
        if len(rows) < 2:
            continue
        headers = rows[0]
        cur_idx = _find_current_row_office(rows)
        if cur_idx is None:
            continue
        cur_row = rows[cur_idx]

        # Prior-year HC from col H (index 7)
        if len(cur_row) > 7 and cur_row[7]:
            total_prior_hc += _parse_int(cur_row[7])

        # Recruiter columns (index 8+, skip 2025/aggregation)
        rec_cols = []
        for i in range(_REC_COL_START, len(headers)):
            name = headers[i].strip()
            if not name or name.endswith(_PRIOR_SUFFIX):
                continue
            if " - " in name or _AGG_RE.search(name):
                continue
            rec_cols.append((i, name))

        ytd_rows = rows[1 : cur_idx + 1]
        for col, name in rec_cols:
            hc = _parse_int(cur_row[col]) if col < len(cur_row) else 0
            vals = []
            for r in ytd_rows:
                if col < len(r) and r[col] and str(r[col]).strip():
                    v = _parse_int(r[col])
                    if v > 0:
                        vals.append(v)
            avg_wk = round(sum(vals) / len(vals)) if vals else 0
            if hc > 0:
                all_recruiters.append(
                    {"name": name, "headcount": hc, "avg_weekly": avg_wk}
                )

    all_recruiters.sort(key=lambda x: x["headcount"], reverse=True)

    # ── Sales tab → top sales reps ──
    top_sales = []
    if sales_range:
        rows = sales_range.get("values", [])
        if len(rows) >= 3:
            headers = rows[0]
            reps = []
            i = 2
            while i + 3 <= len(headers):
                name = headers[i].replace(" Headcount", "")
                reps.append({"name": name, "hc_col": i, "gp_col": i + 2})
                i += 4

            hc_cols = [r["hc_col"] for r in reps]
            cur_idx = _find_current_row_sales(rows, hc_cols)
            if cur_idx is not None:
                cur_row = rows[cur_idx]
                ytd_rows = rows[2 : cur_idx + 1]

                for rep in reps:
                    hc = _parse_int(cur_row[rep["hc_col"]]) if rep["hc_col"] < len(cur_row) else 0
                    ytd_gp = 0.0
                    for r in ytd_rows:
                        if rep["gp_col"] < len(r) and r[rep["gp_col"]]:
                            ytd_gp += _parse_money(r[rep["gp_col"]])
                    if hc > 0:
                        top_sales.append(
                            {"name": rep["name"], "headcount": hc, "ytd_gp": round(ytd_gp)}
                        )

            top_sales.sort(key=lambda x: x["headcount"], reverse=True)
            top_sales = top_sales[:3]

    return {
        "prior_year_hc": total_prior_hc,
        "top_recruiters": all_recruiters[:3],
        "top_sales": top_sales,
    }


def weeks_remaining(week_iso: str) -> int:
    y, m, d = (int(x) for x in week_iso.split("-"))
    from datetime import date

    last_dec = date(y, 12, 31)
    dow = last_dec.weekday()  # Mon=0 … Sun=6
    sun_offset = (6 - dow) % 7
    last_sunday = date(y, 12, 31 - ((dow + 1) % 7))
    fiscal_end = last_sunday - __import__("datetime").timedelta(weeks=1)
    current = date(y, m, d)
    diff = (fiscal_end - current).days
    return max(0, round(diff / 7))


def compute_stats() -> dict:
    db = get_db()

    weeks = (
        db.collection("chdWeeks")
        .order_by("weekISO", direction=firestore.Query.ASCENDING)
        .get()
    )
    week_data = [d.to_dict() for d in weeks]

    cfg_snap = db.document("chdConfig/default").get()
    branch_goals = {}
    if cfg_snap.exists:
        branch_goals = cfg_snap.to_dict().get("branchGoals", {})
    annual_goal = sum(branch_goals.values())

    weekly_gp = [w.get("totals", {}).get("total", 0) for w in week_data]
    ytd_gp = sum(weekly_gp)

    latest_week_iso = week_data[-1]["weekISO"] if week_data else ""
    latest_week_gp = weekly_gp[-1] if weekly_gp else 0
    latest_week_label = latest_week_iso

    wks_remaining = weeks_remaining(latest_week_iso) if latest_week_iso else 0

    tail = weekly_gp[-4:]
    roll4_avg = sum(tail) / len(tail) if tail else 0
    projected = ytd_gp + roll4_avg * wks_remaining

    pct_achieved = (ytd_gp / annual_goal * 100) if annual_goal > 0 else 0
    pace_gap = projected - annual_goal
    on_pace = pace_gap >= 0

    sparkline = weekly_gp[-20:]

    # Revenue (gross sales) — sum of all branches' grossSales per week
    weekly_rev = [
        sum(b.get("grossSales", 0) for b in w.get("branches", {}).values())
        for w in week_data
    ]
    ytd_rev = sum(weekly_rev)
    latest_week_rev = weekly_rev[-1] if weekly_rev else 0
    rev_tail = weekly_rev[-4:]
    rev_roll4 = sum(rev_tail) / len(rev_tail) if rev_tail else 0
    rev_projected = ytd_rev + rev_roll4 * wks_remaining
    rev_sparkline = weekly_rev[-20:]

    # Headcount — sum of all branch headcounts per week (from Firestore)
    weekly_hc = [
        sum(b.get("headcount", 0) for b in w.get("branches", {}).values())
        for w in week_data
    ]
    current_hc = weekly_hc[-1] if weekly_hc else 0
    first_hc = weekly_hc[0] if weekly_hc else 0
    hc_change = current_hc - first_hc
    hc_sparkline = weekly_hc[-20:]

    # Google Sheet → prior-year HC + top recruiters + top sales
    try:
        sheet = get_sheet_data()
        prior_year_hc = sheet["prior_year_hc"]
        top_recruiters = sheet["top_recruiters"]
        top_sales = sheet["top_sales"]
    except Exception:
        prior_year_hc = 0
        top_recruiters = []
        top_sales = []

    yoy_change = current_hc - prior_year_hc
    yoy_pct = (yoy_change / prior_year_hc * 100) if prior_year_hc > 0 else 0

    return {
        "ytd_gp": round(ytd_gp),
        "annual_goal": round(annual_goal),
        "pct_achieved": round(pct_achieved, 1),
        "projected_eoy": round(projected),
        "pace_gap": round(pace_gap),
        "on_pace": on_pace,
        "weeks_remaining": wks_remaining,
        "roll4_avg": round(roll4_avg),
        "latest_week_gp": round(latest_week_gp),
        "latest_week_iso": latest_week_iso,
        "sparkline": [round(v) for v in sparkline],
        "ytd_rev": round(ytd_rev),
        "rev_projected": round(rev_projected),
        "latest_week_rev": round(latest_week_rev),
        "rev_sparkline": [round(v) for v in rev_sparkline],
        "current_hc": current_hc,
        "first_hc": first_hc,
        "hc_change": hc_change,
        "hc_sparkline": hc_sparkline,
        "prior_year_hc": prior_year_hc,
        "yoy_change": yoy_change,
        "yoy_pct": round(yoy_pct, 1),
        "top_recruiters": top_recruiters,
        "top_sales": top_sales,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/kp-stats.json")
def kp_stats():
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        return JSONResponse(content=_cache["data"])

    data = compute_stats()
    _cache["data"] = data
    _cache["ts"] = now
    return JSONResponse(content=data)


@app.get("/health")
def health():
    return {"status": "ok"}
