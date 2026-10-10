"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRIORITIES, TYPES, daysFromToday, leadDays, todayISO } from "@/lib/priority";
import type { Business } from "@/lib/types";

const MAX_FILE_MB = 25;

export default function NewRequestForm({
  businesses,
  defaultName,
  isDesigner,
}: {
  businesses: Business[];
  defaultName: string;
  isDesigner: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<string>(TYPES[0].id);
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const lead = leadDays(type);
  const tight = deadline && daysFromToday(deadline) < lead;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const files = (f.getAll("files") as File[]).filter((x) => x.size > 0);
    const tooBig = files.find((x) => x.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      setBusy(false);
      setError(`${tooBig.name} is over ${MAX_FILE_MB} MB. Share a link to it instead.`);
      return;
    }

    const supabase = createClient();
    const business_id = get("business_id");
    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        business_id,
        requester_name: get("requester_name"),
        title: get("title"),
        type: get("type"),
        formats: get("formats"),
        brief: get("brief"),
        copy: get("copy"),
        links: get("links"),
        colours: get("colours"),
        deadline: get("deadline"),
        event_date: get("event_date") || null,
        priority: get("priority"),
        approver: get("approver"),
      })
      .select("id")
      .single();

    if (insertError || !ticket) {
      setBusy(false);
      setError(`Your request wasn't sent: ${insertError?.message ?? "unknown error"}. Try again.`);
      return;
    }

    const failed: string[] = [];
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${business_id}/${ticket.id}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("inspiration").upload(path, file);
      if (up.error) failed.push(file.name);
      else await supabase.from("ticket_files").insert({ ticket_id: ticket.id, path, name: file.name });
    }

    setBusy(false);
    formRef.current?.reset();
    setType(TYPES[0].id);
    setDeadline("");
    setDone(
      failed.length
        ? `Request sent, but these files didn't upload: ${failed.join(", ")}. Add a link to them in a note instead.`
        : "Request sent. Kingsley can see it now."
    );
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit}>
      <p className="eyebrow">The project</p>
      <div className="group">
        {isDesigner && (
          <div className="row">
            <label htmlFor="business_id">Business</label>
            <div className="ctl">
              <select id="business_id" name="business_id" required>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {!isDesigner && <input type="hidden" name="business_id" value={businesses[0]?.id ?? ""} />}
        <div className="row">
          <label htmlFor="title">Title</label>
          <div className="ctl"><input id="title" name="title" required placeholder="e.g. Halloween weekend poster" /></div>
        </div>
        <div className="row">
          <label htmlFor="type">Type</label>
          <div className="ctl">
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.id}>{t.id}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <label htmlFor="formats">Sizes / formats</label>
          <div className="ctl"><input id="formats" name="formats" placeholder="A3 print, IG post 1080×1350, story" /></div>
        </div>
        <div className="row stack">
          <label htmlFor="brief">What do you need?</label>
          <textarea id="brief" name="brief" required placeholder="Goal, audience, where it will be used" />
        </div>
      </div>

      <p className="eyebrow">Copy</p>
      <div className="group">
        <div className="row stack">
          <label htmlFor="copy">Exact wording to use</label>
          <textarea id="copy" name="copy" placeholder="Headline, dates, prices, small print. Paste it exactly as it should appear." />
        </div>
      </div>
      <p className="foot">Final copy up front saves a round of changes.</p>

      <p className="eyebrow">Inspiration</p>
      <div className="group">
        <div className="row">
          <label htmlFor="links">Links</label>
          <div className="ctl"><input id="links" name="links" placeholder="Pinterest, Instagram, websites" /></div>
        </div>
        <div className="row">
          <label htmlFor="files">Images / logos</label>
          <div className="ctl"><input id="files" name="files" type="file" multiple accept="image/*,application/pdf,.ai,.psd,.svg,.eps,.zip" /></div>
        </div>
        <div className="row">
          <label htmlFor="colours">Colours / mood</label>
          <div className="ctl"><input id="colours" name="colours" placeholder="Autumnal, gold and black, playful" /></div>
        </div>
      </div>

      <p className="eyebrow">Timing</p>
      <div className="group">
        <div className="row">
          <label htmlFor="deadline">Needed by</label>
          <div className="ctl"><input id="deadline" name="deadline" type="date" required min={todayISO()} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
        </div>
        <div className="row">
          <label htmlFor="event_date">Event / go-live</label>
          <div className="ctl"><input id="event_date" name="event_date" type="date" /></div>
        </div>
        <div className="row">
          <label htmlFor="priority">Importance</label>
          <div className="ctl">
            <select id="priority" name="priority">
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>
      <p className="foot">
        {type} jobs need about {lead} working days.
        {tight ? " That deadline is tight, so Kingsley may come back to you about timing." : ""}
      </p>

      <p className="eyebrow">Sign-off</p>
      <div className="group">
        <div className="row">
          <label htmlFor="requester_name">{isDesigner ? "Requested by" : "Your name"}</label>
          <div className="ctl"><input id="requester_name" name="requester_name" required defaultValue={isDesigner ? "" : defaultName} placeholder="Who should Kingsley ask?" /></div>
        </div>
        <div className="row">
          <label htmlFor="approver">Final approver</label>
          <div className="ctl"><input id="approver" name="approver" placeholder="If someone else signs it off" /></div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {done && <p className="foot" style={{ color: "var(--green)", fontWeight: 600 }}>{done}</p>}
      <button className="btn wide" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
    </form>
  );
}
