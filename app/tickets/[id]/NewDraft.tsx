"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DELIVERY_MAX_MB, fileSize } from "@/lib/deliveries";

// The studio sharing a draft for the client's notes: a short message, and files or a link.
// Drafts stay off the galleries until one is sent as final.
export default function NewDraft({ ticketId, businessId, round, clientName }: { ticketId: number; businessId: string; round: number; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);

  function pick(list: File[]) {
    const tooBig = list.filter((f) => f.size > DELIVERY_MAX_MB * 1024 * 1024);
    setFiles((now) => [...now, ...list.filter((f) => f.size <= DELIVERY_MAX_MB * 1024 * 1024)]);
    setProblem(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length > 1 ? "are" : "is"} over ${DELIVERY_MAX_MB}MB. Add a link to ${tooBig.length > 1 ? "them" : "it"} instead.` : "");
  }

  async function share(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const message = String(fd.get("message") ?? "").trim();
    const url = String(fd.get("url") ?? "").trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) return setProblem("Paste the full link, starting with https://");
    if (!files.length && !url) return setProblem("Add a file or a link for them to look at.");
    setProblem("");
    setBusy("Sharing…");
    const supabase = createClient();
    const { data: draft, error } = await supabase.from("ticket_drafts").insert({ ticket_id: ticketId, message }).select("id").single<{ id: number }>();
    if (error || !draft) {
      setBusy("");
      return setProblem(`That didn't share. ${error?.message ?? ""}`.trim());
    }
    const failed: string[] = [];
    let added = 0;
    for (const [i, f] of files.entries()) {
      setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : `Uploading ${f.name}…`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${businessId}/${ticketId}/drafts/${draft.id}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const up = await supabase.storage.from("deliveries").upload(path, f, { contentType: f.type || undefined });
      const row = up.error ? up : await supabase.from("ticket_draft_files").insert({ draft_id: draft.id, path, name: f.name, size: f.size, mime: f.type });
      if (row.error) failed.push(f.name);
      else added++;
    }
    if (url) {
      const name = url.replace(/^https?:\/\//, "").slice(0, 60);
      const { error: e2 } = await supabase.from("ticket_draft_files").insert({ draft_id: draft.id, url, name });
      if (e2) failed.push(url);
      else added++;
    }
    setBusy("");
    if (!added) {
      await supabase.from("ticket_drafts").delete().eq("id", draft.id);
      return setProblem("Nothing uploaded, so the draft wasn't shared. Try again.");
    }
    if (failed.length) setProblem(`${failed.join(", ")} didn't upload. The rest of the draft is shared.`);
    form.reset();
    setFiles([]);
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <div className="deliv-add">
        <button type="button" className="btn plain small" onClick={() => setOpen(true)}>+ Share draft {round}</button>
        <span className="when">{clientName} can look and leave notes. It won&apos;t go in their gallery until you send it as final.</span>
      </div>
    );

  return (
    <form
      onSubmit={share}
      className={`deliveries${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="group">
        <div className="row stack">
          <label htmlFor="draft-message">Draft {round}</label>
          <textarea id="draft-message" name="message" placeholder={`What to look at, and anything you'd like ${clientName}'s thoughts on…`} />
        </div>
        {files.map((f, i) => (
          <div className="row" key={`${f.name}-${i}`}>
            <div className="ctl">{f.name} <span className="when">{fileSize(f.size)}</span></div>
            <button type="button" className="link deliv-remove" onClick={() => setFiles((now) => now.filter((_, j) => j !== i))} aria-label={`Take off ${f.name}`}>Remove</button>
          </div>
        ))}
        <div className="row"><label htmlFor="draft-url">Link</label><div className="ctl"><input id="draft-url" name="url" type="url" placeholder="Optional, e.g. a Figma or video link" /></div></div>
      </div>
      <div className="deliv-add" style={{ marginTop: 12 }}>
        <label className="btn plain small file-btn">
          {files.length ? "Add more files" : "Add files"}
          <input type="file" multiple hidden disabled={Boolean(busy)} onChange={(e) => { pick(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
        <span className="when">Drag files here. Up to {DELIVERY_MAX_MB}MB each.</span>
      </div>
      {problem && <p className="error">{problem}</p>}
      <div className="draft-actions">
        <button type="button" className="link" onClick={() => setOpen(false)} disabled={Boolean(busy)}>Cancel</button>
        <button className="btn small" type="submit" disabled={Boolean(busy)}>{busy || "Share for notes"}</button>
      </div>
    </form>
  );
}
