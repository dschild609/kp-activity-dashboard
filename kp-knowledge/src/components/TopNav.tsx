import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { useTheme } from "../hooks/useTheme";
import { getPoints } from "../lib/knowledge";

interface NavFlags {
  canAdmin: boolean;
  canUseSopBuilder: boolean;
}

interface TopNavProps {
  user: User | null;
  canAdmin: boolean;
  canUseSopBuilder: boolean;
  onSignOut: () => void;
}

interface NavDestination {
  label: string;
  to: string;
  end?: boolean;
  visible: (flags: NavFlags) => boolean;
}

const NAV_DESTINATIONS: NavDestination[] = [
  { label: "Tests", to: "/", end: true, visible: () => true },
  { label: "My Results", to: "/results", visible: () => true },
  { label: "Leaderboard", to: "/leaderboard", visible: () => true },
  { label: "Admin", to: "/admin", visible: (f) => f.canAdmin },
  // Create hosts "Create with AI" (admins) and "SOP Builder" (SOP creators).
  { label: "Create", to: "/create", visible: (f) => f.canAdmin || f.canUseSopBuilder },
];

const TAB_ACTIVE =
  "font-bold bg-kp-crimson-soft text-kp-crimson-soft-text dark:text-white shadow-[inset_0_0_0_1px_rgba(148,0,42,.3)] dark:shadow-[inset_0_0_0_1px_rgba(255,59,92,.45)] rounded-[8px]";
const TAB_INACTIVE = "font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-[8px]";

export function TopNav({ user, canAdmin, canUseSopBuilder, onSignOut }: TopNavProps) {
  const { toggle, resolved } = useTheme();
  const location = useLocation();
  const [balance, setBalance] = useState<number | null>(null);

  // The signed-in user's spendable points. Refetch on navigation so it
  // reflects points just earned by finishing a test or an Asteroids run.
  useEffect(() => {
    if (!user) {
      setBalance(null);
      return;
    }
    let alive = true;
    getPoints(user.uid)
      .then((p) => alive && setBalance(p?.balance ?? 0))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [user, location.pathname]);

  const visibleDestinations = NAV_DESTINATIONS.filter((d) =>
    d.visible({ canAdmin, canUseSopBuilder }),
  );

  return (
    <header className="sticky top-0 z-40 bg-kp-chrome border-b border-kp-chrome-border">
      <div className="flex items-center justify-between px-3 sm:px-5 md:px-7 h-14">
        <div className="flex items-center gap-4">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
                <path d="M22 10v6" />
                <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
              </svg>
            </div>
            <span className="hidden sm:block text-white font-extrabold text-[15.5px] tracking-[-0.01em]">
              Knowledge
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {visibleDestinations.map((dest) => (
              <NavLink
                key={dest.label}
                to={dest.to}
                end={dest.end}
                className={({ isActive }) =>
                  `px-3.5 py-1.5 text-[13.5px] transition-colors ${isActive ? TAB_ACTIVE : TAB_INACTIVE}`
                }
              >
                {dest.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {balance !== null && (
            <span
              title={`Your spendable points: ${balance.toLocaleString()}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white text-[12.5px] font-bold tabular-nums"
            >
              <span className="text-amber-300">★</span>
              {balance.toLocaleString()}
              <span className="hidden sm:inline font-medium text-white/60">pts</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {resolved === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
            )}
          </button>

          {user && (
            <div className="flex items-center gap-2 border-l border-white/20 pl-2.5">
              <span className="hidden sm:block text-[12px] text-white/70 max-w-[140px] truncate">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/40 text-[12px] font-semibold transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
