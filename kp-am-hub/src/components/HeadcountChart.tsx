import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";
import type { ClientMetric } from "../types/data";

interface HeadcountChartProps {
  clients: ClientMetric[];
  onBarClick?: (companyName: string) => void;
}

const PALETTE = [
  "#b5172d", "#2563eb", "#0d9488", "#d97706", "#7c3aed",
  "#059669", "#dc2626", "#0891b2", "#ca8a04", "#db2777",
  "#4f46e5", "#16a34a", "#ea580c", "#0284c7", "#9333ea",
];

function TreemapCell(props: any) {
  const { x, y, width, height, fullName, headcount, index, onClick } = props;
  if (width < 4 || height < 4) return null;

  const fill = PALETTE[index % PALETTE.length];
  const canFitLabel = width > 60 && height > 32;
  const canFitCount = width > 44 && height > 48;

  const maxChars = Math.max(4, Math.floor(width / 7.5));
  const name = fullName ?? "";
  const displayName = name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name;

  return (
    <g
      onClick={() => onClick?.(fullName)}
      style={{ cursor: onClick ? "pointer" : undefined }}
    >
      <rect
        x={x} y={y} width={width} height={height}
        rx={5} fill={fill}
        stroke="var(--color-kp-bg, #ffffff)" strokeWidth={3}
        className="transition-opacity hover:opacity-80"
      />
      {canFitLabel && (
        <text
          x={x + width / 2} y={y + height / 2 + (canFitCount ? -7 : 1)}
          textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize={width > 120 ? 13 : 11} fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {displayName}
        </text>
      )}
      {canFitCount && (
        <text
          x={x + width / 2} y={y + height / 2 + 9}
          textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.8)" fontSize={width > 120 ? 12 : 10}
          style={{ pointerEvents: "none" }}
        >
          {headcount}
        </text>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-kp-navy text-white px-3 py-2 rounded-lg shadow-lg text-[12px] border border-white/10">
      <p className="font-semibold">{d.fullName}</p>
      <p className="text-white/70 mt-0.5">{d.headcount} active placements</p>
    </div>
  );
}

export function HeadcountChart({ clients, onBarClick }: HeadcountChartProps) {
  const data = useMemo(() =>
    clients
      .filter((c) => c.currentPlacements > 0)
      .sort((a, b) => b.currentPlacements - a.currentPlacements)
      .map((c) => ({ fullName: c.companyName, headcount: c.currentPlacements })),
    [clients]
  );

  const totalHc = useMemo(() => data.reduce((s, d) => s + d.headcount, 0), [data]);

  // Clients below 3% of total won't have room for a label in the treemap
  const legendItems = useMemo(() =>
    data
      .map((d, i) => ({ ...d, index: i, color: PALETTE[i % PALETTE.length] }))
      .filter((d) => totalHc > 0 && (d.headcount / totalHc) < 0.03),
    [data, totalHc]
  );

  if (data.length === 0) return null;

  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[14px] font-bold text-kp-text">Headcount by Client</h2>
          <p className="text-[11px] text-kp-text-muted mt-0.5">{totalHc} total across {data.length} clients</p>
        </div>
        {onBarClick && <p className="text-[11px] text-kp-text-muted">Click to view roster</p>}
      </div>

      <div style={{ height: 'clamp(260px, 50vh, 420px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="headcount"
            nameKey="fullName"
            content={<TreemapCell onClick={onBarClick} />}
            animationDuration={400}
            animationEasing="ease-out"
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {legendItems.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-kp-border">
          {legendItems.map((d) => (
            <button
              key={d.index}
              onClick={() => onBarClick?.(d.fullName)}
              className="flex items-center gap-1.5 text-[11px] text-kp-text hover:text-kp-crimson transition-colors cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
              {d.fullName} <span className="text-kp-text-muted">({d.headcount})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
