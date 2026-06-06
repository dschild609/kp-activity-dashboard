import { useState } from "react";
import { Link } from "react-router-dom";
import { useReportData } from "../hooks/useReportData";

export function SubmissionsPage() {
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

  const submissions = report.submissions;
  const clients = [...new Set(submissions.map((s) => s.companyName))].sort();
  const statuses = [...new Set(submissions.map((s) => s.openClosed))].filter(Boolean).sort();

  const filtered = submissions.filter((s) => {
    if (filterClient && s.companyName !== filterClient) return false;
    if (filterStatus && s.openClosed !== filterStatus) return false;
    return true;
  });

  const openCount = submissions.filter((s) => s.openClosed === "Open").length;
  const closedCount = submissions.filter((s) => s.openClosed === "Closed").length;

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-kp-text">Submissions</h1>
        <p className="text-[13px] text-kp-text-muted mt-1">
          {submissions.length} total &middot; {openCount} open &middot; {closedCount} closed
        </p>
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
          <option value="">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
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

      {/* Table */}
      <div className="bg-kp-surface border border-kp-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-kp-surface-alt border-b border-kp-border">
                <th className="text-left px-4 py-2.5 font-semibold text-kp-text-muted">Client</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Job Title</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Candidate</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Status</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Open/Closed</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Staffing Rep</th>
                <th className="text-left px-3 py-2.5 font-semibold text-kp-text-muted">Date Added</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={`${s.submissionId}-${i}`} className="border-b border-kp-border hover:bg-kp-surface-alt transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-kp-text">{s.companyName}</td>
                  <td className="px-3 py-2.5 text-kp-text">{s.jobTitle}</td>
                  <td className="px-3 py-2.5 text-kp-text">{s.candidateName}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      s.submissionStatus === "Placed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      s.submissionStatus === "Submission Rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}>
                      {s.submissionStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      s.openClosed === "Open" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {s.openClosed}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-kp-text-muted">{s.staffingRep}</td>
                  <td className="px-3 py-2.5 text-kp-text-muted">{s.dateAdded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-kp-text-muted">
            No submissions match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
