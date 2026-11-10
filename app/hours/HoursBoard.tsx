"use client";

import { useMemo, useState, useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import NumberInput from "@/components/NumberInput";
import { flashSaved } from "@/components/Saved";
import { gbp } from "@/lib/documents";
import { fmtMinutes, groupLogs, minutesOf, parseDuration, payOf, payTotals, PERIODS, periodRange, type PayLog, type Period } from "@/lib/hours";
import { logHours, removeTimeLog, setPaid, updateHours } from "./actions";
import HoursTimer from "./HoursTimer";

const OFFLINE = "Couldn't save that. Check your connection.";
type Job = { id: number; title: string; done: boolean };

const dayLabel = (day: string, today: string) =>
  day === today ? "Today" : new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Minutes back as something people would type: 90 → "1:30".
const asTyped = (m: number | null) => (m == null ? "" : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

export default function HoursBoard({
  initial,
  jobs,
  names,
  me,
  owner,
  seesAll,
  canEditAll,
  readOnly,
  today,
  notReady,
}: {
  initial: PayLog[];
  jobs: Job[];
  names: Record<string, string>;
  me: string;
  owner: boolean;
  seesAll: boolean;
  canEditAll: boolean;
  readOnly: boolean;
  today: string;
  notReady: boolean;
}) {
  const [logs, setLogs] = useState(initial);
  const [period, setPeriod] = useState<Period>("month");
  const [who, setWho] = useState<string>("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const [pending, startTransition] = useTransition();
  const now = Date.now();

  const jobTitle = (id: number | null) => (id ? (jobs.find((j) => j.id === id)?.title ?? `Job #${id}`) : "No job");
  const nameOf = (email: string) => (email === me ? "You" : (names[email] ?? email.split("@")[0]));
  const myRate = logs.find((l) => l.who === me && l.rate != null)?.rate ?? null;
  const running = logs.find((l) => l.who === me && l.minutes == null && l.started_at);
  const recent = useMemo(() => [...new Set(logs.filter((l) => l.who === me && l.ticket_id).map((l) => l.ticket_id!))].slice(0, 6), [logs, me]);
  const types = useMemo(() => [...new Set(logs.map((l) => l.work_type).filter(Boolean))].sort(), [logs]);

  const [from, to] = periodRange(period, today);
  const inPeriod = logs.filter((l) => l.day >= from && l.day < to);
  const people = [...new Set([me, ...logs.map((l) => l.who)])].filter((p) => p === me || logs.some((l) => l.who === p));
  const shown = who === "all" ? inPeriod : inPeriod.filter((l) => l.who === who);
  const total = payTotals(shown, now);
  const perPerson = people.map((p) => ({ who: p, ...payTotals(inPeriod.filter((l) => l.who === p), now), owedEver: payTotals(logs.filter((l) => l.who === p), now).owed }));
  const byJob = groupLogs(shown, (l) => String(l.ticket_id ?? ""), now);
  const byType = groupLogs(shown, (l) => l.work_type || "", now);

  const put = (fresh: PayLog[]) => setLogs((all) => [...fresh.filter((f) => !all.some((l) => l.id === f.id)), ...all.map((l) => fresh.find((f) => f.id === l.id) ?? l)].sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id));

  function remove(id: number) {
    const before = logs.find((l) => l.id === id);
    setLogs((all) => all.filter((l) => l.id !== id));
    setEditing(null);
    startTransition(async () => {
      const r = await removeTimeLog(id).catch(() => ({ error: OFFLINE }));
      if (r.error && before) {
        setError(r.error);
        put([before]);
      } else flashSaved("Removed");
    });
  }

  function markPaid(person: string, paid: boolean) {
    const ids = logs.filter((l) => l.who === person && l.minutes != null && Boolean(l.paid_at) !== paid && (paid ? l.rate != null : true)).map((l) => l.id);
    startTransition(async () => {
      const r = await setPaid(ids, paid).catch(() => ({ error: OFFLINE, logs: undefined }));
      if (r.error || !r.logs) return setError(r.error || "Couldn't mark that.");
      put(r.logs);
      flashSaved(paid ? `Marked ${nameOf(person) === "You" ? "yours" : nameOf(person) + "'s"} paid` : "Marked unpaid");
    });
  }

  return (
    <div className="hrs">
      <header className="hrs-head">
        <h1 className="hrs-title">Hours</h1>
      </header>

      {!readOnly && <HoursTimer running={running} jobs={jobs} recent={recent} onChange={put} onGone={(id) => setLogs((all) => all.filter((l) => l.id !== id))} />}

      <div className="hrs-below">
        <p className="eyebrow">{seesAll ? "Hours and pay" : "Your hours and pay"}</p>
        {!readOnly && !notReady && !typing && (
          <button type="button" className="btn plain small" onClick={() => setTyping(true)}>Type in hours instead</button>
        )}
      </div>

      {notReady && <p className="hrs-note">Hours and pay are nearly ready. Rates and types of work switch on shortly.</p>}

      {!readOnly && !notReady && typing && (
        <HoursForm
          jobs={jobs}
          types={types}
          today={today}
          startRate={myRate}
          pending={pending}
          onCancel={() => setTyping(false)}
          onSave={(input, done) =>
            startTransition(async () => {
              const r = await logHours(input).catch(() => ({ error: OFFLINE, log: undefined }));
              if (r.error || !r.log) return setError(r.error || "Couldn't log that.");
              setError("");
              put([r.log]);
              done();
              setTyping(false);
              flashSaved(`Logged ${fmtMinutes(r.log.minutes ?? 0)}`);
            })
          }
        />
      )}
      {error && <p className="hrs-error" role="alert">{error}</p>}

      <div className="hrs-filters">
        <nav className="seg" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </nav>
        {seesAll && people.length > 1 && (
          <nav className="seg" aria-label="Person">
            <button type="button" aria-pressed={who === "all"} onClick={() => setWho("all")}>Everyone</button>
            {people.map((p) => (
              <button key={p} type="button" aria-pressed={who === p} onClick={() => setWho(p)}>{nameOf(p)}</button>
            ))}
          </nav>
        )}
      </div>

      <section className="hrs-sum" aria-label="Totals">
        <div><span>Hours</span><b>{fmtMinutes(total.minutes)}</b></div>
        <div><span>Pay</span><b>{gbp(total.pay)}</b></div>
        <div><span>Still owed</span><b>{gbp(total.owed)}</b></div>
      </section>
      {total.noRate > 0 && <p className="hrs-note">{fmtMinutes(total.noRate)} has no rate yet, so it isn&apos;t in the pay. Tap an entry to add one.</p>}

      {seesAll && people.length > 1 && who === "all" && (
        <>
          <p className="eyebrow">Each person</p>
          <ul className="hrs-people">
            {perPerson.map((p) => (
              <li key={p.who}>
                <button type="button" className="hrs-person" onClick={() => setWho(p.who)}>
                  <b>{nameOf(p.who)}</b>
                  <span>{fmtMinutes(p.minutes)} · {gbp(p.pay)}</span>
                </button>
                <div className="hrs-owed">
                  {p.owedEver > 0 ? <span>Owed {gbp(p.owedEver)}</span> : <span className="hrs-paidup">Paid up</span>}
                  {owner && p.owedEver > 0 && (
                    <ConfirmButton label="Mark paid" className="btn plain small" ask={`Mark ${gbp(p.owedEver)} paid?`} yes="Paid" yesClassName="btn small" disabled={pending} onConfirm={() => markPaid(p.who, true)} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {who !== "all" && (
        <div className="hrs-owed hrs-owed-one">
          {(() => {
            const owedEver = payTotals(logs.filter((l) => l.who === who), now).owed;
            return (
              <>
                {owedEver > 0 ? <span>{nameOf(who) === "You" ? "You're" : `${nameOf(who)} is`} owed {gbp(owedEver)} in all</span> : <span className="hrs-paidup">Paid up</span>}
                {owner && owedEver > 0 && (
                  <ConfirmButton label="Mark paid" className="btn plain small" ask={`Mark ${gbp(owedEver)} paid?`} yes="Paid" yesClassName="btn small" disabled={pending} onConfirm={() => markPaid(who, true)} />
                )}
              </>
            );
          })()}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="hrs-empty">No hours logged {PERIODS.find((p) => p.key === period)!.label.toLowerCase().replace("all", "yet")}.</p>
      ) : (
        <div className="hrs-cols">
          <section>
            <p className="eyebrow">By job</p>
            <ul className="hrs-groups">
              {byJob.map((g) => {
                const split = seesAll && who === "all" ? groupLogs(g.logs, (l) => l.who, now) : [];
                return (
                  <li key={g.key}>
                    <div className="hrs-g-main">
                      <b>{jobTitle(Number(g.key) || null)}</b>
                      {split.length > 1 && <span>{split.map((s) => `${nameOf(s.key)} ${fmtMinutes(s.minutes)}`).join(" · ")}</span>}
                    </div>
                    <span className="hrs-g-num">{fmtMinutes(g.minutes)}</span>
                    <span className="hrs-g-num">{gbp(g.pay)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <p className="eyebrow">By type of work</p>
            <ul className="hrs-groups">
              {byType.map((g) => (
                <li key={g.key}>
                  <div className="hrs-g-main"><b>{g.key || "Not said"}</b></div>
                  <span className="hrs-g-num">{fmtMinutes(g.minutes)}</span>
                  <span className="hrs-g-num">{gbp(g.pay)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {shown.length > 0 && (
        <>
          <p className="eyebrow">Entries</p>
          <ul className="hrs-entries">
            {shown.map((l) => {
              const mine = l.who === me;
              const canEdit = !readOnly && l.minutes != null && (mine || canEditAll);
              if (editing === l.id)
                return (
                  <li key={l.id} className="hrs-editing">
                    <HoursForm
                      jobs={jobs}
                      types={types}
                      today={today}
                      log={l}
                      pending={pending}
                      onCancel={() => setEditing(null)}
                      onRemove={() => remove(l.id)}
                      onPaid={owner ? (paid) => startTransition(async () => {
                        const r = await setPaid([l.id], paid).catch(() => ({ error: OFFLINE, logs: undefined }));
                        if (r.error || !r.logs) return setError(r.error || "Couldn't mark that.");
                        put(r.logs);
                        flashSaved(paid ? "Marked paid" : "Marked unpaid");
                      }) : undefined}
                      onSave={(input, done) =>
                        startTransition(async () => {
                          const r = await updateHours(l.id, input).catch(() => ({ error: OFFLINE, log: undefined }));
                          if (r.error || !r.log) return setError(r.error || "Couldn't save that.");
                          setError("");
                          put([r.log]);
                          done();
                          setEditing(null);
                          flashSaved();
                        })
                      }
                    />
                  </li>
                );
              return (
                <li key={l.id}>
                  <button type="button" className="hrs-entry" disabled={!canEdit} onClick={() => setEditing(l.id)}>
                    <span className="hrs-e-day">{dayLabel(l.day, today)}</span>
                    <span className="hrs-e-main">
                      <b>{jobTitle(l.ticket_id)}</b>
                      <span>
                        {[seesAll ? nameOf(l.who) : "", l.work_type, l.note].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="hrs-e-time">{l.minutes == null ? "Timer running" : fmtMinutes(minutesOf(l, now))}</span>
                    <span className="hrs-e-pay">
                      {l.rate == null ? <i>No rate</i> : <>{gbp(payOf(l))}<small>{gbp(Number(l.rate))}/h</small></>}
                    </span>
                    {l.paid_at && <span className="hrs-stamp">Paid</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

type HoursInput = { day: string; ticket_id: number | null; work_type: string; minutes: number; rate: number | null; note: string };

// The box for logging hours, and for changing an entry.
function HoursForm({
  jobs,
  types,
  today,
  log,
  startRate = null,
  pending,
  onSave,
  onCancel,
  onRemove,
  onPaid,
}: {
  jobs: Job[];
  types: string[];
  today: string;
  log?: PayLog;
  startRate?: number | null;
  pending: boolean;
  onSave: (input: HoursInput, done: () => void) => void;
  onCancel?: () => void;
  onRemove?: () => void;
  onPaid?: (paid: boolean) => void;
}) {
  const [day, setDay] = useState(log?.day ?? today);
  const [job, setJob] = useState(log?.ticket_id ? String(log.ticket_id) : "");
  const [type, setType] = useState(log?.work_type ?? "");
  const [time, setTime] = useState(asTyped(log?.minutes ?? null));
  const [rate, setRate] = useState<number>(Number(log ? (log.rate ?? startRate ?? 0) : (startRate ?? 0)));
  const [note, setNote] = useState(log?.note ?? "");
  const [problem, setProblem] = useState("");
  const minutes = parseDuration(time);
  const open = jobs.filter((j) => !j.done || String(j.id) === job);
  const done = jobs.filter((j) => j.done && String(j.id) !== job);
  const listId = log ? `hrs-types-${log.id}` : "hrs-types";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!minutes) return setProblem("Type the time, like 1.5, 1:30 or 45m.");
    setProblem("");
    onSave({ day, ticket_id: Number(job) || null, work_type: type, minutes, rate: rate > 0 ? rate : null, note }, () => {
      if (log) return;
      setTime("");
      setNote("");
    });
  }

  return (
    <form className="hrs-form" onSubmit={submit}>
      <label className="hrs-f hrs-f-small">
        <span>Date</span>
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} required />
      </label>
      <label className="hrs-f hrs-f-wide">
        <span>Job</span>
        <select value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">No job</option>
          {open.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          {done.length > 0 && (
            <optgroup label="Finished">
              {done.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <label className="hrs-f">
        <span>Type of work</span>
        <input value={type} onChange={(e) => setType(e.target.value)} list={listId} placeholder="e.g. Design, Fitting" maxLength={80} />
        <datalist id={listId}>{types.map((t) => <option key={t} value={t} />)}</datalist>
      </label>
      <label className="hrs-f hrs-f-small">
        <span>Hours</span>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="1.5 or 1:30" inputMode="decimal" aria-invalid={Boolean(time && !minutes)} required />
      </label>
      <label className="hrs-f hrs-f-small">
        <span>Rate £/hour</span>
        <NumberInput value={rate} onValue={setRate} min={0} max={10000} step="0.01" inputMode="decimal" />
      </label>
      <label className="hrs-f hrs-f-note">
        <span>Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={500} />
      </label>
      <div className="hrs-f-go">
        {minutes && rate > 0 ? <span className="hrs-preview">{fmtMinutes(minutes)} = {gbp(Math.round((minutes / 60) * rate * 100) / 100)}</span> : null}
        {log && onPaid && (
          <button type="button" className="btn plain small" disabled={pending} onClick={() => onPaid(!log.paid_at)}>{log.paid_at ? "Mark unpaid" : "Mark paid"}</button>
        )}
        {log && onRemove && <ConfirmButton label="Remove" className="link hrs-remove" ask="Remove this?" yes="Remove" onConfirm={onRemove} />}
        {onCancel && <button type="button" className="btn plain small" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn small" disabled={pending || !time.trim()}>{log ? "Save" : "Log hours"}</button>
      </div>
      {problem && <p className="hrs-error">{problem}</p>}
    </form>
  );
}
