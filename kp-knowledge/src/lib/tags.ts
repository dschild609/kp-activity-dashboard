import { doc, onSnapshot, setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";

/* Managed tag vocabulary for KP Knowledge tests — a single Firestore doc
 * (knowledgeMeta/tags). Managers add/remove tags on the admin page; the
 * test editor's dropdown and the Tests filter read from the same list.
 * Order is preserved (insertion order), so the seeded defaults stay first. */

export const DEFAULT_TAGS = [
  "Onboarding",
  "Recruiting",
  "Operations",
  "Sales",
  "Marketing",
  "Management",
];

const tagsRef = () => doc(db, "knowledgeMeta", "tags");

/* Live-subscribe to the vocabulary. Falls back to the defaults if the doc
 * is missing or unreadable. Returns an unsubscribe. */
export function subscribeTags(cb: (tags: string[]) => void): () => void {
  return onSnapshot(
    tagsRef(),
    (snap) => cb((snap.data()?.tags as string[]) ?? DEFAULT_TAGS),
    () => cb(DEFAULT_TAGS)
  );
}

/* Add a tag to the vocabulary (manager-only; no-op on blank/duplicate). */
export async function addTag(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  await setDoc(tagsRef(), { tags: arrayUnion(clean) }, { merge: true });
}

/* Remove a tag from the vocabulary. Tests already tagged with it keep it. */
export async function removeTag(name: string): Promise<void> {
  await setDoc(tagsRef(), { tags: arrayRemove(name) }, { merge: true });
}
