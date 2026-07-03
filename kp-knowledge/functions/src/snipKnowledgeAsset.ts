// Server-side snip for the slide workbench: the admin draws a rectangle
// over an asset image in the browser; we download the original from
// Storage (no CORS constraints server-side), crop it with sharp at native
// resolution, and save the detail as a new asset on the test.

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import sharp from "sharp";
import { ALLOWED_ORIGINS, uploadJpeg, verifyManager } from "./shared";

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* Extract the Storage object path from one of our tokened download URLs:
 * https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded>?alt=... */
function storagePathFromUrl(url: string): string | null {
  const m = /\/o\/([^?]+)/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export const snipKnowledgeAsset = onRequest(
  { cors: ALLOWED_ORIGINS, timeoutSeconds: 120, memory: "512MiB", region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "POST only" });
      return;
    }
    const auth = await verifyManager(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }

    const { testId, name, sourceUrl, region } = req.body ?? {};
    if (typeof testId !== "string" || !testId) {
      res.status(400).json({ ok: false, error: "Missing testId" });
      return;
    }
    if (typeof name !== "string" || !name) {
      res.status(400).json({ ok: false, error: "Missing name" });
      return;
    }
    const r = region as Region;
    const validFraction = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
    if (!r || !validFraction(r.x) || !validFraction(r.y) || !validFraction(r.w) || !validFraction(r.h) || r.w <= 0 || r.h <= 0) {
      res.status(400).json({ ok: false, error: "Region must be fractional {x,y,w,h} within the image" });
      return;
    }

    // Only snip this test's own assets — no arbitrary-URL fetching
    const path = typeof sourceUrl === "string" ? storagePathFromUrl(sourceUrl) : null;
    if (!path || !path.startsWith(`knowledgeAssets/${testId}/`)) {
      res.status(400).json({ ok: false, error: "Source image doesn't belong to this test" });
      return;
    }

    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc(testId);
    if (!(await testRef.get()).exists) {
      res.status(404).json({ ok: false, error: "Test not found" });
      return;
    }

    try {
      const [buffer] = await admin.storage().bucket().file(path).download();
      const meta = await sharp(buffer).metadata();
      const W = meta.width ?? 0;
      const H = meta.height ?? 0;
      if (!W || !H) throw new Error("Couldn't read image dimensions");
      const left = Math.max(0, Math.min(Math.round(r.x * W), W - 1));
      const top = Math.max(0, Math.min(Math.round(r.y * H), H - 1));
      const width = Math.max(1, Math.min(Math.round(r.w * W), W - left));
      const height = Math.max(1, Math.min(Math.round(r.h * H), H - top));
      const crop = await sharp(buffer)
        .extract({ left, top, width, height })
        .jpeg({ quality: 90 })
        .toBuffer();
      const url = await uploadJpeg(
        `knowledgeAssets/${testId}/snip-${Date.now()}.jpg`,
        crop
      );
      const asset = { name, page: 1, url };
      await testRef.update({ assets: admin.firestore.FieldValue.arrayUnion(asset) });
      res.json({ ok: true, asset });
    } catch (e) {
      console.error("snip failed", e);
      res.status(502).json({ ok: false, error: `Snip failed: ${(e as Error).message}` });
    }
  }
);
