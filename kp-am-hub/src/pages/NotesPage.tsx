import { useState } from "react";
import { Link } from "react-router-dom";
import { useReportData } from "../hooks/useReportData";

export function NotesPage() {
  const { report } = useReportData();
  const [filterClient, setFilterClient] = useState("");

  if (!report) {
    return (
      <div className="px-4 sm:px-6 md:px-8 py-12 text-center">
        <p className="text-kp-text-muted text-[14px]">No report loaded. <Link to="/upload" className="text-kp-crimson font-semibold underline">Upload a file</Link> first.</p>
      </div>
    );
  }

  const notes = report.meetingNotes;
  const clients = [...new Set(notes.map((n) => n.companyName))].sort();

  const filtered = filterClient
    ? notes.filter((n) => n.companyName === filterClient)
    : notes;

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-kp-text">Meeting & Visit Notes</h1>
        <p className="text-[13px] text-kp-text-muted mt-1">
          {notes.length} notes from this reporting period
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-5">
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-2 text-[13px] bg-kp-surface border border-kp-border rounded-lg text-kp-text"
        >
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {filterClient && (
          <button
            onClick={() => setFilterClient("")}
            className="px-3 py-2 text-[12px] text-kp-text-muted hover:text-kp-text"
          >
            Clear
          </button>
        )}
      </div>

      {/* Notes List */}
      <div className="space-y-4">
        {filtered.map((note, i) => (
          <div key={`${note.noteTemplateId}-${i}`} className="bg-kp-surface border border-kp-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-[14px] font-bold text-kp-text">{note.companyName}</h3>
                <p className="text-[12px] text-kp-text-muted mt-0.5">
                  {note.about && <span className="font-medium">{note.about} &middot; </span>}
                  {note.action}
                </p>
              </div>
              <span className="text-[11px] text-kp-text-muted whitespace-nowrap shrink-0">
                {note.dateAdded}
              </span>
            </div>
            {note.comments && (
              <div className="bg-kp-surface-alt rounded-lg p-4 text-[13px] text-kp-text leading-relaxed whitespace-pre-wrap">
                {note.comments}
              </div>
            )}
            {note.action && (
              <div className="mt-3 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  note.action === "Client Visit" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                  note.action === "Meeting" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                  "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}>
                  {note.action}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[13px] text-kp-text-muted">
          No notes found for this period.
        </div>
      )}
    </div>
  );
}
