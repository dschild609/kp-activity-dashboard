import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import {
  EMPTY_ASSIGNMENT,
  isAssigned,
  type AnswerKey,
  type Assignment,
  type KnowledgeAttempt,
  type KnowledgeOpen,
  type KnowledgeQuestion,
  type KnowledgeTest,
} from "../types/knowledge";
import { ASSIGNABLE_ROLES, daysUntil, formatDue, getRoster, resolveAssigned, roleLabel, type RosterUser } from "../lib/roster";
import { AssignmentEditor } from "../components/AssignmentEditor";
import {
  previewReminders,
  sendReminders,
  REMINDER_LABEL,
  type ReminderRow,
} from "../lib/reminders";
import {
  deleteAttempt,
  deleteTest,
  getQuestions,
  listAttempts,
  listOpens,
  listTests,
  updateTest,
} from "../lib/knowledge";
import { mergeTagVocabulary, subscribeTags, addTag, removeTag, subscribeTagPermissions, saveTagPermissions, type TagPermissions } from "../lib/tags";
import { generateTestFromDoc } from "../lib/aiGenerate";
import { MAX_TOTAL_PAGES, renderExhibit } from "../lib/exhibitPages";
import { seedForkliftTest } from "../lib/seed";
import { Chip, NoticeBox, Pill, SmallButton, TabPill, Th } from "../components/ui";
import { DropZone } from "../components/DropZone";

type Tab = "tests" | "assignments" | "permissions" | "results";

export function AdminPage() {
  const authed = useOutletContext<AuthState>();
  const [tab, setTab] = useState<Tab>("tests");

  const manage = authed.canManage;
  const viewResults = authed.canViewResults;

  if (!manage && !viewResults) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">
        You don't have access to the admin area.
      </main>
    );
  }

  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: "tests", label: "Tests", show: manage },
    { key: "assignments", label: "Assignments", show: manage },
    { key: "permissions", label: "Permissions", show: manage },
    { key: "results", label: "Results", show: viewResults },
  ];
  const visibleTabs = tabs.filter((t) => t.show);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0].key;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-[30px] font-extrabold tracking-[-0.025em] text-kp-navy">
          Admin
        </h1>
        <span className="font-mono text-[11px] font-extrabold tracking-[0.04em] bg-kp-crimson text-white px-2 py-0.5 rounded-[5px]">
          ADMIN
        </span>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {visibleTabs.map((t) => (
          <TabPill key={t.key} label={t.label} active={activeTab === t.key} onClick={() => setTab(t.key)} />
        ))}
      </div>

      {activeTab === "tests" && <TestsAdmin authed={authed} />}
      {activeTab === "assignments" && <AssignmentsAdmin />}
      {activeTab === "permissions" && <PermissionsAdmin />}
      {activeTab === "results" && <ResultsAdmin />}
    </main>
  );
}

/* ── Tests tab ───────────────────────────────────────────────────── */

/* Manage the shared tag vocabulary — the list that feeds the test editor's
 * tag dropdown and the Tests page filters. */
function TagManager() {
  const [tags, setTags] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribeTags(setTags), []);

  async function add() {
    const clean = draft.trim();
    if (!clean) return;
    if (tags?.some((t) => t.toLowerCase() === clean.toLowerCase())) { setDraft(""); return; }
    setBusy(true); setErr(null);
    try { await addTag(clean); setDraft(""); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(tag: string) {
    setBusy(true); setErr(null);
    try { await removeTag(tag); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mb-8">
      <h2 className="kp-kicker mb-4">Tags</h2>
      <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5">
        <p className="text-[13px] text-kp-text-muted mb-3">
          Tags appear in the dropdown when editing a test, and as filters on the Tests page.
          Removing a tag here leaves it on any test already using it.
        </p>
        {err && <NoticeBox tone="bad" className="mb-3">{err}</NoticeBox>}
        <div className="flex flex-wrap gap-1.5 mb-3 min-h-[1.75rem]">
          {tags === null ? (
            <span className="text-[13px] text-kp-text-faint">Loading…</span>
          ) : tags.length === 0 ? (
            <span className="text-[13px] text-kp-text-faint">No tags yet — add one below.</span>
          ) : (
            tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[12.5px] font-semibold bg-kp-crimson-soft text-kp-crimson-soft-text border border-kp-crimson-soft rounded-lg"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  disabled={busy}
                  className="hover:text-kp-bad disabled:opacity-40"
                  aria-label={`Remove ${tag}`}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2 max-w-sm">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="New tag name…"
            className="focus-kp flex-1 bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px]"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !draft.trim()}
            className="px-4 py-2 bg-kp-navy hover:bg-kp-navy-hover text-white text-[13px] font-semibold rounded-lg disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function TestsAdmin({ authed }: { authed: AuthState }) {
  const [tests, setTests] = useState<KnowledgeTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [assigning, setAssigning] = useState<KnowledgeTest | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [vocab, setVocab] = useState<string[]>([]);

  const reload = useCallback(() => {
    listTests({ activeOnly: false }).then(setTests).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(reload, [reload]);
  // Roster feeds the ad-hoc assignment picker (loaded once, reused per test).
  useEffect(() => { getRoster().then(setRoster).catch(() => {}); }, []);
  useEffect(() => subscribeTags(setVocab), []);

  const allTags = useMemo(() => mergeTagVocabulary(vocab, tests ?? []), [tests, vocab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tests ?? []).filter(
      (t) => (!q || t.name.toLowerCase().includes(q)) && (!tagFilter || t.tags.includes(tagFilter)),
    );
  }, [tests, search, tagFilter]);

  async function handleSeed() {
    if (!authed.user) return;
    setBusy(true);
    try {
      await seedForkliftTest(authed.user.email ?? authed.user.uid);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(test: KnowledgeTest) {
    await updateTest(test.id, { isActive: !test.isActive });
    reload();
  }

  async function handleDelete(test: KnowledgeTest) {
    if (!window.confirm(`Delete "${test.name}" and all its questions and attempts? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteTest(test.id);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <TagManager />
      <h2 className="kp-kicker mb-4">All Tests</h2>
      {error && <NoticeBox tone="bad" className="mb-4">{error}</NoticeBox>}
      {tests === null && <div className="text-[14px] text-kp-text-muted">Loading…</div>}

      {tests !== null && tests.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests by name…"
            aria-label="Search tests by name"
            className="focus-kp flex-1 min-w-[15rem] bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px]"
          />
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filter tests by tag"
            className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2.5 py-2 text-[13.5px]"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          {(search || tagFilter) && (
            <>
              <button
                type="button"
                onClick={() => { setSearch(""); setTagFilter(""); }}
                className="px-3 py-2 text-[13px] font-semibold text-kp-text-muted border border-kp-border rounded-lg hover:text-kp-navy hover:bg-kp-surface-alt transition-colors"
              >
                Clear
              </button>
              <span className="text-[12.5px] text-kp-text-faint">
                {filtered.length} of {tests.length}
              </span>
            </>
          )}
        </div>
      )}

      {tests !== null && tests.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center">
          <div className="text-[14px] text-kp-text-muted mb-4">
            No tests yet. Head to the <strong>Create with AI</strong> tab to make one.
          </div>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={handleSeed}
              disabled={busy}
              className="px-4 py-2 bg-kp-navy hover:bg-kp-navy-hover text-white text-[13.5px] font-semibold rounded-lg disabled:opacity-50"
            >
              {busy ? "Seeding…" : "Seed Forklift Safety sample"}
            </button>
          )}
        </div>
      )}

      {tests !== null && tests.length > 0 && filtered.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center text-[14px] text-kp-text-muted">
          No tests match your search.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((test) => (
          <div key={test.id} className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-kp-text">{test.name}</span>
                  {test.status === "draft" ? (
                    <Pill tone="warn">Draft</Pill>
                  ) : (
                    <Pill tone={test.isActive ? "good" : "neutral"}>
                      {test.isActive ? "Active" : "Inactive"}
                    </Pill>
                  )}
                  {test.aiGenerated && (
                    <span className="font-mono text-[10px] font-extrabold tracking-[0.04em] bg-kp-violet text-white px-1.5 py-0.5 rounded-[5px]">
                      AI
                    </span>
                  )}
                  {test.tags.map((tag) => (
                    <span key={tag} className="font-mono text-[11px] bg-kp-surface-alt border border-kp-border rounded-[6px] px-1.5 py-0.5 text-kp-text-muted">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-[12.5px] text-kp-text-faint mt-0.5">
                  {test.questionCount} questions · up to {test.maxWrongToPass} wrong to pass
                  {isAssigned(test.assignment) && roster.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-kp-text-muted">
                        assigned to {resolveAssigned(test.assignment, roster).length}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAssigning(test)}
                  disabled={test.status === "draft"}
                  title={
                    test.status === "draft"
                      ? "Publish the test first, then assign it"
                      : "Assign this test to people, roles, or branches"
                  }
                  className="px-2.5 py-1.5 text-[12.5px] font-semibold rounded-lg transition-colors bg-kp-navy text-white hover:bg-kp-navy-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Assign
                </button>
                <Link
                  to={`/admin/tests/${test.id}`}
                  className="px-2.5 py-1.5 text-[12.5px] font-semibold border rounded-lg transition-colors text-kp-text-muted border-kp-border hover:bg-kp-surface-alt hover:text-kp-navy"
                >
                  {test.status === "draft" ? "Review & Edit" : "Edit"}
                </Link>
                <SmallButton onClick={() => handleToggleActive(test)}>
                  {test.isActive ? "Deactivate" : "Activate"}
                </SmallButton>
                <SmallButton tone="danger" onClick={() => handleDelete(test)}>
                  Delete
                </SmallButton>
              </div>
            </div>
          </div>
        ))}
      </div>

      {assigning && (
        <AssignModal
          test={assigning}
          roster={roster}
          onClose={() => setAssigning(null)}
          onSaved={() => { setAssigning(null); reload(); }}
        />
      )}
    </section>
  );
}

/* Ad-hoc assignment: open the same picker used when creating a test, on an
 * already-created one, and save who it's assigned to (+ due date) back to the
 * test. Local draft so Cancel discards. */
function AssignModal({
  test,
  roster,
  onClose,
  onSaved,
}: {
  test: KnowledgeTest;
  roster: RosterUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Assignment>(test.assignment ?? EMPTY_ASSIGNMENT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await updateTest(test.id, { assignment: draft });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-kp-surface-alt rounded-2xl w-full max-w-2xl my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-kp-border">
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-kp-text truncate">Assign test</h3>
            <p className="text-[12.5px] text-kp-text-faint truncate">{test.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-3 py-1.5 rounded-lg border border-kp-border text-[13px] font-semibold text-kp-text hover:bg-kp-surface"
          >
            Close ✕
          </button>
        </div>

        <div className="p-5">
          <p className="text-[13px] text-kp-text-muted mb-4">
            Choose who this test is assigned to. It's tracked for completion on the
            Assignments tab, and assignees are reminded as the due date approaches.
          </p>
          <AssignmentEditor assignment={draft} roster={roster} onChange={setDraft} />
          {err && <NoticeBox tone="bad" className="mt-4">{err}</NoticeBox>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-kp-border">
          <SmallButton onClick={onClose}>Cancel</SmallButton>
          <button
            type="button"
            onClick={save}
            disabled={saving || roster.length === 0}
            className="px-4 py-2 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[13.5px] font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── AI Create tab ───────────────────────────────────────────────── */

export function AiCreateAdmin() {
  const navigate = useNavigate();
  const [sourceDoc, setSourceDoc] = useState<File | null>(null);
  const [exhibitFiles, setExhibitFiles] = useState<File[]>([]);
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working"; step: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const working = status.kind === "working";

  function addFiles(files: FileList | File[]) {
    if (working) return;
    setStatus({ kind: "idle" });
    for (const f of Array.from(files)) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".docx")) {
        setSourceDoc(f); // last .docx wins as the content source
      } else if (/\.(pdf|png|jpe?g|webp)$/.test(lower)) {
        setExhibitFiles((prev) =>
          prev.some((p) => p.name === f.name) ? prev : [...prev, f]
        );
      } else {
        setStatus({
          kind: "error",
          message: `"${f.name}" isn't supported — use a .docx source plus PDF/image exhibits.`,
        });
      }
    }
  }

  async function handleGenerate() {
    if (!sourceDoc || working) return;
    try {
      const exhibits = [];
      for (const f of exhibitFiles) {
        setStatus({ kind: "working", step: `Preparing exhibit "${f.name}"…` });
        exhibits.push(await renderExhibit(f));
      }
      const totalPages = exhibits.reduce((n, e) => n + e.pages.length, 0);
      if (totalPages > MAX_TOTAL_PAGES) {
        setStatus({
          kind: "error",
          message: `Exhibits total ${totalPages} pages — the limit is ${MAX_TOTAL_PAGES}. Remove some pages or files.`,
        });
        return;
      }
      setStatus({
        kind: "working",
        step: "Writing slides and quiz — this can take a minute or two…",
      });
      const result = await generateTestFromDoc(sourceDoc, exhibits, includeScreenshots);
      navigate(`/admin/tests/${result.testId}`);
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <section className="max-w-2xl">
      <h2 className="kp-kicker mb-4">Create a Test with AI</h2>
      <p className="text-[13.5px] text-kp-text-muted mb-5">
        Upload a Word document — a policy, procedure, or training doc — and the AI
        builds a slide deck teaching its content plus a quiz. If the document has
        screenshots in it (a Bullhorn walkthrough, say), they're pulled onto the
        slides they belong to automatically. You can also add supporting files
        (a blank W-4, for example) as extra exhibits. Nothing goes live: the
        result lands as a <strong className="text-kp-text">draft</strong> for you
        to review, edit, and publish.
      </p>

      <DropZone
        icon="✨"
        title="Drop files here, or click to choose"
        hint="One .docx as the content source · PDFs and images become slide screenshots"
        accept=".docx,.pdf,.png,.jpg,.jpeg,.webp"
        multiple
        disabled={working}
        onFiles={addFiles}
      />

      {(sourceDoc || exhibitFiles.length > 0) && (
        <div className="mt-4 bg-kp-surface border border-kp-border rounded-xl shadow-2xs divide-y divide-kp-border-soft">
          <FileRow
            icon="📄"
            label={sourceDoc ? sourceDoc.name : "No source document yet"}
            hint="Content source (.docx)"
            missing={!sourceDoc}
            onRemove={sourceDoc && !working ? () => setSourceDoc(null) : undefined}
          />
          {exhibitFiles.map((f) => (
            <FileRow
              key={f.name}
              icon="🖼️"
              label={f.name}
              hint="Exhibit — pages become slide screenshots"
              onRemove={
                working
                  ? undefined
                  : () => setExhibitFiles((prev) => prev.filter((p) => p.name !== f.name))
              }
            />
          ))}
        </div>
      )}

      {sourceDoc && (
        <label className="mt-4 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeScreenshots}
            disabled={working}
            onChange={(e) => setIncludeScreenshots(e.target.checked)}
            className="mt-0.5 accent-kp-crimson"
          />
          <span className="text-[13px] text-kp-text-muted leading-snug">
            <span className="font-semibold text-kp-text">Use the screenshots in the document</span>
            <br />
            Pull the images embedded in the .docx onto the slides they appear next to. Turn off for a
            text-only, faster build.
          </span>
        </label>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!sourceDoc || working}
          onClick={handleGenerate}
          className="px-5 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[14px] font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          {working ? "Generating…" : "Generate Test"}
        </button>
        {working && (
          <span className="flex items-center gap-2 text-[13px] text-kp-text-muted">
            <span className="inline-block w-4 h-4 border-2 border-kp-crimson border-t-transparent rounded-full animate-spin" />
            {status.step}
          </span>
        )}
      </div>
      {status.kind === "error" && (
        <NoticeBox tone="bad" className="mt-4">{status.message}</NoticeBox>
      )}

      <div className="mt-8 bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5">
        <h3 className="kp-kicker mb-3">How it works</h3>
        <ol className="text-[13px] text-kp-text-muted space-y-1.5 list-decimal pl-4">
          <li>The Word document's text and its embedded screenshots are extracted; any exhibit PDFs are rendered to page images in your browser.</li>
          <li>Claude writes training slides covering the content — placing each screenshot on the slide it belongs to — then a 10–15 question quiz.</li>
          <li>You review the draft — edit any slide, screenshot, question, or setting, in full.</li>
          <li>Approve &amp; Publish makes it visible to staff, who view the slides and then take the quiz.</li>
        </ol>
      </div>
    </section>
  );
}

function FileRow({
  icon,
  label,
  hint,
  missing,
  onRemove,
}: {
  icon: string;
  label: string;
  hint: string;
  missing?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[16px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13.5px] font-semibold truncate ${missing ? "text-kp-text-faint italic" : "text-kp-text"}`}>
          {label}
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-kp-text-faint">
          {hint}
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-kp-text-faint hover:text-kp-bad text-[13px] px-1"
          title="Remove"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ── Permissions tab ─────────────────────────────────────────────────
 * Per-tag Library visibility: pick which roles can see each tag's tests.
 * A tag with no roles selected stays open to everyone. */
function PermissionsAdmin() {
  const [vocab, setVocab] = useState<string[] | null>(null);
  const [perms, setPerms] = useState<TagPermissions>({});
  const [err, setErr] = useState<string | null>(null);
  // Latest perms for the click handlers, so rapid toggles build on each other
  // instead of a stale render closure.
  const permsRef = useRef<TagPermissions>({});

  useEffect(() => subscribeTags(setVocab), []);
  useEffect(
    () => subscribeTagPermissions((p) => { permsRef.current = p; setPerms(p); }),
    []
  );

  function commit(next: TagPermissions) {
    permsRef.current = next;
    setPerms(next); // optimistic — the subscription reconciles
    setErr(null);
    saveTagPermissions(next).catch((e) => setErr((e as Error).message));
  }
  function toggleRole(tag: string, roleId: string) {
    const cur = permsRef.current[tag] ?? [];
    const roles = cur.includes(roleId) ? cur.filter((r) => r !== roleId) : [...cur, roleId];
    const next = { ...permsRef.current };
    if (roles.length === 0) delete next[tag];
    else next[tag] = roles;
    commit(next);
  }
  function openToEveryone(tag: string) {
    const next = { ...permsRef.current };
    delete next[tag];
    commit(next);
  }

  return (
    <div>
      <h2 className="kp-kicker mb-4">Library Permissions</h2>
      <p className="text-[13px] text-kp-text-muted mb-4 max-w-2xl">
        Choose which roles can see each tag's tests in the <b>Library</b>. Tags left open are visible to
        everyone, and admins always see every test. Assigned tests still appear for whoever they're
        assigned to, regardless of these settings.
      </p>
      {err && <NoticeBox tone="bad" className="mb-4">{err}</NoticeBox>}
      {vocab === null ? (
        <div className="text-[13px] text-kp-text-faint">Loading…</div>
      ) : vocab.length === 0 ? (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-6 text-center text-[13.5px] text-kp-text-muted">
          No tags yet — add tags on the Tests tab first, then set who can see them here.
        </div>
      ) : (
        <div className="space-y-3">
          {vocab.map((tag) => {
            const roles = perms[tag] ?? [];
            const open = roles.length === 0;
            return (
              <div key={tag} className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-kp-text">{tag}</span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        open
                          ? "bg-kp-good-bg text-kp-good border-kp-good-border"
                          : "bg-kp-surface-alt text-kp-text-muted border-kp-border"
                      }`}
                    >
                      {open ? "Everyone" : `${roles.length} role${roles.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {!open && (
                    <button
                      type="button"
                      onClick={() => openToEveryone(tag)}
                      className="shrink-0 text-[12px] font-semibold text-kp-text-muted hover:text-kp-navy"
                    >
                      Reset to everyone
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ASSIGNABLE_ROLES.map((r) => (
                    <Chip
                      key={r.id}
                      label={r.label}
                      active={roles.includes(r.id)}
                      onClick={() => toggleRole(tag, r.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Upload tab ──────────────────────────────────────────────────── */

/* ── Assignments / completion tab ────────────────────────────────── */

type CompletionStatus = "completed" | "attempted" | "not-started";

interface PersonRow {
  user: RosterUser;
  status: CompletionStatus;
  bestScore: number | null;
  lastAt: Date | null;
  openedAt: Date | null;
}
interface TestCompletion {
  test: KnowledgeTest;
  rows: PersonRow[];
  done: number;
  total: number;
}

/* Compact "opened" stamp, e.g. "Jul 5, 2:30 PM". */
function fmtOpened(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function AssignmentsAdmin() {
  const [roster, setRoster] = useState<RosterUser[] | null>(null);
  const [tests, setTests] = useState<KnowledgeTest[] | null>(null);
  const [attempts, setAttempts] = useState<KnowledgeAttempt[] | null>(null);
  const [opens, setOpens] = useState<KnowledgeOpen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  // On-demand reminder emails (the daily 8am job does this automatically).
  const [reminders, setReminders] = useState<ReminderRow[] | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [reminderErr, setReminderErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([getRoster(), listTests({ activeOnly: false }), listAttempts({}), listOpens()])
      .then(([r, t, a, o]) => { setRoster(r); setTests(t); setAttempts(a); setOpens(o); })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function removePerson(test: KnowledgeTest, uid: string, name: string) {
    if (!window.confirm(`Remove ${name} from "${test.name}"? They can still take it, but won't be tracked or reminded.`)) return;
    const a = test.assignment;
    try {
      await updateTest(test.id, {
        assignment: {
          ...a,
          uids: a.uids.filter((x) => x !== uid),
          excludeUids: [...new Set([...(a.excludeUids ?? []), uid])],
        },
      });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeAssignment(test: KnowledgeTest) {
    if (
      !window.confirm(
        `Remove the assignment on "${test.name}"? It stays available to take, but won't be tracked here and reminders will stop.`
      )
    )
      return;
    try {
      await updateTest(test.id, { assignment: EMPTY_ASSIGNMENT });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function preview() {
    setReminderBusy(true);
    setReminderErr(null);
    setReminderMsg(null);
    try {
      setReminders(await previewReminders());
    } catch (e) {
      setReminderErr((e as Error).message);
    } finally {
      setReminderBusy(false);
    }
  }

  async function send() {
    if (!reminders?.length) return;
    if (!window.confirm(`Email ${reminders.length} reminder${reminders.length === 1 ? "" : "s"} now?`)) return;
    setReminderBusy(true);
    setReminderErr(null);
    try {
      const r = await sendReminders();
      setReminders(null);
      setReminderMsg(
        `Sent ${r.sent} of ${r.candidates} reminder${r.candidates === 1 ? "" : "s"}` +
          (r.failed ? ` · ${r.failed} failed` : "")
      );
    } catch (e) {
      setReminderErr((e as Error).message);
    } finally {
      setReminderBusy(false);
    }
  }

  const completion = useMemo<TestCompletion[]>(() => {
    if (!roster || !tests || !attempts || !opens) return [];
    // attempts keyed by testId → uid → best
    const byTestUser = new Map<string, Map<string, { passed: boolean; score: number; at: Date | null }>>();
    for (const a of attempts) {
      const m = byTestUser.get(a.testId) ?? new Map();
      const at = a.submittedAt?.toDate() ?? null;
      const prev = m.get(a.uid);
      if (!prev || a.passed || a.score > prev.score) {
        m.set(a.uid, { passed: prev?.passed || a.passed, score: Math.max(a.score, prev?.score ?? 0), at });
      }
      byTestUser.set(a.testId, m);
    }
    // first-open keyed by `${testId}__${uid}`
    const openByKey = new Map<string, Date>();
    for (const o of opens) if (o.openedAt) openByKey.set(`${o.testId}__${o.uid}`, o.openedAt.toDate());
    return tests
      .filter((t) => t.status === "published" && isAssigned(t.assignment))
      .map((test) => {
        const assigned = resolveAssigned(test.assignment, roster);
        const um = byTestUser.get(test.id);
        const rows: PersonRow[] = assigned.map((user) => {
          const rec = um?.get(user.uid);
          const status: CompletionStatus = rec?.passed
            ? "completed"
            : rec
              ? "attempted"
              : "not-started";
          return {
            user,
            status,
            bestScore: rec?.score ?? null,
            lastAt: rec?.at ?? null,
            openedAt: openByKey.get(`${test.id}__${user.uid}`) ?? null,
          };
        });
        rows.sort((a, b) => a.user.name.localeCompare(b.user.name));
        return { test, rows, done: rows.filter((r) => r.status === "completed").length, total: rows.length };
      })
      .sort((a, b) => a.test.name.localeCompare(b.test.name));
  }, [roster, tests, attempts, opens]);

  const branches = useMemo(
    () => [...new Set((roster ?? []).map((u) => u.branch).filter(Boolean))].sort() as string[],
    [roster]
  );

  const outstandingPeople = useMemo(() => {
    const s = new Set<string>();
    for (const tc of completion)
      for (const r of tc.rows) if (r.status !== "completed") s.add(r.user.uid);
    return s.size;
  }, [completion]);

  function rowsFor(tc: TestCompletion): PersonRow[] {
    return tc.rows.filter(
      (r) =>
        (showAll || r.status !== "completed") &&
        (!branchFilter || r.user.branch === branchFilter)
    );
  }

  function exportCsv() {
    const head = ["Test", "Person", "Email", "Branch", "Role", "Status", "Opened", "Best %", "Last attempt"];
    const lines = [head];
    for (const tc of completion)
      for (const r of tc.rows.filter((r) => !branchFilter || r.user.branch === branchFilter)) {
        if (!showAll && r.status === "completed") continue;
        lines.push([
          tc.test.name, r.user.name, r.user.email, r.user.branch ?? "", roleLabel(r.user.role),
          r.status, r.openedAt ? r.openedAt.toLocaleString() : "",
          r.bestScore != null ? `${r.bestScore}` : "", r.lastAt ? r.lastAt.toLocaleString() : "",
        ]);
      }
    const csv = lines.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kp-knowledge-assignments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2 className="kp-kicker mb-4">Assignment Completion</h2>
      {error && <NoticeBox tone="bad" className="mb-4">{error}</NoticeBox>}
      {(!roster || !tests || !attempts || !opens) && !error && (
        <div className="text-[14px] text-kp-text-muted">Loading roster and results…</div>
      )}

      {roster && tests && attempts && opens && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="text-[13.5px] text-kp-text-muted">
              <strong className="text-kp-text">{completion.length}</strong> assigned tests ·{" "}
              <strong className={outstandingPeople ? "text-kp-bad" : "text-kp-good"}>
                {outstandingPeople}
              </strong>{" "}
              {outstandingPeople === 1 ? "person" : "people"} with outstanding work
            </div>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13px]"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[13px] text-kp-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-kp-navy"
              />
              Show completed too
            </label>
            <button
              type="button"
              onClick={preview}
              disabled={reminderBusy}
              className="ml-auto px-3.5 py-1.5 border border-kp-border-strong hover:border-kp-navy text-kp-text text-[13px] font-semibold rounded-lg disabled:opacity-50"
            >
              {reminderBusy && !reminders ? "Checking…" : "Preview reminders"}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="px-3.5 py-1.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[13px] font-semibold rounded-lg"
            >
              Export CSV
            </button>
          </div>

          {reminderErr && <NoticeBox tone="bad" className="mb-4">{reminderErr}</NoticeBox>}
          {reminderMsg && <NoticeBox tone="good" className="mb-4">{reminderMsg}</NoticeBox>}
          {reminders && (
            <ReminderPanel
              rows={reminders}
              busy={reminderBusy}
              onSend={send}
              onDismiss={() => { setReminders(null); setReminderMsg(null); }}
            />
          )}

          {completion.length === 0 && (
            <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-8 text-center text-[14px] text-kp-text-muted">
              No published tests are assigned yet. Set an assignment on a test to track completion.
            </div>
          )}

          <div className="space-y-4">
            {completion.map((tc) => {
              const rows = rowsFor(tc);
              const pct = tc.total ? Math.round((tc.done / tc.total) * 100) : 0;
              return (
                <div key={tc.test.id} className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-kp-border-soft">
                    <span className="text-[15px] font-bold text-kp-text">{tc.test.name}</span>
                    <Pill tone={tc.done === tc.total ? "good" : pct >= 50 ? "warn" : "bad"}>
                      {tc.done}/{tc.total} completed · {pct}%
                    </Pill>
                    <DueBadge dueDate={tc.test.assignment.dueDate} allDone={tc.done === tc.total} />
                    <AssignmentSummary test={tc.test} />
                    <SmallButton tone="danger" onClick={() => removeAssignment(tc.test)}>
                      Remove
                    </SmallButton>
                  </div>
                  {rows.length === 0 ? (
                    <div className="px-4 py-4 text-[13.5px] text-kp-good">
                      ✓ Everyone {branchFilter ? `in ${branchFilter} ` : ""}has completed this.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-[13.5px]">
                      <thead>
                        <tr className="bg-kp-surface-alt border-b border-kp-border-strong">
                          <Th>Person</Th>
                          <Th>Branch</Th>
                          <Th>Role</Th>
                          <Th>Status</Th>
                          <Th>Opened</Th>
                          <Th align="right">Best</Th>
                          <Th><span className="sr-only">Remove</span></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.user.uid} className="border-b border-kp-border-soft last:border-0">
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-kp-text">{r.user.name}</div>
                              <div className="text-[11.5px] text-kp-text-faint">{r.user.email}</div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[12px] text-kp-text-muted">{r.user.branch ?? "—"}</td>
                            <td className="px-4 py-2.5 text-kp-text-muted">{roleLabel(r.user.role)}</td>
                            <td className="px-4 py-2.5">
                              {r.status === "completed" ? (
                                <Pill tone="good">Completed</Pill>
                              ) : r.status === "attempted" ? (
                                <Pill tone="warn">Attempted, not passed</Pill>
                              ) : (
                                <Pill tone="bad">Not started</Pill>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-[12.5px] text-kp-text-muted whitespace-nowrap">
                              {r.openedAt ? fmtOpened(r.openedAt) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-kp-text-muted">
                              {r.bestScore != null ? `${r.bestScore}%` : "—"}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => removePerson(tc.test, r.user.uid, r.user.name)}
                                className="text-kp-text-faint hover:text-kp-bad text-[13px] px-1"
                                title={`Remove ${r.user.name} from this assignment`}
                                aria-label={`Remove ${r.user.name}`}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* Preview of the reminder emails that would go out right now, with a
 * one-click Send. Mirrors what the daily 8am job sends automatically. */
function ReminderPanel({
  rows,
  busy,
  onSend,
  onDismiss,
}: {
  rows: ReminderRow[];
  busy: boolean;
  onSend: () => void;
  onDismiss: () => void;
}) {
  const tone = (k: ReminderRow["kind"]) =>
    k === "overdue" ? "bad" : k === "dueSoon" ? "warn" : "neutral";

  if (rows.length === 0) {
    return (
      <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5 mb-4 flex items-center justify-between gap-4">
        <div className="text-[13.5px] text-kp-text-muted">
          <span className="text-kp-good font-semibold">Nothing to send.</span> Everyone assigned has
          already been notified (or has completed their tests). Reminders send automatically each
          morning as due dates approach.
        </div>
        <SmallButton onClick={onDismiss}>Dismiss</SmallButton>
      </div>
    );
  }

  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-kp-border-soft">
        <span className="text-[14px] font-bold text-kp-text">
          {rows.length} reminder{rows.length === 1 ? "" : "s"} ready to send
        </span>
        <span className="text-[12.5px] text-kp-text-faint">
          This is exactly what the daily 8am job would send now.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SmallButton onClick={onDismiss}>Dismiss</SmallButton>
          <button
            type="button"
            onClick={onSend}
            disabled={busy}
            className="px-3.5 py-1.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[13px] font-semibold rounded-lg disabled:opacity-50"
          >
            {busy ? "Sending…" : `Send ${rows.length} now`}
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-kp-border-soft">
        {rows.map((r, i) => (
          <div key={`${r.to}-${r.test}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-kp-text truncate">{r.name}</div>
              <div className="text-[11.5px] text-kp-text-faint truncate">
                {r.to} · {r.test}
              </div>
            </div>
            {r.dueDate && (
              <span className="text-[11.5px] font-mono text-kp-text-faint whitespace-nowrap">
                due {formatDue(r.dueDate)}
              </span>
            )}
            <Pill tone={tone(r.kind)}>{REMINDER_LABEL[r.kind]}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

function DueBadge({ dueDate, allDone }: { dueDate: string | null; allDone: boolean }) {
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  if (!allDone && d < 0) return <Pill tone="bad">Overdue · was {formatDue(dueDate)}</Pill>;
  if (!allDone && d <= 7) return <Pill tone="warn">Due {formatDue(dueDate)}</Pill>;
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-kp-text-faint">
      Due {formatDue(dueDate)}
    </span>
  );
}

function AssignmentSummary({ test }: { test: KnowledgeTest }) {
  const a = test.assignment;
  const parts: string[] = [];
  if (a.everyone) parts.push("Everyone");
  if (a.roles.length) parts.push(`${a.roles.length} role${a.roles.length > 1 ? "s" : ""}`);
  if (a.branches.length) parts.push(a.branches.join(", "));
  if (a.uids.length) parts.push(`${a.uids.length} individual${a.uids.length > 1 ? "s" : ""}`);
  return (
    <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.06em] text-kp-text-faint">
      {parts.join(" · ")}
    </span>
  );
}

/* The questions a person missed on an attempt — their answer vs. the correct
 * one. Questions are passed in (lazily loaded + cached by ResultsAdmin). */
function ReviewDetail({ attempt, questions }: { attempt: KnowledgeAttempt; questions?: KnowledgeQuestion[] }) {
  if (!questions) return <div className="text-[13px] text-kp-text-muted">Loading questions…</div>;
  const labelFor = (q: KnowledgeQuestion, key: AnswerKey | null): string => {
    if (key == null) return "(left blank)";
    const map: Record<AnswerKey, string | null> = { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD };
    return map[key] ?? key;
  };
  const answers = attempt.answers ?? {};
  const wrong = questions.filter((q) => answers[q.id] && !answers[q.id].isCorrect);
  if (wrong.length === 0) {
    return <div className="text-[13px] font-semibold text-kp-good">Every answer was correct.</div>;
  }
  return (
    <div className="space-y-2.5">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-kp-text-faint">
        Missed {wrong.length} of {attempt.totalCount}
      </div>
      {wrong.map((q) => {
        const ans = answers[q.id];
        return (
          <div key={q.id} className="bg-kp-surface border border-kp-border rounded-lg p-3.5">
            <div className="text-[13.5px] font-semibold text-kp-text mb-2">{q.text}</div>
            <div className="text-[13px] text-kp-bad">✗ Answered: {labelFor(q, ans.given)}</div>
            <div className="text-[13px] text-kp-good">✓ Correct: {labelFor(q, ans.correct)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ResultsAdmin() {
  const [attempts, setAttempts] = useState<KnowledgeAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState("");
  const [testFilter, setTestFilter] = useState("");
  // Expandable per-attempt review — questions loaded lazily + cached per test.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questionsByTest, setQuestionsByTest] = useState<Record<string, KnowledgeQuestion[]>>({});

  const reload = useCallback(() => {
    listAttempts({}).then(setAttempts).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(reload, [reload]);

  function toggleReview(a: KnowledgeAttempt) {
    if (expandedId === a.id) { setExpandedId(null); return; }
    setExpandedId(a.id);
    if (!questionsByTest[a.testId]) {
      getQuestions(a.testId)
        .then((qs) => setQuestionsByTest((m) => ({ ...m, [a.testId]: qs })))
        .catch(() => setQuestionsByTest((m) => ({ ...m, [a.testId]: [] })));
    }
  }

  const visible = useMemo(() => {
    return (attempts ?? []).filter((a) => {
      const p = personFilter.toLowerCase();
      const t = testFilter.toLowerCase();
      return (
        (!p || a.userName.toLowerCase().includes(p) || a.userEmail.toLowerCase().includes(p)) &&
        (!t || a.testName.toLowerCase().includes(t))
      );
    });
  }, [attempts, personFilter, testFilter]);

  async function handleReset(a: KnowledgeAttempt) {
    if (!window.confirm(`Reset ${a.userName}'s attempt on "${a.testName}"? They'll be able to retake it.`)) return;
    await deleteAttempt(a.id);
    reload();
  }

  function handleExport() {
    const rows = [
      ["Employee", "Email", "Test", "Score", "Result", "Correct", "Total", "Date Taken"],
      ...visible.map((a) => [
        a.userName,
        a.userEmail,
        a.testName,
        `${a.score}`,
        a.passed ? "Pass" : "Fail",
        `${a.correctCount}`,
        `${a.totalCount}`,
        a.submittedAt ? a.submittedAt.toDate().toLocaleString() : "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "kp-knowledge-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2 className="kp-kicker mb-4">All Results</h2>
      {error && <NoticeBox tone="bad" className="mb-4">{error}</NoticeBox>}

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
          placeholder="Filter by person…"
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px] w-52"
        />
        <input
          value={testFilter}
          onChange={(e) => setTestFilter(e.target.value)}
          placeholder="Filter by test…"
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px] w-52"
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={visible.length === 0}
          className="ml-auto px-4 py-2 bg-kp-navy hover:bg-kp-navy-hover text-white text-[13.5px] font-semibold rounded-lg disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {attempts === null && !error && <div className="text-[14px] text-kp-text-muted">Loading…</div>}

      {attempts !== null && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="bg-kp-surface-alt border-b border-kp-border-strong">
                <Th>Person</Th>
                <Th>Test</Th>
                <Th>Result</Th>
                <Th align="right">Score</Th>
                <Th align="right">Correct</Th>
                <Th align="right">Date</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13.5px] text-kp-text-muted">
                    No results{personFilter || testFilter ? " match the filters" : " yet"}.
                  </td>
                </tr>
              )}
              {visible.map((a) => {
                const missed = a.totalCount - a.correctCount;
                const open = expandedId === a.id;
                return (
                <Fragment key={a.id}>
                <tr
                  className={`border-b border-kp-border-soft ${open ? "" : "last:border-0"} ${
                    a.passed
                      ? "shadow-[inset_3px_0_0_var(--color-kp-good)]"
                      : "shadow-[inset_3px_0_0_var(--color-kp-bad)]"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-kp-text">{a.userName}</div>
                    <div className="text-[12px] text-kp-text-faint">{a.userEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-kp-text">{a.testName}</td>
                  <td className="px-4 py-3">
                    <Pill tone={a.passed ? "good" : "bad"}>{a.passed ? "Pass" : "Fail"}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{a.score}%</td>
                  <td className="px-4 py-3 text-right text-kp-text-muted">
                    {a.correctCount}/{a.totalCount}
                  </td>
                  <td className="px-4 py-3 text-right text-kp-text-muted">
                    {a.submittedAt ? a.submittedAt.toDate().toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {missed > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleReview(a)}
                        className="mr-2 px-2.5 py-1.5 text-[12.5px] font-semibold border border-kp-border rounded-lg text-kp-text-muted hover:bg-kp-surface-alt hover:text-kp-navy"
                      >
                        {open ? "Hide" : `Review (${missed})`}
                      </button>
                    )}
                    <SmallButton tone="danger" onClick={() => handleReset(a)}>Reset</SmallButton>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-kp-border-soft last:border-0">
                    <td colSpan={7} className="px-4 py-4 bg-kp-surface-alt">
                      <ReviewDetail attempt={a} questions={questionsByTest[a.testId]} />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

