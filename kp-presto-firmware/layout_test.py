from presto import Presto
import network
import urequests
import gc
import time

presto = Presto()
display = presto.display
touch = presto.touch
WIDTH, HEIGHT = display.get_bounds()

# ── Colors ──────────────────────────────────────────────────────────────
CRIMSON    = display.create_pen(168, 19, 44)
GREEN      = display.create_pen(22, 163, 74)
BLUE       = display.create_pen(37, 99, 235)
RED        = display.create_pen(220, 38, 38)
ORANGE     = display.create_pen(217, 119, 6)

# Dark mode colors
BG           = display.create_pen(20, 20, 24)
TEXT         = display.create_pen(235, 235, 230)
GRAY         = display.create_pen(150, 150, 150)
LIGHT_GRAY   = display.create_pen(60, 60, 64)
BAR_BG       = display.create_pen(50, 50, 54)
FILL_BLUE    = display.create_pen(30, 40, 70)
FILL_GREEN   = display.create_pen(25, 50, 35)
DOT_ACTIVE   = display.create_pen(220, 220, 215)
DOT_INACTIVE = display.create_pen(70, 70, 74)
BANNER_TEXT  = display.create_pen(235, 235, 230)

THICK = 2
NUM_PAGES = 5
current_page = 0

def fmt_money(v, short=False):
    if v >= 1_000_000:
        if short:
            return "${:.1f}M".format(v / 1_000_000)
        return "${:.2f}M".format(v / 1_000_000)
    if v >= 1_000:
        return "${:.0f}K".format(v / 1_000)
    return "${}".format(v)

def fmt_week(iso):
    parts = iso.split("-")
    if len(parts) == 3:
        months = ["", "Jan", "Feb", "Mar", "Apr", "May",
                  "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return "{} {}".format(months[int(parts[1])], int(parts[2]))
    return iso

def goal_color(pct):
    if pct >= 90: return GREEN
    if pct >= 60: return BLUE
    if pct >= 30: return ORANGE
    return RED

def set_sans(thickness=THICK):
    display.set_font("sans")
    display.set_thickness(thickness)

def set_label():
    display.set_font("bitmap8")
    display.set_thickness(1)

def draw_sparkline(data, x, y, w, h, color, fill_color):
    if not data or len(data) < 2:
        return
    mn = min(data)
    mx = max(data)
    rng = mx - mn if mx > mn else 1
    n = len(data)
    step = w / (n - 1)

    for i in range(n - 1):
        x0 = int(x + i * step)
        x1 = int(x + (i + 1) * step)
        y0 = int(y + h - (data[i] - mn) / rng * h)
        y1 = int(y + h - (data[i + 1] - mn) / rng * h)
        for cx in range(x0, x1 + 1):
            t = (cx - x0) / max(1, x1 - x0)
            cy = int(y0 + (y1 - y0) * t)
            display.set_pen(fill_color)
            display.line(cx, cy, cx, y + h)

    display.set_pen(color)
    display.set_thickness(2)
    for i in range(n - 1):
        x0 = int(x + i * step)
        x1 = int(x + (i + 1) * step)
        y0 = int(y + h - (data[i] - mn) / rng * h)
        y1 = int(y + h - (data[i + 1] - mn) / rng * h)
        display.line(x0, y0, x1, y1)
    display.set_thickness(1)

    last_x = int(x + w)
    last_y = int(y + h - (data[-1] - mn) / rng * h)
    display.circle(last_x, last_y, 3)

    display.set_pen(GRAY)
    set_label()
    display.text(fmt_money(mx), x, y - 2, w, 1)
    display.text(fmt_money(mn), x, y + h + 2, w, 1)

def draw_progress_bar(x, y, w, h, pct, color):
    display.set_pen(BAR_BG)
    display.rectangle(x, y, w, h)
    fill_w = int(w * min(pct, 100) / 100)
    if fill_w > 0:
        display.set_pen(color)
        display.rectangle(x, y, fill_w, h)

def draw_page_dots(page):
    cx = WIDTH // 2
    y = 230
    spacing = 10
    start_x = cx - (NUM_PAGES - 1) * spacing // 2
    for i in range(NUM_PAGES):
        display.set_pen(DOT_ACTIVE if i == page else DOT_INACTIVE)
        display.circle(start_x + i * spacing, y, 3)

def draw_banner():
    display.set_pen(CRIMSON)
    display.rectangle(0, 0, WIDTH, 16)
    display.set_pen(BANNER_TEXT)
    set_label()
    display.text("KP STAFFING", 6, 4, WIDTH, 1)
    wlan = network.WLAN(network.STA_IF)
    display.set_pen(GREEN if wlan.isconnected() else RED)
    display.circle(WIDTH - 10, 8, 3)


def show_status(msg, color=None):
    display.set_pen(BG)
    display.clear()
    draw_banner()
    display.set_pen(color or TEXT)
    set_label()
    y = 60
    for line in msg if isinstance(msg, list) else [msg]:
        display.text(str(line), 12, y, WIDTH - 24, 2)
        y += 28
    presto.update()

def draw_gp_page(stats):
    display.set_pen(BG)
    display.clear()
    draw_banner()

    ytd = stats["ytd_gp"]
    goal = stats["annual_goal"]
    pct = stats["pct_achieved"]
    projected = stats["projected_eoy"]
    on_pace = stats["on_pace"]
    latest_iso = stats["latest_week_iso"]
    sparkline = stats["sparkline"]

    gc_color = goal_color(pct)
    pace_color = GREEN if on_pace else RED

    # Label
    display.set_pen(GRAY)
    set_label()
    display.text("COMPANY ANNUAL GP GOAL", 8, 20, WIDTH, 1)

    # Hero
    display.set_pen(TEXT)
    set_sans(THICK)
    hero_text = fmt_money(ytd)
    display.text(hero_text, 8, 46, WIDTH, 1)
    hero_w = display.measure_text(hero_text, 1)

    display.set_pen(GRAY)
    set_label()
    display.text("of " + fmt_money(goal), hero_w + 14, 56, WIDTH, 1)
    display.text("Through " + fmt_week(latest_iso), 8, 70, WIDTH, 1)

    # Progress bar
    draw_progress_bar(8, 80, WIDTH - 16, 5, pct, gc_color)

    # Achieved / Projected
    mid = WIDTH // 2

    display.set_pen(GRAY)
    set_label()
    display.text("ACHIEVED", 8, 90, mid, 1)
    display.set_pen(gc_color)
    set_sans(THICK)
    display.text("{:.1f}%".format(pct), 8, 114, mid, 1)
    display.set_pen(GRAY)
    set_label()
    display.text(fmt_money(goal - ytd, True) + " left", 8, 136, mid, 1)

    display.set_pen(LIGHT_GRAY)
    display.line(mid, 90, mid, 144)

    display.set_pen(GRAY)
    set_label()
    display.text("PROJECTED EOY", mid + 6, 90, mid - 6, 1)
    display.set_pen(pace_color)
    set_sans(THICK)
    display.text(fmt_money(projected, True), mid + 6, 114, mid - 6, 1)

    # Sparkline
    display.set_pen(LIGHT_GRAY)
    display.line(8, 150, WIDTH - 8, 150)
    display.set_pen(GRAY)
    set_label()
    display.text("Last Week's Gross Profit", 8, 154, WIDTH, 1)
    draw_sparkline(sparkline, 8, 168, WIDTH - 16, 36, BLUE, FILL_BLUE)

    # Page dots + timestamp
    draw_page_dots(0)
    display.set_pen(GRAY)
    set_label()
    ts = stats["updated_at"][:16].replace("T", " ")
    ts_w = display.measure_text(ts, 1)
    display.text(ts, WIDTH - ts_w - 8, 232, WIDTH, 1)

    presto.update()

def draw_sales_page(stats):
    display.set_pen(BG)
    display.clear()
    draw_banner()

    ytd_rev = stats["ytd_rev"]
    rev_projected = stats["rev_projected"]
    latest_iso = stats["latest_week_iso"]
    wks_left = stats["weeks_remaining"]
    rev_sparkline = stats["rev_sparkline"]

    # Label
    display.set_pen(GRAY)
    set_label()
    display.text("TOTAL GROSS REVENUE (YTD)", 8, 20, WIDTH, 1)

    # Hero
    display.set_pen(TEXT)
    set_sans(THICK)
    hero_text = fmt_money(ytd_rev)
    display.text(hero_text, 8, 46, WIDTH, 1)

    display.set_pen(GRAY)
    set_label()
    display.text("Through " + fmt_week(latest_iso), 8, 70, WIDTH, 1)

    # Blue accent line
    display.set_pen(BLUE)
    display.rectangle(8, 80, WIDTH - 16, 3)

    # Projected
    display.set_pen(GRAY)
    set_label()
    display.text("PROJECTED YEAR-END", 8, 92, WIDTH, 1)

    display.set_pen(BLUE)
    set_sans(THICK)
    display.text(fmt_money(rev_projected), 8, 118, WIDTH, 1)

    display.set_pen(GRAY)
    set_label()
    display.text("YTD + 4-wk avg x " + str(wks_left) + " wks left", 8, 132, WIDTH, 1)

    # Sparkline
    display.set_pen(LIGHT_GRAY)
    display.line(8, 144, WIDTH - 8, 144)
    display.set_pen(GRAY)
    set_label()
    display.text("Weekly Gross Revenue", 8, 148, WIDTH, 1)
    draw_sparkline(rev_sparkline, 8, 162, WIDTH - 16, 40, GREEN, FILL_GREEN)

    # Page dots + timestamp
    draw_page_dots(1)
    display.set_pen(GRAY)
    set_label()
    ts = stats["updated_at"][:16].replace("T", " ")
    ts_w = display.measure_text(ts, 1)
    display.text(ts, WIDTH - ts_w - 8, 232, WIDTH, 1)

    presto.update()

def draw_hc_page(stats):
    display.set_pen(BG)
    display.clear()
    draw_banner()

    current_hc = stats["current_hc"]
    prior_hc = stats.get("prior_year_hc", 0)
    yoy_change = stats.get("yoy_change", current_hc - prior_hc)
    yoy_pct = stats.get("yoy_pct", 0)
    hc_sparkline = stats["hc_sparkline"]
    latest_iso = stats["latest_week_iso"]

    change_color = GREEN if yoy_change >= 0 else RED

    # Label
    display.set_pen(GRAY)
    set_label()
    display.text("COMPANY HEADCOUNT", 8, 20, WIDTH, 1)

    # Hero — current HC
    display.set_pen(TEXT)
    set_sans(THICK)
    display.text(str(current_hc), 8, 46, WIDTH, 1)

    display.set_pen(GRAY)
    set_label()
    display.text("workers on assignment", 8, 70, WIDTH, 1)

    # Green accent line
    display.set_pen(GREEN)
    display.rectangle(8, 80, WIDTH - 16, 3)

    # YoY Growth section
    mid = WIDTH // 2

    display.set_pen(GRAY)
    set_label()
    display.text("YOY GROWTH", 8, 90, mid, 1)

    display.set_pen(change_color)
    set_sans(THICK)
    arrow = "+" if yoy_change >= 0 else ""
    display.text(arrow + str(yoy_change), 8, 114, mid, 1)

    display.set_pen(GRAY)
    set_label()
    display.text("vs " + str(prior_hc) + " in 2025", 8, 136, mid, 1)

    display.set_pen(LIGHT_GRAY)
    display.line(mid, 90, mid, 144)

    display.set_pen(GRAY)
    set_label()
    display.text("GROWTH RATE", mid + 6, 90, mid - 6, 1)

    display.set_pen(change_color)
    set_sans(THICK)
    pct_arrow = "+" if yoy_pct >= 0 else ""
    display.text("{}{:.0f}%".format(pct_arrow, yoy_pct), mid + 6, 114, mid - 6, 1)

    display.set_pen(GRAY)
    set_label()
    display.text("same week last yr", mid + 6, 136, mid - 6, 1)

    # Sparkline
    display.set_pen(LIGHT_GRAY)
    display.line(8, 150, WIDTH - 8, 150)
    display.set_pen(GRAY)
    set_label()
    display.text("Weekly Headcount", 8, 154, WIDTH, 1)
    draw_sparkline(hc_sparkline, 8, 168, WIDTH - 16, 36, GREEN, FILL_GREEN)

    # Page dots + timestamp
    draw_page_dots(2)
    display.set_pen(GRAY)
    set_label()
    ts = stats["updated_at"][:16].replace("T", " ")
    ts_w = display.measure_text(ts, 1)
    display.text(ts, WIDTH - ts_w - 8, 232, WIDTH, 1)

    presto.update()

def draw_sales_leaders_page(stats):
    display.set_pen(BG)
    display.clear()
    draw_banner()

    reps = stats.get("top_sales", [])

    # Label
    display.set_pen(GRAY)
    set_label()
    display.text("TOP SALES REPS", 8, 20, WIDTH, 1)

    # Accent line
    display.set_pen(CRIMSON)
    display.rectangle(8, 30, WIDTH - 16, 3)

    rank_colors = [GREEN, BLUE, BLUE]

    for i, rep in enumerate(reps[:3]):
        y = 36 + i * 62

        # Rank + Name
        display.set_pen(TEXT)
        set_label()
        display.text("{}  {}".format(i + 1, rep["name"]), 8, y, WIDTH - 16, 1)

        # HC number (sans) — 24px below name for sans clearance
        display.set_pen(rank_colors[i])
        set_sans(THICK)
        hc_text = str(rep["headcount"])
        hc_w = display.measure_text(hc_text, 1)
        display.text(hc_text, 8, y + 24, WIDTH, 1)

        # YTD GP (bitmap8, beside HC)
        display.set_pen(GRAY)
        set_label()
        display.text(fmt_money(rep["ytd_gp"]) + " YTD GP", hc_w + 16, y + 30, WIDTH, 1)

    # Page dots + timestamp
    draw_page_dots(3)
    display.set_pen(GRAY)
    set_label()
    ts = stats["updated_at"][:16].replace("T", " ")
    ts_w = display.measure_text(ts, 1)
    display.text(ts, WIDTH - ts_w - 8, 232, WIDTH, 1)

    presto.update()


def draw_recruiter_page(stats):
    display.set_pen(BG)
    display.clear()
    draw_banner()

    recruiters = stats.get("top_recruiters", [])

    # Label
    display.set_pen(GRAY)
    set_label()
    display.text("TOP RECRUITERS", 8, 20, WIDTH, 1)

    # Accent line
    display.set_pen(BLUE)
    display.rectangle(8, 30, WIDTH - 16, 3)

    rank_colors = [GREEN, BLUE, BLUE]

    for i, rec in enumerate(recruiters[:3]):
        y = 36 + i * 62

        # Rank + Name
        display.set_pen(TEXT)
        set_label()
        display.text("{}  {}".format(i + 1, rec["name"]), 8, y, WIDTH - 16, 1)

        # HC number (sans) — 24px below name for sans clearance
        display.set_pen(rank_colors[i])
        set_sans(THICK)
        hc_text = str(rec["headcount"])
        hc_w = display.measure_text(hc_text, 1)
        display.text(hc_text, 8, y + 24, WIDTH, 1)

        # Avg weekly (bitmap8, beside HC)
        display.set_pen(GRAY)
        set_label()
        display.text("avg {}/wk".format(rec["avg_weekly"]), hc_w + 16, y + 30, WIDTH, 1)

    # Page dots + timestamp
    draw_page_dots(4)
    display.set_pen(GRAY)
    set_label()
    ts = stats["updated_at"][:16].replace("T", " ")
    ts_w = display.measure_text(ts, 1)
    display.text(ts, WIDTH - ts_w - 8, 232, WIDTH, 1)

    presto.update()


def draw_page(stats, page):
    if page == 0:
        draw_gp_page(stats)
    elif page == 1:
        draw_sales_page(stats)
    elif page == 2:
        draw_hc_page(stats)
    elif page == 3:
        draw_sales_leaders_page(stats)
    else:
        draw_recruiter_page(stats)

# ── Config ────────────────────────────────────────────────
STATS_URL = "https://kp-presto-middleware.onrender.com/kp-stats.json"
REFRESH_SECONDS = 3600
SWIPE_THRESHOLD = 30
AUTO_ROTATE_MS = 10000


def fetch_stats():
    gc.collect()
    r = urequests.get(STATS_URL)
    data = r.json()
    r.close()
    gc.collect()
    return data


def set_leds(on_pace):
    for i in range(7):
        presto.set_led_rgb(i, 0, 0, 0)


# ── Startup ───────────────────────────────────────────────
show_status("Connecting WiFi...")
presto.connect()

wlan = network.WLAN(network.STA_IF)
if not wlan.isconnected():
    show_status(["WiFi failed!", "Check secrets.py"], RED)
    time.sleep(30)
    import machine
    machine.reset()

show_status(["Connected!", wlan.ifconfig()[0]], GREEN)
time.sleep(1)

# First fetch
stats = None
show_status("Fetching data...")
try:
    stats = fetch_stats()
    set_leds(stats.get("on_pace", True))
except Exception as e:
    show_status(["Fetch error", str(e)[:30]], RED)
    time.sleep(10)

if stats:
    draw_page(stats, current_page)

# ── Main loop ────────────────────────────────────────────
last_fetch = time.time()
last_switch = time.ticks_ms()
touch_start_x = None

while True:
    # Periodic data refresh
    if time.time() - last_fetch >= REFRESH_SECONDS:
        try:
            stats = fetch_stats()
            set_leds(stats.get("on_pace", True))
            last_fetch = time.time()
            draw_page(stats, current_page)
        except Exception:
            last_fetch = time.time() - REFRESH_SECONDS + 60

    # Touch handling
    touch.poll()

    if touch.state == touch.STATE_DOWN:
        touch_start_x = touch.x

    elif touch.state == touch.STATE_UP and touch_start_x is not None:
        dx = touch.x - touch_start_x
        touch_start_x = None

        if stats:
            if dx < -SWIPE_THRESHOLD and current_page < NUM_PAGES - 1:
                current_page += 1
                draw_page(stats, current_page)
                last_switch = time.ticks_ms()
            elif dx > SWIPE_THRESHOLD and current_page > 0:
                current_page -= 1
                draw_page(stats, current_page)
                last_switch = time.ticks_ms()

    # Auto-rotate
    if stats and time.ticks_diff(time.ticks_ms(), last_switch) >= AUTO_ROTATE_MS:
        current_page = (current_page + 1) % NUM_PAGES
        draw_page(stats, current_page)
        last_switch = time.ticks_ms()

    time.sleep(0.05)
