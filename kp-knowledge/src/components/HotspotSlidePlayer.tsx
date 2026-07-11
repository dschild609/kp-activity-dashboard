import { useEffect, useRef, useState } from "react";
import type { KnowledgeSlide } from "../types/knowledge";
import { HOTSPOT_FALLBACK_PROMPT, HOTSPOT_REVEAL_AFTER, hotspotHit } from "../lib/hotspot";

/* The employee-facing hotspot exercise: find and click the target region on
 * the screenshot to continue. Misses get a ripple + a nudge; after a few
 * misses a Reveal option appears so nobody gets stuck. Once found (or
 * revealed), the target lights up, the explanation note is shown, and the
 * deck's Next button unlocks. Renders in slide styling (ink/crimson/cream)
 * to sit naturally inside the deck.
 *
 * Mount with key={slideIndex} — a new slide gets a fresh exercise (miss
 * count, ripple, reveal) via remount rather than reset-in-effect. */

const INK = "#13202b";
const CRIMSON = "#94002a";
const CREAM = "#f5f4ef";
const MUTED = "#5b6770";

export function HotspotSlidePlayer({
  slide,
  gate,
  found,
  onFound,
}: {
  slide: KnowledgeSlide;
  /* False in admin preview — no lock, but the exercise still works */
  gate: boolean;
  found: boolean;
  onFound: () => void;
}) {
  const [misses, setMisses] = useState(0);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const rippleTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
  }, []);

  const hs = slide.hotspot!;
  const done = found || revealed;

  function handleClick(e: React.MouseEvent<HTMLSpanElement>) {
    if (done) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - bounds.left) / bounds.width;
    const ny = (e.clientY - bounds.top) / bounds.height;
    if (hotspotHit(hs, nx, ny)) {
      onFound();
      return;
    }
    setMisses((m) => m + 1);
    setRipple({ x: nx, y: ny, key: Date.now() });
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => setRipple(null), 650);
  }

  function reveal() {
    setRevealed(true);
    onFound(); // counts as complete — the point is seeing where it is
  }

  return (
    <div
      className="w-full rounded-xl border border-kp-border shadow-2xs overflow-hidden"
      style={{ background: CREAM }}
    >
      <div className="px-6 sm:px-8 pt-6">
        {slide.kicker && (
          <div className="font-mono uppercase text-[11px] tracking-[0.18em] font-bold" style={{ color: CRIMSON }}>
            {slide.kicker}
          </div>
        )}
        <h2 className="font-extrabold leading-tight tracking-[-0.02em] text-[22px] sm:text-[26px]" style={{ color: INK }}>
          {slide.title}
        </h2>
        <div
          className="mt-3 inline-block rounded-lg px-3.5 py-2.5 text-[14px] font-semibold"
          style={{ background: "rgba(148,0,42,.08)", border: "1px solid rgba(148,0,42,.25)", color: INK }}
        >
          🎯 {slide.hotspotPrompt || HOTSPOT_FALLBACK_PROMPT}
        </div>
      </div>

      <div className="flex justify-center px-4 sm:px-8 py-5">
        <span
          className={`relative inline-block max-w-full ${done ? "" : "cursor-crosshair"}`}
          onClick={handleClick}
        >
          <img
            src={slide.imageUrl!}
            alt="Find the target"
            className="block max-w-full max-h-[56vh] bg-white select-none"
            style={{ boxShadow: "0 2px 10px rgba(19,32,43,.18)" }}
            draggable={false}
          />
          {done && (
            <span
              className="absolute border-[3px] pointer-events-none animate-pulse"
              style={{
                left: `${hs.x * 100}%`,
                top: `${hs.y * 100}%`,
                width: `${hs.w * 100}%`,
                height: `${hs.h * 100}%`,
                borderColor: revealed ? "#b8860b" : "#1c7c46",
                background: revealed ? "rgba(184,134,11,.18)" : "rgba(28,124,70,.18)",
                borderRadius: 4,
              }}
            />
          )}
          {ripple && !done && (
            <span
              key={ripple.key}
              className="absolute pointer-events-none rounded-full border-2"
              style={{
                left: `calc(${ripple.x * 100}% - 14px)`,
                top: `calc(${ripple.y * 100}% - 14px)`,
                width: 28,
                height: 28,
                borderColor: CRIMSON,
                background: "rgba(148,0,42,.15)",
              }}
            />
          )}
        </span>
      </div>

      <div className="px-6 sm:px-8 pb-6">
        {done ? (
          <div className="text-[13.5px] leading-relaxed">
            <span className="font-bold" style={{ color: revealed ? "#8a6508" : "#1c7c46" }}>
              {revealed ? "Here it is — remember this spot." : "✓ You found it!"}
            </span>
            {slide.note && (
              <span className="block mt-1.5 pl-3" style={{ borderLeft: `3px solid ${CRIMSON}`, color: MUTED }}>
                {slide.note}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: MUTED }}>
            <span>
              {misses === 0
                ? "Click the spot on the screenshot."
                : misses === 1
                  ? "Not quite — look again."
                  : "Still hunting — check the instruction above."}
            </span>
            {misses >= HOTSPOT_REVEAL_AFTER && (
              <button
                type="button"
                onClick={reveal}
                className="px-3 py-1.5 text-[12.5px] font-semibold rounded-lg border transition-colors"
                style={{ borderColor: "#c9c3b4", color: INK }}
              >
                Show me
              </button>
            )}
            {gate && <span className="ml-auto text-[12px]" style={{ color: "#98a1a8" }}>Find it to continue</span>}
          </div>
        )}
      </div>
    </div>
  );
}
