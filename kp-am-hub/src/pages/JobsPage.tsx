import { useState } from "react";
import { Link } from "react-router-dom";
import { useReportData } from "../hooks/useReportData";

export function JobsPage() {
  const { report } = useReportData();
  const [filterClient, setFilterClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  if (!report) {
    return (
      <div className="px-4 sm:px-6 md:px-8 py-12 text-center">
        <p className="text-kp-text-muted text-[14px]">No report loaded. <Link to="/upload" className="text-kp-crimson font-semibold underline">Upload a file</Link> first.</p>
      </div>
    );
  }

  const jobs = report.jobs;
  const clients = [...new Set(jobs.map((j) => j.companyName))].sort();
  const openCount = jobs.filter((j) => j.openClosed === "Open").length;
  const closedCount = jobs.filter((j) => j.openClosed === "Closed").length;

  const filtered = jobs.filter((j) => {
    if (filterClient && j.companyName !== filterClient) return false;
    if (filterStatus && j.openClosed !== filterStatus) return false;
    return true;
  });

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-kp-text">Open & Closed Jobs</h1>
        <p className="text-[13px] text-kp-text-muted mt-1">
          {jobs.length} total &middot; {openCount} open &middot; {closedCount} closed
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-kp-surface border border-kp-border rounded-xl p-4 text-center">
          <p className="text-[24px] font-bold text-kp-text">{jobs.length}</p>
          <p className="text-[11px] text-kp-text-muted uppercase font-semibold">Total Jobs</p>
        </div>
        <div className="bg-kp-surface border border-kp-border rounded-xl p-4 text-center">
          <p className="text-[24px] font-bold text-emerald-600">{openCount}</p>
          <p className="text-[11px] text-kp-text-muted uppercase font-semibold">Open</p>
        </div>
        <div className="bg-kp-surface border border-kp-border rounded-xl p-4 text-center">
          <p className="text-[24px] font-bold text-slate-500">{closedCount}</p>
          <p className="text-[11px] text-kp-text-muted uppercase font-semibold">Closed</p>
        </div>
        <div className="bg-kp-surface border border-kp-border rounded-xl p-4 text-center">
          <p className="text-[24px] font-bold text-kp-text">{clients.length}</p>
          <p className="text-[11px] text-kp-text-muted uppercase font-semibold">Clients with Jobs</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-2 text-[13px] bg-kp-surface border border-kp-border rounded-lg text-kp-text"
        >
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-[13px] bg-kp-surface border border-kp-border rounded-lg text-kp-text"
        >
          <option value="">All</option>
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
        </select>
        {(filterClient || filterStatus) && (
          <button
            onClick={() => { setFilterClient(""); setFilterStatus(""); }}
            className="px-3 py-2 text-[12px] text-kp-text-muted hover:text-kp-text"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Jobs Table */}
      <div className="bg-kp-surface border border-kp-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-kp-surface-alt border-b border-kp-border">
                <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Type</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Status</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Open/Closed</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job ID</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Date Added</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j, i) => (
                <tr key={`${j.jobId}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-kp-text">{j.companyName}</td>
                  <td className="px-3 py-2.5 text-kp-text">{j.jobTitle}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {j.employmentType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      j.status === "Placed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      j.status.includes("Cancel") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      j.openClosed === "Open" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {j.openClosed}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-kp-text-muted">{j.jobId}</td>
                  <td className="px-3 py-2.5 text-kp-text-muted">{j.dateAdded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-kp-text-muted">
            No jobs match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
