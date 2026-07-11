import type { HotspotRect } from "../types/knowledge";

export const HOTSPOT_FALLBACK_PROMPT = "Click the right spot on the screenshot";

/* How many misses before the trainee may reveal the answer and move on. */
export const HOTSPOT_REVEAL_AFTER = 3;

/* Forgiveness margin around the drawn target, as a fraction of the image —
 * a near-miss on the border still counts (finger-friendly, not pixel-exact). */
const TOLERANCE = 0.015;

export function hotspotHit(hs: HotspotRect, nx: number, ny: number): boolean {
  return (
    nx >= hs.x - TOLERANCE &&
    nx <= hs.x + hs.w + TOLERANCE &&
    ny >= hs.y - TOLERANCE &&
    ny <= hs.y + hs.h + TOLERANCE
  );
}
