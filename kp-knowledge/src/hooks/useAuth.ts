import { useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db, googleProvider } from "../lib/firebase";
import { canManageByRole, canViewResultsByRole, type UserRole } from "../types/roles";

export interface AuthState {
  user: User | null;
  role: UserRole;
  /* App access granted from the admin console (appAccess.knowledge) —
   * gates taking tests. Managers/admins always pass. */
  canTake: boolean;
  /* Create/edit/remove tests: legacy admin, super_admin/ops role, or the
   * per-user "Can manage tests" flag from the admin console. */
  canManage: boolean;
  /* See everyone's results: managers plus the results-visibility roles. */
  canViewResults: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

function getDevOverrides(): { role: UserRole } | null {
  if (!import.meta.env.DEV) return null;
  const devRole = localStorage.getItem("DEV_ROLE");
  if (!devRole) return null;
  return { role: devRole as UserRole };
}

interface UserDocData {
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: string | null; // legacy dashboard-admin flag ("admin")
  role_new?: string | null; // unified role written by the admin console
  hubRole?: string | null; // legacy role field
  appAccess?: Record<string, boolean>;
  canManageKnowledgeTests?: boolean;
}

async function ensureUserDoc(u: User): Promise<void> {
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    email: u.email ?? "",
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    role: null,
    role_new: null,
    createdAt: serverTimestamp(),
  });
}

const DEV_MOCK_USER = {
  uid: "dev-user",
  email: "dev@kpstaffing.com",
  displayName: "Dev User",
  photoURL: null,
} as unknown as User;

export function useAuth(): AuthState {
  const devOverrides = getDevOverrides();
  const noop = useCallback(async () => {}, []);

  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDocData | null>(null);
  const [loading, setLoading] = useState(!devOverrides);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (devOverrides) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) { setUserDoc(null); setLoading(false); return; }

      try { await ensureUserDoc(u); } catch (e) {
        setError(`Couldn't initialize user profile: ${(e as Error).message}`);
      }

      updateDoc(doc(db, "users", u.uid), {
        lastSeenAt: serverTimestamp(),
      }).catch(() => {});
    }, (err) => { setError(err.message); setLoading(false); });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (devOverrides) return;
    if (!user) { setUserDoc(null); return; }
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setUserDoc(snap.exists() ? (snap.data() as UserDocData) : null);
      setLoading(false);
    }, (err) => {
      setError(`User doc subscription failed: ${err.message}`);
      setLoading(false);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const msg = (e as Error).message ?? "Sign in failed";
      if (!msg.includes("popup-closed-by-user")) setError(msg);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try { await firebaseSignOut(auth); } catch (e) {
      setError((e as Error).message ?? "Sign out failed");
    }
  }, []);

  if (devOverrides) {
    return {
      user: DEV_MOCK_USER,
      role: devOverrides.role,
      canTake: true,
      canManage: true,
      canViewResults: true,
      loading: false,
      error: null,
      signIn: noop,
      signOut: () => { localStorage.removeItem("DEV_ROLE"); window.location.reload(); return Promise.resolve(); },
    };
  }

  // Same resolution chain as the server's verifyManager: role_new (what the
  // admin console writes) → legacy hubRole → legacy dashboard-admin flag.
  const role: UserRole = user
    ? (userDoc?.role_new ?? userDoc?.hubRole ?? (userDoc?.role === "admin" ? "super_admin" : "pending"))
    : null;
  const isLegacyAdmin = userDoc?.role === "admin";
  const canManage =
    isLegacyAdmin || canManageByRole(role) || userDoc?.canManageKnowledgeTests === true;
  const canTake = canManage || userDoc?.appAccess?.knowledge === true;
  const canViewResults = canManage || canViewResultsByRole(role);

  return { user, role, canTake, canManage, canViewResults, loading, error, signIn, signOut };
}
