import { useRef, useState } from "react";
import type { Annotation, BlurBox, Crop, Step } from "./types";
import { BlurEditor } from "./BlurEditor";

interface StepCardProps {
  step: Step;
  index: number;
  total: number;
  videoUrl?: string;
  onChange: (patch: Partial<Step>) => void;
  onGrabFrame?: (timestampMs: number) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function StepCard({
  step,
  index,
  total,
  videoUrl,
  onChange,
  onGrabFrame,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function useThisFrame() {
    const v = videoRef.current;
    if (!v || !onGrabFrame) return;
    setGrabbing(true);
    try {
      await onGrabFrame(Math.round(v.currentTime * 1000));
      setVideoOpen(false);
    } finally {
      setGrabbing(false);
    }
  }

  const editorProps = {
    imageUrl: step.screenshotDownloadUrl,
    boxes: step.blurBoxes,
    annotations: step.annotations ?? [],
    crop: step.crop ?? null,
    onBoxesChange: (boxes: BlurBox[]) => onChange({ blurBoxes: boxes }),
    onAnnotationsChange: (annotations: Annotation[]) => onChange({ annotations }),
    onCropChange: (crop: Crop | null) => onChange({ crop }),
  };

  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-kp-surface-alt border-b border-kp-border">
        <span className="w-7 h-7 rounded-lg bg-kp-navy text-white grid place-items-center text-[13px] font-bold tabular-nums">
          {index + 1}
        </span>
        <span className="kp-kicker !border-l-0 !pl-0">Step {index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn label="Move up" disabled={index === 0} onClick={onMoveUp}>
            ↑
          </IconBtn>
          <IconBtn
            label="Move down"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            ↓
          </IconBtn>
          <IconBtn label="Delete step" danger onClick={onDelete}>
            🗑
          </IconBtn>
        </div>
      </div>

      <div className="p-4 grid md:grid-cols-2 gap-4">
        <div>
          <BlurEditor {...editorProps} />
          <div className="mt-2 flex items-center gap-3">
            {step.screenshotDownloadUrl && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-[12px] font-semibold text-kp-text-muted hover:text-kp-text"
              >
                ⤢ Expand to full screen
              </button>
            )}
            {videoUrl && onGrabFrame && (
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className="text-[12px] font-semibold text-kp-text-muted hover:text-kp-text"
              >
                🎞 Grab frame from recording
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-[11px] font-mono uppercase tracking-wider text-kp-text-muted mb-1">
              Title
            </span>
            <input
              value={step.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Step title"
              className="w-full px-3 py-2 text-[14px] font-semibold bg-kp-surface border border-kp-border rounded-lg focus-kp"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-mono uppercase tracking-wider text-kp-text-muted mb-1">
              Instruction
            </span>
            <textarea
              value={step.instruction}
              onChange={(e) => onChange({ instruction: e.target.value })}
              rows={4}
              placeholder="What the user should do at this step"
              className="w-full px-3 py-2 text-[13.5px] bg-kp-surface border border-kp-border rounded-lg focus-kp resize-y"
            />
          </label>
          {step.narration && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-kp-text-faint font-mono uppercase tracking-wider text-[10.5px]">
                Narration
              </summary>
              <p className="mt-1 text-kp-text-muted italic">"{step.narration}"</p>
            </details>
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-kp-surface rounded-2xl p-4 w-full max-w-[92vw] max-h-[92vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="kp-kicker !border-l-0 !pl-0">
                Step {index + 1} — full screen
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="px-3 py-1.5 rounded-lg border border-kp-border text-[13px] font-semibold text-kp-text hover:bg-kp-surface-alt"
              >
                Close ✕
              </button>
            </div>
            <BlurEditor {...editorProps} />
          </div>
        </div>
      )}

      {videoOpen && videoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setVideoOpen(false)}
        >
          <div
            className="bg-kp-surface rounded-2xl p-4 w-full max-w-[900px] max-h-[92vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="kp-kicker !border-l-0 !pl-0">
                Step {index + 1} — scrub to the frame you want
              </span>
              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-kp-border text-[13px] font-semibold text-kp-text hover:bg-kp-surface-alt"
              >
                Close ✕
              </button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full rounded-lg bg-black"
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = (step.timestampMs || 0) / 1000;
                }
              }}
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] text-kp-text-muted">
                Pause on the exact frame, then use it as this step's screenshot.
              </p>
              <button
                type="button"
                onClick={useThisFrame}
                disabled={grabbing}
                className="px-4 py-2 text-[13px] font-bold text-white bg-kp-crimson rounded-lg hover:bg-kp-crimson-hover disabled:opacity-50"
              >
                {grabbing ? "Capturing…" : "📷 Use this frame"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 grid place-items-center rounded-lg border text-[14px] transition-colors disabled:opacity-30 disabled:cursor-default ${
        danger
          ? "border-kp-border text-kp-crimson hover:bg-kp-bad-bg hover:border-kp-bad-border"
          : "border-kp-border text-kp-text-muted hover:bg-kp-surface-alt hover:border-kp-border-strong"
      }`}
    >
      {children}
    </button>
  );
}
