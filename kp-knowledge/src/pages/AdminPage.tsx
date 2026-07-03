import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import { canManageTests, canViewAllResults } from "../types/roles";
import type { KnowledgeAttempt, KnowledgeQuestion, KnowledgeTest } from "../types/knowledge";
import {
  createTest,
  deleteAttempt,
  deleteQuestion,
  deleteTest,
  getQuestions,
  listAttempts,
  listTests,
  updateQuestion,
  updateTest,
} from "../lib/knowledge";
import { parseTestExcel } from "../lib/parseTestExcel";
import { generateTestFromDoc } from "../lib/aiGenerate";
import { MAX_TOTAL_PAGES, renderExhibit } from "../lib/exhibitPages";
import { seedForkliftTest } from "../lib/seed";
import { Pill } from "./TestsPage";

type Tab = "tests" | "ai" | "upload" | "results";

export function AdminPage() {
  const authed = useOutletContext<AuthState>();
  const [tab, setTab] = useState<Tab>("tests");

  const manage = canManageTests(authed.role);
  const viewResults = canViewAllResults(authed.role);

  if (!manage && !viewResults) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">
        You don't have access to the admin area.
      </main>
    );
  }

  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: "tests", label: "Tests", show: manage },
    { key: "ai", label: "✨ Create with AI", show: manage },
    { key: "upload", label: "Upload Test", show: manage },
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

      <div className="flex gap-2 mb-8">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-kp-navy text-white border-kp-navy"
                : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "tests" && <TestsAdmin authed={authed} />}
      {activeTab === "ai" && <AiCreateAdmin />}
      {activeTab === "upload" && <UploadAdmin authed={authed} />}
      {activeTab === "results" && <ResultsAdmin />}
    </main>
  );
}

/* ── Tests tab ───────────────────────────────────────────────────── */

function TestsAdmin({ authed }: { authed: AuthState }) {
  const [tests, setTests] = useState<KnowledgeTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(() => {
    listTests({ activeOnly: false }).then(setTests).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(reload, [reload]);

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
      <h2 className="kp-kicker mb-4">All Tests</h2>
      {error && <ErrorBox message={error} />}
      {tests === null && <div className="text-[14px] text-kp-text-muted">Loading…</div>}

      {tests !== null && tests.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center">
          <div className="text-[14px] text-kp-text-muted mb-4">
            No tests yet. Upload one from Excel, or seed the sample test.
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

      <div className="space-y-3">
        {(tests ?? []).map((test) => (
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
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/admin/tests/${test.id}`}
                  className="px-2.5 py-1.5 text-[12.5px] font-semibold border rounded-lg transition-colors text-kp-text-muted border-kp-border hover:bg-kp-surface-alt hover:text-kp-navy"
                >
                  {test.status === "draft" ? "Review & Edit" : "Edit"}
                </Link>
                <SmallButton onClick={() => setExpanded(expanded === test.id ? null : test.id)}>
                  {expanded === test.id ? "Close" : "Questions"}
                </SmallButton>
                <SmallButton onClick={() => handleToggleActive(test)}>
                  {test.isActive ? "Deactivate" : "Activate"}
                </SmallButton>
                <SmallButton tone="danger" onClick={() => handleDelete(test)}>
                  Delete
                </SmallButton>
              </div>
            </div>
            {expanded === test.id && <QuestionEditor test={test} onChanged={reload} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionEditor({ test, onChanged }: { test: KnowledgeTest; onChanged: () => void }) {
  const [questions, setQuestions] = useState<KnowledgeQuestion[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const reload = useCallback(() => {
    getQuestions(test.id).then(setQuestions);
  }, [test.id]);
  useEffect(reload, [reload]);

  async function handleDelete(q: KnowledgeQuestion) {
    if (!window.confirm("Delete this question?")) return;
    await deleteQuestion(test.id, q.id);
    reload();
    onChanged();
  }

  if (questions === null) {
    return <div className="px-4 pb-4 text-[13px] text-kp-text-muted">Loading questions…</div>;
  }

  return (
    <div className="border-t border-kp-border-soft px-4 py-3 space-y-2">
      {questions.map((q, i) =>
        editing === q.id ? (
          <QuestionForm
            key={q.id}
            question={q}
            onCancel={() => setEditing(null)}
            onSave={async (fields) => {
              await updateQuestion(test.id, q.id, fields);
              setEditing(null);
              reload();
            }}
          />
        ) : (
          <div key={q.id} className="flex items-start gap-3 py-1.5">
            <span className="font-mono text-[11px] font-bold text-kp-text-faint mt-0.5">Q{i + 1}</span>
            <div className="flex-1 text-[13.5px] text-kp-text">
              {q.text}
              <span className="text-kp-text-faint"> — correct: {q.correctAnswer}</span>
            </div>
            <SmallButton onClick={() => setEditing(q.id)}>Edit</SmallButton>
            <SmallButton tone="danger" onClick={() => handleDelete(q)}>Delete</SmallButton>
          </div>
        )
      )}
    </div>
  );
}

function QuestionForm({
  question,
  onSave,
  onCancel,
}: {
  question: KnowledgeQuestion;
  onSave: (fields: Partial<Omit<KnowledgeQuestion, "id">>) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(question.text);
  const [optionA, setOptionA] = useState(question.optionA);
  const [optionB, setOptionB] = useState(question.optionB);
  const [optionC, setOptionC] = useState(question.optionC ?? "");
  const [optionD, setOptionD] = useState(question.optionD ?? "");
  const [correct, setCorrect] = useState(question.correctAnswer);
  const [saving, setSaving] = useState(false);

  return (
    <div className="bg-kp-surface-alt border border-kp-border rounded-lg p-4 space-y-2">
      <Field label="Question" value={text} onChange={setText} />
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Option A" value={optionA} onChange={setOptionA} />
        <Field label="Option B" value={optionB} onChange={setOptionB} />
        {question.type === "MC" && (
          <>
            <Field label="Option C" value={optionC} onChange={setOptionC} />
            <Field label="Option D" value={optionD} onChange={setOptionD} />
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] uppercase text-kp-text-faint">Correct</label>
        <select
          value={correct}
          onChange={(e) => setCorrect(e.target.value as KnowledgeQuestion["correctAnswer"])}
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2 py-1.5 text-[13px]"
        >
          {(["A", "B", ...(question.type === "MC" ? ["C", "D"] : [])] as const).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <SmallButton onClick={onCancel}>Cancel</SmallButton>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  text,
                  optionA,
                  optionB,
                  optionC: optionC || null,
                  optionD: optionD || null,
                  correctAnswer: correct,
                });
              } finally {
                setSaving(false);
              }
            }}
            className="px-3 py-1.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[12.5px] font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase text-kp-text-faint">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13.5px]"
      />
    </label>
  );
}

/* ── AI Create tab ───────────────────────────────────────────────── */

function AiCreateAdmin() {
  const navigate = useNavigate();
  const [sourceDoc, setSourceDoc] = useState<File | null>(null);
  const [exhibitFiles, setExhibitFiles] = useState<File[]>([]);
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
      const result = await generateTestFromDoc(sourceDoc, exhibits);
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
        builds a slide deck teaching its content plus a quiz. Add supporting files
        (a blank W-4, for example) and the slides will include screenshots of the
        relevant pages. Nothing goes live: the result lands as a{" "}
        <strong className="text-kp-text">draft</strong> for you to review, edit,
        and publish.
      </p>

      <label
        className={`flex flex-col items-center justify-center gap-2 p-8 bg-kp-surface border-2 border-dashed rounded-xl transition-colors ${
          working
            ? "border-kp-border-soft opacity-60 cursor-wait"
            : "border-kp-border cursor-pointer hover:border-kp-border-strong"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="text-[26px]">✨</div>
        <div className="text-[14px] font-semibold text-kp-text">
          Drop files here, or click to choose
        </div>
        <div className="text-[12.5px] text-kp-text-faint">
          One .docx as the content source · PDFs and images become slide screenshots
        </div>
        <input
          type="file"
          multiple
          accept=".docx,.pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          disabled={working}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

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
        <div className="mt-4 text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-3">
          {status.message}
        </div>
      )}

      <div className="mt-8 bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5">
        <h3 className="kp-kicker mb-3">How it works</h3>
        <ol className="text-[13px] text-kp-text-muted space-y-1.5 list-decimal pl-4">
          <li>The Word document's text is extracted; exhibit PDFs are rendered to page images in your browser.</li>
          <li>Claude writes training slides covering the content — placing exhibit screenshots on the slides they belong to — then a 10–15 question quiz.</li>
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

/* ── Upload tab ──────────────────────────────────────────────────── */

function UploadAdmin({ authed }: { authed: AuthState }) {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "done"; name: string; count: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [tags, setTags] = useState("");

  async function handleFile(file: File) {
    setStatus({ kind: "working" });
    try {
      const parsed = await parseTestExcel(file);
      await createTest({
        ...parsed,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        createdBy: authed.user?.email ?? "",
      });
      setStatus({ kind: "done", name: parsed.name, count: parsed.questions.length });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <section className="max-w-2xl">
      <h2 className="kp-kicker mb-4">Upload Test from Excel</h2>

      <label className="block mb-4">
        <span className="font-mono text-[11px] uppercase text-kp-text-faint">
          Tags (comma-separated, optional)
        </span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Safety, Warehouse"
          className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px]"
        />
      </label>

      <label
        className="flex flex-col items-center justify-center gap-2 p-10 bg-kp-surface border-2 border-dashed border-kp-border rounded-xl cursor-pointer hover:border-kp-border-strong transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <div className="text-[26px]">📄</div>
        <div className="text-[14px] font-semibold text-kp-text">
          Drop an .xlsx file here, or click to choose
        </div>
        <div className="text-[12.5px] text-kp-text-faint">
          Needs "Questions" and "Settings" sheets
        </div>
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {status.kind === "working" && (
        <div className="mt-4 text-[13.5px] text-kp-text-muted">Parsing and creating test…</div>
      )}
      {status.kind === "done" && (
        <div className="mt-4 text-[13.5px] text-kp-good bg-kp-good-bg border border-kp-good-border rounded-lg p-3">
          Created <strong>{status.name}</strong> with {status.count} questions.
        </div>
      )}
      {status.kind === "error" && <div className="mt-4"><ErrorBox message={status.message} /></div>}

      <div className="mt-8 bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5">
        <h3 className="kp-kicker mb-3">Format</h3>
        <div className="text-[13px] text-kp-text-muted space-y-2">
          <p><strong className="text-kp-text">Questions sheet</strong> — columns: question_text, question_type (MC or TF), option_a, option_b, option_c, option_d, correct_answer (A–D). TF questions use only A/B.</p>
          <p><strong className="text-kp-text">Settings sheet</strong> — two-column rows: test_name, description, max_wrong_to_pass (how many wrong answers still pass).</p>
        </div>
      </div>
    </section>
  );
}

/* ── Results tab ─────────────────────────────────────────────────── */

function ResultsAdmin() {
  const [attempts, setAttempts] = useState<KnowledgeAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState("");
  const [testFilter, setTestFilter] = useState("");

  const reload = useCallback(() => {
    listAttempts({}).then(setAttempts).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(reload, [reload]);

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
      {error && <ErrorBox message={error} />}

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
          <table className="w-full text-[14px]">
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
              {visible.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-kp-border-soft last:border-0 ${
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
                  <td className="px-4 py-3 text-right">
                    <SmallButton tone="danger" onClick={() => handleReset(a)}>Reset</SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────── */

function SmallButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-kp-bad border-kp-bad-border hover:bg-kp-bad-bg"
      : "text-kp-text-muted border-kp-border hover:bg-kp-surface-alt hover:text-kp-navy";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 text-[12.5px] font-semibold border rounded-lg transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-3 mb-4">
      {message}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono text-[11.5px] font-bold tracking-[0.08em] uppercase text-kp-text-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
