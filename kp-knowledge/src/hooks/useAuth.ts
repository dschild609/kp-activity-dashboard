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
import type { UserRole, BranchCode } from "../types/roles";

export interface AuthState {
  user: User | null;
  role: UserRole;
  branch: BranchCode | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

function getDevOverrides(): { role: UserRole; branch: BranchCode | null } | null {
  if (!import.meta.env.DEV) return null;
  const devRole = localStorage.getItem("DEV_ROLE");
  if (!devRole) return null;
  const devBranch = localStorage.getItem("DEV_BRANCH") as BranchCode | null;
  return { role: devRole as UserRole, branch: devBranch };
}

interface UserDocData {
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: string | null;
  hubRole: UserRole;
  branch: BranchCode | null;
}

async function ensureUserDoc(u: User): Promise<void> {
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    if (data.hubRole === undefined) {
      const autoRole = data.role === "admin" ? "super_admin" : null;
      await updateDoc(ref, { hubRole: autoRole, branch: data.branch ?? null });
    } else if (data.hubRole === null && data.role === "admin") {
      await updateDoc(ref, { hubRole: "super_admin" });
    }
    return;
  }

  await setDoc(ref, {
    email: u.email ?? "",
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    role: null,
    hubRole: null,
    branch: null,
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
      branch: devOverrides.branch,
      isAdmin: true,
      loading: false,
      error: null,
      signIn: noop,
      signOut: () => { localStorage.removeItem("DEV_ROLE"); localStorage.removeItem("DEV_BRANCH"); window.location.reload(); return Promise.resolve(); },
    };
  }

  const role: UserRole = user
    ? (userDoc?.hubRole ?? (userDoc?.role === "admin" ? "super_admin" : "pending"))
    : null;
  const branch: BranchCode | null = userDoc?.branch ?? null;
  const isAdmin = userDoc?.role === "admin";

  return { user, role, branch, isAdmin, loading, error, signIn, signOut };
}
