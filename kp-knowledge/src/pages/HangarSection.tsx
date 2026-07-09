// The Hangar — your owned fleet. See every ship you've unlocked and equip the
// one you want to fly. Buying happens in the Store; this is just your collection.

import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import { usePoints } from "../hooks/usePoints";
import { equipShip, userNameOf } from "../lib/knowledge";
import { SHIPS, DEFAULT_SHIP_ID, ownedShipIds } from "../lib/ships";
import { ShipCard } from "../components/ShipCard";
import { NoticeBox } from "../components/ui";

export function HangarSection() {
  const { user } = useOutletContext<AuthState>();
  const { points, loading } = usePoints(user);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownedIds = ownedShipIds(points?.owned);
  const equipped = points?.equippedShip ?? DEFAULT_SHIP_ID;
  const fleet = SHIPS.filter((s) => ownedIds.has(s.id));

  async function equip(shipId: string) {
    if (!user) return;
    setBusyId(shipId);
    setError(null);
    try {
      // The wallet subscription reflects the new equipped ship on its own.
      await equipShip(user.uid, userNameOf(user), shipId);
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
        <Link to="?tab=store" replace className="font-semibold text-kp-crimson hover:underline">
          Store
        </Link>
        .
      </p>

      {error && <NoticeBox tone="bad" className="mb-4">{error}</NoticeBox>}
      {loading && <div className="text-[14px] text-kp-text-muted">Opening the hangar…</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fleet.map((ship) => (
          <ShipCard
            key={ship.id}
            ship={ship}
            equipped={equipped === ship.id}
            owned
            busy={busyId === ship.id}
            onEquip={() => equip(ship.id)}
          />
        ))}
      </div>
    </div>
  );
}
