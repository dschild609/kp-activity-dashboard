import { useRef, useState } from "react";
import type { HotspotRect } from "../types/knowledge";

/* Drag-to-set the click target on a hotspot slide — the same drag-select UX
 * as the snip tool, but the rectangle is stored on the slide as fractions of
 * the image (nothing is cropped or uploaded). An existing target is preloaded
 * so admins can adjust it. */

interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function HotspotModal({
  imageUrl,
  initial,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  initial: HotspotRect | null;
  onCancel: () => void;
  onConfirm: (target: HotspotRect) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<PxRect | null>(null);

  function pos(e: React.MouseEvent): { x: number; y: number } {
    const bounds = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - bounds.left, bounds.width)),
      y: Math.max(0, Math.min(e.clientY - bounds.top, bounds.height)),
    };
  }

  const bigEnough = rect && rect.w > 8 && rect.h > 8;

  function confirm() {
    const img = imgRef.current;
    if (!img || !rect || !bigEnough) return;
    onConfirm({
      x: rect.x / img.clientWidth,
      y: rect.y / img.clientHeight,
      w: rect.w / img.clientWidth,
      h: rect.h / img.clientHeight,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-kp-surface rounded-2xl shadow-2xl max-w-4xl w-full max-h-full overflow-y-auto p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[16px] font-bold text-kp-text">🎯 Set the click target</h3>
            <p className="text-[12.5px] text-kp-text-muted">
              Drag a rectangle over the spot the trainee has to find. A small margin around it
              counts too, so it doesn't need to be pixel-perfect.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 text-[13px] font-semibold text-kp-text-muted border border-kp-border rounded-lg hover:bg-kp-surface-alt"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!bigEnough}
              className="px-3.5 py-2 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[13px] font-semibold rounded-lg disabled:opacity-40"
            >
              Set target
            </button>
          </div>
        </div>

        <div className="flex justify-center bg-kp-surface-alt rounded-lg p-3">
          <div
            ref={wrapRef}
            className="relative inline-block cursor-crosshair select-none overflow-hidden"
            onMouseDown={(e) => {
              e.preventDefault();
              const p = pos(e);
              setStart(p);
              setRect({ x: p.x, y: p.y, w: 0, h: 0 });
            }}
            onMouseMove={(e) => {
              if (!start) return;
              const p = pos(e);
              setRect({
                x: Math.min(start.x, p.x),
                y: Math.min(start.y, p.y),
                w: Math.abs(p.x - start.x),
                h: Math.abs(p.y - start.y),
              });
            }}
            onMouseUp={() => setStart(null)}
            onMouseLeave={() => setStart(null)}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Hotspot source"
              className="block max-h-[65vh] max-w-full"
              draggable={false}
              onLoad={(e) => {
                // Preload the existing target (scaled to the displayed size)
                if (!initial || rect) return;
                const img = e.currentTarget;
                setRect({
                  x: initial.x * img.clientWidth,
                  y: initial.y * img.clientHeight,
                  w: initial.w * img.clientWidth,
                  h: initial.h * img.clientHeight,
                });
              }}
            />
            {rect && (
              <div
                className="absolute border-2 border-dashed pointer-events-none"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  borderColor: "var(--color-kp-crimson)",
                  background: "rgba(148,0,42,.15)",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
