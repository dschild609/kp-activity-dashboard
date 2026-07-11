// Rank emblems — a faithful port of the "Rank Insignia" spec: metal-gradient
// insignia (bronze diamonds, gold chevrons, silver bars/stars/wings, gold
// laurels) with a sheen highlight, a drop-shadow lift, and grade bars under
// the emblem (gold bars on a family's Grade 4 capstone).

import { useId } from "react";
import { RANKS } from "../lib/ranks";

const STAR_PTS = "50,8 60,36 90,37 66,55 75,84 50,67 25,84 34,55 10,37 40,36";

export function RankBadge({ rankIndex, size = 34 }: { rankIndex: number; size?: number }) {
  const rank = RANKS[Math.max(0, Math.min(rankIndex, RANKS.length - 1))];
  // Gradients/filters need document-unique ids — many badges render per page.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = rank.metal === "gold" ? `${uid}g` : rank.metal === "bronze" ? `${uid}b` : `${uid}s`;
  const grad = `url(#${gid})`;
  const gold = `url(#${uid}g)`;
  const silver = `url(#${uid}s)`;
  const sheen = `url(#${uid}sh)`;
  const lift = `url(#${uid}l)`;

  const star = (cx: number, cy: number, sc: number, fill: string, k: string) => (
    <g key={k} transform={`translate(${cx - 50 * sc},${cy - 50 * sc}) scale(${sc})`}>
      <polygon points={STAR_PTS} fill={fill} />
      <polygon points={STAR_PTS} fill={sheen} />
    </g>
  );

  const totalBars = rank.symbol === "laurel" ? 0 : Math.max(0, rank.grade - 1);
  const cy = totalBars > 0 ? 44 : 58;
  const base: React.ReactNode[] = [];

  if (rank.symbol === "diamond") {
    // Both diamond ranks (Recruit, Apprentice) wear a single hollow diamond.
    const r = 21;
    const cx = 60;
    const d =
      `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z ` +
      `M${cx} ${cy - r * 0.5} L${cx + r * 0.5} ${cy} L${cx} ${cy + r * 0.5} L${cx - r * 0.5} ${cy} Z`;
    base.push(<path key="d" d={d} fillRule="evenodd" fill={grad} />);
  } else if (rank.symbol === "chevron") {
    const pitch = 18, drop = 36, thick = 15;
    const blockH = (rank.count - 1) * pitch + drop + thick;
    const topTip = cy - blockH / 2;
    for (let i = 0; i < rank.count; i++) {
      const yT = topTip + i * pitch;
      const pts = `18,${yT + drop} 60,${yT} 102,${yT + drop} 102,${yT + drop + thick} 60,${yT + thick} 18,${yT + drop + thick}`;
      base.push(<polygon key={`c${i}`} points={pts} fill={grad} />);
    }
  } else if (rank.symbol === "bar") {
    const pos = rank.count === 2 ? [34, 66] : [50];
    pos.forEach((x, i) => {
      base.push(<rect key={`b${i}`} x={x} y={cy - 36} width={20} height={72} rx={9} fill={grad} />);
      base.push(<rect key={`bs${i}`} x={x} y={cy - 36} width={20} height={72} rx={9} fill={sheen} />);
    });
  } else if (rank.symbol === "star") {
    if (rank.count >= 3) {
      base.push(star(60, cy - 16, 0.5, grad, "st0"), star(40, cy + 15, 0.5, grad, "st1"), star(80, cy + 15, 0.5, grad, "st2"));
    } else if (rank.count === 2) {
      base.push(star(40, cy, 0.6, grad, "st0"), star(80, cy, 0.6, grad, "st1"));
    } else {
      base.push(star(60, cy, 0.92, grad, "st0"));
    }
  } else if (rank.symbol === "wings") {
    const feathers: Array<[number, number]> = [[38, 8], [33, 21], [28, 34], [22, 47]];
    feathers.forEach(([len, ang], k) => {
      base.push(
        <rect key={`fr${k}`} x={60} y={cy - 4} width={len} height={8} rx={4} fill={grad} transform={`rotate(${-ang} 60 ${cy})`} />,
        <rect key={`fl${k}`} x={60} y={cy - 4} width={len} height={8} rx={4} fill={grad} transform={`rotate(${180 + ang} 60 ${cy})`} />,
      );
    });
    base.push(<circle key="wc" cx={60} cy={cy} r={8} fill={grad} />);
    base.push(star(60, cy - 24, 0.34, grad, "wst"));
  } else if (rank.symbol === "laurel") {
    const leaves: Array<[number, number, number]> = [
      [34, 94, 26], [23, 79, 48], [17, 61, 74], [19, 43, 102], [30, 29, 126],
    ];
    leaves.forEach(([x, y, rot], i) => {
      base.push(
        <ellipse key={`ll${i}`} cx={x} cy={y - 4} rx={9} ry={4.5} fill={gold} transform={`rotate(${rot} ${x} ${y - 4})`} />,
        <ellipse key={`lr${i}`} cx={120 - x} cy={y - 4} rx={9} ry={4.5} fill={gold} transform={`rotate(${-rot} ${120 - x} ${y - 4})`} />,
      );
    });
    // General grades wear 1, 2, 3, then 5 stars (no 4-star rank exists).
    const n = rank.count;
    if (n >= 5) {
      base.push(star(60, 54, 0.3, silver, "g0"), star(42, 40, 0.24, silver, "g1"), star(78, 40, 0.24, silver, "g2"), star(42, 68, 0.24, silver, "g3"), star(78, 68, 0.24, silver, "g4"));
    } else if (n === 3) {
      base.push(star(60, 42, 0.36, silver, "g0"), star(45, 66, 0.36, silver, "g1"), star(75, 66, 0.36, silver, "g2"));
    } else if (n === 2) {
      base.push(star(46, 56, 0.4, silver, "g0"), star(74, 56, 0.4, silver, "g1"));
    } else {
      base.push(star(60, 55, 0.5, silver, "g0"));
    }
  }

  return (
    <svg width={size} height={size} viewBox="0 0 120 150" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${uid}b`} x1={0} y1={0} x2={0.35} y2={1}>
          <stop offset="0%" stopColor="#F3CFA0" /><stop offset="30%" stopColor="#D99C57" />
          <stop offset="70%" stopColor="#B06E2E" /><stop offset="100%" stopColor="#8A5220" />
        </linearGradient>
        <linearGradient id={`${uid}g`} x1={0} y1={0} x2={0.3} y2={1}>
          <stop offset="0%" stopColor="#FFF2BC" /><stop offset="28%" stopColor="#FBD855" />
          <stop offset="62%" stopColor="#E7A81C" /><stop offset="100%" stopColor="#AE7809" />
        </linearGradient>
        <linearGradient id={`${uid}s`} x1={0} y1={0} x2={0.3} y2={1}>
          <stop offset="0%" stopColor="#FFFFFF" /><stop offset="32%" stopColor="#E6EBF3" />
          <stop offset="66%" stopColor="#BFC8D6" /><stop offset="100%" stopColor="#8B97A8" />
        </linearGradient>
        <radialGradient id={`${uid}sh`} cx={0.35} cy={0.28} r={0.75}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        <filter id={`${uid}l`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx={0} dy={2} stdDeviation={3.5} floodColor="#000000" floodOpacity={0.45} />
        </filter>
      </defs>
      <g filter={lift}>{base}</g>
      {Array.from({ length: totalBars }, (_, j) => (
        <rect
          key={`gb${j}`}
          x={38}
          y={96 + j * 13}
          width={44}
          height={8}
          rx={4}
          fill={rank.capstone ? gold : grad}
          filter={lift}
        />
      ))}
    </svg>
  );
}

/* Halo's skill shield: the 1–50 number, gold at the legendary 50. */
export function SkillShield({ skill }: { skill: number }) {
  const bg = skill >= 50 ? "#f5b83d" : skill >= 40 ? "#ff3b5c" : skill >= 25 ? "#5b8cff" : "#8896a6";
  return (
    <span className="relative inline-grid place-items-center align-middle" title={`Skill ${skill} of 50 — grows with every passing test toward half that test's score`}>
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
