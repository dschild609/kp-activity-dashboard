// Manual asset upload for the slide workbench — an admin adds an image (or
// PDF, rasterized to page JPEGs client-side) to a test's asset library so
// slides can display it. Stores the images and appends them to the test
// doc's assets array.

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { ALLOWED_ORIGINS, uploadJpeg, verifyManager } from "./shared";

const MAX_PAGES = 20;

export const uploadKnowledgeAsset = onRequest(
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

    const { testId, name, pages } = req.body ?? {};
    if (typeof testId !== "string" || !testId) {
      res.status(400).json({ ok: false, error: "Missing testId" });
      return;
    }
    if (typeof name !== "string" || !name) {
      res.status(400).json({ ok: false, error: "Missing file name" });
      return;
    }
    if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PAGES) {
      res.status(400).json({ ok: false, error: `Need 1-${MAX_PAGES} page images` });
      return;
    }

    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc(testId);
    const snap = await testRef.get();
    if (!snap.exists) {
      res.status(404).json({ ok: false, error: "Test not found" });
      return;
    }

    const stamp = Date.now();
    const assets: Array<{ name: string; page: number; url: string }> = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (typeof page?.imageBase64 !== "string" || !page.imageBase64) {
          res.status(400).json({ ok: false, error: `Page ${i + 1} is malformed` });
          return;
        }
        const pageNumber = typeof page.pageNumber === "number" ? page.pageNumber : i + 1;
        const url = await uploadJpeg(
          `knowledgeAssets/${testId}/manual-${stamp}-p${pageNumber}.jpg`,
          Buffer.from(page.imageBase64, "base64")
        );
        assets.push({ name, page: pageNumber, url });
      }
      await testRef.update({
        assets: admin.firestore.FieldValue.arrayUnion(...assets),
      });
    } catch (e) {
      console.error("asset upload failed", e);
      res.status(502).json({ ok: false, error: `Upload failed: ${(e as Error).message}` });
      return;
    }

    res.json({ ok: true, assets });
  }
);
