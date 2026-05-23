import os
import json
import time
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from google.cloud import firestore

app = FastAPI()

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
