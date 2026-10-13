"use client";

import { useState, useTransition } from "react";
import FieldInput from "@/components/FieldInput";
import { groupFields } from "@/lib/fields";
import { todayISO } from "@/lib/priority";
import { createClient } from "@/lib/supabase/client";
import { sendLinkRequest, type LinkForm } from "./actions";

const MAX_FILE_MB = 25;
const MAX_FILES = 10;

export default function RequestLinkForm({ slug, form, name, email }: { slug: string; form: LinkForm; name: string; email: string }) {
  const [type, setType] = useState(form.types[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const typeRow = form.types.find((t) => t.name === type);
  // Questions can be limited to some kinds of job; headings with nothing under them drop out.
  const shown = form.fields.filter((f) => !f.type_ids?.length || (typeRow && f.type_ids.includes(typeRow.id)));
  const groups = groupFields(shown);
  // Photos are the most useful thing a customer can send, so there's always somewhere to add them.
  const asksForFiles = shown.some((f) => f.kind === "files");
  const [note, setNote] = useState<string | null>(null);

  if (sent)
    return (
      <div className="group">
        <div className="row stack">
          <b>Sent. Thank you.</b>
          <span className="when">{form.name} has your request. Check your email for a link to follow it, and reply to them from there.</span>
          {note && <span className="error">{note}</span>}
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        // Files go straight to storage from here, not through the server.
        const files = (data.getAll("files") as File[]).filter((x) => x.size > 0);
        data.delete("files");
        const tooBig = files.find((x) => x.size > MAX_FILE_MB * 1024 * 1024);
        if (tooBig) return setError(`${tooBig.name} is over ${MAX_FILE_MB} MB. Send a smaller one, or a link to it.`);
        if (files.length > MAX_FILES) return setError(`Add up to ${MAX_FILES} files.`);
        start(async () => {
          setError(null);
          const res = await sendLinkRequest(slug, data);
          if (res.error || !res.ticketId) return setError(res.error ?? "That didn't send. Try again.");
          const failed: string[] = [];
          if (files.length) {
            const supabase = createClient();
            const { data: folder } = await supabase.rpc("link_upload_folder", { p_ticket: res.ticketId });
            for (const file of files) {
              const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
              const up = folder ? await supabase.storage.from("inspiration").upload(path, file) : { error: new Error("no folder") };
              const att = up.error ? up : await supabase.rpc("attach_link_file", { p_ticket: res.ticketId, p_path: path, p_name: file.name });
              if (att.error) failed.push(file.name);
            }
          }
          if (failed.length) setNote(`Your request was sent, but these didn't upload: ${failed.join(", ")}. Reply with a link to them from the page in your email.`);
          setSent(true);
        });
      }}
    >
      <p className="eyebrow">You</p>
      <div className="group">
        <div className="row"><label htmlFor="name">Your name</label><div className="ctl"><input id="name" name="name" required autoComplete="name" defaultValue={name} maxLength={80} /></div></div>
        <div className="row"><label htmlFor="email">Email</label><div className="ctl"><input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} /></div></div>
        <div className="row"><label htmlFor="phone">Phone</label><div className="ctl"><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="Optional" maxLength={40} /></div></div>
      </div>

      <p className="eyebrow">The job</p>
      <div className="group">
        <div className="row"><label htmlFor="title">What is it?</label><div className="ctl"><input id="title" name="title" required maxLength={120} placeholder="e.g. House name sign" /></div></div>
        {form.types.length > 1 && (
          <div className="row">
            <label htmlFor="type">Kind of job</label>
            <div className="ctl">
              <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
                {form.types.map((t) => <option key={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {form.types.length === 1 && <input type="hidden" name="type" value={type} />}
        <div className="row"><label htmlFor="deadline">Needed by</label><div className="ctl"><input id="deadline" name="deadline" type="date" min={todayISO()} /></div></div>
      </div>

      {groups.map((g, i) => (
        <div key={`${g.title}-${i}`}>
          <p className="eyebrow">{g.title ?? "Details"}</p>
          <div className="group">
            {g.fields.map((f) => <FieldInput key={f.key} field={f} />)}
          </div>
        </div>
      ))}

      {!asksForFiles && (
        <>
          <p className="eyebrow">Photos</p>
          <div className="group">
            <div className="row">
              <label htmlFor="files">Photos or files</label>
              <div className="ctl"><input id="files" name="files" type="file" multiple accept="image/*,application/pdf" /></div>
            </div>
          </div>
        </>
      )}
      <p className="foot">Up to {MAX_FILES} photos or files, {MAX_FILE_MB} MB each.</p>

      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={pending}>{pending ? "Sending…" : `Send to ${form.name}`}</button>
    </form>
  );
}
