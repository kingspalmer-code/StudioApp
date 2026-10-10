"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROFILES, type Profile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";

type Step = "name" | "profile" | "workspace";

export default function WelcomeForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspace, setWorkspace] = useState("");
  const [clients, setClients] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = name.trim().split(/\s+/)[0] ?? "";

  function pick(p: Profile) {
    setProfile(p);
    setWorkspace(p.workspace(first || "My"));
    setClients(p.clients);
    setStep("workspace");
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!hasPassword && password.length < 8) return setError("Choose a password of at least 8 characters.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!hasPassword) {
      const { error: pwError } = await supabase.auth.updateUser({ password, data: { has_password: true, full_name: name.trim() } });
      if (pwError) {
        setBusy(false);
        return setError(`Your password wasn't saved: ${pwError.message}`);
      }
    }
    const { error: wsError } = await supabase.rpc("start_workspace", {
      ws_name: workspace,
      owner_name: name.trim(),
      ws_profile: profile.key,
      clients_log_in: clients,
    });
    if (wsError) {
      setBusy(false);
      return setError(wsError.message);
    }
    router.replace("/");
    router.refresh();
  }

  if (step === "name")
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep("profile"); }}>
        <p className="login-step">Welcome to Oatcake</p>
        <p className="login-sub">Signed in as {email}. Let&apos;s set up your workspace.</p>
        <div className="group">
          <div className="row">
            <label htmlFor="name">Your name</label>
            <div className="ctl"><input id="name" autoComplete="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" /></div>
          </div>
        </div>
        <button className="btn wide" style={{ marginTop: 16 }}>Next</button>
      </form>
    );

  if (step === "profile")
    return (
      <div>
        <p className="login-step">What do you do?</p>
        <p className="login-sub">Pick the closest. It sets up your stages and job form, and you can change all of it later.</p>
        <div className="profiles">
          {PROFILES.map((p) => (
            <button key={p.key} type="button" className="profile-card" onClick={() => pick(p)}>
              <b>{p.title}</b>
              <span>{p.who}</span>
              <small>{p.stages.join(" · ")}</small>
            </button>
          ))}
        </div>
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="link" onClick={() => setStep("name")}>Back</button>
        </p>
      </div>
    );

  return (
    <form onSubmit={finish}>
      <p className="login-step">{profile?.title}</p>
      <div className="group">
        <div className="row">
          <label htmlFor="ws">Workspace</label>
          <div className="ctl"><input id="ws" required value={workspace} onChange={(e) => setWorkspace(e.target.value)} maxLength={80} /></div>
        </div>
        {!hasPassword && (
          <div className="row">
            <label htmlFor="pw">Password</label>
            <div className="ctl"><input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
          </div>
        )}
      </div>

      <p className="login-step" style={{ marginTop: 22 }}>Will your clients log in?</p>
      <div className="seg wide-seg" role="group" aria-label="Will your clients log in?">
        <button type="button" aria-pressed={clients} onClick={() => setClients(true)}>Yes, to send requests</button>
        <button type="button" aria-pressed={!clients} onClick={() => setClients(false)}>No, just me</button>
      </div>
      <p className="foot">
        {clients
          ? "Clients get their own login to send requests and see progress. You add them on the People page."
          : "Only you see it. You keep your customers' details yourself and add jobs as they come in."}
      </p>

      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={busy} style={{ marginTop: 8 }}>{busy ? "Setting up…" : "Create my workspace"}</button>
      <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
        <button type="button" className="link" onClick={() => setStep("profile")}>Back</button>
      </p>
    </form>
  );
}
