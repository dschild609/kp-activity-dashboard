import { useEffect, useRef, useState } from "react";
import type { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { AnswerKey, KnowledgeQuestion, KnowledgeTest } from "../types/knowledge";
import cpLogoUrl from "../assets/core-personnel-logo.png";

/* ── Asteroids quiz game ──────────────────────────────────────────────
 * A playable Asteroids game where you answer the test by shooting the
 * right answer. Per question: the game freezes and shows the question +
 * options (timed read); then the options dock to a side panel and one
 * asteroid per option drifts in labeled A/B/C/D (or TRUE/FALSE). The FIRST
 * labeled asteroid you destroy is your answer — right earns a power-up.
 * Between questions you play regular Asteroids. Lose all lives → choose to
 * keep playing or finish in the classic quiz. Answering the last question
 * hands the graded answers back to the page. */

type Phase = "intro" | "reading" | "answering" | "freeplay" | "dead" | "complete";

interface Vec {
  x: number;
  y: number;
}
interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  invuln: number; // seconds of spawn protection
  shield: boolean;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  size: 1 | 2 | 3; // 1 small, 2 med, 3 large
  angle: number;
  spin: number;
  shape: number[]; // per-vertex radius jitter
  answerKey?: AnswerKey; // set on labeled answer rocks
  label?: string;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}
// Hostile "Core Personnel" starship that jumps into free-play at high levels.
interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // collision radius (doubles as the draw scale)
  hp: number;
  fireCooldown: number; // ms until the next shot
  boss: boolean; // the apex flagship (bigger, tougher, spread fire)
  sway: number; // phase offset for the menacing sway
  drift: number; // slowly-wandering heading
}

interface World {
  phase: Phase;
  qIndex: number;
  ship: Ship;
  bullets: Bullet[];
  rocks: Rock[];
  particles: Particle[];
  score: number;
  lives: number;
  keys: { left: boolean; right: boolean; thrust: boolean; fire: boolean };
  fireCooldown: number;
  readingUntil: number; // ms timestamp
  readingTotal: number;
  freeplayUntil: number;
  answeredThisQ: boolean;
  wrongThisQ: boolean;
  flash: { color: string; until: number } | null;
  power: { rapidUntil: number; spreadUntil: number };
  answers: Record<string, AnswerKey | null>;
  enemies: Enemy[];
  enemyBullets: Bullet[];
  alert: { text: string; until: number } | null; // transient on-canvas banner
  now: number;
}

const W = 900;
const H = 560;
// All game math runs in W×H logical space; the canvas buffer is rendered at
// RENDER_SCALE× so it stays crisp when the (responsive) canvas fills a wide screen.
const RENDER_SCALE = 2;
const COLORS = { fg: "#e9f2ff", ship: "#eaf2ff", accent: "#ff3b5c", good: "#3ddc84", warn: "#ffcf5c", dim: "#5b6b7f" };

// "Core Personnel" hostile flagship — carrier-class silhouette (normalized, nose
// points up / -y), rendered as a neon double-stroke. Lifted from the boss spec.
const ENEMY_COLOR = "#ff8a1e";
const ENEMY_PATHS: number[][][] = [
  // central deck (wide octagon)
  [[-0.5, -0.55], [0.5, -0.55], [0.98, -0.12], [0.98, 0.38], [0.5, 0.72], [-0.5, 0.72], [-0.98, 0.38], [-0.98, -0.12]],
  // forward crown spikes (up)
  [[-0.5, -0.55], [-0.62, -1.28], [-0.28, -0.55]],
  [[0.5, -0.55], [0.62, -1.28], [0.28, -0.55]],
  [[-0.15, -0.55], [0, -1.42], [0.15, -0.55]],
  // swept side wings (out)
  [[-0.98, -0.02], [-1.55, 0.22], [-1.32, 0.6], [-0.98, 0.34]],
  [[0.98, -0.02], [1.55, 0.22], [1.32, 0.6], [0.98, 0.34]],
  // lower engine prongs (down)
  [[-0.34, 0.72], [-0.44, 1.2], [-0.16, 0.72]],
  [[0.34, 0.72], [0.44, 1.2], [0.16, 0.72]],
];
const ENEMY_FLAME_Y = 0.72;
const ENEMY_FLAME_DX = [-0.25, 0.25]; // hoisted so drawEnemy allocates nothing
const ENEMY_RGB = "255,138,30"; // #ff8a1e, precomputed so we skip hex parsing per frame
const ENEMY_HULL_FILL = `rgba(${ENEMY_RGB},0.06)`; // constant faint hull tint
const ENEMY_BOSS_HP = 6;

// Rotate+scale a normalized hull point into screen space, writing into a shared
// scratch instead of allocating a tuple per vertex per frame. Canvas draw is
// synchronous/single-threaded, so reusing one object is safe.
const _ep = { x: 0, y: 0 };
function enemyPoint(e: Enemy, cos: number, sin: number, x: number, y: number) {
  _ep.x = e.x + (x * cos - y * sin) * e.r;
  _ep.y = e.y + (x * sin + y * cos) * e.r;
  return _ep;
}

function spawnEnemy(boss: boolean): Enemy {
  const edge = Math.floor(Math.random() * 4);
  const x = edge === 1 ? W : edge === 3 ? 0 : Math.random() * W;
  const y = edge === 0 ? 0 : edge === 2 ? H : Math.random() * H;
  const r = boss ? 52 : 22;
  const spd = boss ? 24 : 46 + Math.random() * 26;
  const dir = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5) * 0.7;
  return {
    x,
    y,
    vx: Math.cos(dir) * spd,
    vy: Math.sin(dir) * spd,
    r,
    hp: boss ? ENEMY_BOSS_HP : 1,
    fireCooldown: 800 + Math.random() * 900,
    boss,
    sway: Math.random() * Math.PI * 2,
    drift: dir,
  };
}

const optionKeys = (q: KnowledgeQuestion): AnswerKey[] => {
  const k: AnswerKey[] = ["A", "B"];
  if (q.optionC) k.push("C");
  if (q.optionD) k.push("D");
  return k;
};
const optionText = (q: KnowledgeQuestion, key: AnswerKey): string =>
  ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD }[key] ?? key) ?? key;
const rockLabel = (q: KnowledgeQuestion, key: AnswerKey): string =>
  q.type === "TF" ? (key === "A" ? "TRUE" : "FALSE") : key;

function rockShape(): number[] {
  return Array.from({ length: 10 }, () => 0.75 + Math.random() * 0.45);
}

export function AsteroidsQuiz({
  quiz,
  test,
  onComplete,
  onFallback,
  onExit,
  onScore,
}: {
  quiz: { questions: KnowledgeQuestion[] };
  test: KnowledgeTest;
  onComplete: (answers: Record<string, AnswerKey | null>) => void;
  onFallback: (answers: Record<string, AnswerKey | null>) => void;
  onExit: () => void;
  // Fires with the final arcade score when a run ends (cleared OR game over),
  // so the page can record it on the leaderboard. Best-of is handled downstream.
  onScore?: (score: number) => void;
}) {
  const questions = quiz.questions;
  // Lives = the test's wrong-answer budget: if they can miss N and still
  // pass, they get N lives. Each wrong shot / crash spends one.
  const livesBudget = Math.max(1, test.maxWrongToPass || 1);
  // Enemy starships show up at "high levels" — the back half of the test. The
  // apex flagship boss arrives in the final free-play (needs a longer test).
  const ENEMY_START = Math.max(2, Math.ceil(questions.length * 0.5));
  const BOSS_LEVEL = questions.length >= 4 ? questions.length - 2 : -1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bossLogoRef = useRef<HTMLImageElement | null>(null); // Core Personnel emblem
  const worldRef = useRef<World>(newWorld());
  // Mirror of the bits the HTML overlays need — updated only on change.
  const [phase, setPhase] = useState<Phase>("intro");
  const [qIndex, setQIndex] = useState(0);
  const [hud, setHud] = useState({ score: 0, lives: livesBudget });
  const [readingLeft, setReadingLeft] = useState(1);

  function newWorld(): World {
    return {
      phase: "intro",
      qIndex: 0,
      ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, invuln: 2, shield: false },
      bullets: [],
      rocks: [],
      particles: [],
      score: 0,
      lives: livesBudget,
      keys: { left: false, right: false, thrust: false, fire: false },
      fireCooldown: 0,
      readingUntil: 0,
      readingTotal: 1,
      freeplayUntil: 0,
      answeredThisQ: false,
      wrongThisQ: false,
      flash: null,
      power: { rapidUntil: 0, spreadUntil: 0 },
      answers: {},
      enemies: [],
      enemyBullets: [],
      alert: null,
      now: 0,
    };
  }

  function setPhaseBoth(p: Phase) {
    worldRef.current.phase = p;
    // A run ends the instant it enters a terminal phase — record the score once
    // here so every end path (cleared or out of lives) reports it exactly once.
    if (p === "dead" || p === "complete") onScore?.(worldRef.current.score);
    setPhase(p);
  }
  // Skip the read countdown (Enter key or the on-screen button): collapse the
  // timer so the loop unfreezes into answering on the next frame.
  function skipRead() {
    worldRef.current.readingUntil = worldRef.current.now;
  }

  function spawnRock(size: 1 | 2 | 3, x?: number, y?: number, extra?: Partial<Rock>): Rock {
    const edge = Math.random();
    const px = x ?? (edge < 0.5 ? 0 : W);
    const py = y ?? Math.random() * H;
    const r = size === 3 ? 44 : size === 2 ? 26 : 14;
    const speed = (size === 3 ? 40 : size === 2 ? 65 : 95) * (0.6 + Math.random() * 0.8);
    const dir = Math.random() * Math.PI * 2;
    return {
      x: px,
      y: py,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      r,
      size,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.5,
      shape: rockShape(),
      ...extra,
    };
  }

  function burst(x: number, y: number, color: string, n = 12) {
    const g = worldRef.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 140;
      g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, color });
    }
  }

  // ── phase transitions ────────────────────────────────────────────
  function enterReading(i: number) {
    const g = worldRef.current;
    g.qIndex = i;
    g.answeredThisQ = false;
    g.wrongThisQ = false;
    g.rocks = g.rocks.filter((r) => !r.answerKey); // clear any labeled rocks
    g.bullets = []; // drop in-flight shots so none stray into an answer rock
    g.enemies = []; // hostiles retreat while a question is on screen
    g.enemyBullets = [];
    g.alert = null;
    g.keys.fire = false;
    const q = questions[i];
    const chars = q.text.length + optionKeys(q).reduce((s, k) => s + optionText(q, k).length, 0);
    // Length-scaled base read time + a flat 15s so there's plenty of time.
    g.readingTotal = 15000 + Math.min(9000, Math.max(3500, 2200 + chars * 22));
    g.readingUntil = g.now + g.readingTotal;
    setQIndex(i);
    setPhaseBoth("reading");
  }
  function enterAnswering() {
    const g = worldRef.current;
    const q = questions[g.qIndex];
    const keys = optionKeys(q);
    // 4s of invulnerability on unfreeze so a rock that drifted onto the ship
    // while it was frozen for reading can't instantly kill you.
    g.ship.invuln = Math.max(g.ship.invuln, 4);
    // Brief fire lockout so a held fire key doesn't instantly shoot an answer the
    // moment the game unfreezes — whether the read timer expired or was skipped.
    g.fireCooldown = Math.max(g.fireCooldown, 400);
    // one labeled asteroid per option, spread around the perimeter
    g.rocks = g.rocks.filter((r) => !r.answerKey);
    keys.forEach((key, idx) => {
      const ang = (idx / keys.length) * Math.PI * 2 + Math.random() * 0.4;
      const rx = W / 2 + Math.cos(ang) * (W * 0.42);
      const ry = H / 2 + Math.sin(ang) * (H * 0.42);
      const rock = spawnRock(3, Math.max(30, Math.min(W - 30, rx)), Math.max(30, Math.min(H - 30, ry)), {
        answerKey: key,
        label: rockLabel(q, key),
      });
      // drift gently toward center-ish
      const s = 34;
      const toC = Math.atan2(H / 2 - ry, W / 2 - rx) + (Math.random() - 0.5);
      rock.vx = Math.cos(toC) * s;
      rock.vy = Math.sin(toC) * s;
      g.rocks.push(rock);
    });
    setPhaseBoth("answering");
  }
  /* You must shoot the CORRECT answer to advance. Hitting the correct one
   * auto-detonates the remaining options for bonus points and moves on.
   * A wrong shot costs a life (once per question) and marks it wrong, but you
   * still have to find and shoot the correct answer to clear the question. */
  function shootAnswer(rock: Rock) {
    const g = worldRef.current;
    if (g.answeredThisQ) return;
    const q = questions[g.qIndex];
    const correct = rock.answerKey === q.correctAnswer;

    if (!correct) {
      burst(rock.x, rock.y, COLORS.accent, 10);
      rock.r = -1; // remove the wrong asteroid
      if (!g.wrongThisQ) {
        g.wrongThisQ = true;
        g.answers[q.id] = rock.answerKey ?? null; // recorded wrong
        g.flash = { color: COLORS.accent, until: g.now + 450 };
        decLife();
      }
      return; // no advance — the correct asteroid is still out there
    }

    // correct shot — clears the question
    g.answeredThisQ = true;
    const clean = !g.wrongThisQ; // right on the first try
    if (clean) {
      g.answers[q.id] = rock.answerKey ?? null;
      g.score += 500;
      grantPower();
    }
    // auto-detonate every other option asteroid + collect the points
    for (const rr of g.rocks) {
      if (rr.answerKey) {
        burst(rr.x, rr.y, COLORS.good, 10);
        g.score += 60;
        rr.r = -1;
      }
    }
    g.flash = { color: clean ? COLORS.good : COLORS.warn, until: g.now + 450 };
    setHud({ score: g.score, lives: g.lives });
    const last = g.qIndex >= questions.length - 1;
    if (last) window.setTimeout(() => setPhaseBoth("complete"), 700);
    else enterFreeplay();
  }
  // Between-questions arcade break. At high levels this is where hostile
  // starships jump in; the final free-play summons the Core Personnel flagship.
  function enterFreeplay() {
    const g = worldRef.current;
    const boss = g.qIndex === BOSS_LEVEL;
    g.freeplayUntil = g.now + (boss ? 15000 : 8500);
    if (boss) {
      g.enemies.push(spawnEnemy(true));
      g.alert = { text: "⚠ WARNING — ENEMY FLAGSHIP INBOUND", until: g.now + 2800 };
    } else if (g.qIndex >= ENEMY_START) {
      g.alert = { text: "⚠ HOSTILE STARSHIPS INBOUND", until: g.now + 2200 };
    }
    setPhaseBoth("freeplay");
  }
  function enemyFire(e: Enemy) {
    const g = worldRef.current;
    const s = g.ship;
    const base = Math.atan2(s.y - e.y, s.x - e.x);
    const angs = e.boss ? [-0.28, 0, 0.28] : [(Math.random() - 0.5) * 0.14];
    const spd = e.boss ? 230 : 260;
    for (const da of angs) {
      const a = base + da;
      g.enemyBullets.push({
        x: e.x + Math.cos(a) * (e.r + 4),
        y: e.y + Math.sin(a) * (e.r + 4),
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 2.6,
      });
    }
  }
  function grantPower() {
    const g = worldRef.current;
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) g.ship.shield = true;
    else if (roll === 1) g.power.rapidUntil = g.now + 12000;
    else g.power.spreadUntil = g.now + 12000;
  }
  // Spend one life (a wrong answer or a crash). Returns true if it was the last.
  function decLife(): boolean {
    const g = worldRef.current;
    g.lives -= 1;
    setHud({ score: g.score, lives: g.lives });
    if (g.lives <= 0) {
      setPhaseBoth("dead"); // terminal phase → setPhaseBoth records the score
      return true;
    }
    return false;
  }
  function crash() {
    const g = worldRef.current;
    if (g.ship.shield) {
      g.ship.shield = false;
      g.ship.invuln = 2;
      burst(g.ship.x, g.ship.y, COLORS.warn, 16);
      return;
    }
    burst(g.ship.x, g.ship.y, COLORS.accent, 24);
    if (!decLife()) {
      g.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, invuln: 2.2, shield: false };
    }
  }

  function fire() {
    const g = worldRef.current;
    const spread = g.now < g.power.spreadUntil;
    const nose = { x: g.ship.x + Math.cos(g.ship.angle) * 16, y: g.ship.y + Math.sin(g.ship.angle) * 16 };
    const angs = spread ? [-0.22, 0, 0.22] : [0];
    for (const da of angs) {
      const a = g.ship.angle + da;
      g.bullets.push({ x: nose.x, y: nose.y, vx: Math.cos(a) * 560 + g.ship.vx, vy: Math.sin(a) * 560 + g.ship.vy, life: 1.1 });
    }
    g.fireCooldown = g.now < g.power.rapidUntil ? 130 : 260;
  }

  // ── main loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!bossLogoRef.current) {
      const img = new Image();
      img.src = cpLogoUrl;
      bossLogoRef.current = img;
    }
    let raf = 0;
    let prev = performance.now();
    worldRef.current = newWorld();
    if (import.meta.env.DEV) (window as unknown as { __aq?: World }).__aq = worldRef.current;

    let lastReadPush = 0;
    const setReadingLeftThrottled = (v: number) => {
      const now = performance.now();
      if (now - lastReadPush > 80) {
        lastReadPush = now;
        setReadingLeft(v);
      }
    };

    const step = (t: number) => {
      const g = worldRef.current;
      g.now = t;
      let dt = (t - prev) / 1000;
      prev = t;
      if (dt > 0.05) dt = 0.05; // clamp (tab switches)

      const active = g.phase === "answering" || g.phase === "freeplay";

      // reading → answering
      if (g.phase === "reading") {
        const left = Math.max(0, (g.readingUntil - t) / g.readingTotal);
        setReadingLeftThrottled(left);
        if (t >= g.readingUntil) enterAnswering();
      }
      // freeplay → next question
      if (g.phase === "freeplay" && t >= g.freeplayUntil) enterReading(g.qIndex + 1);

      if (active) updatePhysics(g, dt);
      render(ctx, g, t);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updatePhysics(g: World, dt: number) {
    const s = g.ship;
    // input
    if (g.keys.left) s.angle -= 3.6 * dt;
    if (g.keys.right) s.angle += 3.6 * dt;
    if (g.keys.thrust) {
      s.vx += Math.cos(s.angle) * 320 * dt;
      s.vy += Math.sin(s.angle) * 320 * dt;
      if (Math.random() < 0.6)
        g.particles.push({
          x: s.x - Math.cos(s.angle) * 14,
          y: s.y - Math.sin(s.angle) * 14,
          vx: -Math.cos(s.angle) * 120 + (Math.random() - 0.5) * 40,
          vy: -Math.sin(s.angle) * 120 + (Math.random() - 0.5) * 40,
          life: 0.35,
          max: 0.35,
          color: COLORS.warn,
        });
    }
    s.vx *= 0.992;
    s.vy *= 0.992;
    s.x = wrap(s.x + s.vx * dt, W);
    s.y = wrap(s.y + s.vy * dt, H);
    if (s.invuln > 0) s.invuln -= dt;

    g.fireCooldown -= dt * 1000;
    if (g.keys.fire && g.fireCooldown <= 0) fire();

    // bullets
    for (const b of g.bullets) {
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, H);
      b.life -= dt;
    }
    g.bullets = g.bullets.filter((b) => b.life > 0);

    // rocks
    for (const r of g.rocks) {
      r.x = wrap(r.x + r.vx * dt, W);
      r.y = wrap(r.y + r.vy * dt, H);
      r.angle += r.spin * dt;
    }

    // spawn generic rocks + hostile fighters during freeplay
    if (g.phase === "freeplay") {
      const generic = g.rocks.filter((r) => !r.answerKey).length;
      if (generic < 4 && Math.random() < 0.03) g.rocks.push(spawnRock(3));
      if (g.qIndex >= ENEMY_START) {
        const hasBoss = g.enemies.some((e) => e.boss);
        const fighters = g.enemies.filter((e) => !e.boss).length;
        const cap = hasBoss ? 2 : Math.min(3, 1 + (g.qIndex - ENEMY_START));
        if (fighters < cap && Math.random() < 0.02) g.enemies.push(spawnEnemy(false));
      }
    }

    // hostile starships: wander, sway, and open fire on the player
    for (const e of g.enemies) {
      e.drift += (Math.random() - 0.5) * 0.9 * dt;
      const spd = e.boss ? 24 : 55;
      e.vx += (Math.cos(e.drift) * spd - e.vx) * Math.min(1, dt * 0.7);
      e.vy += (Math.sin(e.drift) * spd - e.vy) * Math.min(1, dt * 0.7);
      e.x = wrap(e.x + e.vx * dt, W);
      e.y = wrap(e.y + e.vy * dt, H);
      e.fireCooldown -= dt * 1000;
      if (g.phase === "freeplay" && e.fireCooldown <= 0) {
        enemyFire(e);
        e.fireCooldown = e.boss ? 1700 : 2000 + Math.random() * 900;
      }
    }
    // enemy bullets fly straight and expire (no wrap — easier to read & dodge)
    for (const b of g.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    g.enemyBullets = g.enemyBullets.filter(
      (b) => b.life > 0 && b.x > -12 && b.x < W + 12 && b.y > -12 && b.y < H + 12
    );

    // bullet × rock
    for (const b of g.bullets) {
      for (const r of g.rocks) {
        if (dist(b, r) < r.r) {
          b.life = 0;
          if (r.answerKey) {
            shootAnswer(r);
          } else {
            burst(r.x, r.y, COLORS.fg, 8);
            g.score += r.size === 3 ? 20 : r.size === 2 ? 50 : 100;
            setHudThrottled(g);
            if (r.size > 1) {
              const ns = (r.size - 1) as 1 | 2;
              for (let i = 0; i < 2; i++) {
                const nr = spawnRock(ns, r.x, r.y);
                nr.vx += r.vx * 0.4;
                nr.vy += r.vy * 0.4;
                g.rocks.push(nr);
              }
            }
            r.r = -1; // mark removed
          }
          break;
        }
      }
    }
    g.rocks = g.rocks.filter((r) => r.r > 0);

    // ship × rock
    if (s.invuln <= 0) {
      for (const r of g.rocks) {
        if (!r.answerKey && dist(s, r) < r.r + 11) {
          crash();
          break;
        }
      }
    }

    // player bullet × enemy
    for (const b of g.bullets) {
      if (b.life <= 0) continue;
      for (const e of g.enemies) {
        if (e.hp > 0 && dist(b, e) < e.r) {
          b.life = 0;
          e.hp -= 1;
          burst(b.x, b.y, ENEMY_COLOR, 6);
          if (e.hp <= 0) {
            burst(e.x, e.y, ENEMY_COLOR, e.boss ? 40 : 16);
            g.score += e.boss ? 1500 : 150;
            setHudThrottled(g);
            if (e.boss) g.alert = { text: "FLAGSHIP DESTROYED  +1500", until: g.now + 2600 };
          }
          break;
        }
      }
    }

    // enemy fire / ramming × ship (guarded by invuln so crash() can't double-hit)
    if (s.invuln <= 0) {
      let hit = false;
      for (const b of g.enemyBullets) {
        if (dist(s, b) < 12) {
          b.life = 0;
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const e of g.enemies) {
          if (dist(s, e) < e.r + 10) {
            if (!e.boss) e.hp = 0; // ramming a fighter destroys it
            hit = true;
            break;
          }
        }
      }
      if (hit) crash();
    }
    g.enemies = g.enemies.filter((e) => e.hp > 0);

    // particles
    for (const p of g.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
  }

  let hudPush = 0;
  function setHudThrottled(g: World) {
    const t = performance.now();
    if (t - hudPush > 120) {
      hudPush = t;
      setHud({ score: g.score, lives: g.lives });
    }
  }

  // ── render ───────────────────────────────────────────────────────
  function render(ctx: CanvasRenderingContext2D, g: World, t: number) {
    // Map the W×H logical space onto the supersampled buffer (idempotent each frame).
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.fillStyle = "#070c14";
    ctx.fillRect(0, 0, W, H);

    // particles
    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    // rocks
    for (const r of g.rocks) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle);
      ctx.beginPath();
      for (let i = 0; i < r.shape.length; i++) {
        const a = (i / r.shape.length) * Math.PI * 2;
        const rad = r.r * r.shape[i];
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = r.answerKey ? COLORS.warn : COLORS.dim;
      ctx.stroke();
      ctx.restore();
      if (r.label) {
        ctx.fillStyle = COLORS.warn;
        ctx.font = "bold 18px 'Geist Mono', ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(r.label, r.x, r.y);
      }
    }

    // hostile starships + their fire
    for (const e of g.enemies) drawEnemy(ctx, e, t);
    ctx.fillStyle = ENEMY_COLOR;
    for (const b of g.enemyBullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);

    // bullets
    ctx.fillStyle = COLORS.fg;
    for (const b of g.bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);

    // ship (hidden while dead/complete overlay)
    if (g.phase !== "dead" && g.phase !== "complete") drawShip(ctx, g, t);

    // reading dim
    if (g.phase === "reading") {
      ctx.fillStyle = "rgba(7,12,20,0.55)";
      ctx.fillRect(0, 0, W, H);
    }

    // flash
    if (g.flash && t < g.flash.until) {
      ctx.globalAlpha = 0.18 * ((g.flash.until - t) / 450);
      ctx.fillStyle = g.flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // hostile-inbound / boss-down banner
    if (g.alert && t < g.alert.until) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (g.alert.until - t) / 500);
      ctx.fillStyle = ENEMY_COLOR;
      ctx.font = "bold 15px 'Geist Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = ENEMY_COLOR;
      ctx.shadowBlur = 12;
      ctx.fillText(g.alert.text, W / 2, 46);
      ctx.restore();
    }

    // HUD
    ctx.fillStyle = COLORS.fg;
    ctx.font = "bold 16px 'Geist Mono', ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`SCORE ${g.score}`, 14, 12);
    ctx.textAlign = "right";
    ctx.fillText("♥".repeat(Math.max(0, g.lives)), W - 14, 12);
    // power indicators
    const powers: string[] = [];
    if (g.ship.shield) powers.push("SHIELD");
    if (t < g.power.rapidUntil) powers.push("RAPID");
    if (t < g.power.spreadUntil) powers.push("SPREAD");
    if (powers.length) {
      ctx.fillStyle = COLORS.good;
      ctx.font = "bold 12px 'Geist Mono', ui-monospace, monospace";
      ctx.fillText(powers.join("  "), W - 14, 34);
    }
    // question progress
    ctx.fillStyle = COLORS.dim;
    ctx.textAlign = "center";
    ctx.font = "12px 'Geist Mono', ui-monospace, monospace";
    ctx.fillText(`Q ${Math.min(g.qIndex + 1, questions.length)} / ${questions.length}`, W / 2, 14);
  }

  function drawShip(ctx: CanvasRenderingContext2D, g: World, t: number) {
    const s = g.ship;
    if (s.invuln > 0 && Math.floor(t / 100) % 2 === 0) return; // blink while invuln
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.ship;
    ctx.stroke();
    if (s.shield) {
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.good;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Enemy flagship silhouette — neon double-stroke, twin flames, sway.
  function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
    const s = e.r;
    const ang = Math.sin(t * 0.0016 + e.sway) * 0.12; // slow menace sway
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = ENEMY_COLOR; // every glow in this draw uses the same colour
    const flick = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.016 + e.sway));

    // twin thruster flames
    for (const dx of ENEMY_FLAME_DX) {
      let p = enemyPoint(e, cos, sin, dx - 0.09, ENEMY_FLAME_Y);
      const blx = p.x;
      const bly = p.y;
      p = enemyPoint(e, cos, sin, dx, ENEMY_FLAME_Y + 0.34 * flick);
      const tipx = p.x;
      const tipy = p.y;
      p = enemyPoint(e, cos, sin, dx + 0.09, ENEMY_FLAME_Y);
      ctx.beginPath();
      ctx.moveTo(blx, bly);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(${ENEMY_RGB},${0.28 + 0.35 * flick})`;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // hull — neon double-stroke (colour glow + thin white inner line)
    for (const path of ENEMY_PATHS) {
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const q = enemyPoint(e, cos, sin, path[i][0], path[i][1]);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.fillStyle = ENEMY_HULL_FILL;
      ctx.fill();
      ctx.shadowBlur = 12;
      ctx.strokeStyle = ENEMY_COLOR;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // Company emblem across the flagship's central deck (boss only — illegible
    // at fighter scale). Sways with the hull.
    const logo = bossLogoRef.current;
    if (e.boss && logo && logo.complete && logo.naturalWidth > 0) {
      const ar = logo.naturalWidth / logo.naturalHeight;
      const dw = s * 1.5;
      const dh = dw / ar;
      const oy = s * 0.04;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(ang);
      ctx.shadowBlur = 12;
      ctx.drawImage(logo, -dw / 2, oy - dh / 2, dw, dh);
      ctx.restore();
    }

    // boss health bar
    if (e.boss) {
      const bw = e.r * 2.2;
      const bx = e.x - bw / 2;
      const by = e.y - e.r * 1.75;
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = ENEMY_COLOR;
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / ENEMY_BOSS_HP), 5);
    }
  }

  // ── input ────────────────────────────────────────────────────────
  useEffect(() => {
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const g = worldRef.current;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") g.keys.left = down;
      else if (k === "arrowright" || k === "d") g.keys.right = down;
      else if (k === "arrowup" || k === "w") g.keys.thrust = down;
      else if (k === "enter") {
        if (down && g.phase === "reading") {
          e.preventDefault();
          skipRead(); // Enter skips the read countdown
        }
      } else if (k === " " || k === "spacebar") {
        g.keys.fire = down;
        e.preventDefault();
      } else return;
    };
    const kd = (e: KeyboardEvent) => setKey(e, true);
    const ku = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const q = questions[qIndex];
  const keys = q ? optionKeys(q) : [];

  // touch/hold helpers for on-screen controls
  const hold = (which: "left" | "right" | "thrust" | "fire") => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      worldRef.current.keys[which] = true;
    },
    onPointerUp: () => (worldRef.current.keys[which] = false),
    onPointerLeave: () => (worldRef.current.keys[which] = false),
    onPointerCancel: () => (worldRef.current.keys[which] = false),
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[18px] sm:text-[22px] font-extrabold tracking-[-0.02em] text-kp-navy">
          {test.name} <span className="text-kp-crimson">· Asteroids</span>
        </h1>
        <button
          type="button"
          onClick={onExit}
          className="px-3 py-1.5 text-[12.5px] font-semibold text-kp-text-muted hover:text-kp-navy border border-kp-border rounded-lg"
        >
          Exit
        </button>
      </div>

      {/* Fill the width, but cap by viewport height so the aspect-locked field
       * never overflows. 16.5rem ≈ the surrounding chrome (header row + the
       * answer panel/help text below + page padding) reserved off 100dvh. */}
      <div
        className="relative mx-auto rounded-xl overflow-hidden border border-kp-border shadow-2xs bg-black"
        style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc((100dvh - 16.5rem) * ${W} / ${H}))` }}
      >
        <canvas ref={canvasRef} width={W * RENDER_SCALE} height={H * RENDER_SCALE} className="absolute inset-0 w-full h-full" />

        {/* HUD mirror (score/lives are drawn on canvas; this is a11y text) */}
        <span className="sr-only">Score {hud.score}, {hud.lives} lives</span>

        {/* Intro */}
        {phase === "intro" && (
          <Overlay>
            <div className="text-white text-center max-w-md">
              <div className="text-[26px] font-extrabold mb-2">Asteroids Quiz</div>
              <p className="text-[13.5px] text-white/80 mb-4">
                Fly with <b>← →</b> (rotate) and <b>↑ / W</b> (thrust), <b>Space</b> to shoot — or use the on-screen buttons.
                A question freezes the game; read it, then shoot the asteroid with the <b>correct</b>{" "}
                answer — the rest blow up for bonus points. A wrong shot (or a crash) costs a life, and you
                get <b>{livesBudget}</b> {livesBudget === 1 ? "life" : "lives"} — your wrong-answer budget.
                Clear all {questions.length} to finish.
              </p>
              <button
                type="button"
                onClick={() => enterReading(0)}
                className="px-6 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[15px] font-bold rounded-lg"
              >
                Start ▶
              </button>
            </div>
          </Overlay>
        )}

        {/* Reading: big question, timed */}
        {phase === "reading" && q && (
          <Overlay>
            <div className="bg-kp-surface/95 rounded-xl border border-kp-border shadow-lg max-w-lg w-[92%] p-5">
              <div className="font-mono text-[11px] uppercase tracking-wide text-kp-text-faint mb-1">
                Question {qIndex + 1} of {questions.length}
              </div>
              <div className="text-[16px] font-bold text-kp-text mb-3">{q.text}</div>
              <div className="space-y-1.5 mb-4">
                {keys.map((k) => (
                  <div key={k} className="flex gap-2 text-[13.5px] text-kp-text">
                    <span className="font-mono font-bold text-kp-crimson">{rockLabel(q, k)}</span>
                    <span>{optionText(q, k)}</span>
                  </div>
                ))}
              </div>
              <div className="h-1.5 bg-kp-surface-alt rounded-full overflow-hidden">
                <div className="h-full bg-kp-crimson transition-[width] duration-75" style={{ width: `${readingLeft * 100}%` }} />
              </div>
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <button
                  onClick={skipRead}
                  className="text-[12.5px] font-semibold text-kp-text bg-kp-surface-alt hover:bg-kp-border border border-kp-border rounded-lg px-3.5 py-1.5 transition-colors"
                >
                  Press <span className="font-mono font-bold">Enter</span> to continue →
                </button>
                <div className="text-[11px] text-kp-text-faint">Then shoot the asteroid with the correct answer</div>
              </div>
            </div>
          </Overlay>
        )}

        {/* Answering: docked question */}
        {/* Dead: choice */}
        {phase === "dead" && (
          <Overlay>
            <div className="text-white text-center max-w-sm">
              <div className="text-[26px] font-extrabold mb-1">Game Over</div>
              <p className="text-[13.5px] text-white/80 mb-4">
                You answered {Object.keys(worldRef.current.answers).length} of {questions.length} before running
                out of lives. Start over from the top, or finish the rest as a normal quiz.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    // Full restart from question 1: reset the whole world (never
                    // drifts from the World shape), but keep the live clock so
                    // enterReading(0)'s read-timer deadline lands in the future.
                    const now = worldRef.current.now;
                    worldRef.current = newWorld();
                    worldRef.current.now = now;
                    setHud({ score: 0, lives: livesBudget });
                    setReadingLeft(1);
                    enterReading(0);
                  }}
                  className="px-5 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[14px] font-bold rounded-lg"
                >
                  Start over ↻
                </button>
                <button
                  type="button"
                  onClick={() => onFallback(worldRef.current.answers)}
                  className="px-5 py-2.5 bg-white/15 hover:bg-white/25 text-white text-[14px] font-semibold rounded-lg"
                >
                  Finish as normal quiz
                </button>
              </div>
            </div>
          </Overlay>
        )}

        {/* Complete */}
        {phase === "complete" && (
          <Overlay>
            <div className="text-white text-center max-w-sm">
              <div className="text-[26px] font-extrabold mb-1">All questions cleared! 🎉</div>
              <p className="text-[13.5px] text-white/80 mb-4">
                Final score <b>{hud.score}</b>. Submit to see how you did.
              </p>
              <button
                type="button"
                onClick={() => onComplete(worldRef.current.answers)}
                className="px-6 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[15px] font-bold rounded-lg"
              >
                See your results →
              </button>
            </div>
          </Overlay>
        )}

        {/* On-screen touch controls (all phases while playing) */}
        {(phase === "answering" || phase === "freeplay") && (
          <>
            <div className="absolute bottom-2 left-2 flex gap-2 sm:hidden">
              <CtrlButton {...hold("left")}>◀</CtrlButton>
              <CtrlButton {...hold("right")}>▶</CtrlButton>
            </div>
            <div className="absolute bottom-2 right-2 flex gap-2 sm:hidden">
              <CtrlButton {...hold("thrust")}>▲</CtrlButton>
              <CtrlButton {...hold("fire")}>●</CtrlButton>
            </div>
          </>
        )}
      </div>

      {/* Question shown BELOW the play field (during answering) so it never
       * covers the asteroids. */}
      {phase === "answering" && q && (
        <div className="mt-3 bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-3.5">
          <div className="text-[14px] font-bold text-kp-text mb-2 leading-snug">{q.text}</div>
          <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1">
            {keys.map((k) => (
              <div key={k} className="text-[13px] text-kp-text-muted">
                <span className="font-mono font-bold text-kp-crimson">{rockLabel(q, k)}</span> — {optionText(q, k)}
              </div>
            ))}
          </div>
          <div className="text-[12px] text-kp-text-faint mt-2">🎯 Shoot the asteroid labeled with the correct answer.</div>
        </div>
      )}

      <div className="mt-3 text-center text-[12px] text-kp-text-faint">
        ← → rotate · ↑/W thrust · Space shoot &nbsp;·&nbsp; shoot the asteroid with the correct answer
      </div>
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/40">{children}</div>
  );
}
function CtrlButton({ children, ...rest }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className="w-14 h-14 rounded-full bg-white/15 active:bg-white/30 text-white text-[20px] font-bold flex items-center justify-center select-none touch-none"
    >
      {children}
    </button>
  );
}

function wrap(v: number, max: number): number {
  return v < 0 ? v + max : v >= max ? v - max : v;
}
function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
