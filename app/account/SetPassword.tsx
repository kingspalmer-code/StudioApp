"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProfile } from "@/lib/supabase/client";

export default function SetPassword({ hasPassword, skippable }: { hasPassword: boolean; skippable: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await saveProfile({ password, data: { has_password: true } });
    setBusy(false);
    if (error) return setError(`Your password wasn't saved: ${error.message}`);
    setPassword("");
    setConfirm("");
    setSaved(true);
    if (skippable) router.replace("/");
    else router.refresh();
  }

  return (
    <form onSubmit={save}>
      <p className="eyebrow">{hasPassword ? "Change password" : "Password"}</p>
      <div className="group">
        <div className="row">
          <label htmlFor="new-password">New password</label>
          <div className="ctl">
            <input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
        </div>
        <div className="row">
          <label htmlFor="confirm-password">Confirm</label>
          <div className="ctl">
            <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" />
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="foot" style={{ color: "var(--green)", fontWeight: 600 }}>Password saved. Use it next time you sign in.</p>}
      <button className="btn wide" disabled={busy}>{busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}</button>
      {skippable && (
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <Link href="/">Skip for now</Link>
        </p>
      )}
    </form>
  );
}
