// Starship skins for the Asteroids game, purchasable with points in the Store.
// Each ship is a set of hull PATHS in normalized, nose-UP coordinates (nose near
// y = -1) plus a color. The shared drawer transforms them into game space (nose
// toward +x) and renders a neon outline, so the store preview and the live game
// ship are drawn by the exact same code — what you buy is what you fly.

export interface Ship {
  id: string;
  name: string;
  cost: number; // points; 0 = free/default
  faction: string;
  weapon: string;
  blurb: string;
  color: string;
  paths: Array<Array<[number, number]>>; // normalized, nose toward -y
}

export const DEFAULT_SHIP_ID = "arrowhead";

const SCALE = 15; // normalized hull → pixels

export const SHIPS: Ship[] = [
  {
    id: "arrowhead", name: "Arrowhead", cost: 0, faction: "Terran Coalition",
    weapon: "Blaster", blurb: "All-round trainer hull — forgiving handling, honest guns.",
    color: "#4fe3ff",
    paths: [[[0,-1],[0.75,0.7],[0,0.35],[-0.75,0.7]],[[0,-0.5],[0.15,-0.05],[-0.15,-0.05]],[[0.3,0.2],[0.52,0.5]],[[-0.3,0.2],[-0.52,0.5]],[[0,-1],[0,0.1]]],
  },
  {
    id: "wisp", name: "Wisp", cost: 150, faction: "Verdant Swarm",
    weapon: "Rapid Needles", blurb: "Barely there — outruns everything, dies to one hit.",
    color: "#5dff9b",
    paths: [[[0,-1.05],[0.16,0.35],[0.42,0.9],[0,0.6],[-0.42,0.9],[-0.16,0.35]],[[0.16,0.1],[0.5,0.25]],[[-0.16,0.1],[-0.5,0.25]],[[0,-1.05],[0,0.5]]],
  },
  {
    id: "hornet", name: "Hornet", cost: 300, faction: "Void Corsairs",
    weapon: "Homing Missiles", blurb: "Darting striker with seekers that chase down debris.",
    color: "#ff6b57",
    paths: [[[0,-1],[0.5,-0.3],[0.35,0.2],[0.8,0.75],[0.22,0.5],[0,0.9],[-0.22,0.5],[-0.8,0.75],[-0.35,0.2],[-0.5,-0.3]],[[0.35,-0.05],[0.62,0.1]],[[-0.35,-0.05],[-0.62,0.1]],[[0,-0.55],[0.13,-0.2],[-0.13,-0.2]]],
  },
  {
    id: "talon", name: "Talon", cost: 450, faction: "Void Corsairs",
    weapon: "Twin Cannons", blurb: "Corsair interceptor built to flank fast and hit twice.",
    color: "#ff5ad8",
    paths: [[[0,-1],[0.28,-0.25],[1,0.55],[0.25,0.35],[0,0.7],[-0.25,0.35],[-1,0.55],[-0.28,-0.25]],[[0.86,0.35],[0.96,0.02]],[[-0.86,0.35],[-0.96,0.02]],[[0,-0.55],[0.12,-0.2],[-0.12,-0.2]]],
  },
  {
    id: "lance", name: "Lance", cost: 600, faction: "Solari Vanguard",
    weapon: "Piercing Beam", blurb: "Line up the shot; the beam punches clean through.",
    color: "#b57bff",
    paths: [[[0,-1.15],[0.13,0.35],[0.32,0.85],[-0.32,0.85],[-0.13,0.35]],[[-0.35,-0.15],[0.35,-0.15]],[[-0.35,-0.15],[-0.28,-0.55]],[[0.35,-0.15],[0.28,-0.55]],[[0,-1.15],[0,0.85]]],
  },
  {
    id: "mantis", name: "Mantis", cost: 800, faction: "Verdant Swarm",
    weapon: "Cluster Mines", blurb: "Lays traps mid-drift and lets the field do the work.",
    color: "#c6f24a",
    paths: [[[0,-0.55],[0.35,0.1],[0.2,0.8],[-0.2,0.8],[-0.35,0.1]],[[-0.2,-0.2],[-0.7,-0.9],[-0.45,-0.15]],[[0.2,-0.2],[0.7,-0.9],[0.45,-0.15]],[[-0.28,0.25],[0.28,0.25]],[[-0.22,0.5],[0.22,0.5]]],
  },
  {
    id: "broadside", name: "Broadside", cost: 1000, faction: "Terran Coalition",
    weapon: "Side Turrets", blurb: "Twin-hull gunboat that rakes fire from both flanks.",
    color: "#5b8cff",
    paths: [[[0,-0.85],[0.3,0.5],[-0.3,0.5]],[[-0.55,-0.3],[-0.9,-0.1],[-0.9,0.5],[-0.55,0.6]],[[0.55,-0.3],[0.9,-0.1],[0.9,0.5],[0.55,0.6]],[[-0.3,0.1],[-0.55,0.1]],[[0.3,0.1],[0.55,0.1]],[[-0.72,-0.1],[-0.72,-0.42]],[[0.72,-0.1],[0.72,-0.42]],[[0,-0.5],[0.12,-0.1],[-0.12,-0.1]]],
  },
  {
    id: "aegis", name: "Aegis", cost: 1300, faction: "Solari Vanguard",
    weapon: "Spread Shot", blurb: "A walking bulwark that clears rocks in a wide cone.",
    color: "#ffb340",
    paths: [[[0,-0.9],[0.85,-0.25],[0.9,0.45],[0.45,0.85],[-0.45,0.85],[-0.9,0.45],[-0.85,-0.25]],[[-0.5,-0.15],[0,-0.5],[0.5,-0.15]],[[-0.5,0.3],[0.5,0.3]],[[-0.55,0.55],[-0.55,0.85]],[[0.55,0.55],[0.55,0.85]]],
  },
  {
    id: "vortex", name: "Vortex", cost: 1900, faction: "Terran Coalition",
    weapon: "Gravity Pulse", blurb: "Bends nearby rocks off course before they reach you.",
    color: "#35e0c0",
    paths: [[[0,-0.95],[0.95,0.25],[0.5,0.35],[0,-0.15],[-0.5,0.35],[-0.95,0.25]],[[-0.18,-0.05],[0,-0.38],[0.18,-0.05],[0,0.2]],[[-0.95,0.25],[-0.8,0.55]],[[0.95,0.25],[0.8,0.55]]],
  },
  {
    id: "reaper", name: "Reaper", cost: 3000, faction: "Void Corsairs",
    weapon: "Charge Railgun", blurb: "Glass cannon — one charged slug ends anything.",
    color: "#ff4f7a",
    paths: [[[0,-1],[0.42,-0.4],[1,0.35],[0.5,0.5],[0.32,1.05],[0,0.55],[-0.32,1.05],[-0.5,0.5],[-1,0.35],[-0.42,-0.4]],[[0,-1],[0,0.55]],[[0,-0.4],[0.42,-0.4]],[[0,-0.4],[-0.42,-0.4]],[[0,-0.62],[0.12,-0.28],[-0.12,-0.28]]],
  },
];

export function getShip(id: string | undefined): Ship {
  return SHIPS.find((s) => s.id === id) ?? SHIPS[0];
}

/** Draw a ship's hull. Assumes the context is already translated to the ship's
 *  center and rotated to its heading (nose toward +x). Neon outline; leaves no
 *  state behind. */
export function drawShipHull(ctx: CanvasRenderingContext2D, id: string | undefined): void {
  const s = getShip(id);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = s.color;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 1.8;
  for (const path of s.paths) {
    ctx.beginPath();
    path.forEach(([hx, hy], i) => {
      // normalized nose-up (nose at -y) → game space (nose at +x)
      const x = -hy * SCALE;
      const y = hx * SCALE;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.shadowBlur = 9;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}
