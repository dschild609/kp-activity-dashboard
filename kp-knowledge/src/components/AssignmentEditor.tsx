import { useMemo, useState } from "react";
import type { Assignment } from "../types/knowledge";
import {
  ASSIGNABLE_ROLES,
  BRANCHES,
  resolveAssigned,
  roleLabel,
  type RosterUser,
} from "../lib/roster";

/* Assign a test to everyone, or any mix of roles / branches / specific
 * people. The union of all four is who's tracked for completion. */
export function AssignmentEditor({
  assignment,
  roster,
  onChange,
}: {
  assignment: Assignment;
  roster: RosterUser[];
  onChange: (next: Assignment) => void;
}) {
  const [personQuery, setPersonQuery] = useState("");

  const assignedCount = useMemo(
    () => resolveAssigned(assignment, roster).length,
    [assignment, roster]
  );
  const pickedPeople = useMemo(
    () => roster.filter((u) => assignment.uids.includes(u.uid)),
    [roster, assignment.uids]
  );
  const searchResults = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    if (!q) return [];
    return roster
      .filter(
        (u) =>
          !assignment.uids.includes(u.uid) &&
          (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [personQuery, roster, assignment.uids]);

  const toggle = (key: "roles" | "branches", value: string) => {
    const cur = assignment[key];
    onChange({
      ...assignment,
      [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    });
  };

  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5 space-y-5">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={assignment.everyone}
          onChange={(e) => onChange({ ...assignment, everyone: e.target.checked })}
          className="w-4 h-4 accent-[var(--color-kp-crimson)]"
        />
        <span className="text-[14px] font-semibold text-kp-text">Assign to everyone</span>
        <span className="text-[12.5px] text-kp-text-faint">(all staff with KP Knowledge access)</span>
      </label>

      {!assignment.everyone && (
        <>
          <div>
            <div className="font-mono text-[11px] uppercase text-kp-text-faint mb-2">By role</div>
            <div className="flex flex-wrap gap-1.5">
              {ASSIGNABLE_ROLES.map((r) => (
                <Chip
                  key={r.id}
                  label={r.label}
                  active={assignment.roles.includes(r.id)}
                  onClick={() => toggle("roles", r.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[11px] uppercase text-kp-text-faint mb-2">By branch</div>
            <div className="flex flex-wrap gap-1.5">
              {BRANCHES.map((b) => (
                <Chip
                  key={b}
                  label={b}
                  active={assignment.branches.includes(b)}
                  onClick={() => toggle("branches", b)}
                  mono
                />
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[11px] uppercase text-kp-text-faint mb-2">Specific people</div>
            {pickedPeople.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {pickedPeople.map((u) => (
                  <span
                    key={u.uid}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[12.5px] font-semibold bg-kp-crimson-soft text-kp-crimson-soft-text border border-kp-crimson-soft rounded-lg"
                  >
                    {u.name}
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...assignment, uids: assignment.uids.filter((x) => x !== u.uid) })
                      }
                      className="hover:text-kp-bad"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative max-w-sm">
              <input
                value={personQuery}
                onChange={(e) => setPersonQuery(e.target.value)}
                placeholder={roster.length ? "Search by name or email…" : "Loading roster…"}
                disabled={roster.length === 0}
                className="focus-kp w-full bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px] disabled:opacity-50"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-kp-surface border border-kp-border rounded-lg shadow-lg py-1">
                  {searchResults.map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => {
                        onChange({ ...assignment, uids: [...assignment.uids, u.uid] });
                        setPersonQuery("");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-kp-surface-alt"
                    >
                      <div className="text-[13.5px] font-semibold text-kp-text">{u.name}</div>
                      <div className="text-[12px] text-kp-text-faint">
                        {roleLabel(u.role)}{u.branch ? ` · ${u.branch}` : ""} · {u.email}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 border-t border-kp-border-soft">
        <label className="font-mono text-[11px] uppercase text-kp-text-faint">Due date</label>
        <input
          type="date"
          value={assignment.dueDate ?? ""}
          onChange={(e) => onChange({ ...assignment, dueDate: e.target.value || null })}
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13px]"
        />
        {assignment.dueDate ? (
          <button
            type="button"
            onClick={() => onChange({ ...assignment, dueDate: null })}
            className="text-[12.5px] font-semibold text-kp-text-muted hover:text-kp-navy"
          >
            Clear (no due date)
          </button>
        ) : (
          <span className="text-[12.5px] text-kp-text-faint">No due date</span>
        )}
      </div>

      <div className="text-[13px] text-kp-text-muted">
        {roster.length === 0 ? (
          "Loading roster…"
        ) : assignedCount === 0 ? (
          <span className="text-kp-text-faint">Not assigned — available to take, but not tracked for completion.</span>
        ) : (
          <>
            Assigned to <strong className="text-kp-text">{assignedCount}</strong>{" "}
            {assignedCount === 1 ? "person" : "people"} — tracked on the Assignments tab.
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  mono,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg border text-[12.5px] font-semibold transition-colors ${
        mono ? "font-mono" : ""
      } ${
        active
          ? "bg-kp-crimson-soft text-kp-crimson-soft-text border-kp-crimson-soft"
          : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
      }`}
    >
      {label}
    </button>
  );
}
