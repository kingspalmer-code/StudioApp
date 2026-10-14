"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { MODEL_MAX_MB, fileSize, type App, type AppModel } from "@/lib/apps";
import { createClient } from "@/lib/supabase/client";
import { deleteApp, deleteModel } from "../actions";

type Saved = AppModel & { view: string; download: string; thumb: string };

// three.js only loads on pages with a model to show.
const ModelViewer = dynamic(() => import("./ModelViewer"), {
  ssr: false,
  loading: () => <div className="mv"><div className="mv-stage"><span className="mv-wait when">Loading the viewer…</span></div></div>,
});

// A 3D viewer app: a gallery of STL models, the picked one shown large to turn, zoom and download.
// The studio adds and removes models; managers and the client look and download.
export default function ModelApp({ app, slug, models, canEdit }: { app: App; slug: string; models: Saved[]; canEdit: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState(models[0]?.id ?? "");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const current = models.find((m) => m.id === pick) ?? models[0];

  // Opening a link to one model (…#model-<id>) shows that one.
  useEffect(() => {
    const id = window.location.hash.match(/^#model-([0-9a-f-]{36})$/)?.[1];
    if (id && models.some((m) => m.id === id)) setPick(id);
  }, [models]);

  async function add(files: FileList | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setProblem("");
    const { parseStl, snapshot } = await import("@/lib/stl-view");
    const supabase = createClient();
    const bucket = supabase.storage.from("apps");
    const problems: string[] = [];
    let newest = "";
    for (const [i, file] of list.entries()) {
      const label = list.length > 1 ? ` ${i + 1} of ${list.length}` : "";
      if (!/\.stl$/i.test(file.name)) {
        problems.push(`${file.name} isn't an STL file.`);
        continue;
      }
      if (file.size > MODEL_MAX_MB * 1024 * 1024) {
        problems.push(`${file.name} is over ${MODEL_MAX_MB}MB.`);
        continue;
      }
      setBusy(`Reading${label}…`);
      let thumb: Blob | null = null;
      let triangles = 0;
      try {
        const geometry = parseStl(await file.arrayBuffer());
        triangles = Math.round(geometry.attributes.position.count / 3);
        thumb = await snapshot(geometry).catch(() => null);
        geometry.dispose();
      } catch {
        problems.push(`${file.name} couldn't be read as an STL.`);
        continue;
      }
      setBusy(`Uploading${label}…`);
      const base = `${app.business_id}/${app.id}/${slug.replace(/[^\w-]+/g, "")}-${Date.now().toString(36)}`;
      const up = await bucket.upload(`${base}.stl`, file, { contentType: "model/stl" });
      if (up.error) {
        problems.push(`${file.name} didn't upload.`);
        continue;
      }
      const thumbPath = thumb && !(await bucket.upload(`${base}.png`, thumb, { contentType: "image/png" })).error ? `${base}.png` : null;
      const { data, error } = await supabase
        .from("app_models")
        .insert({ app_id: app.id, name: file.name.replace(/\.stl$/i, "").trim().slice(0, 120) || "Model", file_path: `${base}.stl`, thumb_path: thumbPath, size_bytes: file.size, triangles })
        .select("id")
        .single();
      if (error || !data) {
        await bucket.remove([`${base}.stl`, ...(thumbPath ? [thumbPath] : [])]);
        problems.push(`${file.name} didn't save.`);
        continue;
      }
      newest = data.id;
    }
    setBusy("");
    if (problems.length) setProblem(problems.join(" "));
    if (newest) {
      setPick(newest);
      router.refresh();
    }
  }

  const addButton = canEdit && (
    <label className={`btn file-btn${models.length ? " plain small" : ""}`}>
      {busy || (models.length ? "Add models" : "Add STL models")}
      <input type="file" accept=".stl,model/stl" multiple hidden disabled={Boolean(busy)} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
    </label>
  );

  return (
    <>
      {current ? (
        <>
          <ModelViewer key={current.id} url={current.view} name={current.name} downloadUrl={current.download} />
          <h2 className="mv-name">{current.name}</h2>
        </>
      ) : (
        <div className="mv"><div className="mv-stage"><span className="mv-wait when">{canEdit ? "" : "No models here yet."}{addButton}</span></div></div>
      )}
      {problem && <p className="error">{problem}</p>}

      <div className="eyebrow-row">
        <p className="eyebrow">Models{models.length ? ` · ${models.length}` : ""}</p>
        {models.length > 0 && addButton}
      </div>
      {models.length ? (
        <div className="gallery pattern-gallery">
          {models.map((m) => (
            <div key={m.id} className={`gallery-card mv-card${m.id === current?.id ? " on" : ""}`}>
              <button
                type="button"
                className="gallery-img mv-thumb"
                aria-pressed={m.id === current?.id}
                aria-label={`Show ${m.name}`}
                onClick={() => {
                  setPick(m.id);
                  history.replaceState(null, "", `#model-${m.id}`);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {m.thumb ? <img src={m.thumb} alt="" loading="lazy" /> : <span>STL</span>}
              </button>
              <b>{m.name}</b>
              <small className="when">{fileSize(m.size_bytes)} · {new Date(m.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
              <span className="pattern-actions">
                {m.download && <a className="btn plain small" href={m.download}>STL</a>}
                {canEdit && <ConfirmButton label="Remove" ask="Remove it?" yes="Remove" className="link pm-small danger-link" onConfirm={() => void deleteModel(m.id).then(() => router.refresh())} />}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="group"><div className="empty">No models yet.{canEdit ? ` Add STL files, up to ${MODEL_MAX_MB}MB each.` : ""}</div></div>
      )}

      {canEdit && (
        <>
          <p className="eyebrow">App</p>
          <div className="group">
            <div className="row">
              <div className="ctl"><div style={{ fontWeight: 600 }}>Delete this app</div><div className="when">And every model in it.</div></div>
              <ConfirmButton label="Delete" ask="Delete the app and its models?" yes="Delete" className="link danger-link" onConfirm={() => void deleteApp(app.id)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
