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

/* ── Library visibility by role (per-tag) ─────────────────────────────
 * Maps a tag → the role ids allowed to see its tests in the Library. A tag
 * that's absent (or maps to an empty list) is open to everyone — so existing
 * tests stay visible until an admin restricts their tag. Single doc
 * knowledgeMeta/tagPermissions; managers write, everyone reads. */
export type TagPermissions = Record<string, string[]>;

const tagPermsRef = () => doc(db, "knowledgeMeta", "tagPermissions");

/* Live-subscribe to the per-tag role map. {} = every tag open. */
export function subscribeTagPermissions(cb: (perms: TagPermissions) => void): () => void {
  return onSnapshot(
    tagPermsRef(),
    (snap) => cb((snap.data()?.perms as TagPermissions) ?? {}),
    () => cb({})
  );
}

/* Save the whole map (manager-only). Callers drop empty entries so an
 * unrestricted tag is simply absent. */
export async function saveTagPermissions(perms: TagPermissions): Promise<void> {
  await setDoc(tagPermsRef(), { perms }, { merge: true });
}

/* Can a user with `role` (already normalized, or null) see a Library test
 * carrying `tags`? Union semantics: visible if ANY of its tags is open or
 * permits the role. Untagged tests are always visible. Managers bypass this
 * (handled by the caller). */
export function testVisibleForRole(perms: TagPermissions, tags: string[], role: string | null): boolean {
  if (tags.length === 0) return true;
  return tags.some((tag) => {
    const allowed = perms[tag];
    return !allowed || allowed.length === 0 || (role != null && allowed.includes(role));
  });
}
