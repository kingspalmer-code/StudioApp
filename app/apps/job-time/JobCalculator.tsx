"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { dayWord, estimate, workingDays, type Sample } from "@/lib/estimate";
import { addTiming, correctJob, readDescription, removeTiming, setTypeDays } from "./actions";

export type Finished = { id: number; business_id: string; title: string; type: string; created_at: string; delivered_at: string; details: Record<string, unknown> | null };
export type Timing = { id: number; ticket_id: number | null; type: string; size: number | null; days: number | null; skip: boolean; note: string; created_at: string };
type Type = { id: number; name: string; lead_days: number };
type Field = { key: string; label: string; type_ids: number[] };

// One past job as the sums see it.
type Past = { key: string; title: string; when: string; days: number | null; size: number | null; ticketId?: number; timingId?: number; skipped: boolean; fixed: boolean };

const SIZE_KEY = (typeId: number) => `oatcake:job-time:size:${typeId}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtNum = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export default function JobCalculator({ types, jobs: allJobs, mineId, fields, timings, canEdit, canSetType, ai, jobWord }: {
  types: Type[];
  jobs: Finished[];
  // The workspace's own business: its in-house jobs are left out of the sums unless switched on.
  mineId?: string;
  fields: Field[];
  timings: Timing[];
  canEdit: boolean;
  canSetType: boolean;
  ai: boolean;
  jobWord: string;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? 0);
  const type = types.find((t) => t.id === typeId);
  const own = useMemo(() => fields.filter((f) => !f.type_ids.length || f.type_ids.includes(typeId)), [fields, typeId]);
  const [sizeKey, setSizeKey] = useState("");
  const [size, setSize] = useState("");
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState("");
  const [countMine, setCountMine] = useState(false);
  const hasMine = Boolean(mineId) && allJobs.some((j) => j.business_id === mineId);
  const jobs = useMemo(() => (countMine ? allJobs : allJobs.filter((j) => j.business_id !== mineId)), [allJobs, countMine, mineId]);

  // The size field picked for each type is remembered on this computer.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(SIZE_KEY(typeId)); } catch {}
    setSizeKey(saved != null && (saved === "" || own.some((f) => f.key === saved)) ? saved : own[0]?.key ?? "");
  }, [typeId, own]);
  function pickSize(key: string) {
    setSizeKey(key);
    try { localStorage.setItem(SIZE_KEY(typeId), key); } catch {}
  }
  const sizeField = own.find((f) => f.key === sizeKey);

  const fixes = useMemo(() => new Map(timings.filter((t) => t.ticket_id != null).map((t) => [t.ticket_id!, t])), [timings]);

  // Every past job of this type: finished ones (with any correction) and ones typed in.
  const past = useMemo<Past[]>(() => {
    if (!type) return [];
    const finished = jobs
      .filter((j) => j.type === type.name)
      .map((j) => {
        const fix = fixes.get(j.id);
        const raw = j.details?.[sizeKey];
        const size = sizeField && typeof raw === "number" && raw > 0 ? raw : null;
        return {
          key: `j${j.id}`,
          title: j.title,
          when: j.delivered_at,
          days: fix?.days != null ? Number(fix.days) : workingDays(j.created_at, j.delivered_at),
          size,
          ticketId: j.id,
          skipped: Boolean(fix?.skip),
          fixed: fix?.days != null,
        };
      });
    const typed = timings
      .filter((t) => t.ticket_id == null && t.type === type.name)
      .map((t) => ({ key: `t${t.id}`, title: t.note || "Added by hand", when: t.created_at, days: Number(t.days), size: t.size != null ? Number(t.size) : null, timingId: t.id, skipped: false, fixed: false }));
    return [...typed, ...finished].sort((a, b) => b.when.localeCompare(a.when));
  }, [type, jobs, timings, fixes, sizeKey, sizeField]);

  const samples: Sample[] = past.filter((p) => !p.skipped && p.days).map((p) => ({ days: p.days!, size: p.size }));
  const sizeNum = sizeField && size.trim() ? parseFloat(size.replace(/,/g, "")) : null;
  const asked = sizeNum != null && Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : null;

  // With nothing of this type yet, fall back on every job, and say so.
  const everything: Sample[] = useMemo(() => {
    const finished = jobs.map((j) => (fixes.get(j.id)?.skip ? null : fixes.get(j.id)?.days ?? workingDays(j.created_at, j.delivered_at))).filter((d): d is number => Boolean(d));
    const typed = timings.filter((t) => t.ticket_id == null && t.days).map((t) => Number(t.days));
    return [...finished, ...typed].map((days) => ({ days: Number(days), size: null }));
  }, [jobs, timings, fixes]);
  const fallback = !samples.length;
  const result = estimate(fallback ? everything : samples, fallback ? null : asked);

  const [described, setDescribed] = useState("");
  function describe() {
    setProblem("");
    start(async () => {
      const r = await readDescription(described, types.map((t) => t.name), sizeField?.label ?? "");
      if (r.error) return setProblem(r.error);
      const t = types.find((x) => x.name === r.type);
      if (t) setTypeId(t.id);
      setSize(r.size != null ? String(r.size) : "");
    });
  }

  if (!types.length) return <p className="empty">Add a {jobWord} type in Settings to use the calculator.</p>;

  return (
    <div className="jt">
      {ai && (
        <div className="group jt-describe">
          <div className="row stack">
            <label htmlFor="jt-describe">Describe the {jobWord} (optional)</label>
            <textarea id="jt-describe" value={described} onChange={(e) => setDescribed(e.target.value)} placeholder={`e.g. Two shop front fascias, about 4 metres each`} rows={2} />
          </div>
          <div className="row jt-describe-go">
            <span className="when">Oatcake picks the type and size from this. The estimate itself is worked out from your past {jobWord}s.</span>
            <button type="button" className="btn small" onClick={describe} disabled={pending || !described.trim()}>{pending ? "Reading…" : "Fill in"}</button>
          </div>
        </div>
      )}

      <div className="group">
        <div className="row">
          <label htmlFor="jt-type">Type</label>
          <select id="jt-type" className="ctl" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {own.length > 0 && (
          <div className="row">
            <label htmlFor="jt-size-field">Size from</label>
            <select id="jt-size-field" className="ctl" value={sizeKey} onChange={(e) => pickSize(e.target.value)}>
              {own.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              <option value="">Don't use a size</option>
            </select>
          </div>
        )}
        {sizeField && (
          <div className="row">
            <label htmlFor="jt-size">{sizeField.label}</label>
            <input id="jt-size" className="ctl" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder="How big this one is" />
          </div>
        )}
      </div>
      {problem && <p className="foot" style={{ color: "var(--red)" }}>{problem}</p>}

      <div className="group jt-result" aria-live="polite">
        {result ? (
          <>
            <p className="jt-days">About {dayWord(result.days)}</p>
            {result.high > result.low && <p className="jt-range">usually {result.low} to {dayWord(result.high)}</p>}
            <p className="when jt-why">
              {fallback
                ? `No finished ${type?.name} ${jobWord}s yet, so this is the typical time across all ${result.count} of your ${jobWord}s.`
                : result.how === "size"
                  ? `About ${fmtNum(result.perUnit!)} days per ${sizeField?.label.toLowerCase()}, from ${result.count} past ${type?.name} ${jobWord}s with a size.`
                  : `The typical time for ${result.count} past ${type?.name} ${jobWord}${result.count === 1 ? "" : "s"}.${
                      asked && sizeField ? ` Fewer than 2 have a ${sizeField.label.toLowerCase()}, so size isn't used yet.` : ""
                    }`}
              {!fallback && result.count < 3 && " That's not many, so treat it as a rough guess."}
              {" "}Working days, from adding it to finishing it.
            </p>
            {type && !fallback && (
              <p className="when jt-setting">
                Settings has {type.name} at {dayWord(type.lead_days)}.
                {canSetType && Math.ceil(result.days) !== type.lead_days && (
                  <> <button type="button" className="link" disabled={pending} onClick={() => start(() => setTypeDays(type.id, result.days))}>Change it to {dayWord(Math.ceil(result.days))}</button></>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="empty">No finished {jobWord}s to learn from yet. Add some past ones below and the estimate appears here.</p>
        )}
      </div>

      {canEdit && <AddPast type={type?.name ?? ""} sizeLabel={sizeField?.label} jobWord={jobWord} />}

      <p className="eyebrow">Past {type?.name} {jobWord}s</p>
      {past.length ? (
        <div className="group">
          {past.map((p) => <PastRow key={p.key} p={p} canEdit={canEdit} sizeLabel={sizeField?.label} />)}
        </div>
      ) : (
        <p className="foot">None yet.</p>
      )}
      <p className="foot">Finished {jobWord}s count from the day they were added to the day they were finished. Leave out any that don't show the real time, or change their days.</p>
      {hasMine && (
        <label className="foot jt-mine">
          <input type="checkbox" checked={countMine} onChange={(e) => setCountMine(e.target.checked)} /> Count in-house {jobWord}s for my business too
        </label>
      )}
    </div>
  );
}

function AddPast({ type, sizeLabel, jobWord }: { type: string; sizeLabel?: string; jobWord: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ size: "", days: "", note: "" });
  const [problem, setProblem] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn plain small jt-add" onClick={() => setOpen(true)}>Add a past {type} {jobWord}</button>;
  return (
    <form
      className="group jt-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        setProblem("");
        start(async () => {
          const r = await addTiming({ type, ...v, size: sizeLabel ? v.size : "" });
          if (r.error) return setProblem(r.error);
          setV({ size: "", days: "", note: "" });
        });
      }}
    >
      <div className="row">
        <label htmlFor="jt-add-note">What it was</label>
        <input id="jt-add-note" className="ctl" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Optional" maxLength={200} />
      </div>
      {sizeLabel && (
        <div className="row">
          <label htmlFor="jt-add-size">{sizeLabel}</label>
          <input id="jt-add-size" className="ctl" inputMode="decimal" value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} placeholder="Optional" />
        </div>
      )}
      <div className="row">
        <label htmlFor="jt-add-days">Days it took</label>
        <input id="jt-add-days" className="ctl" inputMode="decimal" value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} placeholder="Working days, e.g. 2.5" required />
      </div>
      <div className="row jt-add-go">
        {problem ? <span className="when" style={{ color: "var(--red)" }}>{problem}</span> : <span className="when">Adds to {type}.</span>}
        <button type="button" className="link" onClick={() => setOpen(false)}>Done</button>
        <button type="submit" className="btn small" disabled={pending || !v.days.trim()}>{pending ? "Adding…" : "Add"}</button>
      </div>
    </form>
  );
}

function PastRow({ p, canEdit, sizeLabel }: { p: Past; canEdit: boolean; sizeLabel?: string }) {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(p.days != null ? String(p.days) : "");
  const [pending, start] = useTransition();
  const fix = (change: { skip: boolean; days: string | null }) => start(async () => { await correctJob(p.ticketId!, change); setEditing(false); });

  return (
    <div className={`row jt-past${p.skipped ? " skipped" : ""}`}>
      <div className="ctl">
        <b className="jt-past-title">{p.title}</b>
        <span className="when">
          {fmtDate(p.when)}
          {p.size != null && sizeLabel && ` · ${sizeLabel} ${fmtNum(p.size)}`}
          {p.timingId && " · added by hand"}
          {p.fixed && " · days changed"}
        </span>
      </div>
      {editing ? (
        <form className="jt-past-edit" onSubmit={(e) => { e.preventDefault(); fix({ skip: false, days }); }}>
          <input inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Working days it took" autoFocus />
          <button type="submit" className="link" disabled={pending}>Save</button>
        </form>
      ) : (
        <span className="jt-past-days">{p.skipped ? "Left out" : p.days ? dayWord(p.days) : "No dates"}</span>
      )}
      {canEdit && !editing && (
        <span className="jt-past-tools">
          {p.timingId ? (
            <button type="button" className="link" style={{ color: "var(--red)" }} disabled={pending} onClick={() => start(() => removeTiming(p.timingId!))}>Remove</button>
          ) : p.skipped ? (
            <button type="button" className="link" disabled={pending} onClick={() => fix({ skip: false, days: null })}>Put back</button>
          ) : (
            <>
              <button type="button" className="link" onClick={() => setEditing(true)}>{p.days ? "Change" : "Add days"}</button>
              {p.fixed && <button type="button" className="link" disabled={pending} onClick={() => fix({ skip: false, days: null })}>Undo</button>}
              <button type="button" className="link" disabled={pending} onClick={() => fix({ skip: true, days: null })}>Leave out</button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
