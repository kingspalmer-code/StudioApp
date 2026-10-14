"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIND_LABEL, cleanSvg, type AppKind } from "@/lib/apps";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";

// Makes an app for one client: pick who it's for, what kind and a name. A pattern app needs its
// pattern as an SVG, drawn in one colour on a clear background (the app recolours both). A 3D
// viewer starts empty and models are added inside it.
export default function NewApp({ businesses, workspaceId, clientWord }: { businesses: Business[]; workspaceId: string; clientWord: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [kind, setKind] = useState<AppKind>("pattern");

  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    const business = String(data.get("business") ?? "");
    const name = String(data.get("name") ?? "").trim();
    if (!business || !name) return;
    setProblem("");
    const supabase = createClient();
    if (kind === "model") {
      setBusy(true);
      const { data: app, error } = await supabase.from("apps").insert({ business_id: business, workspace_id: workspaceId, name, kind }).select("id").single();
      if (error || !app) {
        setBusy(false);
        return setProblem("The app couldn't be made. Try again.");
      }
      return router.push(`/apps/${app.id}`);
    }
    const file = data.get("pattern");
    if (!(file instanceof File) || !file.size) return;
    const text = await file.text();
    if (!/<svg\b/i.test(text)) return setProblem("That file isn't an SVG. Export the pattern as an SVG and try again.");
    setBusy(true);
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
        <label htmlFor="app-kind">Kind</label>
        <div className="ctl">
          <select id="app-kind" value={kind} onChange={(e) => setKind(e.target.value as AppKind)}>
            {(Object.keys(KIND_LABEL) as AppKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <label htmlFor="app-name">Name</label>
        <div className="ctl"><input id="app-name" name="name" required maxLength={80} placeholder={kind === "model" ? "Ring models" : "Weekly mailer backgrounds"} /></div>
      </div>
      {kind === "pattern" && (
        <div className="row">
          <label htmlFor="app-svg">Pattern</label>
          <div className="ctl"><input id="app-svg" name="pattern" type="file" accept=".svg,image/svg+xml" required /></div>
        </div>
      )}
      <div className="row">
        <div className="ctl when">
          {kind === "model"
            ? "A gallery of STL models to turn, zoom and download in the browser. You'll add the models in the app."
            : <>An SVG drawn in one colour with no background. You&apos;ll pick both colours in the app.</>}
        </div>
        <button type="button" className="btn plain small" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn small" disabled={busy}>{busy ? "Making…" : "Make app"}</button>
      </div>
      {problem && <p className="error" style={{ padding: "0 16px 12px" }}>{problem}</p>}
    </form>
  );
}
