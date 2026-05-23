from presto import Presto
import network
import urequests
import time
import gc

STATS_URL = "MIDDLEWARE_URL_HERE"
REFRESH_SECONDS = 3600

presto = Presto()
display = presto.display
WIDTH, HEIGHT = display.get_bounds()

# ── Colors ──────────────────────────────────────────────────────────────
WHITE      = display.create_pen(245, 245, 240)
BG         = display.create_pen(240, 240, 236)
BLACK      = display.create_pen(20, 20, 20)
GRAY       = display.create_pen(140, 140, 140)
LIGHT_GRAY = display.create_pen(210, 210, 206)
CRIMSON    = display.create_pen(168, 19, 44)
GREEN      = display.create_pen(22, 163, 74)
BLUE       = display.create_pen(37, 99, 235)
RED        = display.create_pen(220, 38, 38)
ORANGE     = display.create_pen(217, 119, 6)
BAR_BG     = display.create_pen(225, 225, 220)


def fmt_money(v):
    if v >= 1_000_000:
        return "${:.2f}M".format(v / 1_000_000)
    if v >= 1_000:
        return "${:.0f}K".format(v / 1_000)
    return "${}".format(v)


def fmt_week(iso):
    parts = iso.split("-")
    if len(parts) == 3:
        months = ["", "Jan", "Feb", "Mar", "Apr", "May",
                  "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        m = int(parts[1])
        d = int(parts[2])
        return "{} {}".format(months[m], d)
    return iso


def goal_color(pct):
    if pct >= 90:
        return GREEN
    if pct >= 60:
        return BLUE
    if pct >= 30:
        return ORANGE
    return RED


def draw_sparkline(data, x, y, w, h):
    if not data or len(data) < 2:
        return
    mn = min(data)
    mx = max(data)
    rng = mx - mn if mx > mn else 1
    n = len(data)
    step = w / (n - 1)

    # Fill area under the line
    for i in range(n - 1):
        x0 = int(x + i * step)
        x1 = int(x + (i + 1) * step)
        y0 = int(y + h - (data[i] - mn) / rng * h)
        y1 = int(y + h - (data[i + 1] - mn) / rng * h)
        # Draw vertical fills column by column
        for cx in range(x0, x1 + 1):
            t = (cx - x0) / max(1, x1 - x0)
            cy = int(y0 + (y1 - y0) * t)
            # Light blue fill
            display.set_pen(display.create_pen(220, 230, 250))
            display.line(cx, cy, cx, y + h)

    # Draw the line itself
    display.set_pen(BLUE)
    display.set_thickness(2)
    for i in range(n - 1):
        x0 = int(x + i * step)
        x1 = int(x + (i + 1) * step)
        y0 = int(y + h - (data[i] - mn) / rng * h)
        y1 = int(y + h - (data[i + 1] - mn) / rng * h)
        display.line(x0, y0, x1, y1)
    display.set_thickness(1)

    # Current value dot
    last_x = int(x + w)
    last_y = int(y + h - (data[-1] - mn) / rng * h)
    display.circle(last_x, last_y, 3)

    # Y-axis labels
    display.set_pen(GRAY)
    display.set_font("bitmap8")
    display.text(fmt_money(mx), x, y - 2, w, 1)
    display.text(fmt_money(mn), x, y + h + 2, w, 1)


def draw_progress_bar(x, y, w, h, pct, color):
    display.set_pen(BAR_BG)
    display.rectangle(x, y, w, h)
    fill_w = int(w * min(pct, 100) / 100)
    if fill_w > 0:
        display.set_pen(color)
        display.rectangle(x, y, fill_w, h)


def draw_dashboard(stats):
    display.set_pen(BG)
    display.clear()

    ytd = stats["ytd_gp"]
    goal = stats["annual_goal"]
    pct = stats["pct_achieved"]
    projected = stats["projected_eoy"]
    pace_gap = stats["pace_gap"]
    on_pace = stats["on_pace"]
    wks_left = stats["weeks_remaining"]
    latest_gp = stats["latest_week_gp"]
    latest_iso = stats["latest_week_iso"]
    sparkline = stats["sparkline"]

    gc_color = goal_color(pct)
    pace_color = GREEN if on_pace else RED

    # ── Top banner ────────────────────────────────────────
    display.set_pen(CRIMSON)
    display.rectangle(0, 0, WIDTH, 16)
    display.set_pen(WHITE)
    display.set_font("bitmap8")
    display.text("KP STAFFING", 6, 4, WIDTH, 1)

    # WiFi indicator
    wlan = network.WLAN(network.STA_IF)
    if wlan.isconnected():
        display.set_pen(GREEN)
        display.circle(WIDTH - 10, 8, 3)

    # ── GP Goal section ───────────────────────────────────
    display.set_pen(GRAY)
    display.set_font("bitmap8")
    display.text("COMPANY ANNUAL GP GOAL", 8, 22, WIDTH, 1)

    # Hero number
    display.set_pen(BLACK)
    display.set_font("bitmap8")
    display.text(fmt_money(ytd), 8, 32, WIDTH, 3)

    # "of $X.XXM" and period
    of_text = "of " + fmt_money(goal)
    display.set_pen(GRAY)
    display.set_font("bitmap8")
    hero_w = display.measure_text(fmt_money(ytd), 3)
    display.text(of_text, hero_w + 14, 40, WIDTH, 1)
    display.text("Through " + fmt_week(latest_iso), 8, 54, WIDTH, 1)

    # Progress bar
    draw_progress_bar(8, 64, WIDTH - 16, 5, pct, gc_color)

    # ── Achieved + Projected row ──────────────────────────
    # Achieved (left)
    mid = WIDTH // 2

    display.set_pen(GRAY)
    display.set_font("bitmap8")
    display.text("ACHIEVED", 8, 76, mid, 1)

    display.set_pen(gc_color)
    display.set_font("bitmap8")
    display.text("{:.1f}%".format(pct), 8, 85, mid, 2)

    remaining = goal - ytd
    display.set_pen(GRAY)
    display.text(fmt_money(remaining) + " left", 8, 102, mid, 1)

    # Divider line
    display.set_pen(LIGHT_GRAY)
    display.line(mid, 76, mid, 110)

    # Projected (right)
    display.set_pen(GRAY)
    display.set_font("bitmap8")
    display.text("PROJECTED EOY", mid + 6, 76, mid - 6, 1)

    display.set_pen(pace_color)
    display.set_font("bitmap8")
    display.text(fmt_money(projected), mid + 6, 85, mid - 6, 2)

    arrow = "^ " if on_pace else "v "
    gap_label = arrow + fmt_money(abs(pace_gap))
    display.text(gap_label, mid + 6, 102, mid - 6, 1)

    # ── Sparkline ─────────────────────────────────────────
    display.set_pen(LIGHT_GRAY)
    display.line(8, 116, WIDTH - 8, 116)

    display.set_pen(GRAY)
    display.set_font("bitmap8")
    display.text("Weekly Gross Profit", 8, 120, WIDTH, 1)

    draw_sparkline(sparkline, 8, 138, WIDTH - 16, 60)

    # ── Footer ────────────────────────────────────────────
    display.set_pen(GRAY)
    display.set_font("bitmap8")
    display.text("Latest: " + fmt_money(latest_gp), 8, 210, WIDTH, 1)
    display.text("4wk avg x " + str(wks_left) + " wks", 8, 222, WIDTH, 1)

    # Timestamp (right-aligned)
    ts = stats.get("updated_at", "")[:16].replace("T", " ")
    ts_w = display.measure_text(ts, 1)
    display.text(ts, WIDTH - ts_w - 8, 232, WIDTH, 1)

    presto.update()


def set_leds(on_pace):
    if on_pace:
        for i in range(7):
            presto.set_led_rgb(i, 0, 40, 0)
    else:
        for i in range(7):
            presto.set_led_rgb(i, 40, 0, 0)


def show_status(msg, color=None):
    display.set_pen(BG)
    display.clear()
    display.set_pen(CRIMSON)
    display.rectangle(0, 0, WIDTH, 16)
    display.set_pen(WHITE)
    display.set_font("bitmap8")
    display.text("KP STAFFING", 6, 4, WIDTH, 1)
    display.set_pen(color or BLACK)
    display.set_font("bitmap8")
    y = 60
    for line in msg if isinstance(msg, list) else [msg]:
        display.text(str(line), 12, y, WIDTH - 24, 2)
        y += 28
    presto.update()


def fetch_stats():
    gc.collect()
    r = urequests.get(STATS_URL)
    data = r.json()
    r.close()
    gc.collect()
    return data


def main():
    show_status("Connecting WiFi...")
    presto.connect()

    wlan = network.WLAN(network.STA_IF)
    if not wlan.isconnected():
        show_status(["WiFi failed!", "Check secrets.py"], RED)
        time.sleep(30)
        return

    show_status(["Connected!", wlan.ifconfig()[0]], GREEN)
    time.sleep(1)

    while True:
        try:
            show_status("Fetching data...")
            stats = fetch_stats()
            draw_dashboard(stats)
            set_leds(stats.get("on_pace", True))
            time.sleep(REFRESH_SECONDS)
        except Exception as e:
            show_status(["Fetch error", str(e)[:30]], RED)
            set_leds(False)
            time.sleep(60)


main()
