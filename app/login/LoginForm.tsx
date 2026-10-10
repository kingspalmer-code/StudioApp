"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "new" | "forgot" | "sent";

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const address = () => email.trim().toLowerCase();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: address(), password });
    setBusy(false);
    if (error) setError("That email and password don't match. New here? Use \"Set up my account\" below.");
    else router.replace("/");
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: allowed } = await supabase.rpc("is_member", { check_email: address() });
    if (!allowed) {
      setBusy(false);
      setError("That email doesn't have access yet. Ask whoever runs your Oatcake to add you.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: address(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setMode("sent");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: address(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("That code didn't work. Check it, or request a new one.");
    else router.replace("/account?setup=1");
  }

  const switchTo = (m: Mode) => () => {
    setMode(m);
    setError(null);
    setCode("");
  };

  const emailRow = (
    <div className="row">
      <label htmlFor="email">Email</label>
      <div className="ctl">
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
      </div>
    </div>
  );

  if (mode === "sent") {
    return (
      <form onSubmit={verify}>
        <div className="group">
          <div className="row">
            <label htmlFor="code">Code</label>
            <div className="ctl">
              <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="From the email" />
            </div>
          </div>
        </div>
        <p className="foot">We sent an email to {email}. Open the link in it on this device, or type the code here if the email has one.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn wide" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="link" onClick={switchTo("password")}>Back to sign in</button>
        </p>
      </form>
    );
  }

  if (mode === "new" || mode === "forgot") {
    return (
      <form onSubmit={sendLink}>
        <p className="login-step">{mode === "new" ? "Set up your account" : "Reset your password"}</p>
        <div className="group">{emailRow}</div>
        <p className="foot">
          {mode === "new"
            ? "Use the email you were invited with. We'll send you a link, and when you open it you'll choose your password."
            : "We'll email you a link. Open it to sign in and choose a new password."}
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn wide" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="link" onClick={switchTo("password")}>Back to sign in</button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={signIn}>
      <div className="group">
        {emailRow}
        <div className="row">
          <label htmlFor="password">Password</label>
          <div className="ctl">
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="foot" style={{ textAlign: "center", marginTop: 12 }}>
        <button type="button" className="link" onClick={switchTo("forgot")}>Forgot your password?</button>
      </p>
      <div className="login-divider"><span>New to Oatcake?</span></div>
      <button type="button" className="btn wide outline" onClick={switchTo("new")}>Set up my account</button>
    </form>
  );
}
