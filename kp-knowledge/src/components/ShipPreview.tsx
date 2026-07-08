// A canvas thumbnail of a starship, nose-up — drawn by the SAME hull renderer
// the game uses, so a ship looks identical in the Store, the Hangar, and in play.

import { useEffect, useRef } from "react";
import { drawShipHull } from "../lib/ships";

export function ShipPreview({
  shipId,
  width = 132,
  height = 96,
  zoom = 1.7,
}: {
  shipId: string;
  width?: number;
  height?: number;
  zoom?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 2); // nose up
    ctx.scale(zoom, zoom);
    drawShipHull(ctx, shipId);
    ctx.restore();
  }, [shipId, width, height, zoom]);
  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className="rounded-lg bg-[#0b1220] w-full"
    />
  );
}
