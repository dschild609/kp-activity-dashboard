// Manual asset upload for the slide workbench — an admin adds an image (or
// PDF, rasterized to page JPEGs client-side) to a test's asset library so
// slides can display it. Stores the images and appends them to the test
// doc's assets array.

import * as admin from "firebase-admin";
import { MAX_PAGES, managerEndpoint, uploadJpeg } from "./shared";

export const uploadKnowledgeAsset = managerEndpoint(
  { timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
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
    for (let i = 0; i < pages.length; i++) {
      if (typeof pages[i]?.imageBase64 !== "string" || !pages[i].imageBase64) {
        res.status(400).json({ ok: false, error: `Page ${i + 1} is malformed` });
        return;
      }
    }

    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc(testId);
    if (!(await testRef.get()).exists) {
      res.status(404).json({ ok: false, error: "Test not found" });
      return;
    }

    const stamp = Date.now();
    try {
      const assets = await Promise.all(
        pages.map(async (page, i) => {
          const pageNumber = typeof page.pageNumber === "number" ? page.pageNumber : i + 1;
          const url = await uploadJpeg(
            `knowledgeAssets/${testId}/manual-${stamp}-p${pageNumber}.jpg`,
            Buffer.from(page.imageBase64, "base64")
          );
          return { name, page: pageNumber, url };
        })
      );
      await testRef.update({
        assets: admin.firestore.FieldValue.arrayUnion(...assets),
      });
      res.json({ ok: true, assets });
    } catch (e) {
      console.error("asset upload failed", e);
      res.status(502).json({ ok: false, error: `Upload failed: ${(e as Error).message}` });
    }
  }
);
