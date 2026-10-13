"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmButton from "./ConfirmButton";
import { DELIVERY_MAX_MB, fileSize, isImage, isVideo, type Delivery, type Signed } from "@/lib/deliveries";

const ext = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "file").toUpperCase();

// Finished files on a job. The studio uploads them (or adds a link for anything too big);
// everyone who can see the job can view and download them. Drafts show their files with it too, read-only.
type Shown = Signed<Pick<Delivery, "id" | "path" | "url" | "name" | "size" | "mime">>;
export default function Deliveries({
  ticketId,
  businessId,
  files,
  canEdit,
  clientName,
}: {
  ticketId: number;
  businessId: string;
  files: Shown[];
  canEdit: boolean;
  clientName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);
  const [linking, setLinking] = useState(false);

  async function upload(list: File[]) {
    if (!list.length) return;
    setProblem("");
    const tooBig = list.filter((f) => f.size > DELIVERY_MAX_MB * 1024 * 1024);
    const ok = list.filter((f) => f.size <= DELIVERY_MAX_MB * 1024 * 1024);
    const supabase = createClient();
    const failed: string[] = [];
    for (const [i, f] of ok.entries()) {
      setBusy(ok.length > 1 ? `Uploading ${i + 1} of ${ok.length}…` : `Uploading ${f.name}…`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${businessId}/${ticketId}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const { error } = await supabase.storage.from("deliveries").upload(path, f, { contentType: f.type || undefined });
      if (error) {
        failed.push(f.name);
        continue;
      }
      const { error: e2 } = await supabase.from("ticket_deliveries").insert({ ticket_id: ticketId, path, name: f.name, size: f.size, mime: f.type });
      if (e2) failed.push(f.name);
    }
    setBusy("");
    const notes = [
      tooBig.length && `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length > 1 ? "are" : "is"} over ${DELIVERY_MAX_MB}MB. Upload ${tooBig.length > 1 ? "them" : "it"} to a file-sharing site and add the link instead.`,
      failed.length && `${failed.join(", ")} didn't upload. Try again.`,
    ].filter(Boolean);
    if (notes.length) setProblem(notes.join(" "));
    if (tooBig.length) setLinking(true);
    router.refresh();
  }

  async function addLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const url = String(fd.get("url") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim() || url.replace(/^https?:\/\//, "").slice(0, 60);
    if (!/^https?:\/\/\S+$/.test(url)) return setProblem("Paste the full link, starting with https://");
    setBusy("Adding…");
    const { error } = await createClient().from("ticket_deliveries").insert({ ticket_id: ticketId, url, name });
    setBusy("");
    if (error) return setProblem(`That link didn't save. ${error.message}`);
    setLinking(false);
    setProblem("");
    router.refresh();
  }

  async function remove(f: Shown) {
    const supabase = createClient();
    // A file sent as final from a draft stays on that draft, so only the finished copy goes.
    const onDraft = f.path ? (await supabase.from("ticket_draft_files").select("id", { count: "exact", head: true }).eq("path", f.path)).count : 0;
    if (f.path && !onDraft) await supabase.storage.from("deliveries").remove([f.path]);
    await supabase.from("ticket_deliveries").delete().eq("id", f.id);
    router.refresh();
  }

  return (
    <div
      className={`deliveries${over ? " over" : ""}`}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      {files.length > 0 && (
        <div className="deliv-grid">
          {files.map((f) => (
            <div key={f.id} className="deliv">
              <a className="deliv-preview" href={f.view ?? undefined} target="_blank" rel="noreferrer">
                {f.view && f.path && isImage(f) ? (
                  <img src={f.view} alt="" loading="lazy" />
                ) : f.view && f.path && isVideo(f) ? (
                  <video src={f.view} muted playsInline preload="metadata" />
                ) : (
                  <span className="deliv-ext">{f.url ? "LINK" : ext(f.name)}</span>
                )}
              </a>
              <div className="deliv-meta">
                <span className="deliv-name" title={f.name}>{f.name}</span>
                <span className="when">{f.url ? "Link" : fileSize(f.size)}</span>
              </div>
              <div className="deliv-actions">
                {f.download && (
                  <a className="btn plain small" href={f.download} {...(f.url ? { target: "_blank", rel: "noreferrer" } : {})}>
                    {f.url ? "Open" : "Download"}
                  </a>
                )}
                {canEdit && (
                  <ConfirmButton label="Remove" ask="Remove it?" yes="Remove" onConfirm={() => remove(f)} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="deliv-add">
          <label className="btn plain small file-btn">
            {busy || (files.length ? "Add more files" : "Upload finished files")}
            <input type="file" multiple hidden disabled={Boolean(busy)} onChange={(e) => upload(Array.from(e.target.files ?? []))} />
          </label>
          {!linking && <button type="button" className="link" onClick={() => setLinking(true)}>Add a link instead</button>}
          <span className="when">Drag files here. Up to {DELIVERY_MAX_MB}MB each.</span>
        </div>
      )}
      {canEdit && linking && (
        <form className="group deliv-link" onSubmit={addLink}>
          <div className="row"><label htmlFor="d-url">Link</label><div className="ctl"><input id="d-url" name="url" type="url" required placeholder="https://…" /></div></div>
          <div className="row"><label htmlFor="d-name">Name</label><div className="ctl"><input id="d-name" name="name" placeholder="e.g. Print files (zip)" /></div></div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 14 }}>
            <button type="button" className="link" onClick={() => setLinking(false)}>Cancel</button>
            <button className="btn small" type="submit" disabled={Boolean(busy)}>Add link</button>
          </div>
        </form>
      )}
      {problem && <p className="error">{problem}</p>}
      {!canEdit && !files.length && <div className="group"><div className="empty">Nothing here yet.</div></div>}
    </div>
  );
}
