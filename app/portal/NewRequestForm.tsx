"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BriefHelper from "./BriefHelper";
import { createClient } from "@/lib/supabase/client";
import { PRIORITIES, daysFromToday, todayISO } from "@/lib/priority";
import FieldInput from "@/components/FieldInput";
import { appliesTo, groupFields, readFields, type JobField } from "@/lib/fields";
import type { Business, JobType } from "@/lib/types";
import { slugify } from "@/lib/workspace";

const MAX_FILE_MB = 25;

export default function NewRequestForm({
  businesses,
  defaultName,
  isDesigner,
  types,
  fields: allFields,
  trade = false,
  ownerName = "the studio",
  helper = false,
  onSent,
}: {
  businesses: Business[];
  defaultName: string;
  isDesigner: boolean;
  types: JobType[];
  fields: JobField[];
  trade?: boolean;
  ownerName?: string;
  helper?: boolean;
  onSent?: (message: string) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const firstType = types[0]?.name ?? "Other";
  const [type, setType] = useState<string>(firstType);
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Images pasted or dropped onto the form (from Pinterest, a screenshot, anywhere), sent with the other files.
  const [extra, setExtra] = useState<{ file: File; url: string }[]>([]);
  const hasFiles = allFields.some((f) => f.kind === "files");

  function addImages(list: File[]) {
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return false;
    setExtra((xs) => [...xs, ...images.map((file, i) => ({ file: file.name && file.name !== "image.png" ? file : new File([file], `reference-${Date.now()}-${i}.png`, { type: file.type }), url: URL.createObjectURL(file) }))]);
    return true;
  }

  useEffect(() => {
    if (!hasFiles) return;
    const form = formRef.current;
    const paste = (e: ClipboardEvent) => {
      if (addImages(Array.from(e.clipboardData?.files ?? []))) e.preventDefault();
    };
    form?.addEventListener("paste", paste);
    return () => form?.removeEventListener("paste", paste);
  }, [hasFiles]);

  const typeRow = types.find((t) => t.name === type);
  const lead = typeRow?.lead_days ?? 3;
  // Fields can be limited to some job types; headings with nothing under them drop out.
  const fields = allFields.filter((f) => appliesTo(f, typeRow?.id));
  const groups = groupFields(fields);
  const job = trade ? "Job" : "Request";
  const tight = deadline && daysFromToday(deadline) < lead;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const files = [...(f.getAll("files") as File[]).filter((x) => x.size > 0), ...extra.map((x) => x.file)];
    const tooBig = files.find((x) => x.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      setBusy(false);
      setError(`${tooBig.name} is over ${MAX_FILE_MB} MB. Share a link to it instead.`);
      return;
    }

    const supabase = createClient();
    let business_id = get("business_id");
    if (trade) {
      // Customers are picked by name; a new name becomes a new customer.
      const name = get("customer");
      const existing = businesses.find((b) => b.name.toLowerCase() === name.toLowerCase());
      if (existing) business_id = existing.id;
      else {
        const { data: created, error: custError } = await supabase
          .from("businesses")
          .insert({ name, slug: slugify(name), color: "#8a7a70", phone: get("phone") })
          .select("id")
          .single();
        if (custError || !created) {
          setBusy(false);
          setError(`Couldn't add that customer: ${custError?.message ?? "unknown error"}.`);
          return;
        }
        business_id = created.id;
      }
    }
    const { columns, details } = readFields(fields, get, (k) => f.get(k) != null);
    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        business_id,
        title: get("title"),
        type: get("type"),
        deadline: get("deadline"),
        priority: get("priority"),
        ...columns,
        details,
      })
      .select("id")
      .single();

    if (insertError || !ticket) {
      setBusy(false);
      setError(`${job} wasn't saved: ${insertError?.message ?? "unknown error"}. Try again.`);
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
    const message =
      failed.length
        ? `${job} saved, but these files didn't upload: ${failed.join(", ")}. Add a link to them in a note instead.`
        : trade
          ? "Job added. It's in your list now."
          : isDesigner
            ? "Request added to the queue."
            : `Request sent. ${ownerName} can see it now.`;
    router.refresh();
    if (onSent && !failed.length) return onSent(message);
    formRef.current?.reset();
    setType(firstType);
    setDeadline("");
    setExtra([]);
    setDone(message);
  }

  const readIdea = () => {
    const form = formRef.current;
    const val = (k: string) => ((form?.elements.namedItem(k) as HTMLInputElement | null)?.value ?? "").trim();
    return [val("title"), val("brief")].filter(Boolean).join(". ");
  };
  const briefField = fields.some((f) => f.key === "brief");
  const applyBrief = (text: string) => {
    const el = formRef.current?.elements.namedItem("brief") as HTMLTextAreaElement | null;
    if (!el) return;
    el.value = text;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onDragOver={(e) => hasFiles && e.preventDefault()}
      onDrop={(e) => {
        if (!hasFiles) return;
        e.preventDefault();
        if (addImages(Array.from(e.dataTransfer.files))) return;
        // An image dragged from another tab often comes as a link; keep it in the links field.
        const link = e.dataTransfer.getData("text/uri-list").split("\n")[0]?.trim();
        const links = formRef.current?.elements.namedItem("links") as HTMLInputElement | null;
        if (link && links) links.value = links.value ? `${links.value} ${link}` : link;
      }}
    >
      <p className="eyebrow">{trade ? "The job" : "The project"}</p>
      <div className="group">
        {trade && (
          <>
            <div className="row">
              <label htmlFor="customer">Customer</label>
              <div className="ctl">
                <input id="customer" name="customer" required list="customers" autoComplete="off" placeholder="Existing or new customer" />
                <datalist id="customers">
                  {businesses.map((b) => <option key={b.id} value={b.name} />)}
                </datalist>
              </div>
            </div>
            <div className="row">
              <label htmlFor="phone">Phone</label>
              <div className="ctl"><input id="phone" name="phone" type="tel" placeholder="For new customers" /></div>
            </div>
          </>
        )}
        {isDesigner && !trade && (
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
          <div className="ctl"><input id="title" name="title" required placeholder={trade ? "e.g. Shop front fascia" : "e.g. Halloween weekend poster"} /></div>
        </div>
        <div className="row">
          <label htmlFor="type">Type</label>
          <div className="ctl">
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => <option key={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <label htmlFor="deadline">Needed by</label>
          <div className="ctl"><input id="deadline" name="deadline" type="date" required min={todayISO()} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
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
        {tight ? (isDesigner ? " That deadline is tight." : ` That deadline is tight, so ${ownerName} may come back to you about timing.`) : ""}
      </p>

      {helper && <BriefHelper type={type} readIdea={readIdea} applyBrief={briefField ? applyBrief : null} canAddImages={hasFiles} />}

      {groups.map((g, i) => (
        <div key={`${g.title}-${i}`}>
          <p className="eyebrow">{g.title ?? "Details"}</p>
          <div className="group">
            {g.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={f.key === "requester_name" && !isDesigner ? defaultName : undefined} />
            ))}
          </div>
        </div>
      ))}

      {extra.length > 0 && (
        <>
          <p className="eyebrow">Added images</p>
          <div className="ref-tray">
            {extra.map((x, i) => (
              <span key={x.url} className="ref-thumb">
                <img src={x.url} alt="" />
                <button type="button" aria-label="Remove image" onClick={() => setExtra((xs) => xs.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {done && <p className="foot" style={{ color: "var(--green)", fontWeight: 600 }}>{done}</p>}
      <button className="btn wide" disabled={busy}>{busy ? "Saving…" : trade ? "Add job" : isDesigner ? "Add request" : "Send request"}</button>
    </form>
  );
}
