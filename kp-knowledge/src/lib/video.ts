import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/* A training-video source: either an external embed (YouTube/Loom/Vimeo —
 * played in an iframe, can't reliably report completion) or a direct file
 * (played in a <video> element, which fires `ended`). */
export interface ParsedVideo {
  isEmbed: boolean;
  src: string;
  provider: "youtube" | "vimeo" | "loom" | "file";
}

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;
const LOOM = /loom\.com\/(?:share|embed)\/([\w-]+)/;

/* Turn a pasted link (or a Storage download URL) into a player source. */
export function parseVideoUrl(url: string): ParsedVideo {
  const u = url.trim();
  const yt = u.match(YT);
  if (yt) return { isEmbed: true, provider: "youtube", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vim = u.match(VIMEO);
  if (vim) return { isEmbed: true, provider: "vimeo", src: `https://player.vimeo.com/video/${vim[1]}` };
  const loom = u.match(LOOM);
  if (loom) return { isEmbed: true, provider: "loom", src: `https://www.loom.com/embed/${loom[1]}` };
  return { isEmbed: false, provider: "file", src: u };
}

/* Does this look like a link we can embed / play at all? (Blank or obvious
 * garbage returns false so the editor can warn.) */
export function isPlayableVideoUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const p = parseVideoUrl(u);
  return p.isEmbed || /^https?:\/\//.test(u);
}

/* Upload a video file straight to Storage (no Cloud Function — files are too
 * big for the function payload). Reports 0..1 progress; resolves to the
 * download URL to store on the slide. */
export function uploadVideo(
  testId: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `knowledgeVideos/${testId}/${crypto.randomUUID()}.${ext}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject)
    );
  });
}
