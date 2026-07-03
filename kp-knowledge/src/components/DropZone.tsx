/* Shared drag-and-drop / click-to-choose file target used by the AI Create
 * and Excel Upload tabs. */
export function DropZone({
  icon,
  title,
  hint,
  accept,
  multiple,
  disabled,
  onFiles,
}: {
  icon: string;
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
}) {
  return (
    <label
      className={`flex flex-col items-center justify-center gap-2 p-8 bg-kp-surface border-2 border-dashed rounded-xl transition-colors ${
        disabled
          ? "border-kp-border-soft opacity-60 cursor-wait"
          : "border-kp-border cursor-pointer hover:border-kp-border-strong"
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <div className="text-[26px]">{icon}</div>
      <div className="text-[14px] font-semibold text-kp-text">{title}</div>
      <div className="text-[12.5px] text-kp-text-faint">{hint}</div>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
