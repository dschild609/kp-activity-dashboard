// kpshub.app portal — sign-in gate + per-user tile filtering.
//
// The portal is a sign-in gate: nothing useful renders until the user is
// authenticated. Three exclusive view states are toggled by adding a
// class to <body>:
//
//   show-loading   — transient state on page open until auth resolves
//   show-signedout — anonymous user; centered "Sign in with Google" card
//   show-pending   — signed in but no appAccess flags / not admin; notice
//   show-app       — signed in with at least one flag (or admin); tiles
//
// Within show-app, every tile backed by an appAccess flag reveals only
// when the user actually has that flag (or, for Admin, the admin role).
// Sales Hub is the lone ungated tile — it lives in a separate Firebase
// project, so the portal can't read its access model and always links
// it.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const app = initializeApp({
  projectId: "client-health-dashboard-4826e",
  appId: "1:864229666607:web:d0b293a6eca9b6a611fbda",
  storageBucket: "client-health-dashboard-4826e.firebasestorage.app",
  apiKey: "AIzaSyDCkr55i9b2WmqEVVrXIb5nFJLh2jYUPqA",
  authDomain: "client-health-dashboard-4826e.firebaseapp.com",
  messagingSenderId: "864229666607",
});

const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

function setState(state) {
  document.body.classList.remove(
    "show-loading",
    "show-signedout",
    "show-pending",
    "show-app",
  );
  document.body.classList.add(`show-${state}`);
}

async function startSignIn() {
  setSignInError("");
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: "kpstaffing.com" });
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = e?.code ?? "";
    const msg = String(e?.message ?? "");
    if (code === "auth/popup-closed-by-user" || msg.includes("popup-closed-by-user")) return;
    console.error("Sign-in failed:", e);
    if (code === "auth/unauthorized-domain") {
      setSignInError("This domain isn't authorized in Firebase. Add kpshub.app and www.kpshub.app under Authentication → Settings → Authorized domains.");
    } else if (code === "auth/popup-blocked") {
      setSignInError("Your browser blocked the sign-in popup. Allow popups for kpshub.app and try again.");
    } else {
      setSignInError(`Sign-in failed (${code || "unknown error"}). Check the browser console.`);
    }
  }
}

function setSignInError(text) {
  const el = $("signin-error");
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

$("signin-btn").addEventListener("click", startSignIn);
$("signin-cta").addEventListener("click", startSignIn);
$("signout-btn").addEventListener("click", () => signOut(auth));

function setGatedVisibility({
  clientHealth,
  onsiteHub,
  arReporting,
  forecast,
  opsHub,
  clientDashboard,
  hrHub,
  knowledge,
  remoteHub,
  admin,
} = {}) {
  const set = (key, visible) => {
    document
      .querySelectorAll(`.tile[data-gated="${key}"]`)
      .forEach((el) => el.classList.toggle("show", visible));
  };
  set("clientHealth", !!clientHealth);
  set("onsiteHub", !!onsiteHub);
  set("arReporting", !!arReporting);
  set("forecast", !!forecast);
  set("opsHub", !!opsHub);
  set("clientDashboard", !!clientDashboard);
  set("hrHub", !!hrHub);
  set("knowledge", !!knowledge);
  set("remoteHub", !!remoteHub);
  set("admin", !!admin);
}

onAuthStateChanged(auth, async (user) => {
  setGatedVisibility(); // hide every gated tile until the user doc resolves

  if (!user) {
    setState("signedout");
    return;
  }

  $("user-email").textContent = user.email ?? "";

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : null;
    const a = data?.appAccess ?? {};

    // Remote Recruiter Hub gates by role, not an appAccess flag — its
    // useAuth reads users/{uid}.remoteHubRole directly.
    const hasRemoteHub = ["super_admin", "remote_manager", "remote_recruiter"]
      .includes(data?.remoteHubRole);

    // Admin role no longer trumps appAccess — admins need explicit flags
    // too. The Settings UI auto-grants corporate access on promotion, and
    // legacy admins get backfilled in the family apps' useAuth on next
    // sign-in there. From the portal's view, only appAccess matters.
    const hasAnyAccess =
      a.clientHealth || a.onsiteHub || a.arReporting || a.forecast ||
      a.opsHub || a.clientDashboard || a.hrHub || a.knowledge || hasRemoteHub;

    if (!hasAnyAccess) {
      setState("pending");
      return;
    }

    setGatedVisibility({
      clientHealth: !!a.clientHealth,
      onsiteHub: !!a.onsiteHub,
      arReporting: !!a.arReporting,
      forecast: !!a.forecast,
      opsHub: !!a.opsHub,
      clientDashboard: !!a.clientDashboard,
      hrHub: !!a.hrHub,
      knowledge: !!a.knowledge,
      remoteHub: hasRemoteHub,
      // Recognize both the legacy `role: "admin"` flag and the unified
      // `role_new: "super_admin"` field the admin console now writes —
      // matches the isAdmin check used everywhere else in the family.
      admin: data?.role === "admin" || data?.role_new === "super_admin",
    });
    setState("app");
  } catch (e) {
    // Permission-denied on /users/{uid} typically means the user signed in
    // but the doc hasn't been created (rules deny non-self reads). Same
    // experience as "pending" — they can't do anything until David sets
    // things up.
    console.error("Failed to load user doc:", e);
    setState("pending");
  }
});
