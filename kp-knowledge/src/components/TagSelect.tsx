/* Assign tags to a test from the managed vocabulary. Selected tags show as
 * removable chips; the dropdown lists the vocabulary tags not yet picked.
 * New tags are created on the admin page, not here. */
export function TagSelect({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const add = (tag: string) => {
    if (tag && !value.includes(tag)) onChange([...value, tag]);
  };
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));
  const available = options.filter((o) => !value.includes(o));

  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase text-kp-text-faint">Tags</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[12.5px] font-semibold bg-kp-crimson-soft text-kp-crimson-soft-text border border-kp-crimson-soft rounded-lg"
          >
            {tag}
            <button type="button" onClick={() => remove(tag)} className="hover:text-kp-bad" aria-label={`Remove ${tag}`}>
              ✕
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => {
            add(e.target.value);
            e.target.value = "";
          }}
          disabled={available.length === 0}
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13px] disabled:opacity-50"
        >
          <option value="" disabled>
            {options.length === 0 ? "No tags yet…" : available.length === 0 ? "All tags added" : "Add tag…"}
          </option>
          {available.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
