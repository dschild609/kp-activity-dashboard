import type { BlurBox, Step } from "./types";
import { BlurEditor } from "./BlurEditor";

interface StepCardProps {
  step: Step;
  index: number;
  total: number;
  onChange: (patch: Partial<Step>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function StepCard({
  step,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StepCardProps) {
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
        <BlurEditor
          imageUrl={step.screenshotDownloadUrl}
          boxes={step.blurBoxes}
          onChange={(boxes: BlurBox[]) => onChange({ blurBoxes: boxes })}
        />

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
