// Halo 3-style rank insignia, drawn parametrically: chevrons for enlisted,
// rockered chevrons for NCOs, bars/diamonds for officers, stars for generals.
// Colors step up with the tier so the ladder reads at a glance.

const STEEL = "#8896a6";
const BLUE = "#5b8cff";
const CRIMSON = "#ff3b5c";
const GOLD = "#f5b83d";

interface Insignia {
  dot?: boolean;
  chevrons?: number;
  rockers?: number;
  bars?: number;
  diamonds?: number;
  stars?: number;
  color: string;
}

/* Index-aligned with RANKS (Recruit … General). */
const INSIGNIA: Insignia[] = [
  { dot: true, color: STEEL }, // Recruit
  { chevrons: 1, color: STEEL }, // Apprentice
  { chevrons: 2, color: STEEL }, // Private
  { chevrons: 3, color: STEEL }, // Corporal
  { chevrons: 3, rockers: 1, color: BLUE }, // Sergeant
  { chevrons: 3, rockers: 2, color: BLUE }, // Gunnery Sergeant
  { bars: 1, color: CRIMSON }, // Lieutenant
  { bars: 2, color: CRIMSON }, // Captain
  { diamonds: 1, color: CRIMSON }, // Major
  { diamonds: 2, color: CRIMSON }, // Commander
  { diamonds: 3, color: CRIMSON }, // Colonel
  { stars: 1, color: GOLD }, // Brigadier
  { stars: 3, color: GOLD }, // General
];

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;
}

/* Evenly space n marks across the badge width. */
function spread(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 14 + (i - (n - 1) / 2) * 9.5);
}

export function RankBadge({ rankIndex, size = 26 }: { rankIndex: number; size?: number }) {
  const spec = INSIGNIA[Math.max(0, Math.min(rankIndex, INSIGNIA.length - 1))];
  const c = spec.color;
  const el: React.ReactNode[] = [];

  if (spec.dot) el.push(<circle key="dot" cx="14" cy="14" r="4" fill="none" stroke={c} strokeWidth="2.2" />);
  for (let i = 0; i < (spec.chevrons ?? 0); i++) {
    const y = 9 + i * 5;
    el.push(
      <path key={`c${i}`} d={`M6 ${y + 3.5} L14 ${y - 2.5} L22 ${y + 3.5}`} fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
    );
  }
  for (let i = 0; i < (spec.rockers ?? 0); i++) {
    const y = 9 + (spec.chevrons ?? 0) * 5 + i * 4;
    el.push(
      <path key={`r${i}`} d={`M7 ${y} L14 ${y + 3.5} L21 ${y}`} fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
    );
  }
  if (spec.bars) {
    const xs = spread(spec.bars);
    for (const [i, x] of xs.entries()) el.push(<rect key={`b${i}`} x={x - 2.2} y="6" width="4.4" height="16" rx="1.4" fill={c} />);
  }
  if (spec.diamonds) {
    const xs = spread(spec.diamonds);
    for (const [i, x] of xs.entries()) el.push(<path key={`d${i}`} d={diamondPath(x, 14, 4.4)} fill={c} />);
  }
  if (spec.stars) {
    const xs = spread(spec.stars);
    for (const [i, x] of xs.entries()) el.push(<path key={`s${i}`} d={starPath(x, 14, 5)} fill={c} />);
  }

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      {el}
    </svg>
  );
}

/* Halo's skill shield: the 1–50 number, gold at the legendary 50. */
export function SkillShield({ skill }: { skill: number }) {
  const bg = skill >= 50 ? GOLD : skill >= 40 ? CRIMSON : skill >= 25 ? BLUE : STEEL;
  return (
    <span className="relative inline-grid place-items-center align-middle" title={`Skill ${skill} of 50 — average best score ÷ 2`}>
      <svg width="24" height="26" viewBox="0 0 24 26" aria-hidden>
        <path
          d="M4 1.5 H20 Q22.5 1.5 22.5 4 V13 Q22.5 21 12 24.5 Q1.5 21 1.5 13 V4 Q1.5 1.5 4 1.5 Z"
          fill={bg}
        />
      </svg>
      <span className="absolute text-[11px] font-extrabold text-white tabular-nums" style={{ top: 4 }}>
        {skill}
      </span>
    </span>
  );
}

