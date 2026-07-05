import type { SopStatus } from "./types";

const MAP: Record<SopStatus, { label: string; cls: string }> = {
  processing: {
    label: "Processing",
    cls: "text-kp-warn bg-kp-warn-bg border-kp-warn-border",
  },
  draft: {
    label: "Draft",
    cls: "text-kp-info bg-kp-surface-alt border-kp-border",
  },
  published: {
    label: "Published",
    cls: "text-kp-good bg-kp-good-bg border-kp-good-border",
  },
};

export function StatusPill({ status }: { status: SopStatus }) {
  const s = MAP[status];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-[6px] border text-[11px] font-mono font-bold uppercase tracking-[0.06em] ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
