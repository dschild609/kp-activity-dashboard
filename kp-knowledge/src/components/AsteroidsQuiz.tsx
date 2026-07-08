import { useEffect, useRef, useState } from "react";
import type { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { AnswerKey, KnowledgeQuestion, KnowledgeTest } from "../types/knowledge";

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
  now: number;
}

const W = 900;
const H = 560;
const COLORS = { fg: "#e9f2ff", ship: "#eaf2ff", accent: "#ff3b5c", good: "#3ddc84", warn: "#ffcf5c", dim: "#5b6b7f" };

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
}: {
  quiz: { questions: KnowledgeQuestion[] };
  test: KnowledgeTest;
  onComplete: (answers: Record<string, AnswerKey | null>) => void;
  onFallback: (answers: Record<string, AnswerKey | null>) => void;
  onExit: () => void;
}) {
  const questions = quiz.questions;
  // Lives = the test's wrong-answer budget: if they can miss N and still
  // pass, they get N lives. Each wrong shot / crash spends one.
  const livesBudget = Math.max(1, test.maxWrongToPass || 1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      now: 0,
    };
  }

  function setPhaseBoth(p: Phase) {
    worldRef.current.phase = p;
    setPhase(p);
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
    const q = questions[i];
    const chars = q.text.length + optionKeys(q).reduce((s, k) => s + optionText(q, k).length, 0);
    g.readingTotal = Math.min(9000, Math.max(3500, 2200 + chars * 22));
    g.readingUntil = g.now + g.readingTotal;
    setQIndex(i);
    setPhaseBoth("reading");
  }
  function enterAnswering() {
    const g = worldRef.current;
    const q = questions[g.qIndex];
    const keys = optionKeys(q);
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
    else {
      g.freeplayUntil = g.now + 8500;
      setPhaseBoth("freeplay");
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
      setPhaseBoth("dead");
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

    // spawn generic rocks during freeplay
    if (g.phase === "freeplay") {
      const generic = g.rocks.filter((r) => !r.answerKey).length;
      if (generic < 4 && Math.random() < 0.03) g.rocks.push(spawnRock(3));
    }

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

  // ── input ────────────────────────────────────────────────────────
  useEffect(() => {
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const g = worldRef.current;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") g.keys.left = down;
      else if (k === "arrowright" || k === "d") g.keys.right = down;
      else if (k === "arrowup" || k === "w") g.keys.thrust = down;
      else if (k === " " || k === "spacebar") {
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
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6">
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

      <div className="relative w-full rounded-xl overflow-hidden border border-kp-border shadow-2xs bg-black" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" />

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
              <div className="text-[11.5px] text-kp-text-faint mt-2 text-center">Get ready — shoot the correct asteroid…</div>
            </div>
          </Overlay>
        )}

        {/* Answering: docked question */}
        {phase === "answering" && q && (
          <div className="absolute top-2 left-2 right-2 sm:right-auto sm:max-w-xs bg-black/70 rounded-lg border border-white/15 p-2.5 backdrop-blur-sm pointer-events-none">
            <div className="text-[13px] font-bold text-white mb-1.5 leading-snug">{q.text}</div>
            <div className="space-y-0.5">
              {keys.map((k) => (
                <div key={k} className="text-[12px] text-white/85">
                  <span className="font-mono font-bold text-kp-warn">{rockLabel(q, k)}</span> — {optionText(q, k)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dead: choice */}
        {phase === "dead" && (
          <Overlay>
            <div className="text-white text-center max-w-sm">
              <div className="text-[24px] font-extrabold mb-1">Out of lives</div>
              <p className="text-[13.5px] text-white/80 mb-4">
                You answered {Object.keys(worldRef.current.answers).length} of {questions.length}. Keep flying, or
                finish the rest as a normal quiz.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const g = worldRef.current;
                    g.lives = livesBudget;
                    g.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, invuln: 2.5, shield: false };
                    setHud({ score: g.score, lives: g.lives });
                    // resume: if a question is mid-answer, keep answering; else freeplay
                    if (!g.answeredThisQ && g.rocks.some((r) => r.answerKey)) setPhaseBoth("answering");
                    else enterReading(g.answeredThisQ ? g.qIndex + 1 : g.qIndex);
                  }}
                  className="px-5 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[14px] font-bold rounded-lg"
                >
                  Keep playing ▶
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
