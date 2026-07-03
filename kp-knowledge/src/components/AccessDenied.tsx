import type { User } from "firebase/auth";

interface AccessDeniedProps {
  user: User;
  onSignOut: () => void;
}

export function AccessDenied({ user, onSignOut }: AccessDeniedProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-kp-bg px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 bg-kp-warn-bg border border-kp-warn-border rounded-full flex items-center justify-center text-[28px] mx-auto mb-4">
          &#9203;
        </div>
        <h2 className="text-[20px] font-bold text-kp-text mb-2">
          Access Pending
        </h2>
        <p className="text-[14px] text-kp-text-muted mb-6">
          You're signed in as <strong>{user.email}</strong>, but your
          account hasn't been activated yet. An admin will review your
          request shortly.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="px-4 py-2 text-[13px] font-semibold text-kp-text border border-kp-border rounded-lg hover:bg-kp-surface"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
