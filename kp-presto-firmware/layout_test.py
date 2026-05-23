from presto import Presto
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

# Theme-dependent colors — set by apply_theme()
BG = TEXT = GRAY = LIGHT_GRAY = BAR_BG = None
FILL_BLUE = FILL_GREEN = DOT_ACTIVE = DOT_INACTIVE = None
BANNER_TEXT = None

THICK = 2
NUM_PAGES = 2
current_page = 0
dark_mode = False

def apply_theme():
    global BG, TEXT, GRAY, LIGHT_GRAY, BAR_BG
    global FILL_BLUE, FILL_GREEN, DOT_ACTIVE, DOT_INACTIVE, BANNER_TEXT
    if dark_mode:
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
    else:
        BG           = display.create_pen(240, 240, 236)
        TEXT         = display.create_pen(20, 20, 20)
        GRAY         = display.create_pen(140, 140, 140)
        LIGHT_GRAY   = display.create_pen(210, 210, 206)
        BAR_BG       = display.create_pen(225, 225, 220)
        FILL_BLUE    = display.create_pen(220, 230, 250)
        FILL_GREEN   = display.create_pen(220, 245, 230)
        DOT_ACTIVE   = display.create_pen(80, 80, 80)
        DOT_INACTIVE = display.create_pen(190, 190, 186)
        BANNER_TEXT  = display.create_pen(245, 245, 240)

apply_theme()

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
    display.set_pen(GREEN)
    display.circle(WIDTH - 10, 8, 3)

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
    display.text("ACHIEVED", 8, 92, mid, 1)
    display.set_pen(gc_color)
    display.text("{:.1f}%".format(pct), 8, 102, mid, 3)
    display.set_pen(GRAY)
    display.text(fmt_money(goal - ytd) + " left", 8, 126, mid, 1)

    display.set_pen(LIGHT_GRAY)
    display.line(mid, 92, mid, 134)

    display.set_pen(GRAY)
    set_label()
    display.text("PROJECTED EOY", mid + 6, 92, mid - 6, 1)
    display.set_pen(pace_color)
    display.text(fmt_money(projected), mid + 6, 102, mid - 6, 3)

    # Sparkline
    display.set_pen(LIGHT_GRAY)
    display.line(8, 140, WIDTH - 8, 140)
    display.set_pen(GRAY)
    set_label()
    display.text("Last Week's Gross Profit", 8, 144, WIDTH, 1)
    draw_sparkline(sparkline, 8, 158, WIDTH - 16, 44, BLUE, FILL_BLUE)

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

def draw_page(stats, page):
    if page == 0:
        draw_gp_page(stats)
    else:
        draw_sales_page(stats)

# ── Mock data ────────────────────────────────────────────
stats = {
    "ytd_gp": 8718622,
    "annual_goal": 20587114,
    "pct_achieved": 42.3,
    "projected_eoy": 24570381,
    "pace_gap": 3983267,
    "on_pace": True,
    "weeks_remaining": 31,
    "latest_week_gp": 525351,
    "latest_week_iso": "2026-05-17",
    "sparkline": [263807,350596,373399,343577,313844,409895,468423,
                  411132,422974,400297,403940,423990,443147,424927,
                  478131,477755,496247,512681,511110,525351],
    "ytd_rev": 49820113,
    "rev_projected": 139267273,
    "latest_week_rev": 3023321,
    "rev_sparkline": [1453927,1919628,2098422,1946788,1826432,2318561,
                      2555834,2295327,2413289,2264780,2339720,2502397,
                      2636101,2442869,2762994,2809948,2829106,2888102,
                      3023321,3023321],
    "updated_at": "2026-05-23T17:49:38",
}

# LEDs
for i in range(7):
    presto.set_led_rgb(i, 0, 40, 0)

# Draw initial page
draw_page(stats, current_page)

# ── Touch/swipe loop ─────────────────────────────────────
SWIPE_THRESHOLD = 30
TAP_THRESHOLD = 15
touch_start_x = None

while True:
    touch.poll()

    if touch.state == touch.STATE_DOWN:
        touch_start_x = touch.x

    elif touch.state == touch.STATE_UP and touch_start_x is not None:
        dx = touch.x - touch_start_x
        touch_start_x = None

        if dx < -SWIPE_THRESHOLD and current_page < NUM_PAGES - 1:
            current_page += 1
            draw_page(stats, current_page)
        elif dx > SWIPE_THRESHOLD and current_page > 0:
            current_page -= 1
            draw_page(stats, current_page)
        elif abs(dx) < TAP_THRESHOLD:
            dark_mode = not dark_mode
            apply_theme()
            draw_page(stats, current_page)

    time.sleep(0.05)
