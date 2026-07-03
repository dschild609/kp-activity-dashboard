import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExhibitPage {
  pageNumber: number;
  imageBase64: string; // JPEG, no data: prefix
}

export interface Exhibit {
  name: string;
  pages: ExhibitPage[];
}

const RENDER_SCALE = 1.6; // crisp enough to read form text on a slide
const JPEG_QUALITY = 0.85;
export const MAX_TOTAL_PAGES = 20;

/* Rasterize an exhibit file to page JPEGs in the browser: PDFs via pdf.js
 * (one image per page), plain images pass through as a single page. The
 * Cloud Function stores these and shows them to Claude so it can put the
 * right form page on the right slide. */
export async function renderExhibit(file: File): Promise<Exhibit> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await loadingTask.promise;
    const pages: ExhibitPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push({ pageNumber: n, imageBase64: canvasToBase64Jpeg(canvas) });
    }
    await loadingTask.destroy();
    if (pages.length === 0) throw new Error(`"${file.name}" has no pages`);
    return { name: file.name, pages };
  }

  if (/\.(png|jpe?g|webp)$/.test(lower)) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.fillStyle = "#ffffff"; // flatten transparency for JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {
      name: file.name,
      pages: [{ pageNumber: 1, imageBase64: canvasToBase64Jpeg(canvas) }],
    };
  }

  throw new Error(`"${file.name}": exhibits must be PDF or image files (.pdf, .png, .jpg)`);
}

function canvasToBase64Jpeg(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
