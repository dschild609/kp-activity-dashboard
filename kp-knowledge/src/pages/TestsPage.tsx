import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { Assignment, KnowledgeAttempt, KnowledgeTest } from "../types/knowledge";
import { attemptGate, listAttempts, listTests } from "../lib/knowledge";
import { assignmentMatchesUser, daysUntil, formatDue, normalizeRole } from "../lib/roster";
import { mergeTagVocabulary, subscribeTags, subscribeTagPermissions, testVisibleForRole, type TagPermissions } from "../lib/tags";
import { Pill } from "../components/ui";

type TabKey = "assigned" | "library";
type SortKey = "name" | "category" | "recent";

const SORTS: Record<SortKey, { label: string; cmp: (a: KnowledgeTest, b: KnowledgeTest) => number }> = {
  name: { label: "Name (A–Z)", cmp: (a, b) => a.name.localeCompare(b.name) },
  category: {
    label: "Category",
    cmp: (a, b) => (a.tags[0] ?? "~").localeCompare(b.tags[0] ?? "~") || a.name.localeCompare(b.name),
  },
  recent: {
    label: "Recently added",
    cmp: (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  },
};

export function TestsPage() {
  const { user, role, branch, canManage } = useOutletContext<AuthState>();
  const [tests, setTests] = useState<KnowledgeTest[] | null>(null);
  const [attempts, setAttempts] = useState<KnowledgeAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("assigned");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [vocab, setVocab] = useState<string[]>([]);
  const [tagPerms, setTagPerms] = useState<TagPermissions>({});

  useEffect(() => {
    if (!user) return;
    Promise.all([listTests({ activeOnly: true }), listAttempts({ uid: user.uid })])
      .then(([t, a]) => { setTests(t); setAttempts(a); })
      .catch((e) => setError((e as Error).message));
  }, [user]);

  // The managed tag vocabulary drives the filter chips, so a new tag shows
  // up here even before any test uses it.
  useEffect(() => subscribeTags(setVocab), []);
  // Per-tag role visibility scopes the Library (set on the admin Permissions tab).
  useEffect(() => subscribeTagPermissions(setTagPerms), []);

  const attemptsByTest = useMemo(() => {
    const map = new Map<string, KnowledgeAttempt[]>();
    for (const a of attempts) {
      const list = map.get(a.testId) ?? [];
      list.push(a);
      map.set(a.testId, list);
    }
    return map;
  }, [attempts]);

  const bestOf = (t: KnowledgeTest) => {
    const a = attemptsByTest.get(t.id) ?? [];
    return a.find((x) => x.passed) ?? a[0];
  };
  const isAssignedToMe = (t: KnowledgeTest) =>
    !!user && assignmentMatchesUser(t.assignment, { uid: user.uid, role, branch });

  const allTags = useMemo(() => mergeTagVocabulary(vocab, tests ?? []), [tests, vocab]);

  // Assigned-to-me, sorted as a to-do list: overdue/soonest-due first, then
  // undated, then already-passed at the bottom.
  const assignedTests = useMemo(() => {
    const key = (t: KnowledgeTest): [number, string] => {
      if (bestOf(t)?.passed) return [3, t.name];
      if (t.assignment.dueDate) return [1, t.assignment.dueDate];
      return [2, t.name];
    };
    return (tests ?? [])
      .filter(isAssignedToMe)
      .sort((a, b) => {
        const [ga, ka] = key(a);
        const [gb, kb] = key(b);
        return ga - gb || ka.localeCompare(kb);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, attempts, user, role, branch]);

  const assignedOutstanding = assignedTests.filter((t) => !bestOf(t)?.passed).length;

  // Library = every active test, minus any whose tags aren't visible to this
  // user's role (managers see all), then the chip filter + sort.
  const libraryTests = useMemo(() => {
    const myRole = normalizeRole(role);
    return (tests ?? [])
      .filter((t) => canManage || testVisibleForRole(tagPerms, t.tags, myRole))
      .filter((t) => !tagFilter || t.tags.includes(tagFilter))
      .sort(SORTS[sort].cmp);
  }, [tests, tagFilter, sort, tagPerms, role, canManage]);

  const shown = tab === "assigned" ? assignedTests : libraryTests;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.025em] text-kp-navy mb-1">
        Tests
      </h1>
      <p className="text-[14px] text-kp-text-muted mb-5">
        Certification and knowledge checks for KP staff.
      </p>

      <div className="flex gap-1 mb-5 border-b border-kp-border overflow-x-auto">
        <TabBtn label="Assigned to Me" count={assignedOutstanding} active={tab === "assigned"} onClick={() => setTab("assigned")} />
        <TabBtn label="Library" active={tab === "library"} onClick={() => setTab("library")} />
      </div>

      {tab === "library" && (
        <div className="mb-5 space-y-3">
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <FilterChip label="All" active={tagFilter === null} onClick={() => setTagFilter(null)} />
              {allTags.map((tag) => (
                <FilterChip key={tag} label={tag} active={tagFilter === tag} onClick={() => setTagFilter(tag)} />
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-kp-text-muted">
            <span className="font-mono text-[11px] uppercase text-kp-text-faint">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13px]"
            >
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORTS[k].label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && (
        <div className="text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-4 mb-6">
          Couldn't load tests: {error}
        </div>
      )}

      {tests === null && !error && (
        <div className="text-[14px] text-kp-text-muted">Loading tests…</div>
      )}

      {tests !== null && shown.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center">
          <div className="text-[28px] mb-2">{tab === "assigned" ? "✅" : "📚"}</div>
          <div className="text-[15px] font-bold text-kp-text mb-1">
            {tab === "assigned" ? "Nothing assigned to you" : "No tests found"}
          </div>
          <div className="text-[13.5px] text-kp-text-muted">
            {tab === "assigned" ? (
              <>
                You have no outstanding assigned tests.{" "}
                <button type="button" onClick={() => setTab("library")} className="text-kp-crimson font-semibold hover:underline">
                  Browse the Library
                </button>
                .
              </>
            ) : tagFilter ? (
              "No tests carry this tag yet."
            ) : (
              "When tests are published they'll show up here."
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((test) => (
          <TestCard
            key={test.id}
            test={test}
            attempts={attemptsByTest.get(test.id) ?? []}
            assignedToMe={isAssignedToMe(test)}
          />
        ))}
      </div>
    </main>
  );
}

function TestCard({
  test,
  attempts,
  assignedToMe,
}: {
  test: KnowledgeTest;
  attempts: KnowledgeAttempt[];
  assignedToMe: boolean;
}) {
  const best = attempts.find((a) => a.passed) ?? attempts[0];
  const gate = attemptGate(test, attempts);
  const passNeeded = Math.max(test.questionCount - test.maxWrongToPass, 0);
  return (
    <div className="group flex flex-col p-5 bg-kp-surface rounded-xl border border-kp-border shadow-2xs hover:border-kp-border-strong hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="text-[16px] font-bold text-kp-text">{test.name}</h2>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {best ? (
            best.passed ? <Pill tone="good">Passed</Pill> : <Pill tone="bad">Failed</Pill>
          ) : (
            <Pill tone="neutral">Not started</Pill>
          )}
          {assignedToMe && !best?.passed && <AssignedBadge assignment={test.assignment} />}
        </div>
      </div>
      {test.description && (
        <p className="text-[13.5px] text-kp-text-muted mb-3">{test.description}</p>
      )}
      <div className="text-[12.5px] text-kp-text-faint mb-4">
        {test.questionCount} questions · pass with {passNeeded} or more correct
      </div>
      <div className="mt-auto space-y-2.5">
        {best && (
          <div className="text-[13.5px] font-semibold text-kp-text-muted">
            {best.passed ? "Score" : "Best so far"}:{" "}
            <span className="font-bold text-kp-text">
              {Math.max(...attempts.map((a) => a.score))}%
            </span>
            {best.submittedAt && (
              <span className="text-kp-text-faint font-normal">
                {" "}· {best.submittedAt.toDate().toLocaleDateString()}
              </span>
            )}
            {attempts.length > 1 && (
              <span className="text-kp-text-faint font-normal"> · {attempts.length} attempts</span>
            )}
          </div>
        )}
        {gate.canTake && (
          <Link
            to={`/tests/${test.id}`}
            className={`inline-block px-4 py-2 text-white text-[13.5px] font-semibold rounded-lg transition-colors ${
              best ? "bg-kp-crimson hover:bg-kp-crimson-hover" : "bg-kp-navy hover:bg-kp-navy-hover"
            }`}
          >
            {best
              ? `Retake Test${
                  test.retakePolicy === "limited" ? ` (${attempts.length} of ${test.maxAttempts} used)` : ""
                }`
              : "Start Test"}
          </Link>
        )}
        {gate.retakeable && (
          <Link
            to={`/tests/${test.id}?retake=1`}
            className="inline-block px-4 py-2 text-[13.5px] font-semibold rounded-lg border border-kp-border text-kp-text-muted hover:text-kp-navy hover:bg-kp-surface-alt transition-colors"
          >
            Retake for practice ↻
          </Link>
        )}
        {!gate.canTake && gate.reason === "out-of-attempts" && (
          <div className="text-[12.5px] text-kp-text-faint">
            All {test.maxAttempts} attempts used — ask your admin for another.
          </div>
        )}
        {!gate.canTake && gate.reason === "single-used" && !best?.passed && (
          <div className="text-[12.5px] text-kp-text-faint">
            One attempt allowed — ask your admin for a reset.
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px shrink-0 whitespace-nowrap px-4 py-2.5 text-[14px] font-semibold border-b-2 transition-colors ${
        active
          ? "border-kp-crimson text-kp-navy"
          : "border-transparent text-kp-text-muted hover:text-kp-text"
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
            active ? "bg-kp-crimson text-white" : "bg-kp-surface-alt text-kp-text-muted"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* "Assigned to you" badge on the current user's assigned tests, reflecting
 * the optional due date (overdue / due today / due soon / due later). */
function AssignedBadge({ assignment }: { assignment: Assignment }) {
  const base = "px-2 py-0.5 text-[11.5px] font-bold rounded-[6px] border whitespace-nowrap";
  const due = assignment.dueDate;
  if (!due) {
    return <span className={`${base} text-kp-violet bg-kp-crimson-soft border-kp-crimson-soft`}>Assigned</span>;
  }
  const d = daysUntil(due);
  if (d < 0) {
    return <span className={`${base} text-kp-bad bg-kp-bad-bg border-kp-bad-border`}>Overdue · was {formatDue(due)}</span>;
  }
  if (d === 0) {
    return <span className={`${base} text-kp-warn bg-kp-warn-bg border-kp-warn-border`}>Due today</span>;
  }
  const tone =
    d <= 7
      ? "text-kp-warn bg-kp-warn-bg border-kp-warn-border"
      : "text-kp-violet bg-kp-crimson-soft border-kp-crimson-soft";
  return <span className={`${base} ${tone}`}>Assigned · due {formatDue(due)}</span>;
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const cls = active
    ? label === "All"
      ? "bg-kp-navy text-white border-kp-navy"
      : "bg-kp-crimson-soft text-kp-crimson-soft-text border-kp-crimson-soft"
    : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}
