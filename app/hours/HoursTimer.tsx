"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { flashSaved } from "@/components/Saved";
import { fmtClock, fmtMinutes, type PayLog } from "@/lib/hours";
import { finishTimer, removeTimeLog, startTimer } from "./actions";

const OFFLINE = "Couldn't save that. Check your connection.";
type Job = { id: number; title: string; done: boolean };

// Where a pressed Stop is remembered, so a reload while choosing the job keeps the same time.
const stopKey = (id: number) => `oatcake:hours-stop:${id}`;
const readStop = (id: number): number | null => {
  try {
    const v = Number(localStorage.getItem(stopKey(id)));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
const writeStop = (id: number, at: number | null) => {
  try {
    if (at) localStorage.setItem(stopKey(id), String(at));
    else localStorage.removeItem(stopKey(id));
  } catch {}
};

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </svg>
);

// The Hours page's main thing: one big Start button. Press it and it times. Press Stop and it asks
// which job the time was for, then saves it. The running timer lives in the database (a time log
// with started_at and no minutes yet), so it keeps going through reloads and on other devices.
export default function HoursTimer({
  running,
  jobs,
  recent,
  onChange,
  onGone,
}: {
  running: PayLog | undefined;
  jobs: Job[];
  recent: number[];
  onChange: (logs: PayLog[]) => void;
  onGone: (id: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [find, setFind] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Pick up a Stop pressed before a reload.
  useEffect(() => {
    setStoppedAt(running ? readStop(running.id) : null);
    setFind("");
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running || stoppedAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, stoppedAt]);

  const startMs = running?.started_at ? Date.parse(running.started_at) : 0;
  const elapsed = running ? (stoppedAt ?? now) - startMs : 0;

  // Jobs to offer: the one the timer was started on, then ones you've clocked lately, then the rest
  // that are still open. Typing finds any job, finished ones too.
  const choices = useMemo(() => {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const order: Job[] = [];
    const add = (j: Job | undefined) => j && !order.includes(j) && order.push(j);
    add(running?.ticket_id ? byId.get(running.ticket_id) : undefined);
    recent.forEach((id) => add(byId.get(id)));
    jobs.filter((j) => !j.done).forEach(add);
    const q = find.trim().toLowerCase();
    if (!q) return order.filter((j) => !j.done || j.id === running?.ticket_id).slice(0, 8);
    return [...order, ...jobs.filter((j) => !order.includes(j))].filter((j) => j.title.toLowerCase().includes(q)).slice(0, 12);
  }, [jobs, recent, running?.ticket_id, find]);

  function start() {
    setError("");
    startTransition(async () => {
      const r = await startTimer({}).catch(() => ({ error: OFFLINE, log: undefined, stopped: undefined }));
      if (r.error || !r.log) return setError(r.error || "Couldn't start the timer.");
      const pay = (l: typeof r.log) => ({ work_type: "", rate: null, paid_at: null, ...l }) as PayLog;
      onChange([pay(r.log), ...(r.stopped ?? []).map(pay)]);
      setNow(Date.now());
    });
  }

  function stop() {
    if (!running) return;
    const at = Date.now();
    writeStop(running.id, at);
    setStoppedAt(at);
  }

  function keepGoing() {
    if (!running) return;
    writeStop(running.id, null);
    setStoppedAt(null);
  }

  function save(ticket: number | null) {
    if (!running || !stoppedAt) return;
    const id = running.id;
    setError("");
    startTransition(async () => {
      const r = await finishTimer(id, { ticket_id: ticket, ended_at: new Date(stoppedAt).toISOString() }).catch(() => ({ error: OFFLINE, log: undefined }));
      if (r.error || !r.log) return setError(r.error || "Couldn't save that.");
      writeStop(id, null);
      onChange([r.log]);
      const title = ticket ? jobs.find((j) => j.id === ticket)?.title : "";
      flashSaved(`Clocked ${fmtMinutes(r.log.minutes ?? 0)}${title ? ` to ${title}` : ""}`);
    });
  }

  function discard() {
    if (!running) return;
    const id = running.id;
    startTransition(async () => {
      const r = await removeTimeLog(id).catch(() => ({ error: OFFLINE }));
      if (r.error) return setError(r.error);
      writeStop(id, null);
      onGone(id);
      flashSaved("Time not kept");
    });
  }

  if (!running)
    return (
      <section className="hrs-timer" aria-label="Timer">
        <button type="button" className="hrs-go" onClick={start} disabled={pending}>
          <PlayIcon />
          <span>Start</span>
        </button>
        <p className="hrs-hint">Press start when you begin. You&apos;ll pick the job when you stop.</p>
        {error && <p className="hrs-error" role="alert">{error}</p>}
      </section>
    );

  const startedLabel = new Date(startMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  const startedOn = running.ticket_id ? jobs.find((j) => j.id === running.ticket_id)?.title : "";

  if (!stoppedAt)
    return (
      <section className="hrs-timer is-running" aria-label="Timer">
        <p className="hrs-clock" aria-live="off">{fmtClock(elapsed)}</p>
        <p className="hrs-hint">Started {startedLabel}{startedOn ? ` · ${startedOn}` : ""}</p>
        <button type="button" className="hrs-go hrs-stop" onClick={stop} disabled={pending}>
          <StopIcon />
          <span>Stop</span>
        </button>
        {error && <p className="hrs-error" role="alert">{error}</p>}
      </section>
    );

  return (
    <section className="hrs-timer is-asking" aria-label="Which job">
      <p className="hrs-clock is-still">{fmtMinutes(Math.max(1, Math.round(elapsed / 60000)))}</p>
      <h2 className="hrs-ask">Which job would you like to clock this under?</h2>
      {jobs.length > 8 && (
        <input className="hrs-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a job" aria-label="Find a job" />
      )}
      <div className="hrs-picks">
        {choices.map((j) => (
          <button key={j.id} type="button" className="hrs-pick" disabled={pending} onClick={() => save(j.id)}>
            <span>{j.title}</span>
            {j.id === running.ticket_id && <small>Started on this</small>}
            {j.done && j.id !== running.ticket_id && <small>Finished</small>}
          </button>
        ))}
        {find.trim() && choices.length === 0 && <p className="hrs-note">No job called that.</p>}
        <button type="button" className="hrs-pick hrs-pick-none" disabled={pending} onClick={() => save(null)}>
          <span>No job</span>
        </button>
      </div>
      {error && <p className="hrs-error" role="alert">{error}</p>}
      <div className="hrs-ask-foot">
        <button type="button" className="btn plain small" onClick={keepGoing} disabled={pending}>Keep timing</button>
        <ConfirmButton label="Don't keep this time" className="link hrs-remove" ask="Throw this time away?" yes="Throw away" onConfirm={discard} disabled={pending} />
      </div>
    </section>
  );
}
