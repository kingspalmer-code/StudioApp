"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions";
import { KIND_LABELS } from "@/lib/fields";
import { STAGE_COLORS, stageColor } from "@/lib/priority";
import type { Setup } from "@/lib/setup";
import { createClient, saveProfile } from "@/lib/supabase/client";
import type { WorkspaceKind } from "@/lib/types";
import { MODES, termsFor } from "@/lib/workspace";
import { suggestSetup } from "./actions";

type Step = "name" | "who" | "profile" | "setup" | "workspace";

const BLANK: Setup = {
  base: "personal",
  workspace_name: "",
  clients_log_in: false,
  stages: [{ label: "To do", color: "blue" }, { label: "In progress", color: "orange" }, { label: "Done", color: "green" }],
  job_types: [{ name: "Job", lead_days: 3 }],
  fields: [
    { use: "brief", label: "Notes", kind: "longtext", hint: "", options: [], required: false },
    { use: "files", label: "Files", kind: "files", hint: "", options: [], required: false },
  ],
};

const PLACEHOLDER: Record<WorkspaceKind, string> = {
  studio: "e.g. I'm a designer. Local pubs and venues send me posters, menus and social posts, usually with a week's notice.",
  trade: "e.g. I run a sign shop. Mostly van livery and shopfronts, and I always do a site visit before I quote.",
  solo: "e.g. I want to keep track of my own illustration projects, from first sketches to printing.",
};

export default function WelcomeForm({ email, hasPassword, helper }: { email: string; hasPassword: boolean; helper: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [thinking, setThinking] = useState(false);
  const [blankStart, setBlankStart] = useState(false);
  const [workspace, setWorkspace] = useState("");
  const [mode, setMode] = useState<WorkspaceKind | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = name.trim().split(/\s+/)[0] ?? "";

  // A plain starting point for anyone who'd rather set things up themselves in Settings.
  function blank() {
    setSetup({ ...BLANK, job_types: [{ name: termsFor(mode ?? "studio").Job, lead_days: 3 }] });
    setBlankStart(true);
    setWorkspace(`${first || "My"}'s Workspace`);
    setStep("workspace");
  }

  async function suggest(e: React.FormEvent) {
    e.preventDefault();
    setThinking(true);
    setError(null);
    const res = await suggestSetup(about, name, mode ?? "studio");
    setThinking(false);
    if (!res.setup) return setError(res.error ?? "Something went wrong.");
    setSetup(res.setup);
    setBlankStart(false);
    setWorkspace(res.setup.workspace_name || `${first || "My"}'s Workspace`);
    setStep("setup");
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    if (!hasPassword && password.length < 8) return setError("Choose a password of at least 8 characters.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!hasPassword) {
      const { error: pwError } = await saveProfile({ password, data: { has_password: true, full_name: name.trim() } });
      if (pwError) {
        setBusy(false);
        return setError(`Your password wasn't saved: ${pwError.message}`);
      }
    }
    const { error: wsError } = await supabase.rpc("start_workspace_as", { ws_name: workspace, owner_name: name.trim(), ws_kind: mode ?? "studio", setup });
    if (wsError) {
      setBusy(false);
      return setError(wsError.message);
    }
    router.replace("/");
    router.refresh();
  }

  if (step === "name")
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep("who"); }}>
        <p className="login-step">Welcome to Oatcake</p>
        <p className="login-sub">Signed in as {email}. Let&apos;s set up your workspace.</p>
        <div className="group">
          <div className="row">
            <label htmlFor="name">Your name</label>
            <div className="ctl"><input id="name" autoComplete="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" /></div>
          </div>
        </div>
        <button className="btn wide" style={{ marginTop: 16 }}>Next</button>
        <div className="login-divider"><span>Were you invited?</span></div>
        <p className="foot" style={{ textAlign: "center" }}>
          If someone like your designer added you, they used a different email to {email}.{" "}
          <button type="button" className="link" onClick={() => signOut()}>Sign out</button> and use that one instead.
        </p>
      </form>
    );

  // Who the work is for decides the words Oatcake uses, who can send work in, and what the
  // setup helper suggests next. Nothing is picked for them, so they stop and choose.
  if (step === "who")
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (mode) setStep("profile"); }}>
        <p className="login-step">Who is your work for?</p>
        <p className="login-sub">This sets the words Oatcake uses and who can send you work. You can change it later in Settings.</p>
        <div className="mode-pick" role="radiogroup" aria-label="Who is your work for?">
          {MODES.map((m) => (
            <button type="button" key={m.kind} role="radio" aria-checked={mode === m.kind} className="mode-card" onClick={() => setMode(m.kind)}>
              <b>{m.title}</b>
              <small>{m.blurb}</small>
              <em>{m.examples}</em>
            </button>
          ))}
        </div>
        <button className="btn wide" disabled={!mode}>Next</button>
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="link" onClick={() => setStep("name")}>Back</button>
        </p>
      </form>
    );

  if (step === "profile")
    return (
      <div>
        <p className="login-step">What do you do?</p>
        {helper ? (
          <form onSubmit={suggest} className="describe">
            <p className="login-sub">Tell us about your work in a sentence or two and we&apos;ll set up your stages, job types and job form to match.</p>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={1500}
              rows={4}
              disabled={thinking}
              placeholder={PLACEHOLDER[mode ?? "studio"]}
            />
            {error && <p className="error">{error}</p>}
            <button className="btn wide" disabled={thinking || about.trim().length < 10}>
              {thinking ? "Setting it up for you…" : "Set it up for me"}
            </button>
            {thinking && <p className="foot" style={{ textAlign: "center" }}>This takes a few seconds.</p>}
            <p className="foot" style={{ textAlign: "center", marginTop: 18 }}>
              Rather do it yourself? <button type="button" className="link" onClick={blank}>Start with a blank workspace</button>
            </p>
          </form>
        ) : (
          <>
            <p className="login-sub">You&apos;ll start with a simple workspace. Set up your stages, kinds of job and job form in Settings to suit how you work.</p>
            <button type="button" className="btn wide" onClick={blank}>Continue</button>
          </>
        )}
        <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="link" onClick={() => setStep("who")}>Back</button>
        </p>
      </div>
    );

  if (step === "setup" && setup)
    return <SetupEditor setup={setup} onChange={setSetup} onNext={() => setStep("workspace")} onBack={() => setStep("profile")} />;

  return (
    <form onSubmit={finish}>
      <p className="login-step">Nearly there</p>
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

      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={busy} style={{ marginTop: 8 }}>{busy ? "Setting up…" : "Create my workspace"}</button>
      <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
        <button type="button" className="link" onClick={() => setStep(blankStart ? "profile" : "setup")}>Back</button>
      </p>
    </form>
  );
}

// Lets someone adjust a suggested setup before it's saved. Everything here can be changed again in Settings.
function SetupEditor({ setup, onChange, onNext, onBack }: { setup: Setup; onChange: (s: Setup) => void; onNext: () => void; onBack: () => void }) {
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => onChange({ ...setup, [k]: v });
  const at = <T,>(list: T[], i: number, v: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...v } : x));
  const without = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);
  const ok = setup.stages.filter((s) => s.label.trim()).length >= 2 && setup.job_types.some((t) => t.name.trim());

  return (
    <div className="setup-edit">
      <p className="login-step">Here&apos;s your setup</p>
      <p className="login-sub">Change anything that isn&apos;t right. You can change all of it later in Settings too.</p>

      <h3>Stages a job moves through</h3>
      <div className="group">
        {setup.stages.map((s, i) => (
          <div className="row" key={i}>
            <span className="dot" style={{ background: stageColor(s.color) }} />
            <div className="ctl"><input aria-label={`Stage ${i + 1}`} value={s.label} maxLength={40} onChange={(e) => set("stages", at(setup.stages, i, { label: e.target.value }))} /></div>
            {setup.stages.length > 2 && <button type="button" className="x" aria-label={`Remove ${s.label}`} onClick={() => set("stages", without(setup.stages, i))}>×</button>}
          </div>
        ))}
      </div>
      {setup.stages.length < 8 && (
        <button type="button" className="link add" onClick={() => set("stages", [...setup.stages.slice(0, -1), { label: "", color: STAGE_COLORS[setup.stages.length % 6] }, ...setup.stages.slice(-1)])}>+ Add a stage</button>
      )}

      <h3>Kinds of job</h3>
      <div className="group">
        {setup.job_types.map((t, i) => (
          <div className="row" key={i}>
            <div className="ctl"><input aria-label={`Job type ${i + 1}`} value={t.name} maxLength={50} onChange={(e) => set("job_types", at(setup.job_types, i, { name: e.target.value }))} /></div>
            <input className="days" type="number" min={0} max={365} aria-label={`Working days for ${t.name}`} value={t.lead_days} onChange={(e) => set("job_types", at(setup.job_types, i, { lead_days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) }))} />
            <span className="unit">days</span>
            {setup.job_types.length > 1 && <button type="button" className="x" aria-label={`Remove ${t.name}`} onClick={() => set("job_types", without(setup.job_types, i))}>×</button>}
          </div>
        ))}
      </div>
      {setup.job_types.length < 12 && (
        <button type="button" className="link add" onClick={() => set("job_types", [...setup.job_types, { name: "", lead_days: 3 }])}>+ Add a kind of job</button>
      )}

      <h3>What a new job asks</h3>
      <div className="group">
        {setup.fields.map((f, i) => (
          <div className={`row${f.kind === "heading" ? " heading" : ""}`} key={i}>
            <div className="ctl"><input aria-label={`Question ${i + 1}`} value={f.label} maxLength={60} onChange={(e) => set("fields", at(setup.fields, i, { label: e.target.value }))} /></div>
            <span className="unit">{f.kind === "heading" ? "Section" : KIND_LABELS[f.kind]}</span>
            <button type="button" className="x" aria-label={`Remove ${f.label}`} onClick={() => set("fields", without(setup.fields, i))}>×</button>
          </div>
        ))}
      </div>
      <p className="foot">You can add more questions, dropdowns and tick boxes in Settings → Job form.</p>

      <button type="button" className="btn wide" disabled={!ok} onClick={onNext}>Looks good</button>
      <p className="foot" style={{ textAlign: "center", marginTop: 14 }}>
        <button type="button" className="link" onClick={onBack}>Start again</button>
      </p>
    </div>
  );
}
