import { useState, useEffect, useRef } from "react";
import { auth, tokens, ApiRequestError, type AdminUser, type LoginResult } from "../lib/api";

type Step = "credentials" | "mfa" | "forgot" | "forgot-sent";

export function Login({ onSignedIn }: { onSignedIn: (user: AdminUser) => void }) {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<LoginResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "mfa") codeRef.current?.focus();
  }, [step]);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await auth.login(email.trim(), password);
      setSession(result);
      setStep("mfa");

      // The email channel needs an explicit send; TOTP is already on the device.
      if (result.mfa_method === "email") {
        await auth.sendEmailOtp(result.session_id);
        setNotice(`We sent a 6-digit code to ${email.trim()}.`);
      } else {
        setNotice(result.message);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const verify =
        session.mfa_method === "email" ? auth.verifyEmailOtp : auth.verifyTotp;
      const result = await verify(session.session_id, code.trim());
      tokens.set(result.access_token, result.refresh_token);
      sessionStorage.setItem("sikas_session_id", session.session_id);
      onSignedIn(result.user);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Verification failed");
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await auth.sendEmailOtp(session.session_id);
      setNotice("A new code is on its way.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not resend");
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.requestPasswordReset(email.trim());
      setStep("forgot-sent");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStep("credentials");
    setSession(null);
    setCode("");
    setPassword("");
    setError("");
    setNotice("");
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="wordmark">
          Sik<span>Ads</span>
        </h1>

        {step === "credentials" && (
          <>
            <p className="auth-sub">Admin console — sign in to continue.</p>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={submitCredentials}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  autoComplete="username"
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  required
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? <span className="spinner" /> : "Sign in"}
              </button>
            </form>
            <div className="auth-foot">
              <button className="btn-link" onClick={() => { setStep("forgot"); setError(""); }}>
                Forgot password?
              </button>
              <ThemeToggle />
            </div>
          </>
        )}

        {step === "mfa" && session && (
          <>
            <p className="auth-sub">
              {session.mfa_method === "email"
                ? "Check your email for a 6-digit code."
                : "Open your authenticator app and enter the current code."}
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            {!error && notice && <div className="alert alert-ok">{notice}</div>}
            <form onSubmit={submitCode}>
              <div className="field">
                <label htmlFor="code">Verification code</label>
                <input
                  id="code"
                  ref={codeRef}
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </div>
              <button className="btn" type="submit" disabled={busy || code.length !== 6}>
                {busy ? <span className="spinner" /> : "Verify"}
              </button>
            </form>
            <div className="auth-foot">
              <button className="btn-link" onClick={restart}>
                Use a different account
              </button>
              {session.mfa_method === "email" && (
                <button className="btn-link" onClick={resendCode} disabled={busy}>
                  Resend code
                </button>
              )}
            </div>
          </>
        )}

        {step === "forgot" && (
          <>
            <p className="auth-sub">
              Enter your email and we'll send a link to set a new password.
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={submitForgot}>
              <div className="field">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? <span className="spinner" /> : "Send reset link"}
              </button>
            </form>
            <div className="auth-foot">
              <button className="btn-link" onClick={restart}>
                Back to sign in
              </button>
            </div>
          </>
        )}

        {step === "forgot-sent" && (
          <>
            <p className="auth-sub">Check your inbox.</p>
            <div className="alert alert-ok">
              If that email is registered, a reset link is on its way. It expires in one hour.
            </div>
            <button className="btn btn-quiet" onClick={restart}>
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("sikas_theme") || "system"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    localStorage.setItem("sikas_theme", theme);
  }, [theme]);

  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label = theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark";

  return (
    <button className="btn-link" onClick={() => setTheme(next)} title="Switch theme">
      Theme: {label}
    </button>
  );
}
