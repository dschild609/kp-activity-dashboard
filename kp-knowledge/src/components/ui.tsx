/* Small shared UI atoms used across pages — status pills, labeled inputs,
 * table headers, notice boxes, and the compact bordered button. */

export function Pill({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const cls = {
    good: "text-kp-good bg-kp-good-bg border-kp-good-border",
    bad: "text-kp-bad bg-kp-bad-bg border-kp-bad-border",
    warn: "text-kp-warn bg-kp-warn-bg border-kp-warn-border",
    neutral: "text-kp-text-muted bg-kp-surface-alt border-kp-border",
  }[tone];
  return (
    <span className={`shrink-0 px-2 py-0.5 text-[12.5px] font-bold rounded-[6px] border ${cls}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase text-kp-text-faint">{label}</span>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13.5px] disabled:opacity-50"
      />
    </label>
  );
}

export function SmallButton({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
}) {
  const cls =
    tone === "danger"
      ? "text-kp-bad border-kp-bad-border hover:bg-kp-bad-bg"
      : "text-kp-text-muted border-kp-border hover:bg-kp-surface-alt hover:text-kp-navy";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1.5 text-[12.5px] font-semibold border rounded-lg transition-colors disabled:opacity-30 ${cls}`}
    >
      {children}
    </button>
  );
}

export function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono text-[11.5px] font-bold tracking-[0.08em] uppercase text-kp-text-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function NoticeBox({
  tone,
  children,
  className,
}: {
  tone: "bad" | "good";
  children: React.ReactNode;
  className?: string;
}) {
  const cls =
    tone === "bad"
      ? "text-kp-bad bg-kp-bad-bg border-kp-bad-border"
      : "text-kp-good bg-kp-good-bg border-kp-good-border";
  return (
    <div className={`text-[13px] border rounded-lg p-3 ${cls} ${className ?? ""}`}>{children}</div>
  );
}
