import { useEffect, useRef, useState } from "react";
import type { Annotation, BlurBox } from "./types";

type Tool = "blur" | "arrow" | "circle";
// crimson, blue, green, amber
const COLORS = ["B5172D", "1F6FD0", "0F9D63", "C2820C"];

interface EditorProps {
  imageUrl?: string;
  boxes: BlurBox[];
  annotations: Annotation[];
  onBoxesChange: (boxes: BlurBox[]) => void;
  onAnnotationsChange: (annotations: Annotation[]) => void;
}

interface Draft {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Screenshot editor: blur boxes to redact, plus arrows and highlight-circles.
 *  Everything is stored normalized 0–1 and rasterized into the image at publish. */
export function BlurEditor({
  imageUrl,
  boxes,
  annotations,
  onBoxesChange,
  onAnnotationsChange,
}: EditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("blur");
  const [color, setColor] = useState(COLORS[0]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [imageUrl]);

  function pointFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || !imageUrl) return;
    const p = pointFromEvent(e);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!draft) return;
    const p = pointFromEvent(e);
    setDraft({ ...draft, x1: p.x, y1: p.y });
  }
  function onMouseUp() {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    const dx = Math.abs(d.x1 - d.x0);
    const dy = Math.abs(d.y1 - d.y0);
    if (tool === "blur") {
      if (dx > 0.015 && dy > 0.015) {
        onBoxesChange([
          ...boxes,
          { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: dx, h: dy },
        ]);
      }
    } else if (tool === "arrow") {
      if (Math.hypot(dx, dy) > 0.03) {
        onAnnotationsChange([
          ...annotations,
          { type: "arrow", x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, color },
        ]);
      }
    } else if (dx > 0.02 && dy > 0.02) {
      onAnnotationsChange([
        ...annotations,
        { type: "circle", x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, color },
      ]);
    }
  }

  const W = size.w || 1;
  const H = size.h || 1;

  return (
    <div className="space-y-2">
      {/* Tool palette */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["blur", "arrow", "circle"] as Tool[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTool(t)}
            className={`px-2.5 py-1 rounded-lg border text-[12px] font-semibold transition-colors ${
              tool === t
                ? "bg-kp-navy text-white border-kp-navy"
                : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
            }`}
          >
            {t === "blur" ? "▩ Blur" : t === "arrow" ? "↗ Arrow" : "◯ Circle"}
          </button>
        ))}
        {tool !== "blur" && (
          <div className="flex items-center gap-1 ml-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title="Color"
                onClick={() => setColor(c)}
                style={{ background: `#${c}` }}
                className={`w-5 h-5 rounded-full border border-black/10 ${
                  color === c ? "ring-2 ring-offset-1 ring-kp-navy" : ""
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={ref}
        className="group relative select-none bg-kp-surface-alt border border-kp-border rounded-lg overflow-hidden cursor-crosshair"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Step screenshot"
            draggable={false}
            className="block w-full pointer-events-none"
          />
        ) : (
          <div className="aspect-video grid place-items-center text-kp-text-faint text-[12px] font-mono uppercase tracking-wider">
            No screenshot
          </div>
        )}

        {/* Blur boxes */}
        {boxes.map((b, i) => (
          <div
            key={`b${i}`}
            className="absolute bg-kp-crimson/45 border border-kp-crimson [backdrop-filter:blur(6px)]"
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
            }}
          >
            <RemoveBtn onClick={() => onBoxesChange(boxes.filter((_, idx) => idx !== i))} />
          </div>
        ))}

        {/* Annotations (arrows + circles) drawn in a pixel-accurate SVG */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          {annotations.map((a, i) => (
            <Shape key={`a${i}`} a={a} W={W} H={H} />
          ))}
          {draft && tool === "arrow" && (
            <Shape a={{ type: "arrow", x1: draft.x0, y1: draft.y0, x2: draft.x1, y2: draft.y1, color }} W={W} H={H} />
          )}
          {draft && tool === "circle" && (
            <Shape a={{ type: "circle", x1: draft.x0, y1: draft.y0, x2: draft.x1, y2: draft.y1, color }} W={W} H={H} />
          )}
        </svg>

        {/* Annotation remove buttons (anchored at arrow head / circle top-right) */}
        {annotations.map((a, i) => {
          const ax = a.type === "arrow" ? a.x2 : Math.max(a.x1, a.x2);
          const ay = a.type === "arrow" ? a.y2 : Math.min(a.y1, a.y2);
          return (
            <div key={`ar${i}`} className="absolute" style={{ left: `${ax * 100}%`, top: `${ay * 100}%` }}>
              <RemoveBtn onClick={() => onAnnotationsChange(annotations.filter((_, idx) => idx !== i))} />
            </div>
          );
        })}

        {/* Blur draft preview */}
        {draft && tool === "blur" && (
          <div
            className="absolute bg-kp-crimson/30 border border-dashed border-kp-crimson pointer-events-none"
            style={{
              left: `${Math.min(draft.x0, draft.x1) * 100}%`,
              top: `${Math.min(draft.y0, draft.y1) * 100}%`,
              width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
              height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
            }}
          />
        )}
      </div>

      <p className="text-[11px] text-kp-text-muted">
        {tool === "blur"
          ? "Drag to blur sensitive data."
          : tool === "arrow"
            ? "Drag from where you want the arrow to start, to where it points."
            : "Drag a box to circle/highlight an area."}{" "}
        Hover a mark and click × to remove.
      </p>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title="Remove"
      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-kp-navy text-white text-[11px] leading-none grid place-items-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
    >
      ×
    </button>
  );
}

function Shape({ a, W, H }: { a: Annotation; W: number; H: number }) {
  const c = `#${a.color}`;
  if (a.type === "circle") {
    return (
      <ellipse
        cx={((a.x1 + a.x2) / 2) * W}
        cy={((a.y1 + a.y2) / 2) * H}
        rx={(Math.abs(a.x2 - a.x1) / 2) * W}
        ry={(Math.abs(a.y2 - a.y1) / 2) * H}
        fill="none"
        stroke={c}
        strokeWidth={3}
      />
    );
  }
  const x1 = a.x1 * W;
  const y1 = a.y1 * H;
  const x2 = a.x2 * W;
  const y2 = a.y2 * H;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = 14;
  const back = (5 * Math.PI) / 6; // 150°
  const h1x = x2 + hl * Math.cos(ang + back);
  const h1y = y2 + hl * Math.sin(ang + back);
  const h2x = x2 + hl * Math.cos(ang - back);
  const h2y = y2 + hl * Math.sin(ang - back);
  return (
    <g stroke={c} strokeWidth={3} strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x2} y1={y2} x2={h1x} y2={h1y} />
      <line x1={x2} y1={y2} x2={h2x} y2={h2y} />
    </g>
  );
}
