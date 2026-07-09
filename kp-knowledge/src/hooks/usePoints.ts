import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { KnowledgePoints } from "../types/knowledge";
import { subscribePoints } from "../lib/knowledge";

/* Live view of the signed-in user's points wallet — the one source of truth
 * for every surface that shows the balance or the equipped ship (nav badge,
 * Store, Hangar, the game). Backed by a single onSnapshot per subscriber
 * (the Firestore SDK dedupes identical doc listens into one watch), so the
 * balance updates everywhere the moment a purchase or award lands — no
 * refetch-on-navigation or post-write reloads needed.
 *
 * `points` is null while loading AND for users with no wallet yet — use
 * `loading` to tell the two apart. */
export function usePoints(user: User | null): { points: KnowledgePoints | null; loading: boolean } {
  // The snapshot is keyed by uid so a stale value from a previous user is
  // ignored (rather than reset imperatively) when the signed-in user changes.
  const [snap, setSnap] = useState<{ uid: string; points: KnowledgePoints | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribePoints(user.uid, (points) => setSnap({ uid: user.uid, points }));
  }, [user]);

  const current = user && snap?.uid === user.uid ? snap : null;
  return { points: current?.points ?? null, loading: !!user && !current };
}
