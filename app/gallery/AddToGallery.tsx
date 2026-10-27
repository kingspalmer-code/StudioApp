"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flashSaved } from "@/components/Saved";
import { createClient } from "@/lib/supabase/client";
import { DELIVERY_MAX_MB } from "@/lib/deliveries";
import { uploadPreview } from "@/lib/preview";
import { addToGallery, myBusinessId } from "./actions";
import TagPicker, { type TagPerson } from "./TagPicker";

// The studio puts pictures straight into the Gallery, without a job: picks who they're for, adds a
// caption, and tags people, who hear about it. Files go to deliveries/<business>/gallery/.
const MINE = "mine";

export default function AddToGallery({ businesses, selfId, people, solo }: { businesses: { id: string; name: string }[]; selfId: string | null; people: TagPerson[]; solo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [biz, setBiz] = useState(solo || !businesses.length ? MINE : "");
  const [caption, setCaption] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);

  const pick = (list: File[]) => {
    const tooBig = list.filter((f) => f.size > DELIVERY_MAX_MB * 1024 * 1024);
    setProblem(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length > 1 ? "are" : "is"} over ${DELIVERY_MAX_MB}MB, so ${tooBig.length > 1 ? "they were" : "it was"} left out.` : "");
    const ok = list.filter((f) => f.size <= DELIVERY_MAX_MB * 1024 * 1024 && !files.some((x) => x.name === f.name && x.size === f.size));
    setFiles([...files, ...ok]);
  };

  function reset() {
    setFiles([]);
    setCaption("");
    setTagged([]);
    setProblem("");
    setOpen(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return setProblem("Pick a picture or file to add.");
    if (!biz) return setProblem("Pick who it's for.");
    setProblem("");
    setBusy("Getting ready…");
    const businessId = biz === MINE ? selfId ?? (await myBusinessId().catch(() => null)) : biz;
    if (!businessId) {
      setBusy("");
      return setProblem("That didn't work. Try again.");
    }
    const supabase = createClient();
    const done: { path: string; name: string; mime: string; size: number }[] = [];
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : `Uploading ${f.name}…`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${businessId}/gallery/${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const { error } = await supabase.storage.from("deliveries").upload(path, f, { contentType: f.type || undefined });
      if (error) {
        failed.push(f.name);
        continue;
      }
      await uploadPreview(supabase, "deliveries", path, f);
      done.push({ path, name: f.name, mime: f.type, size: f.size });
    }
    if (!done.length) {
      setBusy("");
      return setProblem(`${failed.join(", ")} didn't upload. Try again.`);
    }
    setBusy("Saving…");
    const r = await addToGallery(businessId, done, caption, tagged).catch(() => ({ error: "That didn't save. Check your connection and try again." }) as { ids?: number[]; error?: string });
    setBusy("");
    if (r.error) return setProblem(r.error);
    flashSaved(tagged.length ? `Added and ${tagged.length} tagged` : "Added to Gallery");
    if (failed.length) setProblem(`${failed.join(", ")} didn't upload. Try again.`);
    else reset();
    router.refresh();
  }

  if (!open) {
    return (
      <div className="gallery-add-bar">
        <button type="button" className="btn small" onClick={() => setOpen(true)}>Add to Gallery</button>
      </div>
    );
  }

  return (
    <form className="gallery-add" onSubmit={save}>
      <div
        className={`gallery-drop${over ? " over" : ""}`}
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
        <label className="btn plain small file-btn">
          {files.length ? "Add more" : "Pick pictures"}
          <input type="file" multiple hidden accept="image/*,video/*,application/pdf" disabled={Boolean(busy)} onChange={(e) => pick(Array.from(e.target.files ?? []))} />
        </label>
        <span className="when">or drag them here. Up to {DELIVERY_MAX_MB}MB each.</span>
        {files.length > 0 && (
          <ul className="gallery-picked">
            {files.map((f) => (
              <li key={f.name + f.size}>
                <span>{f.name}</span>
                <button type="button" className="link" disabled={Boolean(busy)} onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Take ${f.name} out`}>Take out</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="group">
        {!solo && (
          <div className="row">
            <label className="k" htmlFor="g-biz">For</label>
            <div className="ctl">
              <select id="g-biz" value={biz} onChange={(e) => setBiz(e.target.value)} disabled={Boolean(busy)}>
                {!biz && <option value="">Pick one…</option>}
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value={MINE}>My business</option>
              </select>
            </div>
          </div>
        )}
        <div className="row">
          <label className="k" htmlFor="g-caption">Caption</label>
          <div className="ctl"><input id="g-caption" value={caption} maxLength={1000} placeholder="Optional" onChange={(e) => setCaption(e.target.value)} disabled={Boolean(busy)} /></div>
        </div>
        <div className="row">
          <span className="k">Tag</span>
          <div className="ctl"><TagPicker people={people} businessId={biz === MINE ? selfId ?? "" : biz} value={tagged} onChange={setTagged} disabled={Boolean(busy)} /></div>
        </div>
      </div>
      {tagged.length > 0 && <p className="when">Tagged people get a notification, an email and a phone alert, and can see it even if it isn&apos;t for their business.</p>}
      {problem && <p className="error">{problem}</p>}
      <div className="gallery-add-actions">
        <button type="button" className="link" onClick={reset} disabled={Boolean(busy)}>Cancel</button>
        <button className="btn small" type="submit" disabled={Boolean(busy)} aria-busy={Boolean(busy) || undefined}>{busy || "Add to Gallery"}</button>
      </div>
    </form>
  );
}
