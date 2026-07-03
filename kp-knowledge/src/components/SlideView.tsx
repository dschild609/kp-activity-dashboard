import type { KnowledgeSlide } from "../types/knowledge";

/* Renders one training slide per the "KP Training Template" deck. The
 * palette is fixed (ink / crimson / cream from the template) regardless of
 * app theme — slides are branded artifacts, not UI chrome. 16:9 canvas
 * sized for a ~896px-wide (max-w-4xl) container. */

const INK = "#13202b";
const CRIMSON = "#94002a";
const CREAM = "#f5f4ef";
const MUTED = "#5b6770";
const HAIRLINE = "#e3e1d8";

export function SlideView({
  slide,
  sectionNumber,
}: {
  slide: KnowledgeSlide;
  /* 1-based ordinal among section slides, for the giant divider numeral */
  sectionNumber?: number;
}) {
  return (
    <div
      className="w-full aspect-[16/9] rounded-xl border border-kp-border shadow-2xs overflow-hidden relative select-text"
      style={{ background: slide.kind === "title" ? INK : slide.kind === "section" ? CRIMSON : CREAM }}
    >
      {slide.kind === "title" && <TitleSlide slide={slide} />}
      {slide.kind === "section" && <SectionSlide slide={slide} number={sectionNumber ?? 1} />}
      {slide.kind === "agenda" && <AgendaSlide slide={slide} />}
      {slide.kind === "bullets" && <BulletsSlide slide={slide} />}
      {slide.kind === "steps" && <StepsSlide slide={slide} />}
      {slide.kind === "image" && <ImageSlide slide={slide} />}
    </div>
  );
}

/* "Lead — rest" renders the lead bold, per the template's card bullets */
function DashBullet({ text, light }: { text: string; light?: boolean }) {
  const sep = text.indexOf(" — ");
  return (
    <li className="flex gap-2.5 text-[14px] leading-snug" style={{ color: light ? "rgba(255,255,255,.85)" : MUTED }}>
      <span className="font-bold shrink-0" style={{ color: CRIMSON }}>—</span>
      {sep > 0 ? (
        <span>
          <strong style={{ color: light ? "#fff" : INK }}>{text.slice(0, sep)}</strong>
          {text.slice(sep)}
        </span>
      ) : (
        <span>{text}</span>
      )}
    </li>
  );
}

function Kicker({ text, color }: { text: string | null; color: string }) {
  if (!text) return null;
  return (
    <div
      className="font-bold uppercase mb-2"
      style={{ color, fontSize: 12, letterSpacing: "0.28em" }}
    >
      {text}
    </div>
  );
}

function TitleSlide({ slide }: { slide: KnowledgeSlide }) {
  return (
    <div className="absolute inset-0 flex flex-col px-10 py-8">
      <div className="flex items-stretch gap-2.5">
        <div className="w-[3px] self-stretch" style={{ background: CRIMSON }} />
        <span className="text-white font-black tracking-tight text-[15px] py-1">KP STAFFING</span>
      </div>
      <div className="flex-1 flex flex-col justify-center max-w-[75%]">
        <Kicker text={slide.kicker} color="#e05c7e" />
        <h2 className="text-white font-extrabold leading-[1.05] tracking-[-0.02em]" style={{ fontSize: 40 }}>
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,.65)" }}>
            {slide.subtitle}
          </p>
        )}
      </div>
      <div className="flex justify-between text-[11.5px]" style={{ color: "rgba(255,255,255,.5)" }}>
        <span>Employee Training Series</span>
        <span>KP Knowledge</span>
      </div>
    </div>
  );
}

function SectionSlide({ slide, number }: { slide: KnowledgeSlide; number: number }) {
  return (
    <div className="absolute inset-0 px-10 flex flex-col justify-center overflow-hidden">
      <div
        className="absolute font-black leading-none pointer-events-none"
        style={{ fontSize: 220, right: 24, bottom: -40, color: "rgba(255,255,255,.12)" }}
      >
        {String(number).padStart(2, "0")}
      </div>
      <div
        className="font-bold uppercase text-white mb-1"
        style={{ fontSize: 12, letterSpacing: "0.28em" }}
      >
        {slide.kicker ?? `Section ${number}`}
      </div>
      <div className="w-9 h-[3px] bg-white/80 mb-5" />
      <h2 className="text-white font-extrabold leading-[1.05] tracking-[-0.02em] max-w-[70%]" style={{ fontSize: 38 }}>
        {slide.title}
      </h2>
      {slide.subtitle && (
        <p className="mt-4 text-[15px] max-w-[60%]" style={{ color: "rgba(255,255,255,.8)" }}>
          {slide.subtitle}
        </p>
      )}
    </div>
  );
}

function ContentHeader({ slide }: { slide: KnowledgeSlide }) {
  return (
    <div className="mb-6">
      <Kicker text={slide.kicker} color={CRIMSON} />
      <h2 className="font-extrabold leading-tight tracking-[-0.02em]" style={{ fontSize: 30, color: INK }}>
        {slide.title}
      </h2>
      <div className="w-9 h-[3px] mt-3" style={{ background: CRIMSON }} />
    </div>
  );
}

function AgendaSlide({ slide }: { slide: KnowledgeSlide }) {
  const items = slide.items ?? [];
  return (
    <div className="absolute inset-0 px-10 py-9 overflow-y-auto">
      <ContentHeader slide={slide} />
      <div>
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-baseline gap-5 py-3"
            style={{ borderBottom: `1px solid ${HAIRLINE}` }}
          >
            <span className="font-extrabold text-[15px] tabular-nums" style={{ color: CRIMSON }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[15.5px]" style={{ color: INK }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletsSlide({ slide }: { slide: KnowledgeSlide }) {
  const columns = (slide.columns ?? []).slice(0, 2);
  return (
    <div className="absolute inset-0 px-10 py-9 overflow-y-auto">
      <ContentHeader slide={slide} />
      <div className={`grid gap-5 ${columns.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {columns.map((col, ci) => (
          <div
            key={ci}
            className="bg-white px-6 py-5"
            style={{
              borderTop: `3px solid ${ci === 0 ? INK : CRIMSON}`,
              boxShadow: "0 1px 2px rgba(19,32,43,.06)",
            }}
          >
            {col.heading && (
              <h3 className="font-extrabold text-[17px] mb-3" style={{ color: INK }}>
                {col.heading}
              </h3>
            )}
            <ul className="space-y-2.5">
              {col.bullets.map((b, i) => (
                <DashBullet key={i} text={b} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepsSlide({ slide }: { slide: KnowledgeSlide }) {
  const steps = (slide.steps ?? []).slice(0, 4);
  return (
    <div className="absolute inset-0 px-10 py-9 overflow-y-auto">
      <ContentHeader slide={slide} />
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, 1fr)` }}>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <div key={i}>
              <div className="flex items-center mb-3.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[14px] shrink-0"
                  style={{ background: last ? CRIMSON : INK }}
                >
                  {i + 1}
                </div>
                {!last && <div className="flex-1 h-px ml-2" style={{ background: HAIRLINE }} />}
              </div>
              <h3 className="font-extrabold text-[15.5px] mb-1.5" style={{ color: INK }}>
                {step.title}
              </h3>
              <p className="text-[13px] leading-snug" style={{ color: MUTED }}>
                {step.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImageSlide({ slide }: { slide: KnowledgeSlide }) {
  return (
    <div className="absolute inset-0 grid grid-cols-[46%_54%]">
      <div className="relative flex items-center justify-center" style={{ background: "#e7e5dd" }}>
        {slide.imageUrl ? (
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
        ) : (
          <span
            className="font-mono uppercase text-[11px] tracking-[0.2em] px-3 py-1.5 bg-white/70"
            style={{ color: MUTED }}
          >
            No image selected
          </span>
        )}
      </div>
      <div className="px-9 py-9 flex flex-col justify-center overflow-y-auto">
        <Kicker text={slide.kicker} color={CRIMSON} />
        <h2 className="font-extrabold leading-tight tracking-[-0.02em]" style={{ fontSize: 28, color: INK }}>
          {slide.title}
        </h2>
        {slide.body && (
          <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: MUTED }}>
            {slide.body}
          </p>
        )}
        {slide.note && (
          <div
            className="mt-5 pl-3.5 text-[13px] leading-relaxed"
            style={{ borderLeft: `3px solid ${CRIMSON}`, color: MUTED }}
          >
            {slide.note}
          </div>
        )}
        {slide.imageLabel && (
          <div
            className="mt-5 font-mono uppercase"
            style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "#98a1a8" }}
          >
            {slide.imageLabel}
          </div>
        )}
      </div>
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
