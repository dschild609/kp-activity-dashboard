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

/* Toggleable selection chip (crimson when active) — role pickers, tag pickers. */
export function Chip({
  label,
  active,
  onClick,
  mono,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 rounded-lg border text-[12.5px] font-semibold transition-colors ${
        mono ? "font-mono" : ""
      } ${
        active
          ? "bg-kp-crimson-soft text-kp-crimson-soft-text border-kp-crimson-soft"
          : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
      }`}
    >
      {label}
    </button>
  );
}

/* Section-switcher pill (navy when active) — the admin tabs, arcade sub-tabs. */
export function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
        active
          ? "bg-kp-navy text-white border-kp-navy"
          : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
      }`}
    >
      {label}
    </button>
  );
}

/* Centered empty-state card for list/table pages. */
export function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center text-[14px] text-kp-text-muted">
      {children}
    </div>
  );
}

/* Card-wrapped data table: surface shell + styled header row. Pass <Th> cells
 * as `head` and <tr> rows as children. */
export function TableCard({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="bg-kp-surface-alt border-b border-kp-border-strong">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* "YOU" marker on the signed-in user's own leaderboard row. */
export function YouTag() {
  return (
    <span className="ml-2 align-middle text-[10px] font-bold tracking-wide text-kp-crimson">YOU</span>
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
