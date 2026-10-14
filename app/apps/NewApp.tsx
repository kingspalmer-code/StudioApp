"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cleanSvg } from "@/lib/apps";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";

// Makes a pattern app for one client: pick who it's for, name it and add the pattern as an SVG.
// The pattern is drawn in one colour on a clear background; the app recolours both.
export default function NewApp({ businesses, workspaceId, clientWord }: { businesses: Business[]; workspaceId: string; clientWord: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    const business = String(data.get("business") ?? "");
    const name = String(data.get("name") ?? "").trim();
    const file = data.get("pattern");
    if (!business || !name || !(file instanceof File) || !file.size) return;
    setProblem("");
    const text = await file.text();
    if (!/<svg\b/i.test(text)) return setProblem("That file isn't an SVG. Export the pattern as an SVG and try again.");
    setBusy(true);
    const supabase = createClient();
    const { data: app, error } = await supabase.from("apps").insert({ business_id: business, workspace_id: workspaceId, name, kind: "pattern" }).select("id").single();
    if (error || !app) {
      setBusy(false);
      return setProblem("The app couldn't be made. Try again.");
    }
    const path = `${business}/${app.id}/pattern-${Date.now()}.svg`;
    const up = await supabase.storage.from("apps").upload(path, new Blob([cleanSvg(text)], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
    if (!up.error) await supabase.from("apps").update({ source_path: path }).eq("id", app.id);
    router.push(`/apps/${app.id}`);
  }

  if (!open)
    return <button type="button" className="btn" onClick={() => setOpen(true)}>New app</button>;
  return (
    <form
      className="group app-new"
      onSubmit={(e) => {
        e.preventDefault();
        void create(e.currentTarget);
      }}
    >
      <div className="row">
        <label htmlFor="app-biz">For</label>
        <div className="ctl">
          <select id="app-biz" name="business" required defaultValue="">
            <option value="" disabled>Choose a {clientWord}</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <label htmlFor="app-name">Name</label>
        <div className="ctl"><input id="app-name" name="name" required maxLength={80} placeholder="Weekly mailer backgrounds" /></div>
      </div>
      <div className="row">
        <label htmlFor="app-svg">Pattern</label>
        <div className="ctl"><input id="app-svg" name="pattern" type="file" accept=".svg,image/svg+xml" required /></div>
      </div>
      <div className="row">
        <div className="ctl when">An SVG drawn in one colour with no background. You&apos;ll pick both colours in the app.</div>
        <button type="button" className="btn plain small" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn small" disabled={busy}>{busy ? "Making…" : "Make app"}</button>
      </div>
      {problem && <p className="error" style={{ padding: "0 16px 12px" }}>{problem}</p>}
    </form>
  );
}
