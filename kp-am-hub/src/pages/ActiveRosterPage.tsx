import { useState } from "react";
import { Link } from "react-router-dom";
import { useReportData } from "../hooks/useReportData";

type Tab = "all" | "new" | "converted" | "ended";

export function ActiveRosterPage() {
  const { report } = useReportData();
  const [tab, setTab] = useState<Tab>("all");
  const [filterClient, setFilterClient] = useState("");

  if (!report) {
    return (
      <div className="px-4 sm:px-6 md:px-8 py-12 text-center">
        <p className="text-kp-text-muted text-[14px]">No report loaded. <Link to="/upload" className="text-kp-crimson font-semibold underline">Upload a file</Link> first.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All Placements", count: report.allPlacements.length },
    { key: "new", label: "New Starts", count: report.newPlacements.length },
    { key: "converted", label: "Converted", count: report.convertedPlacements.length },
    { key: "ended", label: "Ended", count: report.endedPlacements.length },
  ];

  const allClients = [
    ...new Set([
      ...report.allPlacements.map((p) => p.companyName),
      ...report.newPlacements.map((p) => p.companyName),
      ...report.convertedPlacements.map((p) => p.companyName),
      ...report.endedPlacements.map((p) => p.companyName),
    ]),
  ].sort();

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-kp-text">Active Roster</h1>
        <p className="text-[13px] text-kp-text-muted mt-1">
          Placement activity for this reporting period
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 bg-kp-surface-alt border border-kp-border rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              tab === t.key
                ? "bg-kp-surface text-kp-text shadow-sm"
                : "text-kp-text-muted hover:text-kp-text"
            }`}
          >
            {t.label} <span className="text-[11px] ml-1 opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Client filter */}
      <div className="flex gap-3 mb-5">
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-2 text-[13px] bg-kp-surface border border-kp-border rounded-lg text-kp-text"
        >
          <option value="">All Clients</option>
          {allClients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {filterClient && (
          <button onClick={() => setFilterClient("")} className="px-3 py-2 text-[12px] text-kp-text-muted hover:text-kp-text">
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      <div className="bg-kp-surface border border-kp-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {tab === "all" && <AllPlacementsTable data={report.allPlacements.filter((p) => !filterClient || p.companyName === filterClient)} />}
          {tab === "new" && <NewPlacementsTable data={report.newPlacements.filter((p) => !filterClient || p.companyName === filterClient)} />}
          {tab === "converted" && <ConvertedTable data={report.convertedPlacements.filter((p) => !filterClient || p.companyName === filterClient)} />}
          {tab === "ended" && <EndedTable data={report.endedPlacements.filter((p) => !filterClient || p.companyName === filterClient)} />}
        </div>
      </div>

      {/* Placement Summary */}
      {report.placementSummaries.length > 0 && (
        <div className="mt-8 bg-kp-surface border border-kp-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-kp-border">
            <h2 className="text-[14px] font-bold text-kp-text">Placement Summary by Client</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-kp-surface-alt border-b border-kp-border">
                  <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Total</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">New</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Converted</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Ended</th>
                </tr>
              </thead>
              <tbody>
                {report.placementSummaries.map((s) => (
                  <tr key={s.companyName} className="border-b border-kp-border hover:bg-kp-surface-alt">
                    <td className="px-4 py-2.5 font-semibold text-kp-text">{s.companyName}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-kp-text">{s.total}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{s.new || "—"}</td>
                    <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400">{s.converted || "—"}</td>
                    <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400">{s.ended || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AllPlacementsTable({ data }: { data: { companyName: string; name: string; candidateId: string; jobTitle: string; startDate: string; actualEndDate: string }[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="bg-kp-surface-alt border-b border-kp-border">
          <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Employee</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Start Date</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">End Date</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p, i) => (
          <tr key={`${p.name}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt">
            <td className="px-4 py-2.5 font-semibold text-kp-text">{p.companyName}</td>
            <td className="px-3 py-2.5 text-kp-text">{p.name}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.jobTitle}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.startDate}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.actualEndDate || "Active"}</td>
          </tr>
        ))}
      </tbody>
      {data.length === 0 && (
        <tbody><tr><td colSpan={5} className="px-4 py-8 text-center text-kp-text-muted">No placements found.</td></tr></tbody>
      )}
    </table>
  );
}

function NewPlacementsTable({ data }: { data: { companyName: string; name: string; subDepartment: string; jobTitle: string; payRateLow: number; startDate: string; staffingRep: string }[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="bg-kp-surface-alt border-b border-kp-border">
          <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Employee</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
          <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Pay Rate</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Start Date</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Staffing Rep</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p, i) => (
          <tr key={`${p.name}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt">
            <td className="px-4 py-2.5 font-semibold text-kp-text">{p.companyName}</td>
            <td className="px-3 py-2.5 text-kp-text">{p.name}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.jobTitle}</td>
            <td className="px-3 py-2.5 text-right text-kp-text">${p.payRateLow}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.startDate}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.staffingRep}</td>
          </tr>
        ))}
      </tbody>
      {data.length === 0 && (
        <tbody><tr><td colSpan={6} className="px-4 py-8 text-center text-kp-text-muted">No new placements.</td></tr></tbody>
      )}
    </table>
  );
}

function ConvertedTable({ data }: { data: { companyName: string; name: string; subDepartment: string; jobTitle: string; payRateLow: number; convertedDate: string; staffingRep: string }[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="bg-kp-surface-alt border-b border-kp-border">
          <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Employee</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
          <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Pay Rate</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Converted Date</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Staffing Rep</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p, i) => (
          <tr key={`${p.name}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt">
            <td className="px-4 py-2.5 font-semibold text-kp-text">{p.companyName}</td>
            <td className="px-3 py-2.5 text-kp-text">{p.name}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.jobTitle}</td>
            <td className="px-3 py-2.5 text-right text-kp-text">${p.payRateLow}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.convertedDate}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.staffingRep}</td>
          </tr>
        ))}
      </tbody>
      {data.length === 0 && (
        <tbody><tr><td colSpan={6} className="px-4 py-8 text-center text-kp-text-muted">No conversions.</td></tr></tbody>
      )}
    </table>
  );
}

function EndedTable({ data }: { data: { companyName: string; name: string; subDepartment: string; jobTitle: string; payRateLow: number; endDate: string; staffingRep: string }[] }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="bg-kp-surface-alt border-b border-kp-border">
          <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Employee</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
          <th className="text-right px-3 py-2.5 font-semibold text-kp-text-muted">Pay Rate</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">End Date</th>
          <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Staffing Rep</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p, i) => (
          <tr key={`${p.name}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt">
            <td className="px-4 py-2.5 font-semibold text-kp-text">{p.companyName}</td>
            <td className="px-3 py-2.5 text-kp-text">{p.name}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.jobTitle}</td>
            <td className="px-3 py-2.5 text-right text-kp-text">${p.payRateLow}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.endDate}</td>
            <td className="px-3 py-2.5 text-kp-text-muted">{p.staffingRep}</td>
          </tr>
        ))}
      </tbody>
      {data.length === 0 && (
        <tbody><tr><td colSpan={6} className="px-4 py-8 text-center text-kp-text-muted">No ended placements.</td></tr></tbody>
      )}
    </table>
  );
}
