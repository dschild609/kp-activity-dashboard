import { Outlet } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { TopNav } from "./TopNav";

export function AuthedLayout() {
  return (
    <RequireAuth>
      {(authed) => (
        <div className="min-h-screen bg-kp-bg">
          <TopNav
            user={authed.user}
            role={authed.role}
            onSignOut={authed.signOut}
          />
          <Outlet context={authed} />
        </div>
      )}
    </RequireAuth>
  );
}
