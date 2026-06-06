import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useReportData } from "../hooks/useReportData";
import { HeadcountChart } from "../components/HeadcountChart";
import type { ClientMetric, ParsedAMReport, GrossProfitRecord, JobRecord, Submission, EndReasonRecord } from "../types/data";

/* ── tiny helpers ────────────────────────────────────────────── */

function StatCard({ label, value, subtitle, onClick }: { label: string; value: string | number; subtitle?: string; onClick?: () => void }) {
  return (
    <div
      className={`bg-kp-surface border border-kp-border rounded-xl p-4 ${onClick ? "cursor-pointer hover:border-kp-text/30 hover:shadow-sm transition-all" : ""}`}
      onClick={onClick}
    >
      <p className="text-[11px] font-semibold text-kp-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-[24px] font-bold text-kp-text mt-1">{value}</p>
      {subtitle && <p className="text-[11px] text-kp-text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SectionBack({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-[13px] text-kp-text-muted hover:text-kp-text mb-4 transition-colors">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      {label}
    </button>
  );
}

function fmtDollars(n: number) {
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type SortField = "jobTitle" | "payRate" | "name" | "startDate";
type SortDir = "asc" | "desc";
type OverviewSort = "client" | "priority" | "headcount" | "openJobs" | "new" | "ended" | "growth" | "turnover" | "grossMargin" | "gm" | "contact" | "visit";

/* ── main component ──────────────────────────────────────────── */

export function DashboardPage() {
  const { report } = useReportData();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [kpiModal, setKpiModal] = useState<"headcount" | "openJobs" | "newPlacements" | "turnover" | null>(null);
  const [rosterClient, setRosterClient] = useState<string | null>(null);
  const [rosterSort, setRosterSort] = useState<SortField>("name");
  const [rosterDir, setRosterDir] = useState<SortDir>("asc");
  const [overviewSort, setOverviewSort] = useState<OverviewSort>("headcount");
  const [overviewDir, setOverviewDir] = useState<SortDir>("desc");

  // Build client → GP lookup
  const clientGpMap = useMemo(() => {
    if (!report) return new Map<string, GrossProfitRecord>();
    const amToGp = new Map<string, GrossProfitRecord>();
    for (const g of report.grossProfit ?? []) {
      amToGp.set(g.primaryAccountManager, g);
    }
    const map = new Map<string, GrossProfitRecord>();
    for (const c of report.clientMetrics) {
      const gp = amToGp.get(c.primaryAccountManager);
      if (gp) map.set(c.companyName, gp);
    }
    return map;
  }, [report]);

  // Adjusted turnover per client — exclude non-turnover reasons
  const EXCLUDED_REASONS = new Set([
    "Dropped Out No Start", "Cancelled No Start",
    "Layoff", "Converted to Permanent", "Changed Title/Promoted",
    "Assignment Complete", "Assignment Completed",
  ]);
  const clientTurnoverMap = useMemo(() => {
    if (!report) return new Map<string, { adjusted: number; pct: number }>();
    const endReasons = report.endReasons ?? [];
    // Group by company, counting only genuine turnover
    const countMap = new Map<string, number>();
    for (const r of endReasons) {
      if (EXCLUDED_REASONS.has(r.endReason)) continue;
      const days = parseInt(r.daysOnAssignment) || 0;
      if (days <= 0) continue;
      countMap.set(r.companyName, (countMap.get(r.companyName) ?? 0) + 1);
    }
    const map = new Map<string, { adjusted: number; pct: number }>();
    for (const c of report.clientMetrics) {
      const adj = countMap.get(c.companyName) ?? 0;
      const pct = c.currentPlacements > 0 ? (adj / c.currentPlacements) * 100 : 0;
      map.set(c.companyName, { adjusted: adj, pct });
    }
    return map;
  }, [report]);

  const toggleOverviewSort = (field: OverviewSort) => {
    if (overviewSort === field) setOverviewDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOverviewSort(field); setOverviewDir(field === "client" || field === "priority" ? "asc" : "desc"); }
  };

  const daysSince = (dateStr: string | undefined) => {
    if (!dateStr || !report) return Infinity;
    const pe = new Date(report.meta.periodEnd);
    const d = new Date(dateStr);
    const days = Math.round((pe.getTime() - d.getTime()) / 86400000);
    return isNaN(days) || days < 0 ? Infinity : days;
  };

  const sortedClients = useMemo(() => {
    if (!report) return [];
    const arr = [...report.clientMetrics];
    const dir = overviewDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (overviewSort) {
        case "client": av = a.companyName.toLowerCase(); bv = b.companyName.toLowerCase(); break;
        case "priority": av = a.priority; bv = b.priority; break;
        case "headcount": av = a.currentPlacements; bv = b.currentPlacements; break;
        case "openJobs": av = a.currentOpenJobs; bv = b.currentOpenJobs; break;
        case "new": av = a.newPlacements; bv = b.newPlacements; break;
        case "ended": av = a.endedPlacements; bv = b.endedPlacements; break;
        case "growth": av = a.growth; bv = b.growth; break;
        case "turnover": av = clientTurnoverMap.get(a.companyName)?.pct ?? 0; bv = clientTurnoverMap.get(b.companyName)?.pct ?? 0; break;
        case "grossMargin": av = clientGpMap.get(a.companyName)?.grossMargin ?? 0; bv = clientGpMap.get(b.companyName)?.grossMargin ?? 0; break;
        case "gm": av = clientGpMap.get(a.companyName)?.gmPercent ?? 0; bv = clientGpMap.get(b.companyName)?.gmPercent ?? 0; break;
        case "contact": av = daysSince(a.dateLastContacted); bv = daysSince(b.dateLastContacted); break;
        case "visit": av = daysSince(a.dateLastVisited); bv = daysSince(b.dateLastVisited); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [report, overviewSort, overviewDir, clientTurnoverMap, clientGpMap]);

  if (!report) {
    return (
      <div className="px-4 sm:px-6 md:px-8 py-12 text-center">
        <p className="text-kp-text-muted text-[14px]">No report loaded. <Link to="/upload" className="text-kp-crimson font-semibold underline">Upload a file</Link> first.</p>
      </div>
    );
  }

  const clients = report.clientMetrics;
  const totalPlacements = clients.reduce((s, c) => s + c.currentPlacements, 0);
  const totalOpenJobs = clients.reduce((s, c) => s + c.currentOpenJobs, 0);
  const totalNewPlacements = clients.reduce((s, c) => s + c.newPlacements, 0);
  const totalEnded = clients.reduce((s, c) => s + c.endedPlacements, 0);
  const totalGrowth = clients.reduce((s, c) => s + c.growth, 0);
  const turnoverRate = totalPlacements > 0 ? ((totalEnded / totalPlacements) * 100).toFixed(1) + "%" : "0%";

  /* ── roster drilldown (from headcount chart click) ── */
  if (rosterClient) {
    return (
      <RosterDrilldown
        clientName={rosterClient}
        report={report}
        rosterSort={rosterSort}
        rosterDir={rosterDir}
        setRosterSort={setRosterSort}
        setRosterDir={setRosterDir}
        onBack={() => setRosterClient(null)}
      />
    );
  }

  const selectedClientData = selectedClient ? clients.find((c) => c.companyName === selectedClient) : null;

  /* ── main dashboard view ── */
  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-kp-text">Dashboard</h1>
        <p className="text-[13px] text-kp-text-muted mt-1">
          {report.meta.accountManager} &middot; {report.meta.periodStart} to {report.meta.periodEnd}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Active Headcount" value={totalPlacements} onClick={() => setKpiModal("headcount")} />
        <StatCard label="Open Jobs" value={totalOpenJobs} onClick={() => setKpiModal("openJobs")} />
        <StatCard label="New Placements" value={totalNewPlacements} onClick={() => setKpiModal("newPlacements")} />
        <StatCard label="Turnover Rate" value={turnoverRate} subtitle={`${totalEnded} ended of ${totalPlacements}`} onClick={() => setKpiModal("turnover")} />
        <StatCard label="Net Growth" value={totalGrowth > 0 ? `+${totalGrowth}` : totalGrowth} />
      </div>

      {/* Action Items */}
      <ActionItems report={report} onClientClick={setSelectedClient} />

      {/* Headcount Chart */}
      <div className="mb-8">
        <HeadcountChart clients={clients} onBarClick={(name) => setSelectedClient(name)} />
      </div>

      {/* Client Overview — with GP columns */}
      <div className="bg-kp-surface border border-kp-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-kp-border">
          <h2 className="text-[14px] font-bold text-kp-text">Client Overview</h2>
          <p className="text-[11px] text-kp-text-muted mt-0.5">Click a client to view full details</p>
        </div>
        <div className="relative">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-kp-surface-alt border-b border-kp-border">
                  {([
                    ["client", "Client", "left", "px-4"] as const,
                    ["priority", "Priority", "left", "px-3"] as const,
                    ["headcount", "Headcount", "right", "px-3"] as const,
                    ["openJobs", "Open Jobs", "right", "px-3"] as const,
                    ["new", "New", "right", "px-3"] as const,
                    ["ended", "Ended", "right", "px-3"] as const,
                    ["growth", "Growth", "right", "px-3"] as const,
                    ["turnover", "Turnover %", "right", "px-3"] as const,
                    ["grossMargin", "Gross Margin", "right", "px-3"] as const,
                    ["gm", "GM%", "right", "px-3"] as const,
                    ["contact", "Days Since Contact", "right", "px-3"] as const,
                    ["visit", "Days Since Visit", "right", "px-3"] as const,
                  ] as const).map(([field, label, align, px]) => (
                    <th
                      key={field}
                      onClick={() => toggleOverviewSort(field)}
                      className={`text-${align} ${px} py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 font-semibold text-kp-text-muted cursor-pointer select-none hover:text-kp-text transition-colors whitespace-nowrap`}
                    >
                      {label}
                      {overviewSort === field && (
                        <span className="ml-1 text-kp-crimson">{overviewDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
            <tbody>
              {sortedClients.map((c) => {
                const gp = clientGpMap.get(c.companyName);
                const to = clientTurnoverMap.get(c.companyName);
                return (
                  <tr
                    key={c.companyName}
                    onClick={() => setSelectedClient(c.companyName)}
                    className="border-b border-kp-border cursor-pointer hover:bg-kp-surface-alt transition-colors"
                  >
                    <td className="px-4 py-2.5 font-semibold text-kp-text">{c.companyName}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        c.priority === "Tier A" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        c.priority === "Tier B" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}>{c.priority}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-kp-text">{c.currentPlacements}</td>
                    <td className="px-3 py-2.5 text-right text-kp-text">{c.currentOpenJobs}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">{c.newPlacements || "—"}</td>
                    <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400 font-semibold">{c.endedPlacements || "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={c.growth > 0 ? "text-emerald-600 dark:text-emerald-400" : c.growth < 0 ? "text-red-600 dark:text-red-400" : "text-kp-text-muted"}>
                        {c.growth > 0 ? `+${c.growth}` : c.growth}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {to && to.adjusted > 0 ? (
                        <span className={`font-bold ${to.pct > 30 ? "text-red-600 dark:text-red-400" : to.pct > 15 ? "text-amber-600 dark:text-amber-400" : "text-kp-text"}`}>
                          {to.pct.toFixed(1)}%
                        </span>
                      ) : <span className="text-kp-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {gp ? fmtDollars(gp.grossMargin) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-kp-text">
                      {gp ? (gp.gmPercent * 100).toFixed(1) + "%" : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(() => {
                        if (!c.dateLastContacted) return <span className="text-kp-text-muted">—</span>;
                        const pe = new Date(report.meta.periodEnd);
                        const lc = new Date(c.dateLastContacted);
                        const days = Math.round((pe.getTime() - lc.getTime()) / 86400000);
                        if (isNaN(days) || days < 0) return <span className="text-kp-text-muted">—</span>;
                        return <span className={`font-semibold ${days > 14 ? "text-red-600 dark:text-red-400" : days > 7 ? "text-amber-600 dark:text-amber-400" : "text-kp-text"}`}>{days}d</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(() => {
                        if (!c.dateLastVisited) return <span className="text-kp-text-muted">—</span>;
                        const pe = new Date(report.meta.periodEnd);
                        const lv = new Date(c.dateLastVisited);
                        const days = Math.round((pe.getTime() - lv.getTime()) / 86400000);
                        if (isNaN(days) || days < 0) return <span className="text-kp-text-muted">—</span>;
                        return <span className={`font-semibold ${days > 30 ? "text-red-600 dark:text-red-400" : days > 14 ? "text-amber-600 dark:text-amber-400" : "text-kp-text"}`}>{days}d</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-kp-surface to-transparent md:hidden" />
        </div>
      </div>

      {/* KPI Drilldown Modal */}
      {kpiModal && (
        <KpiModal type={kpiModal} report={report} onClose={() => setKpiModal(null)} onClientClick={(name) => { setKpiModal(null); setSelectedClient(name); }} />
      )}

      {/* Client Detail Modal */}
      {selectedClientData && (
        <ClientDetailModal
          client={selectedClientData}
          report={report}
          gpRecord={clientGpMap.get(selectedClientData.companyName)}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}

/* ── KPI Drilldown Modal ────────────────────────────────────── */

function KpiModal({ type, report, onClose, onClientClick }: {
  type: "headcount" | "openJobs" | "newPlacements" | "turnover";
  report: ParsedAMReport;
  onClose: () => void;
  onClientClick: (name: string) => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const periodEnd = new Date(report.meta.periodEnd);

  const title = type === "headcount" ? "Active Headcount" : type === "openJobs" ? "Open Jobs" : type === "newPlacements" ? "New Placements" : "Turnover Breakdown";

  return (
    <div className="fixed inset-0 sm:pt-8 sm:pb-8 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 bg-kp-surface border border-kp-border shadow-2xl w-full h-full sm:w-[95vw] sm:max-w-5xl sm:max-h-[90vh] rounded-none sm:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-kp-text-muted hover:text-kp-text hover:bg-kp-surface-alt transition-colors z-10" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <div className="px-6 py-5">
          <h2 className="text-[20px] font-bold text-kp-text mb-1">{title}</h2>
          <p className="text-[12px] text-kp-text-muted mb-4">
            {report.meta.periodStart} to {report.meta.periodEnd} &middot; Click a client name to view details
          </p>

          {type === "headcount" && <HeadcountTable report={report} onClientClick={onClientClick} />}
          {type === "openJobs" && <OpenJobsTable report={report} periodEnd={periodEnd} />}
          {type === "newPlacements" && <NewPlacementsTable report={report} onClientClick={onClientClick} />}
          {type === "turnover" && <TurnoverBreakdown report={report} onClientClick={onClientClick} />}
        </div>
      </div>
    </div>
  );
}

function HeadcountTable({ report, onClientClick }: { report: ParsedAMReport; onClientClick: (name: string) => void }) {
  const sorted = useMemo(() =>
    [...report.allPlacements].sort((a, b) => a.companyName.localeCompare(b.companyName) || a.name.localeCompare(b.name)),
    [report.allPlacements]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-kp-surface-alt border-b border-kp-border sticky top-0">
            <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Name</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Start Date</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">End Date</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={`${p.candidateId}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt transition-colors">
              <td
                className="px-4 py-2 font-semibold text-kp-text cursor-pointer hover:text-kp-crimson transition-colors"
                onClick={() => onClientClick(p.companyName)}
              >{p.companyName}</td>
              <td className="px-3 py-2 text-kp-text">{p.name}</td>
              <td className="px-3 py-2 text-kp-text-muted">{p.jobTitle}</td>
              <td className="px-3 py-2 text-kp-text-muted">{p.startDate}</td>
              <td className="px-3 py-2 text-kp-text-muted">{p.actualEndDate || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpenJobsTable({ report, periodEnd }: { report: ParsedAMReport; periodEnd: Date }) {
  const openJobs = useMemo(() =>
    (report.jobs ?? []).filter((j) => j.openClosed === "Open").sort((a, b) => {
      let da = parseInt(a.daysOpen) || 0;
      if (!da && a.dateAdded) da = Math.round((periodEnd.getTime() - new Date(a.dateAdded).getTime()) / 86400000);
      let db = parseInt(b.daysOpen) || 0;
      if (!db && b.dateAdded) db = Math.round((periodEnd.getTime() - new Date(b.dateAdded).getTime()) / 86400000);
      return db - da;
    }),
    [report.jobs, periodEnd]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-kp-surface-alt border-b border-kp-border">
            <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">BH ID</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Type</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Status</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Date Added</th>
            <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Days Open</th>
          </tr>
        </thead>
        <tbody>
          {openJobs.map((j, i) => {
            let daysOpen = parseInt(j.daysOpen) || 0;
            if (!daysOpen && j.dateAdded) {
              const added = new Date(j.dateAdded);
              if (!isNaN(added.getTime())) daysOpen = Math.round((periodEnd.getTime() - added.getTime()) / 86400000);
            }
            return (
              <tr key={`${j.jobId}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt transition-colors">
                <td className="px-4 py-2.5 font-semibold text-kp-text">{j.companyName}</td>
                <td className="px-3 py-2.5 text-kp-text">{j.jobTitle}</td>
                <td className="px-3 py-2.5 text-kp-text-muted">{j.jobId}</td>
                <td className="px-3 py-2.5">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{j.employmentType}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    j.status === "Accepting Candidates" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                    "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}>{j.status}</span>
                </td>
                <td className="px-3 py-2.5 text-kp-text-muted">{j.dateAdded}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-semibold ${daysOpen > 28 ? "text-red-600 dark:text-red-400" : "text-kp-text"}`}>{daysOpen > 0 ? daysOpen : "—"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewPlacementsTable({ report, onClientClick }: { report: ParsedAMReport; onClientClick: (name: string) => void }) {
  const placements = useMemo(() =>
    [...(report.newPlacements ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [report.newPlacements]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-kp-surface-alt border-b border-kp-border">
            <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Name</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Department</th>
            <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Pay Rate</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Start Date</th>
            <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Staffing Rep</th>
          </tr>
        </thead>
        <tbody>
          {placements.map((p, i) => (
            <tr key={`${p.name}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt transition-colors">
              <td
                className="px-4 py-2.5 font-semibold text-kp-text cursor-pointer hover:text-kp-crimson transition-colors"
                onClick={() => onClientClick(p.companyName)}
              >{p.companyName}</td>
              <td className="px-3 py-2.5 text-kp-text">{p.name}</td>
              <td className="px-3 py-2.5 text-kp-text-muted">{p.jobTitle}</td>
              <td className="px-3 py-2.5 text-kp-text-muted">{p.subDepartment || "—"}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-kp-text">{p.payRateLow > 0 ? `$${p.payRateLow.toFixed(2)}` : "—"}</td>
              <td className="px-3 py-2.5 text-kp-text-muted">{p.startDate}</td>
              <td className="px-3 py-2.5 text-kp-text-muted">{p.staffingRep || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReasonBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(0) : "0";
  const barPct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-kp-text">{label}</span>
        <span className="text-[12px] font-semibold text-kp-text">{value} <span className="text-kp-text-muted font-normal">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-kp-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

function TurnoverBreakdown({ report, onClientClick }: { report: ParsedAMReport; onClientClick: (name: string) => void }) {
  const clients = report.clientMetrics;
  const endReasons = report.endReasons ?? [];
  const totalHc = clients.reduce((s, c) => s + c.currentPlacements, 0);
  const totalEnded = clients.reduce((s, c) => s + c.endedPlacements, 0);
  const turnoverPct = totalHc > 0 ? ((totalEnded / totalHc) * 100).toFixed(1) : "0";

  // Group end reasons by status (Ended by Employer = involuntary, Ended by Candidate = voluntary)
  const involRecords = useMemo(() => endReasons.filter((r) => r.status === "Ended by Employer"), [endReasons]);
  const volRecords = useMemo(() => endReasons.filter((r) => r.status === "Ended by Candidate"), [endReasons]);
  const involPct = totalHc > 0 ? ((involRecords.length / totalHc) * 100).toFixed(1) : "0";
  const volPct = totalHc > 0 ? ((volRecords.length / totalHc) * 100).toFixed(1) : "0";

  // Count by reason within each group, sorted by count desc
  const countByReason = (records: EndReasonRecord[]) => {
    const map = new Map<string, number>();
    for (const r of records) {
      const reason = r.endReason || "Unknown";
      map.set(reason, (map.get(reason) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const involByReason = useMemo(() => countByReason(involRecords), [involRecords]);
  const volByReason = useMemo(() => countByReason(volRecords), [volRecords]);

  // Per-client data sorted by turnover rate desc
  const clientRows = useMemo(() =>
    [...clients]
      .filter((c) => c.currentPlacements > 0 || c.endedPlacements > 0)
      .map((c) => ({
        ...c,
        turnoverPct: c.currentPlacements > 0 ? (c.endedPlacements / c.currentPlacements) * 100 : 0,
      }))
      .sort((a, b) => b.turnoverPct - a.turnoverPct),
    [clients]
  );

  return (
    <div>
      {/* Top KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-kp-surface-alt rounded-xl p-4 border border-kp-border">
          <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Turnover Rate</p>
          <p className="text-[28px] font-bold text-red-600 dark:text-red-400 mt-1">{turnoverPct}%</p>
          <p className="text-[11px] text-kp-text-muted">({totalEnded}) / {totalHc} Active</p>
        </div>
        <div className="bg-kp-surface-alt rounded-xl p-4 border border-kp-border">
          <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Involuntary</p>
          <p className="text-[28px] font-bold text-red-600 dark:text-red-400 mt-1">{involPct}%</p>
          <p className="text-[11px] text-kp-text-muted">{involRecords.length} terminations</p>
        </div>
        <div className="bg-kp-surface-alt rounded-xl p-4 border border-kp-border">
          <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Voluntary</p>
          <p className="text-[28px] font-bold text-amber-600 dark:text-amber-400 mt-1">{volPct}%</p>
          <p className="text-[11px] text-kp-text-muted">{volRecords.length} terminations</p>
        </div>
        <div className="bg-kp-surface-alt rounded-xl p-4 border border-kp-border">
          <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Total Ended</p>
          <p className="text-[28px] font-bold text-kp-text mt-1">{totalEnded}</p>
          <p className="text-[11px] text-kp-text-muted">{endReasons.length} with reasons</p>
        </div>
      </div>

      {/* Breakdown panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Involuntary */}
        <div className="bg-kp-surface-alt rounded-xl p-4 border border-kp-border">
          <h3 className="text-[13px] font-bold text-kp-text mb-3">
            Involuntary <span className="text-kp-text-muted font-normal">({involRecords.length})</span>
          </h3>
          <div className="space-y-2.5">
            {involByReason.map(([reason, count]) => (
              <ReasonBar key={reason} label={reason} value={count} total={involRecords.length} color="bg-red-500" />
            ))}
          </div>
        </div>

        {/* Voluntary */}
        <div className="bg-kp-surface-alt rounded-xl p-4 border border-kp-border">
          <h3 className="text-[13px] font-bold text-kp-text mb-3">
            Voluntary <span className="text-kp-text-muted font-normal">({volRecords.length})</span>
          </h3>
          <div className="space-y-2.5">
            {volByReason.map(([reason, count]) => (
              <ReasonBar key={reason} label={reason} value={count} total={volRecords.length} color="bg-amber-500" />
            ))}
          </div>
        </div>
      </div>

      {/* Per-client turnover table */}
      <h3 className="text-[13px] font-bold text-kp-text mb-3">Turnover by Client</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-kp-surface-alt border-b border-kp-border sticky top-0">
              <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
              <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Headcount</th>
              <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Ended</th>
              <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Voluntary</th>
              <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Involuntary</th>
              <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Layoffs</th>
              <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Turnover %</th>
            </tr>
          </thead>
          <tbody>
            {clientRows.map((c) => (
              <tr key={c.companyName} className="border-b border-kp-border hover:bg-kp-surface-alt transition-colors">
                <td
                  className="px-4 py-2.5 font-semibold text-kp-text cursor-pointer hover:text-kp-crimson transition-colors"
                  onClick={() => onClientClick(c.companyName)}
                >{c.companyName}</td>
                <td className="px-3 py-2.5 text-right text-kp-text">{c.currentPlacements}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{c.endedPlacements || "—"}</td>
                <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">{c.voluntaryTerms || "—"}</td>
                <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400">{c.involuntaryTerms || "—"}</td>
                <td className="px-3 py-2.5 text-right text-kp-text-muted">{c.layoffs || "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-bold ${c.turnoverPct > 30 ? "text-red-600 dark:text-red-400" : c.turnoverPct > 15 ? "text-amber-600 dark:text-amber-400" : "text-kp-text"}`}>
                    {c.turnoverPct > 0 ? `${c.turnoverPct.toFixed(1)}%` : "0%"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Action Items ────────────────────────────────────────────── */

interface ActionItem {
  type: "contact" | "notes" | "job" | "turnover";
  label: string;
  detail: string;
  clientName?: string;
}

function ActionItems({ report, onClientClick }: { report: ParsedAMReport; onClientClick: (name: string) => void }) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const COLLAPSED_LIMIT = 3;

  const items = useMemo(() => {
    const periodEnd = new Date(report.meta.periodEnd);
    const twoWeeksMs = 14 * 86400000;
    const fourWeeksMs = 28 * 86400000;
    const results: ActionItem[] = [];

    for (const c of report.clientMetrics) {
      // 1. Not contacted in 2 weeks
      if (c.dateLastContacted) {
        const lastContact = new Date(c.dateLastContacted);
        if (periodEnd.getTime() - lastContact.getTime() > twoWeeksMs) {
          const days = Math.round((periodEnd.getTime() - lastContact.getTime()) / 86400000);
          results.push({
            type: "contact",
            label: c.companyName,
            detail: `Last contacted ${days} days ago (${c.dateLastContacted})`,
            clientName: c.companyName,
          });
        }
      }

      // 2. No notes in 4 weeks
      const clientNotes = report.meetingNotes.filter((n) => n.companyName === c.companyName);
      const latestNoteDate = clientNotes.reduce((max, n) => {
        const d = new Date(n.dateAdded);
        return d > max ? d : max;
      }, new Date(0));
      if (periodEnd.getTime() - latestNoteDate.getTime() > fourWeeksMs) {
        const msg = latestNoteDate.getTime() > 0
          ? `Last note ${Math.round((periodEnd.getTime() - latestNoteDate.getTime()) / 86400000)} days ago`
          : "No notes on file";
        results.push({
          type: "notes",
          label: c.companyName,
          detail: msg,
          clientName: c.companyName,
        });
      }

      // 4. Turnover > 30%
      if (c.currentPlacements > 0) {
        const rate = c.endedPlacements / c.currentPlacements;
        if (rate > 0.30) {
          results.push({
            type: "turnover",
            label: c.companyName,
            detail: `${(rate * 100).toFixed(1)}% turnover (${c.endedPlacements} ended / ${c.currentPlacements} active)`,
            clientName: c.companyName,
          });
        }
      }
    }

    // 3. Jobs open > 4 weeks with no submissions
    const openJobs = (report.jobs ?? []).filter((j) => j.openClosed === "Open");
    for (const j of openJobs) {
      // Use daysOpen if available, otherwise compute from dateAdded
      let daysNum = parseInt(j.daysOpen) || 0;
      if (!daysNum && j.dateAdded) {
        const added = new Date(j.dateAdded);
        if (!isNaN(added.getTime())) {
          daysNum = Math.round((periodEnd.getTime() - added.getTime()) / 86400000);
        }
      }
      if (daysNum > 28) {
        const jobSubs = report.submissions.filter(
          (s) => s.companyName === j.companyName && s.jobTitle === j.jobTitle
        );
        if (jobSubs.length === 0) {
          results.push({
            type: "job",
            label: `${j.jobTitle} — ${j.companyName}`,
            detail: `Open ${daysNum} days with 0 submissions`,
            clientName: j.companyName,
          });
        }
      }
    }

    return results;
  }, [report]);

  if (items.length === 0) return null;

  const icons: Record<ActionItem["type"], { icon: string; color: string; bg: string }> = {
    contact: { icon: "📞", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
    notes: { icon: "📝", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
    job: { icon: "💼", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
    turnover: { icon: "⚠️", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
  };

  const grouped = {
    turnover: items.filter((i) => i.type === "turnover"),
    contact: items.filter((i) => i.type === "contact"),
    notes: items.filter((i) => i.type === "notes"),
    job: items.filter((i) => i.type === "job"),
  };

  const sections: { key: ActionItem["type"]; title: string; items: ActionItem[] }[] = ([
    { key: "turnover" as const, title: "High Turnover (>30%)", items: grouped.turnover },
    { key: "contact" as const, title: "No Contact in 2+ Weeks", items: grouped.contact },
    { key: "notes" as const, title: "No Notes in 4+ Weeks", items: grouped.notes },
    { key: "job" as const, title: "Stale Jobs (4+ Weeks, No Submissions)", items: grouped.job },
  ]).filter((s) => s.items.length > 0);

  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl p-5 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[16px]">🚩</span>
        <h2 className="text-[14px] font-bold text-kp-text">Action Items</h2>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{items.length}</span>
      </div>
      <div className="space-y-4">
        {sections.map(({ key, title, items: sectionItems }) => {
          const style = icons[key];
          const isExpanded = expandedSections[key] ?? false;
          const visibleItems = isExpanded ? sectionItems : sectionItems.slice(0, COLLAPSED_LIMIT);
          const hasMore = sectionItems.length > COLLAPSED_LIMIT;
          return (
            <div key={key}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${style.color}`}>
                {style.icon} {title} <span className="opacity-60">({sectionItems.length})</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {visibleItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => item.clientName && onClientClick(item.clientName)}
                    className={`text-left px-3 py-2.5 rounded-lg border transition-colors hover:shadow-sm ${style.bg}`}
                  >
                    <p className="text-[12px] font-semibold text-kp-text truncate">{item.label}</p>
                    <p className="text-[11px] text-kp-text-muted mt-0.5">{item.detail}</p>
                  </button>
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={() => toggleSection(key)}
                  className="mt-1.5 text-[11px] font-semibold text-kp-text-muted hover:text-kp-text transition-colors"
                >
                  {isExpanded ? "Show less" : `Show all ${sectionItems.length} →`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Client Detail Modal ────────────────────────────────────── */

function ClientDetailModal({ client: c, report, gpRecord, onClose }: {
  client: ClientMetric;
  report: ParsedAMReport;
  gpRecord?: GrossProfitRecord;
  onClose: () => void;
}) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Date range presets — clamp FROM to the earliest data we actually have
  const PRESETS = useMemo(() => {
    const pe = new Date(report.meta.periodEnd);
    const ps = new Date(report.meta.periodStart);
    const yr = pe.getFullYear();
    const clamp = (d: Date) => (d < ps ? ps : d);
    return [
      { label: "Report Period", from: ps, to: pe },
      { label: "Last 4 weeks", from: clamp(new Date(pe.getTime() - 28 * 86400000)), to: pe },
      { label: "Last 8 weeks", from: clamp(new Date(pe.getTime() - 56 * 86400000)), to: pe },
      { label: "Last 13 weeks", from: clamp(new Date(pe.getTime() - 91 * 86400000)), to: pe },
      { label: "This quarter to date", from: clamp(new Date(yr, Math.floor(pe.getMonth() / 3) * 3, 1)), to: pe },
      { label: "This year to date", from: clamp(new Date(yr, 0, 1)), to: pe },
      { label: "All time", from: ps, to: pe },
    ];
  }, [report.meta.periodEnd, report.meta.periodStart]);

  const [presetIdx, setPresetIdx] = useState(0);
  const [showPresets, setShowPresets] = useState(false);
  const dateFrom = PRESETS[presetIdx].from;
  const dateTo = PRESETS[presetIdx].to;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowPresets(false); onClose(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const clientNotes = report.meetingNotes.filter((n) => n.companyName === c.companyName);
  const clientOpenJobs = (report.jobs ?? []).filter((j) => j.companyName === c.companyName && j.openClosed === "Open");
  const clientSubmissions = report.submissions.filter((s) => s.companyName === c.companyName);
  const turnover = c.currentPlacements > 0 ? (c.endedPlacements / c.currentPlacements * 100).toFixed(1) : "0";

  // End reason records for this client, filtered by date range
  const clientEndReasons = useMemo(() => {
    const all = (report.endReasons ?? []).filter((r) => r.companyName === c.companyName);
    return all.filter((r) => {
      if (!r.endDate) return true;
      const d = new Date(r.endDate);
      return d >= dateFrom && d <= dateTo;
    });
  }, [report.endReasons, c.companyName, dateFrom, dateTo]);

  const involRecords = useMemo(() => clientEndReasons.filter((r) => r.status === "Ended by Employer"), [clientEndReasons]);
  const volRecords = useMemo(() => clientEndReasons.filter((r) => r.status === "Ended by Candidate"), [clientEndReasons]);

  const countByReason = (records: EndReasonRecord[]) => {
    const map = new Map<string, number>();
    for (const r of records) {
      const reason = r.endReason || "Unknown";
      map.set(reason, (map.get(reason) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const involByReason = useMemo(() => countByReason(involRecords), [involRecords]);
  const volByReason = useMemo(() => countByReason(volRecords), [volRecords]);
  const involPct = c.currentPlacements > 0 ? ((involRecords.length / c.currentPlacements) * 100).toFixed(1) : "0";
  const volPct = c.currentPlacements > 0 ? ((volRecords.length / c.currentPlacements) * 100).toFixed(1) : "0";

  // Group jobs by employment type
  const jobsByType = useMemo(() => {
    const groups: Record<string, typeof clientOpenJobs> = {};
    for (const j of clientOpenJobs) {
      const key = j.employmentType || "Other";
      (groups[key] ??= []).push(j);
    }
    return groups;
  }, [clientOpenJobs]);

  // Week count
  const weekCount = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / (7 * 86400000)));

  return (
    <div className="fixed inset-0 sm:pt-8 sm:pb-8 z-50 flex items-start justify-center">
      {/* Backdrop — click to close */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal content */}
      <div
        className="relative z-10 bg-kp-surface border border-kp-border shadow-2xl w-full h-full sm:w-[95vw] sm:max-w-5xl sm:max-h-[90vh] rounded-none sm:rounded-2xl overflow-y-auto"
        onClick={(e) => { e.stopPropagation(); setShowPresets(false); }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-kp-text-muted hover:text-kp-text hover:bg-kp-surface-alt transition-colors z-10"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <div className="px-6 py-5">
          {/* Header */}
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-[20px] font-bold text-kp-text">{c.companyName}</h2>
              <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                c.priority === "Tier A" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                c.priority === "Tier B" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              }`}>{c.priority}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-kp-text-muted">
              <span>{c.branch}</span>
              <span>&middot;</span>
              <span>AM: <span className="font-semibold text-kp-text">{c.primaryAccountManager}</span></span>
              <span>&middot;</span>
              <span>Last visited: {c.dateLastVisited || "—"}</span>
              <span>&middot;</span>
              <span>Last contacted: {c.dateLastContacted || "—"}</span>
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="flex flex-wrap items-center gap-3 mb-5 bg-kp-surface-alt rounded-lg border border-kp-border px-4 py-3">
            <div className="relative">
              <p className="text-[9px] font-semibold text-kp-text-muted uppercase tracking-wider mb-1">Report Period</p>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPresets(!showPresets); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-kp-surface border border-kp-border rounded-lg text-[12px] font-semibold text-kp-text hover:border-kp-text/30 transition-colors cursor-pointer"
              >
                {PRESETS[presetIdx].label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {showPresets && (
                <div className="absolute top-full left-0 mt-1 bg-kp-surface border border-kp-border rounded-lg shadow-xl z-20 py-1 min-w-[180px]">
                  {PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      onClick={(e) => { e.stopPropagation(); setPresetIdx(i); setShowPresets(false); }}
                      className={`w-full text-left px-4 py-2 text-[12px] transition-colors cursor-pointer ${
                        i === presetIdx
                          ? "text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/20"
                          : "text-kp-text hover:bg-kp-surface-alt"
                      }`}
                    >
                      {i === presetIdx && <span className="mr-1.5">✓</span>}
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[9px] font-semibold text-kp-text-muted uppercase tracking-wider mb-1">From</p>
              <div className="px-3 py-1.5 bg-kp-surface border border-kp-border rounded-lg text-[12px] text-kp-text">{fmtDate(dateFrom)}</div>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-kp-text-muted uppercase tracking-wider mb-1">To</p>
              <div className="px-3 py-1.5 bg-kp-surface border border-kp-border rounded-lg text-[12px] text-kp-text">{fmtDate(dateTo)}</div>
            </div>
            <div className="ml-auto text-[12px] text-kp-text-muted font-semibold">{weekCount} {weekCount === 1 ? "week" : "weeks"}</div>
          </div>

          {/* Mini KPI Row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
            <div className="bg-kp-surface-alt rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Headcount</p>
              <p className="text-[20px] font-bold text-kp-text">{c.currentPlacements}</p>
            </div>
            <div className="bg-kp-surface-alt rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Open Jobs</p>
              <p className="text-[20px] font-bold text-kp-text">{c.currentOpenJobs}</p>
            </div>
            <div className="bg-kp-surface-alt rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold text-kp-text-muted uppercase">New</p>
              <p className="text-[20px] font-bold text-emerald-600 dark:text-emerald-400">{c.newPlacements}</p>
            </div>
            <div className="bg-kp-surface-alt rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Ended</p>
              <p className="text-[20px] font-bold text-red-600 dark:text-red-400">{c.endedPlacements}</p>
            </div>
            <div className="bg-kp-surface-alt rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Growth</p>
              <p className={`text-[20px] font-bold ${c.growth > 0 ? "text-emerald-600 dark:text-emerald-400" : c.growth < 0 ? "text-red-600 dark:text-red-400" : "text-kp-text-muted"}`}>
                {c.growth > 0 ? `+${c.growth}` : c.growth}
              </p>
            </div>
            <div className="bg-kp-surface-alt rounded-lg p-3 text-center">
              <p className="text-[10px] font-semibold text-kp-text-muted uppercase">Turnover</p>
              <p className="text-[20px] font-bold text-kp-text">{turnover}%</p>
            </div>
          </div>

          {/* Turnover Breakdown + GP row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {/* Turnover Breakdown */}
            {c.endedPlacements > 0 && (
              <div className="bg-kp-surface-alt rounded-lg border border-kp-border p-4 lg:col-span-2">
                <h3 className="text-[13px] font-bold text-kp-text mb-3">Turnover Breakdown</h3>

                {/* Involuntary / Voluntary KPI mini-row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-kp-surface rounded-lg p-3 text-center">
                    <p className="text-[9px] font-semibold text-kp-text-muted uppercase">Turnover Rate</p>
                    <p className="text-[18px] font-bold text-red-600 dark:text-red-400">{turnover}%</p>
                    <p className="text-[11px] text-kp-text-muted">({c.endedPlacements}) / {c.currentPlacements}</p>
                  </div>
                  <div className="bg-kp-surface rounded-lg p-3 text-center">
                    <p className="text-[9px] font-semibold text-kp-text-muted uppercase">Involuntary</p>
                    <p className="text-[18px] font-bold text-red-600 dark:text-red-400">{involPct}%</p>
                    <p className="text-[11px] text-kp-text-muted">{involRecords.length} terminations</p>
                  </div>
                  <div className="bg-kp-surface rounded-lg p-3 text-center">
                    <p className="text-[9px] font-semibold text-kp-text-muted uppercase">Voluntary</p>
                    <p className="text-[18px] font-bold text-amber-600 dark:text-amber-400">{volPct}%</p>
                    <p className="text-[11px] text-kp-text-muted">{volRecords.length} terminations</p>
                  </div>
                </div>

                {/* Reason-level breakdown panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-kp-surface rounded-lg p-3">
                    <h4 className="text-[12px] font-bold text-kp-text mb-2">
                      Involuntary <span className="text-kp-text-muted font-normal">({involRecords.length})</span>
                    </h4>
                    {involByReason.length === 0 ? (
                      <p className="text-[11px] text-kp-text-muted">No involuntary terminations.</p>
                    ) : (
                      <div className="space-y-2">
                        {involByReason.map(([reason, count]) => (
                          <ReasonBar key={reason} label={reason} value={count} total={involRecords.length} color="bg-red-500" />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-kp-surface rounded-lg p-3">
                    <h4 className="text-[12px] font-bold text-kp-text mb-2">
                      Voluntary <span className="text-kp-text-muted font-normal">({volRecords.length})</span>
                    </h4>
                    {volByReason.length === 0 ? (
                      <p className="text-[11px] text-kp-text-muted">No voluntary terminations.</p>
                    ) : (
                      <div className="space-y-2">
                        {volByReason.map(([reason, count]) => (
                          <ReasonBar key={reason} label={reason} value={count} total={volRecords.length} color="bg-amber-500" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* GP Data */}
            {gpRecord && (
              <div className={`bg-kp-surface-alt rounded-lg p-4 ${c.endedPlacements > 0 ? "" : "lg:col-span-2"}`}>
                <h3 className="text-[12px] font-bold text-kp-text mb-2">Gross Profit</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[11px] text-kp-text-muted">Gross Sales</p>
                    <p className="text-[14px] font-bold text-kp-text">{fmtDollars(gpRecord.grossSales)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-kp-text-muted">Gross Margin</p>
                    <p className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">{fmtDollars(gpRecord.grossMargin)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-kp-text-muted">GM%</p>
                    <p className="text-[14px] font-bold text-kp-text">{(gpRecord.gmPercent * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-kp-text-muted">Hours</p>
                    <p className="text-[14px] font-bold text-kp-text">{gpRecord.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-kp-surface-alt rounded-lg border border-kp-border p-4 mb-4">
            <h3 className="text-[13px] font-bold text-kp-text mb-3">Latest Notes</h3>
            {clientNotes.length === 0 ? (
              <p className="text-[12px] text-kp-text-muted">No notes.</p>
            ) : (
              <div className="space-y-3 max-h-[200px] overflow-y-auto">
                {clientNotes.slice(0, 5).map((note, i) => (
                  <div key={i} className="border-b border-kp-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        note.action === "Client Visit" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        note.action === "Phone Call" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}>{note.action}</span>
                      <span className="text-[11px] text-kp-text-muted">{note.dateAdded?.slice(0, 10)}</span>
                    </div>
                    <p className="text-[11px] text-kp-text leading-relaxed whitespace-pre-line line-clamp-3">{note.comments}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open Jobs table */}
          <div className="bg-kp-surface-alt rounded-lg border border-kp-border">
            <div className="px-4 py-3 border-b border-kp-border">
              <h3 className="text-[13px] font-bold text-kp-text">Open Jobs ({clientOpenJobs.length})</h3>
              {clientOpenJobs.length > 0 && <p className="text-[11px] text-kp-text-muted mt-0.5">Click a job to view submissions</p>}
            </div>
            {clientOpenJobs.length === 0 ? (
              <p className="text-[12px] text-kp-text-muted p-4">No open jobs.</p>
            ) : (
              <div className="overflow-x-auto">
                {Object.entries(jobsByType).map(([empType, jobs]) => (
                  <div key={empType}>
                    <div className="px-4 py-2 bg-kp-surface border-b border-kp-border">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{empType}</span>
                      <span className="text-[11px] text-kp-text-muted ml-2">{jobs.length} {jobs.length === 1 ? "job" : "jobs"}</span>
                    </div>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-kp-border">
                          <th className="text-left px-4 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Job Title</th>
                          <th className="text-left px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">BH ID</th>
                          <th className="text-left px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Status</th>
                          <th className="text-left px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Date Added</th>
                          <th className="text-right px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Openings</th>
                          <th className="text-right px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Submissions</th>
                          <th className="text-right px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Placed</th>
                          <th className="text-right px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Fill %</th>
                          <th className="text-right px-3 py-2 font-semibold text-kp-text-muted uppercase tracking-wider text-[10px]">Days Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((j) => {
                          const jobSubs = clientSubmissions.filter((s) => s.jobTitle === j.jobTitle);
                          const isJobOpen = expandedJob === j.jobId;
                          const fillPct = j.fillPercent > 0 ? Math.round(j.fillPercent * 100) : 0;
                          let daysOpen = parseInt(j.daysOpen) || 0;
                          if (!daysOpen && j.dateAdded) {
                            const periodEnd = new Date(report.meta.periodEnd);
                            const added = new Date(j.dateAdded);
                            if (!isNaN(added.getTime())) daysOpen = Math.round((periodEnd.getTime() - added.getTime()) / 86400000);
                          }
                          return (
                            <JobRow
                              key={j.jobId}
                              job={j}
                              submissions={jobSubs}
                              isOpen={isJobOpen}
                              fillPct={fillPct}
                              daysOpen={daysOpen}
                              onToggle={() => setExpandedJob(isJobOpen ? null : j.jobId)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Job Row with expandable submissions ────────────────────── */

function JobRow({ job: j, submissions, isOpen, fillPct, daysOpen, onToggle }: {
  job: JobRecord;
  submissions: Submission[];
  isOpen: boolean;
  fillPct: number;
  daysOpen: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-kp-border cursor-pointer transition-colors ${
          isOpen ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-kp-surface-alt"
        }`}
      >
        <td className="px-4 py-2.5 text-kp-text font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-kp-text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}><path d="M9 18l6-6-6-6" /></svg>
            {j.jobTitle}
          </span>
        </td>
        <td className="px-3 py-2.5 text-kp-text-muted">{j.jobId}</td>
        <td className="px-3 py-2.5">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
            j.status === "Accepting Candidates" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
            "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          }`}>{j.status}</span>
        </td>
        <td className="px-3 py-2.5 text-kp-text-muted">{j.dateAdded}</td>
        <td className="px-3 py-2.5 text-right text-kp-text">{j.numOpenings || "—"}</td>
        <td className="px-3 py-2.5 text-right text-kp-text">{submissions.length || "0"}</td>
        <td className="px-3 py-2.5 text-right text-kp-text">{j.placementCount || "0"}</td>
        <td className="px-3 py-2.5 text-right">
          <span className={`font-semibold ${fillPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : fillPct > 0 ? "text-amber-600 dark:text-amber-400" : "text-kp-text-muted"}`}>
            {fillPct > 0 ? `${fillPct}%` : "—"}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right text-kp-text-muted">{daysOpen > 0 ? daysOpen : "—"}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="bg-kp-bg border-b border-kp-border px-6 py-3">
              <p className="text-[11px] font-bold text-kp-text mb-2">Submissions ({submissions.length})</p>
              {submissions.length === 0 ? (
                <p className="text-[11px] text-kp-text-muted">No submissions for this job.</p>
              ) : (
                <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                  {submissions.map((s) => (
                    <div key={s.submissionId} className="flex items-center justify-between gap-2 py-1.5 px-3 bg-kp-surface rounded border border-kp-border">
                      <div>
                        <p className="text-[11px] font-semibold text-kp-text">{s.candidateName}</p>
                        <p className="text-[11px] text-kp-text-muted">{s.jobTitle} &middot; {s.staffingRep}</p>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                        s.submissionStatus === "Placed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        s.submissionStatus?.includes("Rejected") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}>{s.submissionStatus}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Roster Drilldown (from headcount chart click) ───────────── */

function RosterDrilldown({
  clientName,
  report,
  rosterSort,
  rosterDir,
  setRosterSort,
  setRosterDir,
  onBack,
}: {
  clientName: string;
  report: ParsedAMReport;
  rosterSort: SortField;
  rosterDir: SortDir;
  setRosterSort: (f: SortField) => void;
  setRosterDir: (d: SortDir) => void;
  onBack: () => void;
}) {
  const placements = useMemo(() => {
    const raw = report.allPlacements.filter((p) => p.companyName === clientName);
    return raw.map((p) => {
      const np = report.newPlacements.find(
        (n) => n.companyName === clientName && n.name === p.name
      );
      const ep = report.endedPlacements.find(
        (e) => e.companyName === clientName && e.name === p.name
      );
      return {
        ...p,
        payRate: np?.payRateLow ?? ep?.payRateLow ?? 0,
      };
    });
  }, [clientName, report]);

  const sorted = useMemo(() => {
    const arr = [...placements];
    arr.sort((a, b) => {
      let cmp = 0;
      if (rosterSort === "jobTitle") cmp = a.jobTitle.localeCompare(b.jobTitle);
      else if (rosterSort === "payRate") cmp = a.payRate - b.payRate;
      else if (rosterSort === "name") cmp = a.name.localeCompare(b.name);
      else if (rosterSort === "startDate") cmp = a.startDate.localeCompare(b.startDate);
      return rosterDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [placements, rosterSort, rosterDir]);

  function toggleSort(field: SortField) {
    if (rosterSort === field) {
      setRosterDir(rosterDir === "asc" ? "desc" : "asc");
    } else {
      setRosterSort(field);
      setRosterDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (rosterSort !== field) return <span className="text-kp-text-muted/40 ml-1">&#8597;</span>;
    return <span className="ml-1">{rosterDir === "asc" ? "&#9650;" : "&#9660;"}</span>;
  }

  const clientMetric = report.clientMetrics.find((c) => c.companyName === clientName);

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      <SectionBack onClick={onBack} label="Back to Dashboard" />

      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-kp-text">{clientName} — Active Roster</h1>
        <p className="text-[13px] text-kp-text-muted mt-1">
          {sorted.length} placements {clientMetric ? `· ${clientMetric.branch} · ${clientMetric.priority}` : ""}
        </p>
      </div>

      <div className="bg-kp-surface border border-kp-border rounded-xl overflow-hidden">
        {sorted.length === 0 ? (
          <p className="px-5 py-8 text-[13px] text-kp-text-muted text-center">No active placements for this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-kp-surface-alt border-b border-kp-border">
                  <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    Name <SortIcon field="name" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted cursor-pointer select-none" onClick={() => toggleSort("jobTitle")}>
                    Job Title <SortIcon field="jobTitle" />
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted cursor-pointer select-none" onClick={() => toggleSort("payRate")}>
                    Pay Rate <SortIcon field="payRate" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted cursor-pointer select-none" onClick={() => toggleSort("startDate")}>
                    Start Date <SortIcon field="startDate" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">End Date</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={`${p.name}-${i}`} className="border-b border-kp-border">
                    <td className="px-4 py-2.5 font-semibold text-kp-text">{p.name}</td>
                    <td className="px-3 py-2.5 text-kp-text">{p.jobTitle}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-kp-text">
                      {p.payRate > 0 ? `$${p.payRate.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-kp-text-muted">{p.startDate}</td>
                    <td className="px-3 py-2.5 text-kp-text-muted">{p.actualEndDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
