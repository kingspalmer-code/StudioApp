"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const address = email.trim().toLowerCase();
    const { data: allowed } = await supabase.rpc("is_member", { check_email: address });
    if (!allowed) {
      setBusy(false);
      setError("That email doesn't have access yet. Ask Kingsley to add you.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError("That code didn't work. Check it, or request a new one.");
    else router.replace("/");
  }

  if (sent) {
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
        <p className="foot">We sent an email to {email}. Tap the link in it, or type the code here.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn wide" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="link" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={send}>
      <div className="group">
        <div className="row">
          <label htmlFor="email">Email</label>
          <div className="ctl">
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={busy}>{busy ? "Sending…" : "Continue"}</button>
    </form>
  );
}
