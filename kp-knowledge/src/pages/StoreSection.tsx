// The points Store — spend the points you earn on tests and Asteroids on cosmetic
// starships. Buying deducts points and auto-equips the ship; you can re-equip any
// ship you own. What you see previewed is exactly what you fly in the game.

import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgePoints } from "../types/knowledge";
import { getPoints, purchaseShip, equipShip } from "../lib/knowledge";
import { SHIPS, DEFAULT_SHIP_ID, type Ship } from "../lib/ships";
import { ShipPreview } from "../components/ShipPreview";
import { NoticeBox } from "../components/ui";

export function StoreSection() {
  const { user } = useOutletContext<AuthState>();
  const [points, setPoints] = useState<KnowledgePoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    getPoints(user.uid)
      .then(setPoints)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [user]);
  useEffect(load, [load]);

  const balance = points?.balance ?? 0;
  const owned = new Set([DEFAULT_SHIP_ID, ...(points?.owned ?? [])]);
  const equipped = points?.equippedShip ?? DEFAULT_SHIP_ID;
  const userName = user?.displayName || user?.email || "Pilot";

  async function buy(ship: Ship) {
    if (!user) return;
    setBusyId(ship.id);
    setError(null);
    setMessage(null);
    try {
      await purchaseShip(user.uid, userName, ship);
      setMessage(`Unlocked & equipped the ${ship.name}!`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function equip(ship: Ship) {
    if (!user) return;
    setBusyId(ship.id);
    setError(null);
    setMessage(null);
    try {
      await equipShip(user.uid, userName, ship.id);
      setMessage(`Now flying the ${ship.name}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-[13px] text-kp-text-muted flex-1 min-w-[240px]">
          Spend the points you earn on tests and Asteroids on a new starship — what you buy
          is what you fly.
        </p>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-kp-navy text-white text-[14px] font-bold tabular-nums">
          <span className="text-amber-300">★</span>
          {balance.toLocaleString()}
          <span className="font-medium text-white/60">pts</span>
        </span>
      </div>

      {error && <NoticeBox tone="bad" className="mb-4">{error}</NoticeBox>}
      {message && <NoticeBox tone="good" className="mb-4">{message}</NoticeBox>}
      {loading && !points && (
        <div className="text-[14px] text-kp-text-muted">Loading the hangar…</div>
      )}

      <section>
        <h2 className="kp-kicker mb-4">Starships</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHIPS.map((ship) => {
            const isOwned = owned.has(ship.id);
            const isEquipped = equipped === ship.id;
            const affordable = balance >= ship.cost;
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
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold tabular-nums text-kp-text">
                      {ship.cost === 0 ? "Free" : (
                        <><span className="text-amber-500">★</span> {ship.cost.toLocaleString()}</>
                      )}
                    </span>
                    {isEquipped ? (
                      <button
                        type="button"
                        disabled
                        className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-kp-surface-alt text-kp-text-faint border border-kp-border cursor-default"
                      >
                        Flying
                      </button>
                    ) : isOwned ? (
                      <button
                        type="button"
                        onClick={() => equip(ship)}
                        disabled={busy}
                        className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg border border-kp-navy text-kp-navy hover:bg-kp-navy hover:text-white transition-colors disabled:opacity-50"
                      >
                        {busy ? "…" : "Equip"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => buy(ship)}
                        disabled={busy || !affordable}
                        title={affordable ? "" : "Not enough points yet"}
                        className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-kp-crimson text-white hover:bg-kp-crimson-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busy ? "Buying…" : affordable ? "Buy" : "Locked"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
