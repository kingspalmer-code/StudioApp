"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { alertNewFiles } from "@/app/portal/actions";
import { uploadPreview } from "@/lib/preview";

const MAX_FILE_MB = 25;

// Adding files to a job after it's been sent, such as an invoice or a photo the client forgot.
// They go alongside the files sent with the request; a client adding them alerts the studio.
export default function AddFiles({ ticketId, businessId, isClient }: { ticketId: number; businessId: string; isClient: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);

  async function upload(list: File[]) {
    if (!list.length) return;
    setProblem("");
    const tooBig = list.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    const ok = list.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    const supabase = createClient();
    const failed: string[] = [];
    for (const [i, f] of ok.entries()) {
      setBusy(ok.length > 1 ? `Uploading ${i + 1} of ${ok.length}…` : `Uploading ${f.name}…`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${businessId}/${ticketId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("inspiration").upload(path, f, { contentType: f.type || undefined });
      if (up.error) {
        failed.push(f.name);
        continue;
      }
      await uploadPreview(supabase, "inspiration", path, f);
      const { error } = await supabase.from("ticket_files").insert({ ticket_id: ticketId, path, name: f.name });
      if (error) failed.push(f.name);
    }
    setBusy("");
    if (isClient && failed.length < ok.length) void alertNewFiles(ticketId).catch(() => {});
    const notes = [
      tooBig.length && `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length > 1 ? "are" : "is"} over ${MAX_FILE_MB}MB. Share a link to ${tooBig.length > 1 ? "them" : "it"} in a note instead.`,
      failed.length && `${failed.join(", ")} didn't upload. Try again.`,
    ].filter(Boolean);
    if (notes.length) setProblem(notes.join(" "));
    router.refresh();
  }

  return (
    <div
      className={`deliveries${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="deliv-add">
        <label className="btn plain small file-btn">
          {busy || "Add files"}
          <input type="file" multiple hidden disabled={Boolean(busy)} onChange={(e) => upload(Array.from(e.target.files ?? []))} />
        </label>
        <span className="when">Invoices, photos, anything. Drag files here, up to {MAX_FILE_MB}MB each.</span>
      </div>
      {problem && <p className="error">{problem}</p>}
    </div>
  );
}
