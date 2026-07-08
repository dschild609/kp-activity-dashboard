// The Hangar — your owned fleet. See every ship you've unlocked and equip the
// one you want to fly. Buying happens in the Store; this is just your collection.

import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgePoints } from "../types/knowledge";
import { getPoints, equipShip } from "../lib/knowledge";
import { SHIPS, DEFAULT_SHIP_ID } from "../lib/ships";
import { ShipPreview } from "../components/ShipPreview";
import { NoticeBox } from "../components/ui";

export function HangarSection() {
  const { user } = useOutletContext<AuthState>();
  const [, setParams] = useSearchParams();
  const [points, setPoints] = useState<KnowledgePoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    getPoints(user.uid)
      .then(setPoints)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(load, [load]);

  const ownedIds = new Set([DEFAULT_SHIP_ID, ...(points?.owned ?? [])]);
  const equipped = points?.equippedShip ?? DEFAULT_SHIP_ID;
  const fleet = SHIPS.filter((s) => ownedIds.has(s.id));
  const userName = user?.displayName || user?.email || "Pilot";

  async function equip(shipId: string, shipName: string) {
    if (!user) return;
    setBusyId(shipId);
    setError(null);
    try {
      await equipShip(user.uid, userName, shipId);
      setPoints((p) => (p ? { ...p, equippedShip: shipId } : p));
      void shipName;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="text-[13px] text-kp-text-muted mb-4">
        Your fleet — <strong className="text-kp-text">{fleet.length}</strong> of {SHIPS.length}{" "}
        ships unlocked. Equip the one you want to fly; grab more in the{" "}
        <button
          type="button"
          onClick={() => setParams({ tab: "store" }, { replace: true })}
          className="font-semibold text-kp-crimson hover:underline"
        >
          Store
        </button>
        .
      </p>

      {error && <NoticeBox tone="bad" className="mb-4">{error}</NoticeBox>}
      {loading && !points && (
        <div className="text-[14px] text-kp-text-muted">Opening the hangar…</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fleet.map((ship) => {
          const isEquipped = equipped === ship.id;
          const busy = busyId === ship.id;
          return (
            <div
              key={ship.id}
              className={`bg-kp-surface border rounded-xl shadow-2xs overflow-hidden flex flex-col ${
                isEquipped ? "border-kp-crimson" : "border-kp-border"
              }`}
            >
              <div className="p-3 bg-[#0b1220] grid place-items-center">
                <ShipPreview shipId={ship.id} />
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-bold text-kp-text">{ship.name}</h3>
                  {isEquipped && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-kp-crimson bg-kp-crimson-soft rounded-full px-2 py-0.5">
                      Equipped
                    </span>
                  )}
                </div>
                <div className="mt-0.5 mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-kp-text-faint">
                  {ship.faction} · {ship.weapon}
                </div>
                <p className="text-[12.5px] text-kp-text-muted flex-1">{ship.blurb}</p>
                <div className="mt-3 flex justify-end">
                  {isEquipped ? (
                    <button
                      type="button"
                      disabled
                      className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-kp-surface-alt text-kp-text-faint border border-kp-border cursor-default"
                    >
                      Flying
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => equip(ship.id, ship.name)}
                      disabled={busy}
                      className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-kp-navy text-white hover:bg-kp-navy-hover transition-colors disabled:opacity-50"
                    >
                      {busy ? "…" : "Equip"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
