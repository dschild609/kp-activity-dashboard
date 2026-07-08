// Starship skins for the Asteroids game, purchasable with points in the Store.
// A ship is a hull polygon (nose at +x, the direction the ship faces) plus a
// stroke/fill/glow. The same drawer renders the live game ship and the store
// preview, so what you buy is exactly what you fly.

export interface Ship {
  id: string;
  name: string;
  cost: number; // points; 0 = free/default
  blurb: string;
  hull: Array<[number, number]>; // vertices, ~16px scale, nose toward +x
  stroke: string;
  fill?: string; // filled hull (else outline only)
  glow?: number; // shadowBlur for a neon glow
}

export const DEFAULT_SHIP_ID = "classic";

export const SHIPS: Ship[] = [
  {
    id: "classic",
    name: "Standard Issue",
    cost: 0,
    blurb: "The trusty starter fighter. Free for every pilot.",
    hull: [[16, 0], [-12, -10], [-7, 0], [-12, 10]],
    stroke: "#eaf2ff",
  },
  {
    id: "interceptor",
    name: "Interceptor",
    cost: 250,
    blurb: "A sleek cyan dart. All speed, all style.",
    hull: [[20, 0], [-8, -7], [-12, 0], [-8, 7]],
    stroke: "#5cc8ff",
    glow: 8,
  },
  {
    id: "raptor",
    name: "Raptor",
    cost: 500,
    blurb: "Swept-wing raptor with an emerald afterglow.",
    hull: [[18, 0], [-6, -12], [-12, -5], [-12, 5], [-6, 12]],
    stroke: "#3ddc84",
    glow: 10,
  },
  {
    id: "vanguard",
    name: "KP Vanguard",
    cost: 1000,
    blurb: "Crimson flagship in full KP livery. The apex ride.",
    hull: [[19, 0], [-4, -7], [-13, -13], [-8, 0], [-13, 13], [-4, 7]],
    stroke: "#ff3b5c",
    fill: "rgba(181,23,45,0.35)",
    glow: 12,
  },
];

export function getShip(id: string | undefined): Ship {
  return SHIPS.find((s) => s.id === id) ?? SHIPS[0];
}

/** Draw a ship's hull. Assumes the context is already translated to the ship's
 *  center and rotated to its heading (nose toward +x). Leaves no state behind. */
export function drawShipHull(ctx: CanvasRenderingContext2D, id: string | undefined): void {
  const s = getShip(id);
  ctx.beginPath();
  s.hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  if (s.glow) {
    ctx.shadowColor = s.stroke;
    ctx.shadowBlur = s.glow;
  }
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = s.stroke;
  ctx.stroke();
  ctx.shadowBlur = 0;
}
