interface LoginScreenProps {
  onSignIn: () => void;
  error: string | null;
  signingIn: boolean;
}

export function LoginScreen({ onSignIn, error, signingIn }: LoginScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-kp-chrome px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 bg-orange-600 rounded-xl items-center justify-center text-white mb-4">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
              <path d="M22 10v6" />
              <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
            </svg>
          </div>
          <h1 className="text-white text-[24px] font-extrabold tracking-[-0.02em] mb-2">
            KP Knowledge
          </h1>
          <p className="text-white/50 text-[13px]">
            Certification tests &amp; training
          </p>
        </div>

        <div className="bg-kp-surface rounded-xl shadow-2xl p-8">
          <button
            type="button"
            onClick={onSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-kp-border rounded-lg hover:border-kp-border-strong hover:bg-kp-surface-alt disabled:opacity-50 disabled:cursor-wait transition-colors font-semibold text-[14px] text-kp-text"
          >
            <GoogleIcon />
            {signingIn ? "Signing in…" : "Sign in with Google"}
          </button>

          {error && (
            <div className="mt-4 text-[12px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-3">
              <div className="font-bold mb-1">Sign in failed</div>
              <div>{error}</div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-kp-border-soft text-center">
            <p className="text-[11px] text-kp-text-muted">
              Access is granted by invitation only.<br />
              Contact your admin if you need access.
            </p>
          </div>
        </div>

        <p className="text-center text-white/40 text-[11px] mt-6">
          KP Staffing &middot; Internal tool &middot; Authorized users only
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.257h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
