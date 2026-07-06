import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import { AiCreateAdmin } from "./AdminPage";
import { SopBuilder } from "../sop/SopBuilder";

type Tab = "ai" | "sop";

export function CreatePage() {
  const authed = useOutletContext<AuthState>();

  // "Create with AI" is for test-managers; "SOP Builder" for SOP creators.
  const tabs: Array<{ key: Tab; label: string }> = [
    ...(authed.canManage ? [{ key: "ai" as Tab, label: "✨ Create with AI" }] : []),
    ...(authed.canUseSopBuilder ? [{ key: "sop" as Tab, label: "SOP Builder" }] : []),
  ];

  const [tab, setTab] = useState<Tab>(authed.canManage ? "ai" : "sop");

  if (tabs.length === 0) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">
        You don't have access to the create area.
      </main>
    );
  }
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-[30px] font-extrabold tracking-[-0.025em] text-kp-navy">
          Create
        </h1>
        <span className="font-mono text-[11px] font-extrabold tracking-[0.04em] bg-kp-crimson text-white px-2 py-0.5 rounded-[5px]">
          ADMIN
        </span>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-kp-navy text-white border-kp-navy"
                : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "ai" && <AiCreateAdmin />}
      {activeTab === "sop" && <SopBuilder />}
    </main>
  );
}
