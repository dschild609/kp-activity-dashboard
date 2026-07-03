import { useRef } from "react";
import type { KnowledgeSlide, SlideColumn, SlideStep } from "../types/knowledge";

/* Renders one training slide per the "KP Training Template" deck. The
 * palette is fixed (ink / crimson / cream from the template) regardless of
 * app theme — slides are branded artifacts, not UI chrome. 16:9 canvas
 * sized for a ~896px-wide (max-w-4xl) container.
 *
 * Pass `onChange` to make the slide editable in place: text becomes
 * click-to-edit, and bullet/item/step rows grow hover controls for
 * add / remove / reorder. Image slides get side-flip and remove controls. */

const INK = "#13202b";
const CRIMSON = "#94002a";
const CREAM = "#f5f4ef";
const MUTED = "#5b6770";
const HAIRLINE = "#e3e1d8";

interface EditCtx {
  onChange: (next: KnowledgeSlide) => void;
  onSnip?: () => void;
}

export function SlideView({
  slide,
  sectionNumber,
  onChange,
  onSnip,
}: {
  slide: KnowledgeSlide;
  /* 1-based ordinal among section slides, for the giant divider numeral */
  sectionNumber?: number;
  /* Present = editable in place */
  onChange?: (next: KnowledgeSlide) => void;
  /* Editable mode: opens the snip (crop) tool for the slide's image */
  onSnip?: () => void;
}) {
  const edit = onChange ? { onChange, onSnip } : undefined;
  return (
    <div
      className="w-full aspect-[16/9] rounded-xl border border-kp-border shadow-2xs overflow-hidden relative select-text"
      style={{ background: slide.kind === "title" ? INK : slide.kind === "section" ? CRIMSON : CREAM }}
    >
      {slide.kind === "title" && <TitleSlide slide={slide} edit={edit} />}
      {slide.kind === "section" && <SectionSlide slide={slide} number={sectionNumber ?? 1} edit={edit} />}
      {slide.kind === "agenda" && <AgendaSlide slide={slide} edit={edit} />}
      {slide.kind === "bullets" && <BulletsSlide slide={slide} edit={edit} />}
      {slide.kind === "steps" && <StepsSlide slide={slide} edit={edit} />}
      {slide.kind === "image" && <ImageSlide slide={slide} edit={edit} />}
    </div>
  );
}

/* ── Click-to-edit text ──────────────────────────────────────────── */

function Txt({
  value,
  onCommit,
  placeholder,
  className,
  style,
  block,
}: {
  value: string;
  onCommit?: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  block?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  if (!onCommit) {
    if (!value) return null;
    const Tag = block ? "div" : "span";
    return <Tag className={className} style={style}>{value}</Tag>;
  }
  const empty = !value;
  const Tag = block ? "div" : "span";
  return (
    <Tag
      // @ts-expect-error ref type varies with Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={`${className ?? ""} outline-none cursor-text rounded-[3px] hover:[box-shadow:0_0_0_1px_rgba(148,0,42,.35)] focus:[box-shadow:0_0_0_2px_rgba(148,0,42,.55)]`}
      style={{ ...style, ...(empty ? { opacity: 0.45, fontStyle: "italic" } : null), minWidth: 24 }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === "Escape") {
          (e.currentTarget as HTMLElement).textContent = value;
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onBlur={(e: React.FocusEvent) => {
        const next = (e.currentTarget.textContent ?? "").replace(/\n+/g, " ").trim();
        if (next !== value) onCommit(next);
      }}
    >
      {empty ? placeholder ?? "click to edit" : value}
    </Tag>
  );
}

/* Hover controls for a list row: move up/down, remove */
function RowControls({
  onUp,
  onDown,
  onRemove,
  light,
}: {
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
  light?: boolean;
}) {
  const base = `w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold ${
    light ? "bg-white/15 text-white hover:bg-white/30" : "bg-black/5 hover:bg-black/15"
  } disabled:opacity-25`;
  return (
    <span className="inline-flex gap-1 ml-2 opacity-0 group-hover/row:opacity-100 transition-opacity align-middle shrink-0">
      <button type="button" className={base} style={light ? undefined : { color: MUTED }} disabled={!onUp} onClick={onUp} title="Move up">↑</button>
      <button type="button" className={base} style={light ? undefined : { color: MUTED }} disabled={!onDown} onClick={onDown} title="Move down">↓</button>
      <button type="button" className={base} style={{ color: light ? "#fff" : CRIMSON }} onClick={onRemove} title="Remove">✕</button>
    </span>
  );
}

function AddRow({ onAdd, label }: { onAdd: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="mt-1 text-[12px] font-semibold opacity-40 hover:opacity-100 transition-opacity"
      style={{ color: CRIMSON }}
    >
      + {label ?? "add line"}
    </button>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/* "Lead — rest" renders the lead bold when read-only; editable mode shows
 * the raw string so the separator stays typeable */
function DashBullet({ text }: { text: string }) {
  const sep = text.indexOf(" — ");
  return sep > 0 ? (
    <span>
      <strong style={{ color: INK }}>{text.slice(0, sep)}</strong>
      {text.slice(sep)}
    </span>
  ) : (
    <span>{text}</span>
  );
}

function Kicker({
  text,
  color,
  edit,
  commit,
}: {
  text: string | null;
  color: string;
  edit?: EditCtx;
  commit?: (v: string | null) => void;
}) {
  if (!text && !edit) return null;
  return (
    <div className="font-bold uppercase mb-2" style={{ color, fontSize: 12, letterSpacing: "0.28em" }}>
      <Txt
        value={text ?? ""}
        placeholder="KICKER"
        onCommit={edit && commit ? (v) => commit(v || null) : undefined}
      />
    </div>
  );
}

/* ── Layouts ─────────────────────────────────────────────────────── */

function TitleSlide({ slide, edit }: { slide: KnowledgeSlide; edit?: EditCtx }) {
  const c = edit?.onChange;
  return (
    <div className="absolute inset-0 flex flex-col px-10 py-8">
      <div className="flex items-stretch gap-2.5">
        <div className="w-[3px] self-stretch" style={{ background: CRIMSON }} />
        <span className="text-white font-black tracking-tight text-[15px] py-1">KP STAFFING</span>
      </div>
      <div className="flex-1 flex flex-col justify-center max-w-[75%]">
        <Kicker text={slide.kicker} color="#e05c7e" edit={edit} commit={(v) => c?.({ ...slide, kicker: v })} />
        <h2 className="text-white font-extrabold leading-[1.05] tracking-[-0.02em]" style={{ fontSize: 40 }}>
          <Txt value={slide.title} onCommit={c ? (v) => c({ ...slide, title: v }) : undefined} placeholder="Title" />
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,.65)" }}>
          <Txt
            value={slide.subtitle ?? ""}
            placeholder={edit ? "Subtitle" : ""}
            onCommit={c ? (v) => c({ ...slide, subtitle: v || null }) : undefined}
          />
        </p>
      </div>
      <div className="flex justify-between text-[11.5px]" style={{ color: "rgba(255,255,255,.5)" }}>
        <span>Employee Training Series</span>
        <span>KP Knowledge</span>
      </div>
    </div>
  );
}

function SectionSlide({ slide, number, edit }: { slide: KnowledgeSlide; number: number; edit?: EditCtx }) {
  const c = edit?.onChange;
  return (
    <div className="absolute inset-0 px-10 flex flex-col justify-center overflow-hidden">
      <div
        className="absolute font-black leading-none pointer-events-none"
        style={{ fontSize: 220, right: 24, bottom: -40, color: "rgba(255,255,255,.12)" }}
      >
        {String(number).padStart(2, "0")}
      </div>
      <div className="font-bold uppercase text-white mb-1" style={{ fontSize: 12, letterSpacing: "0.28em" }}>
        <Txt
          value={slide.kicker ?? `Section ${number}`}
          onCommit={c ? (v) => c({ ...slide, kicker: v || null }) : undefined}
        />
      </div>
      <div className="w-9 h-[3px] bg-white/80 mb-5" />
      <h2 className="text-white font-extrabold leading-[1.05] tracking-[-0.02em] max-w-[70%]" style={{ fontSize: 38 }}>
        <Txt value={slide.title} onCommit={c ? (v) => c({ ...slide, title: v }) : undefined} placeholder="Section title" />
      </h2>
      <p className="mt-4 text-[15px] max-w-[60%]" style={{ color: "rgba(255,255,255,.8)" }}>
        <Txt
          value={slide.subtitle ?? ""}
          placeholder={edit ? "Subtitle" : ""}
          onCommit={c ? (v) => c({ ...slide, subtitle: v || null }) : undefined}
        />
      </p>
    </div>
  );
}

function ContentHeader({ slide, edit }: { slide: KnowledgeSlide; edit?: EditCtx }) {
  const c = edit?.onChange;
  return (
    <div className="mb-6">
      <Kicker text={slide.kicker} color={CRIMSON} edit={edit} commit={(v) => c?.({ ...slide, kicker: v })} />
      <h2 className="font-extrabold leading-tight tracking-[-0.02em]" style={{ fontSize: 30, color: INK }}>
        <Txt value={slide.title} onCommit={c ? (v) => c({ ...slide, title: v }) : undefined} placeholder="Title" />
      </h2>
      <div className="w-9 h-[3px] mt-3" style={{ background: CRIMSON }} />
    </div>
  );
}

function AgendaSlide({ slide, edit }: { slide: KnowledgeSlide; edit?: EditCtx }) {
  const c = edit?.onChange;
  const items = slide.items ?? [];
  const setItems = (items: string[]) => c?.({ ...slide, items });
  return (
    <div className="absolute inset-0 px-10 py-9 overflow-y-auto">
      <ContentHeader slide={slide} edit={edit} />
      <div>
        {items.map((item, i) => (
          <div
            key={i}
            className="group/row flex items-baseline gap-5 py-3"
            style={{ borderBottom: `1px solid ${HAIRLINE}` }}
          >
            <span className="font-extrabold text-[15px] tabular-nums" style={{ color: CRIMSON }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[15.5px] flex-1" style={{ color: INK }}>
              <Txt value={item} onCommit={c ? (v) => setItems(items.map((x, j) => (j === i ? v : x))) : undefined} placeholder="Agenda item" />
            </span>
            {edit && (
              <RowControls
                onUp={i > 0 ? () => setItems(move(items, i, -1)) : undefined}
                onDown={i < items.length - 1 ? () => setItems(move(items, i, 1)) : undefined}
                onRemove={() => setItems(items.filter((_, j) => j !== i))}
              />
            )}
          </div>
        ))}
        {edit && <AddRow onAdd={() => setItems([...items, ""])} label="add item" />}
      </div>
    </div>
  );
}

function BulletsSlide({ slide, edit }: { slide: KnowledgeSlide; edit?: EditCtx }) {
  const c = edit?.onChange;
  const columns = (slide.columns ?? []).slice(0, 2);
  const setColumns = (columns: SlideColumn[]) => c?.({ ...slide, columns });
  return (
    <div className="absolute inset-0 px-10 py-9 overflow-y-auto">
      <ContentHeader slide={slide} edit={edit} />
      <div className={`grid gap-5 ${columns.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {columns.map((col, ci) => {
          const setCol = (next: SlideColumn) => setColumns(columns.map((x, j) => (j === ci ? next : x)));
          return (
            <div
              key={ci}
              className="group/col relative bg-white px-6 py-5"
              style={{ borderTop: `3px solid ${ci === 0 ? INK : CRIMSON}`, boxShadow: "0 1px 2px rgba(19,32,43,.06)" }}
            >
              {edit && columns.length > 1 && (
                <button
                  type="button"
                  onClick={() => setColumns(columns.filter((_, j) => j !== ci))}
                  className="absolute top-2 right-2 w-5 h-5 rounded bg-black/5 hover:bg-black/15 text-[11px] opacity-0 group-hover/col:opacity-100 transition-opacity"
                  style={{ color: CRIMSON }}
                  title="Remove column"
                >
                  ✕
                </button>
              )}
              <h3 className="font-extrabold text-[17px] mb-3" style={{ color: INK }}>
                <Txt
                  value={col.heading}
                  placeholder={edit ? "Heading" : ""}
                  onCommit={c ? (v) => setCol({ ...col, heading: v }) : undefined}
                />
              </h3>
              <ul className="space-y-2.5">
                {col.bullets.map((b, i) => (
                  <li key={i} className="group/row flex gap-2.5 text-[14px] leading-snug" style={{ color: MUTED }}>
                    <span className="font-bold shrink-0" style={{ color: CRIMSON }}>—</span>
                    <span className="flex-1">
                      {edit ? (
                        <Txt value={b} placeholder="Lead — description" onCommit={(v) => setCol({ ...col, bullets: col.bullets.map((x, j) => (j === i ? v : x)) })} />
                      ) : (
                        <DashBullet text={b} />
                      )}
                    </span>
                    {edit && (
                      <RowControls
                        onUp={i > 0 ? () => setCol({ ...col, bullets: move(col.bullets, i, -1) }) : undefined}
                        onDown={i < col.bullets.length - 1 ? () => setCol({ ...col, bullets: move(col.bullets, i, 1) }) : undefined}
                        onRemove={() => setCol({ ...col, bullets: col.bullets.filter((_, j) => j !== i) })}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {edit && <AddRow onAdd={() => setCol({ ...col, bullets: [...col.bullets, ""] })} label="add bullet" />}
            </div>
          );
        })}
        {edit && columns.length < 2 && (
          <button
            type="button"
            onClick={() => setColumns([...columns, { heading: "", bullets: [""] }])}
            className="border-2 border-dashed rounded-lg text-[13px] font-semibold py-8 opacity-40 hover:opacity-100 transition-opacity"
            style={{ borderColor: MUTED, color: MUTED }}
          >
            + second column
          </button>
        )}
      </div>
    </div>
  );
}

function StepsSlide({ slide, edit }: { slide: KnowledgeSlide; edit?: EditCtx }) {
  const c = edit?.onChange;
  const steps = (slide.steps ?? []).slice(0, 4);
  const setSteps = (steps: SlideStep[]) => c?.({ ...slide, steps });
  return (
    <div className="absolute inset-0 px-10 py-9 overflow-y-auto">
      <ContentHeader slide={slide} edit={edit} />
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length + (edit && steps.length < 4 ? 1 : 0), 1)}, 1fr)` }}>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          const setStep = (next: SlideStep) => setSteps(steps.map((x, j) => (j === i ? next : x)));
          return (
            <div key={i} className="group/row">
              <div className="flex items-center mb-3.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0"
                  style={{ background: last ? CRIMSON : INK }}
                >
                  {i + 1}
                </div>
                {!last && <div className="flex-1 h-px ml-2" style={{ background: HAIRLINE }} />}
                {edit && (
                  <RowControls
                    onUp={i > 0 ? () => setSteps(move(steps, i, -1)) : undefined}
                    onDown={i < steps.length - 1 ? () => setSteps(move(steps, i, 1)) : undefined}
                    onRemove={() => setSteps(steps.filter((_, j) => j !== i))}
                  />
                )}
              </div>
              <h3 className="font-extrabold text-[15.5px] mb-1.5" style={{ color: INK }}>
                <Txt value={step.title} placeholder="Step title" onCommit={c ? (v) => setStep({ ...step, title: v }) : undefined} />
              </h3>
              <p className="text-[13px] leading-snug" style={{ color: MUTED }}>
                <Txt value={step.description} placeholder={edit ? "Description" : ""} onCommit={c ? (v) => setStep({ ...step, description: v }) : undefined} />
              </p>
            </div>
          );
        })}
        {edit && steps.length < 4 && (
          <button
            type="button"
            onClick={() => setSteps([...steps, { title: "", description: "" }])}
            className="border-2 border-dashed rounded-lg text-[13px] font-semibold opacity-40 hover:opacity-100 transition-opacity min-h-[100px]"
            style={{ borderColor: MUTED, color: MUTED }}
          >
            + step
          </button>
        )}
      </div>
    </div>
  );
}

const IMAGE_POSITIONS = ["left", "right", "top"] as const;

function ImageSlide({ slide, edit }: { slide: KnowledgeSlide; edit?: EditCtx }) {
  const c = edit?.onChange;
  const position = slide.imagePosition ?? "left";
  const imageRight = position === "right";
  const imageTop = position === "top";
  const cyclePosition = () => {
    const next = IMAGE_POSITIONS[(IMAGE_POSITIONS.indexOf(position) + 1) % IMAGE_POSITIONS.length];
    c?.({ ...slide, imagePosition: next });
  };
  const imagePane = (
    <div className="relative flex items-center justify-center" style={{ background: "#e7e5dd" }}>
      {slide.imageUrl ? (
        <>
          {edit ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <img
                src={slide.imageUrl}
                alt={slide.imageLabel ?? "Slide illustration"}
                className="max-w-full max-h-full object-contain bg-white"
                style={{ boxShadow: "0 2px 10px rgba(19,32,43,.18)" }}
              />
            </div>
          ) : (
            <a
              href={slide.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute inset-0 flex items-center justify-center p-4"
              title="Open full size"
            >
              <img
                src={slide.imageUrl}
                alt={slide.imageLabel ?? "Slide illustration"}
                className="max-w-full max-h-full object-contain bg-white"
                style={{ boxShadow: "0 2px 10px rgba(19,32,43,.18)" }}
              />
            </a>
          )}
          {edit && (
            <div className="absolute top-2 left-2 flex gap-1.5">
              <button
                type="button"
                onClick={cyclePosition}
                className="px-2 py-1 rounded bg-white/90 hover:bg-white text-[11px] font-bold shadow"
                style={{ color: INK }}
                title="Cycle image position: left / right / top"
              >
                ⇄ {position}
              </button>
              {edit.onSnip && (
                <button
                  type="button"
                  onClick={edit.onSnip}
                  className="px-2 py-1 rounded bg-white/90 hover:bg-white text-[11px] font-bold shadow"
                  style={{ color: INK }}
                  title="Crop to a part of this image"
                >
                  ✂ snip
                </button>
              )}
              <button
                type="button"
                onClick={() => c?.({ ...slide, imageUrl: null, imageLabel: null })}
                className="px-2 py-1 rounded bg-white/90 hover:bg-white text-[11px] font-bold shadow"
                style={{ color: CRIMSON }}
                title="Remove image"
              >
                ✕ remove
              </button>
            </div>
          )}
        </>
      ) : (
        <span className="font-mono uppercase text-[11px] tracking-[0.2em] px-3 py-1.5 bg-white/70" style={{ color: MUTED }}>
          {edit ? "Pick an image below" : "No image selected"}
        </span>
      )}
    </div>
  );
  const textPane = (
    <div className="px-9 py-9 flex flex-col justify-center overflow-y-auto">
      <Kicker text={slide.kicker} color={CRIMSON} edit={edit} commit={(v) => c?.({ ...slide, kicker: v })} />
      <h2 className="font-extrabold leading-tight tracking-[-0.02em]" style={{ fontSize: 28, color: INK }}>
        <Txt value={slide.title} placeholder="Title" onCommit={c ? (v) => c({ ...slide, title: v }) : undefined} />
      </h2>
      <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: MUTED }}>
        <Txt
          value={slide.body ?? ""}
          placeholder={edit ? "Body paragraph" : ""}
          onCommit={c ? (v) => c({ ...slide, body: v || null }) : undefined}
        />
      </p>
      {(slide.note || edit) && (
        <div className="mt-5 pl-3.5 text-[13px] leading-relaxed" style={{ borderLeft: `3px solid ${CRIMSON}`, color: MUTED }}>
          <Txt
            value={slide.note ?? ""}
            placeholder={edit ? "Callout note (optional)" : ""}
            onCommit={c ? (v) => c({ ...slide, note: v || null }) : undefined}
          />
        </div>
      )}
      {slide.imageLabel && (
        <div className="mt-5 font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "#98a1a8" }}>
          {slide.imageLabel}
        </div>
      )}
    </div>
  );
  if (imageTop) {
    // Horizontal variant: screenshot across the top, lower-third text band —
    // best for wide crops (a form row, a signature line, a table header).
    return (
      <div className="absolute inset-0 grid" style={{ gridTemplateRows: "58% 42%" }}>
        {imagePane}
        <div className="px-10 py-5 grid gap-8 overflow-y-auto" style={{ gridTemplateColumns: "38% 1fr" }}>
          <div>
            <Kicker text={slide.kicker} color={CRIMSON} edit={edit} commit={(v) => c?.({ ...slide, kicker: v })} />
            <h2 className="font-extrabold leading-tight tracking-[-0.02em]" style={{ fontSize: 24, color: INK }}>
              <Txt value={slide.title} placeholder="Title" onCommit={c ? (v) => c({ ...slide, title: v }) : undefined} />
            </h2>
            {slide.imageLabel && (
              <div className="mt-2.5 font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.12em", color: "#98a1a8" }}>
                {slide.imageLabel}
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[14px] leading-relaxed" style={{ color: MUTED }}>
              <Txt
                value={slide.body ?? ""}
                placeholder={edit ? "Body paragraph" : ""}
                onCommit={c ? (v) => c({ ...slide, body: v || null }) : undefined}
              />
            </p>
            {(slide.note || edit) && (
              <div className="mt-3 pl-3.5 text-[12.5px] leading-relaxed" style={{ borderLeft: `3px solid ${CRIMSON}`, color: MUTED }}>
                <Txt
                  value={slide.note ?? ""}
                  placeholder={edit ? "Callout note (optional)" : ""}
                  onCommit={c ? (v) => c({ ...slide, note: v || null }) : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: imageRight ? "54% 46%" : "46% 54%" }}>
      {imageRight ? (
        <>
          {textPane}
          {imagePane}
        </>
      ) : (
        <>
          {imagePane}
          {textPane}
        </>
      )}
    </div>
  );
}

/* 1-based ordinal of each section slide, for the divider numeral */
export function sectionNumberAt(slides: KnowledgeSlide[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < slides.length; i++) {
    if (slides[i].kind === "section") n += 1;
  }
  return Math.max(n, 1);
}
