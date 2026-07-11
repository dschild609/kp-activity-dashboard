interface PublishBarProps {
  dirty: boolean;
  saving: boolean;
  previewing: boolean;
  publishing: boolean;
  reviewed: boolean;
  onReviewedChange: (v: boolean) => void;
  onSave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  message: string | null;
  error: string | null;
}

/** Sticky action bar with the hard PII gate: Publish stays disabled until the
 *  creator explicitly confirms they reviewed every frame (CLAUDE.md §5.3). */
export function PublishBar({
  dirty,
  saving,
  previewing,
  publishing,
  reviewed,
  onReviewedChange,
  onSave,
  onPreview,
  onPublish,
  message,
  error,
}: PublishBarProps) {
  return (
    <div className="sticky bottom-0 z-30 bg-kp-surface border-t border-kp-border">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="flex items-start gap-2.5 cursor-pointer max-w-xl">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => onReviewedChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-kp-crimson"
          />
          <span className="text-[13px] text-kp-text leading-snug">
            I've reviewed <strong>every frame</strong> for SSNs, pay, and
            candidate data.
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          {message && (
            <span className="text-[12px] text-kp-good font-semibold">
              {message}
            </span>
          )}
          {error && (
            <span className="text-[12px] text-kp-bad font-semibold">{error}</span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className="px-4 py-2 text-[13px] font-semibold text-kp-text border border-kp-border rounded-lg hover:bg-kp-surface-alt disabled:opacity-40 disabled:cursor-default"
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button
            type="button"
            onClick={onPreview}
            disabled={previewing || saving || publishing}
            title="Download the Word doc exactly as publishing would produce it — nothing goes to Drive"
            className="px-4 py-2 text-[13px] font-semibold text-kp-navy border border-kp-navy/40 rounded-lg hover:bg-kp-surface-alt disabled:opacity-40 disabled:cursor-default"
          >
            {previewing ? "Rendering…" : "👁 Preview doc"}
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={!reviewed || publishing || dirty}
            title={
              !reviewed
                ? "Confirm the PII review first"
                : dirty
                  ? "Save your changes first"
                  : ""
            }
            className="px-5 py-2 text-[13px] font-bold text-white bg-kp-crimson rounded-lg hover:bg-kp-crimson-hover disabled:opacity-40 disabled:cursor-default"
          >
            {publishing ? "Publishing…" : "Publish SOP"}
          </button>
        </div>
      </div>
    </div>
  );
}
