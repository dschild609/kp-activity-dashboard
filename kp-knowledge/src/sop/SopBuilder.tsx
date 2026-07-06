// SOP Builder — the Admin tab that lists auto-drafted SOPs (recorded with the KP
// SOP Recorder Chrome extension) and lets an admin review, blur, and publish
// them. Ported from the standalone review UI; talks to the SOP backend with the
// signed-in user's Firebase token (VITE_SOP_API_BASE).

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  captureFrame,
  deleteSop,
  getSop,
  listSops,
  patchSop,
  publishSop,
} from "./api";
import type { Sop, SopDetail, SopStatus, Step } from "./types";
import { StatusPill } from "./StatusPill";
import { StepCard } from "./StepCard";
import { PublishBar } from "./PublishBar";

export function SopBuilder() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return selectedId ? (
    <ReviewView sopId={selectedId} onBack={() => setSelectedId(null)} />
  ) : (
    <Catalog onOpen={setSelectedId} />
  );
}

// ── Catalog ─────────────────────────────────────────────────────────────────

type Filter = "all" | SopStatus;
const FILTERS: Filter[] = ["all", "draft", "processing", "published"];

function Catalog({ onOpen }: { onOpen: (id: string) => void }) {
  const [sops, setSops] = useState<Sop[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listSops(filter === "all" ? undefined : { status: filter })
      .then((r) => setSops(r.sops))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [filter]);

  async function remove(sop: Sop) {
    if (!window.confirm(`Delete "${sop.title || sop.task || "this SOP"}"? This can't be undone.`)) {
      return;
    }
    setDeletingId(sop.id);
    try {
      await deleteSop(sop.id);
      setSops((prev) => prev.filter((s) => s.id !== sop.id));
    } catch (e) {
      setError(`Couldn't delete: ${(e as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="rounded-xl border border-kp-border bg-kp-surface-alt p-4 mb-6 text-[13px] text-kp-text-muted">
        <strong className="text-kp-text">Record a new SOP</strong> with the KP
        SOP Recorder Chrome extension: click the KP icon on any web app, narrate
        the process, then Stop. Drafts appear here to review, blur, and publish.
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold capitalize transition-colors ${
              filter === f
                ? f === "all"
                  ? "bg-kp-navy text-white border-kp-navy"
                  : "bg-kp-crimson-soft text-kp-crimson-soft-text border-kp-crimson-soft"
                : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && <div className="text-[13px] text-kp-text-muted py-10 text-center">Loading…</div>}
      {error && (
        <div className="text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-4">
          Couldn't load SOPs: {error}
          <div className="text-kp-text-muted mt-1">
            Is the SOP backend running? (VITE_SOP_API_BASE)
          </div>
        </div>
      )}
      {!loading && !error && sops.length === 0 && (
        <div className="text-center py-16 text-kp-text-muted text-[14px]">
          No SOPs yet. Record one with the Chrome extension.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sops.map((sop) => (
          <div
            key={sop.id}
            onClick={() => onOpen(sop.id)}
            className="group cursor-pointer text-left flex flex-col bg-kp-surface rounded-xl border border-kp-border shadow-2xs hover:border-kp-border-strong hover:-translate-y-0.5 transition-all overflow-hidden"
          >
            <div className="px-4 py-2 bg-kp-chrome flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
                {sop.system || "—"}
              </span>
              <span className="ml-auto">
                <StatusPill status={sop.status} />
              </span>
            </div>
            <div className="p-4 flex-1">
              <h3 className="text-[16px] font-bold text-kp-text leading-tight">
                {sop.title || sop.task || "Untitled SOP"}
              </h3>
              {sop.overview && (
                <p className="mt-1.5 text-[13px] text-kp-text-muted line-clamp-2">
                  {sop.overview}
                </p>
              )}
            </div>
            <div className="px-4 py-2.5 border-t border-kp-border-soft flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-kp-text-faint">
              <span>{sop.branch || "Company-wide"}</span>
              <button
                type="button"
                title="Delete SOP"
                disabled={deletingId === sop.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(sop);
                }}
                className="ml-auto text-kp-text-faint hover:text-kp-crimson disabled:opacity-40 transition-colors normal-case"
              >
                {deletingId === sop.id ? "Deleting…" : "🗑 Delete"}
              </button>
              <span className="text-kp-crimson opacity-0 group-hover:opacity-100 transition-opacity">
                Review →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Review ──────────────────────────────────────────────────────────────────

interface Meta {
  title: string;
  system: string;
  branch: string;
  task: string;
  overview: string;
  whyItMatters: string;
  bottomLine: string;
}

function ReviewView({ sopId, onBack }: { sopId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<SopDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    getSop(sopId)
      .then((d) => {
        setDetail(d);
        setMeta({
          title: d.title ?? "",
          system: d.system ?? "",
          branch: d.branch ?? "",
          task: d.task ?? "",
          overview: d.overview ?? "",
          whyItMatters: d.whyItMatters ?? "",
          bottomLine: d.bottomLine ?? "",
        });
        setSteps([...d.steps].sort((a, b) => a.order - b.order));
        setDirty(false);
      })
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoading(false));
  }, [sopId]);

  useEffect(load, [load]);

  function editMeta(patch: Partial<Meta>) {
    setMeta((m) => (m ? { ...m, ...patch } : m));
    setDirty(true);
    setMessage(null);
  }
  function editStep(index: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setDirty(true);
    setMessage(null);
  }
  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setDirty(true);
  }
  function deleteStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  // Grab a frame from the recording at timestampMs and use it as this step's
  // screenshot. The backend persists it immediately; update the local image.
  async function grabFrame(index: number, step: Step, timestampMs: number) {
    // Throws on failure — StepCard's video modal catches and shows the error.
    const res = await captureFrame(sopId, step.id, timestampMs);
    setSteps((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              screenshotDownloadUrl: res.screenshotDownloadUrl,
              // The marks were positioned on the OLD frame — drop them so a
              // stale blur can't rasterize onto the new image and miss
              // sensitive data. Re-blur/annotate on the new frame as needed.
              blurBoxes: [],
              annotations: [],
              crop: null,
            }
          : s,
      ),
    );
    setDirty(true);
    setActionError(null);
    setMessage("New frame captured — blur/marks were cleared; re-check, then Save.");
  }

  async function save() {
    if (!meta) return;
    setSaving(true);
    setActionError(null);
    try {
      await patchSop(sopId, {
        ...meta,
        steps: steps.map((s) => ({
          id: s.id,
          title: s.title,
          instruction: s.instruction,
          blurBoxes: s.blurBoxes,
          annotations: s.annotations ?? [],
          crop: s.crop ?? null,
        })),
      });
      setDirty(false);
      setMessage("Saved");
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setActionError(null);
    setMessage(null);
    try {
      await publishSop(sopId);
      setMessage("Published to the Shared Drive");
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) {
        setActionError("Publishing isn't wired yet — that lands in Phase 4.");
      } else {
        setActionError((e as Error).message);
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="text-[13px] text-kp-text-muted hover:text-kp-text font-semibold mb-4"
      >
        ← All SOPs
      </button>

      {loading && <div className="text-[13px] text-kp-text-muted py-10 text-center">Loading SOP…</div>}
      {loadError && (
        <div className="text-[13px] text-kp-bad">Couldn't load: {loadError}</div>
      )}

      {detail && meta && !loading && (
        <>
          {detail.status === "processing" ? (
            <div className="text-center py-16">
              <div className="text-[36px] mb-3 animate-pulse">⏳</div>
              <h2 className="text-[18px] font-bold text-kp-text">Still drafting this SOP…</h2>
              <p className="text-[14px] text-kp-text-muted mt-1">
                Transcription and step drafting are running.
                {detail.processingError && (
                  <span className="block mt-2 text-kp-bad">Error: {detail.processingError}</span>
                )}
              </p>
              <button
                type="button"
                onClick={load}
                className="mt-5 px-4 py-2 text-[13px] font-semibold border border-kp-border rounded-lg hover:bg-kp-surface-alt"
              >
                Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <StatusPill status={detail.status} />
                <span className="text-[12px] text-kp-text-faint font-mono uppercase tracking-wider">
                  {steps.length} step{steps.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="bg-kp-surface border border-kp-border rounded-xl p-4 space-y-3 mb-6">
                <input
                  value={meta.title}
                  onChange={(e) => editMeta({ title: e.target.value })}
                  placeholder="SOP title"
                  className="w-full px-3 py-2 text-[20px] font-extrabold tracking-[-0.01em] bg-transparent border border-transparent hover:border-kp-border rounded-lg focus-kp"
                />
                <textarea
                  value={meta.overview}
                  onChange={(e) => editMeta({ overview: e.target.value })}
                  placeholder="One-line overview"
                  rows={2}
                  className="w-full px-3 py-2 text-[14px] text-kp-text-muted bg-kp-surface border border-kp-border rounded-lg focus-kp resize-y"
                />
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[11px] font-mono uppercase tracking-wider text-kp-text-muted mb-1">
                      Why it matters
                    </span>
                    <textarea
                      value={meta.whyItMatters}
                      onChange={(e) => editMeta({ whyItMatters: e.target.value })}
                      placeholder="Why this process matters / what's at stake"
                      rows={3}
                      className="w-full px-3 py-2 text-[13px] bg-kp-surface border border-kp-border rounded-lg focus-kp resize-y"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-mono uppercase tracking-wider text-kp-text-muted mb-1">
                      Bottom line
                    </span>
                    <textarea
                      value={meta.bottomLine}
                      onChange={(e) => editMeta({ bottomLine: e.target.value })}
                      placeholder="The one thing to remember"
                      rows={3}
                      className="w-full px-3 py-2 text-[13px] bg-kp-surface border border-kp-border rounded-lg focus-kp resize-y"
                    />
                  </label>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <MetaField label="System" value={meta.system} onChange={(v) => editMeta({ system: v })} />
                  <MetaField label="Branch" value={meta.branch} onChange={(v) => editMeta({ branch: v })} />
                  <MetaField label="Task" value={meta.task} onChange={(v) => editMeta({ task: v })} />
                </div>
              </div>

              <h2 className="kp-kicker mb-4">Steps</h2>
              <div className="space-y-4 pb-4">
                {steps.map((step, i) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={i}
                    total={steps.length}
                    videoUrl={detail.videoDownloadUrl}
                    onChange={(patch) => editStep(i, patch)}
                    onGrabFrame={(ms) => grabFrame(i, step, ms)}
                    onMoveUp={() => moveStep(i, -1)}
                    onMoveDown={() => moveStep(i, 1)}
                    onDelete={() => deleteStep(i)}
                  />
                ))}
                {steps.length === 0 && (
                  <p className="text-[13px] text-kp-text-muted italic">No steps.</p>
                )}
              </div>

              <PublishBar
                dirty={dirty}
                saving={saving}
                publishing={publishing}
                reviewed={reviewed}
                onReviewedChange={setReviewed}
                onSave={save}
                onPublish={publish}
                message={message}
                error={actionError}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function MetaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-kp-text-muted mb-1">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-[13.5px] bg-kp-surface border border-kp-border rounded-lg focus-kp"
      />
    </label>
  );
}
