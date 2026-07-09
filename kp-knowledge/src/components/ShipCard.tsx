// The one starship card used by both the Store and the Hangar — preview,
// name + Equipped badge, faction/weapon line, blurb, and the Flying/Equip
// action. The Store adds a price cell and swaps in a Buy button for ships
// the pilot doesn't own yet.

import type { ReactNode } from "react";
import type { Ship } from "../lib/ships";
import { ShipPreview } from "./ShipPreview";

export function ShipCard({
  ship,
  equipped,
  owned,
  busy,
  onEquip,
  footerLeft,
  buyButton,
}: {
  ship: Ship;
  equipped: boolean;
  owned: boolean;
  busy: boolean;
  onEquip: () => void;
  /* Store-only: the price cell on the footer's left */
  footerLeft?: ReactNode;
  /* Store-only: rendered instead of Equip while the ship isn't owned */
  buyButton?: ReactNode;
}) {
  return (
    <div
      className={`bg-kp-surface border rounded-xl shadow-2xs overflow-hidden flex flex-col ${
        equipped ? "border-kp-crimson" : "border-kp-border"
      }`}
    >
      <div className="p-3 bg-[#0b1220] grid place-items-center">
        <ShipPreview shipId={ship.id} />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-kp-text">{ship.name}</h3>
          {equipped && (
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
          {footerLeft ?? <span />}
          {equipped ? (
            <button
              type="button"
              disabled
              className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-kp-surface-alt text-kp-text-faint border border-kp-border cursor-default"
            >
              Flying
            </button>
          ) : owned ? (
            <button
              type="button"
              onClick={onEquip}
              disabled={busy}
              className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg border border-kp-navy text-kp-navy hover:bg-kp-navy hover:text-white transition-colors disabled:opacity-50"
            >
              {busy ? "…" : "Equip"}
            </button>
          ) : (
            buyButton
          )}
        </div>
      </div>
    </div>
  );
}
