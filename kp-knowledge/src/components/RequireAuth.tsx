import type { ReactNode } from "react";
import { useAuth, type AuthState } from "../hooks/useAuth";
import { isAuthorizedRole } from "../types/roles";
import { LoginScreen } from "./LoginScreen";
import { AccessDenied } from "./AccessDenied";

interface RequireAuthProps {
  children: (authed: AuthState) => ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const authState = useAuth();
  const { user, role, loading, error, signIn, signOut } = authState;

  if (loading) return <LoadingSplash />;
  if (!user) return <LoginScreen onSignIn={signIn} error={error} signingIn={false} />;
  if (!isAuthorizedRole(role)) return <AccessDenied user={user} onSignOut={signOut} />;
  return <>{children(authState)}</>;
}

function LoadingSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-kp-chrome">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-kp-crimson rounded-lg flex items-center justify-center font-black text-white text-[20px] tracking-tighter">
          KP
        </div>
        <div className="text-white/50 text-[12px]">Loading…</div>
      </div>
    </div>
  );
}
