import { useRef, useState } from "react";
import type { BlurBox } from "./types";

interface BlurEditorProps {
  imageUrl?: string;
  boxes: BlurBox[];
  onChange: (boxes: BlurBox[]) => void;
}

interface DraftBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Draw manual redaction rectangles over a screenshot. Boxes are stored
 *  normalized 0–1 so they survive scaling and get rasterized at publish. */
export function BlurEditor({ imageUrl, boxes, onChange }: BlurEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftBox | null>(null);

  function pointFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
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
    const box: BlurBox = {
      x: Math.min(draft.x0, draft.x1),
      y: Math.min(draft.y0, draft.y1),
      w: Math.abs(draft.x1 - draft.x0),
      h: Math.abs(draft.y1 - draft.y0),
    };
    setDraft(null);
    if (box.w > 0.015 && box.h > 0.015) onChange([...boxes, box]);
  }

  function removeBox(i: number) {
    onChange(boxes.filter((_, idx) => idx !== i));
  }

  const draftStyle = draft
    ? {
        left: `${Math.min(draft.x0, draft.x1) * 100}%`,
        top: `${Math.min(draft.y0, draft.y1) * 100}%`,
        width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
        height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
      }
    : null;

  return (
    <div className="space-y-2">
      <div
        ref={ref}
        className="relative select-none bg-kp-surface-alt border border-kp-border rounded-lg overflow-hidden cursor-crosshair"
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

        {boxes.map((b, i) => (
          <div
            key={i}
            className="absolute bg-kp-crimson/45 border border-kp-crimson [backdrop-filter:blur(6px)] group"
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeBox(i);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Remove blur"
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-kp-crimson text-white text-[11px] leading-none grid place-items-center shadow-lg opacity-0 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        {draftStyle && (
          <div
            className="absolute bg-kp-crimson/30 border border-dashed border-kp-crimson pointer-events-none"
            style={draftStyle}
          />
        )}
      </div>
      <p className="text-[11px] text-kp-text-muted">
        Drag on the image to blur sensitive data. Hover a box and click × to
        remove.{" "}
        {boxes.length > 0 && (
          <span className="text-kp-crimson font-semibold">
            {boxes.length} region{boxes.length === 1 ? "" : "s"} blurred
          </span>
        )}
      </p>
    </div>
  );
}
