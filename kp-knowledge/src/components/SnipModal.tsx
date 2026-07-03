import { useRef, useState } from "react";

/* Drag-to-crop overlay for slide images: draw a rectangle over the image,
 * and the selected region is cut out at the image's natural resolution
 * (canvas crop in the browser) and handed back as base64 JPEG. */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SnipModal({
  imageUrl,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  onCancel: () => void;
  /* Receives the selection as fractions of the image (0-1); the actual
   * crop happens server-side at native resolution */
  onConfirm: (region: { x: number; y: number; w: number; h: number }) => Promise<void>;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pos(e: React.MouseEvent): { x: number; y: number } {
    const bounds = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - bounds.left, bounds.width)),
      y: Math.max(0, Math.min(e.clientY - bounds.top, bounds.height)),
    };
  }

  const bigEnough = rect && rect.w > 12 && rect.h > 12;

  async function confirm() {
    const img = imgRef.current;
    if (!img || !rect || !bigEnough || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        x: rect.x / img.clientWidth,
        y: rect.y / img.clientHeight,
        w: rect.w / img.clientWidth,
        h: rect.h / img.clientHeight,
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
      <div className="bg-kp-surface rounded-2xl shadow-2xl max-w-4xl w-full max-h-full overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[16px] font-bold text-kp-text">Snip image</h3>
            <p className="text-[12.5px] text-kp-text-muted">
              Drag a rectangle over the part you want on the slide.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-3.5 py-2 text-[13px] font-semibold text-kp-text-muted border border-kp-border rounded-lg hover:bg-kp-surface-alt disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!bigEnough || busy}
              className="px-3.5 py-2 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[13px] font-semibold rounded-lg disabled:opacity-40"
            >
              {busy ? "Snipping…" : "Use snip"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-3">
            {error}
          </div>
        )}

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
              alt="Snip source"
              className="block max-h-[65vh] max-w-full"
              draggable={false}
            />
            {rect && (
              <div
                className="absolute border-2 pointer-events-none"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  borderColor: "#94002a",
                  boxShadow: "0 0 0 9999px rgba(0,0,0,.45)",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
