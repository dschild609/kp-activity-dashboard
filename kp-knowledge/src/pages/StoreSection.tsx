// The points Store — spend the points you earn on tests and Asteroids on cosmetic
// starships. Buying deducts points and auto-equips the ship; you can re-equip any
// ship you own. What you see previewed is exactly what you fly in the game.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import { usePoints } from "../hooks/usePoints";
import { purchaseShip, equipShip, userNameOf } from "../lib/knowledge";
import { SHIPS, DEFAULT_SHIP_ID, ownedShipIds, type Ship } from "../lib/ships";
import { ShipCard } from "../components/ShipCard";
import { NoticeBox } from "../components/ui";

export function StoreSection() {
  const { user } = useOutletContext<AuthState>();
  const { points, loading } = usePoints(user);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const balance = points?.balance ?? 0;
  const owned = ownedShipIds(points?.owned);
  const equipped = points?.equippedShip ?? DEFAULT_SHIP_ID;

  // The wallet subscription picks up the new balance/ship on its own — the
  // actions only need to report success or failure.
  async function run(shipId: string, action: () => Promise<void>, success: string) {
    if (!user) return;
    setBusyId(shipId);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  const buy = (ship: Ship) =>
    run(ship.id, () => purchaseShip(user!.uid, userNameOf(user!), ship), `Unlocked & equipped the ${ship.name}!`);
  const equip = (ship: Ship) =>
    run(ship.id, () => equipShip(user!.uid, userNameOf(user!), ship.id), `Now flying the ${ship.name}.`);

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
      {loading && <div className="text-[14px] text-kp-text-muted">Loading the store…</div>}

      <section>
        <h2 className="kp-kicker mb-4">Starships</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHIPS.map((ship) => {
            const affordable = balance >= ship.cost;
            const busy = busyId === ship.id;
            return (
              <ShipCard
                key={ship.id}
                ship={ship}
                equipped={equipped === ship.id}
                owned={owned.has(ship.id)}
                busy={busy}
                onEquip={() => equip(ship)}
                footerLeft={
                  <span className="text-[13px] font-bold tabular-nums text-kp-text">
                    {ship.cost === 0 ? "Free" : (
                      <><span className="text-amber-500">★</span> {ship.cost.toLocaleString()}</>
                    )}
                  </span>
                }
                buyButton={
                  <button
                    type="button"
                    onClick={() => buy(ship)}
                    disabled={busy || !affordable}
                    title={affordable ? "" : "Not enough points yet"}
                    className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-kp-crimson text-white hover:bg-kp-crimson-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy ? "Buying…" : affordable ? "Buy" : "Locked"}
                  </button>
                }
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
