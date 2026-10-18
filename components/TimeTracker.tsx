"use client";

import { useEffect, useState, useTransition } from "react";
import { byPerson, fmtClock, fmtMinutes, parseDuration, totalMinutes, type TimeLog } from "@/lib/hours";
import ConfirmButton from "./ConfirmButton";
import { logTime, removeTimeLog, startTimer, stopTimer } from "@/app/hours/actions";

const OFFLINE = "Couldn't save that. Check your connection.";

// Hours worked on one job or one to-do: the total so far, a timer, a box to type time in, and
// the entries. The caller keeps the list, so the calendar can show a running timer elsewhere too.
export default function TimeTracker({
  logs,
  setLogs,
  ticketId,
  planItemId,
  me,
  names = {},
  canEditAll = false,
  readOnly = false,
  today,
}: {
  logs: TimeLog[];
  setLogs: (update: (all: TimeLog[]) => TimeLog[]) => void;
  ticketId?: number | null;
  planItemId?: number | null;
  me: string;
  names?: Record<string, string>;
  canEditAll?: boolean;
  readOnly?: boolean;
  today: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const running = logs.find((l) => l.minutes === null && l.who === me);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const total = totalMinutes(logs, now);
  const people = byPerson(logs, now);
  const nameOf = (email: string) => (email === me ? "You" : names[email] ?? email);

  const replace = (fresh: TimeLog[]) => setLogs((all) => [...fresh, ...all.filter((l) => !fresh.some((f) => f.id === l.id))]);

  function log() {
    const minutes = parseDuration(typed);
    if (!minutes) return setError("Type a time, like 1.5, 1:30 or 45m.");
    setError("");
    startTransition(async () => {
      const r = await logTime({ ticket_id: ticketId ?? null, plan_item_id: planItemId ?? null, minutes, note }).catch(() => ({ error: OFFLINE, log: undefined }));
      if (r.error || !r.log) return setError(r.error || "Couldn't log that.");
      replace([r.log]);
      setTyped("");
      setNote("");
    });
  }

  function start() {
    startTransition(async () => {
      const r = await startTimer({ ticket_id: ticketId ?? null, plan_item_id: planItemId ?? null }).catch(() => ({ error: OFFLINE, log: undefined, stopped: undefined }));
      if (r.error || !r.log) return setError(r.error || "Couldn't start the timer.");
      setNow(Date.now());
      replace([r.log, ...(r.stopped ?? [])]);
    });
  }

  function stop(id: number) {
    startTransition(async () => {
      const r = await stopTimer(id).catch(() => ({ error: OFFLINE, log: undefined }));
      if (r.error || !r.log) return setError(r.error || "Couldn't stop the timer.");
      replace([r.log]);
    });
  }

  function remove(id: number) {
    const before = logs.find((l) => l.id === id);
    setLogs((all) => all.filter((l) => l.id !== id));
    startTransition(async () => {
      const r = await removeTimeLog(id).catch(() => ({ error: OFFLINE }));
      if (r.error && before) {
        setError(r.error);
        setLogs((all) => [before, ...all]);
      }
    });
  }

  const sorted = [...logs].sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id);
  return (
    <div className="tt">
      <div className="tt-top">
        <div className="tt-total">
          <b>{fmtMinutes(total)}</b>
          <span>{people.length > 1 ? people.map((p) => `${nameOf(p.who)} ${fmtMinutes(p.minutes)}`).join(" · ") : "logged so far"}</span>
        </div>
        {!readOnly &&
          (running ? (
            <button type="button" className="tt-btn stop" disabled={pending} onClick={() => stop(running.id)}>
              <i /> {fmtClock(now - Date.parse(running.started_at!))} · Stop
            </button>
          ) : (
            <button type="button" className="tt-btn" disabled={pending} onClick={start}>▶ Start timer</button>
          ))}
      </div>
      {!readOnly && (
        <form className="tt-log" onSubmit={(e) => { e.preventDefault(); log(); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Hours, e.g. 1.5" aria-label="Time worked" inputMode="decimal" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What on (optional)" aria-label="What on" maxLength={500} />
          <button type="submit" disabled={pending || !typed.trim()}>Log</button>
        </form>
      )}
      {error && <p className="tt-error">{error}</p>}
      {sorted.length > 0 && (
        <ul className="tt-list">
          {sorted.slice(0, 30).map((l) => (
            <li key={l.id}>
              <span className="tt-when">{l.day === today ? "Today" : new Date(l.day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              <span className="tt-what">
                {l.minutes === null ? "Timer running" : fmtMinutes(l.minutes)}
                {l.note && <small>{l.note}</small>}
              </span>
              <span className="tt-who">{nameOf(l.who)}</span>
              {!readOnly && l.minutes !== null && (l.who === me || canEditAll) && (
                <ConfirmButton label="×" className="tt-x" ask="Remove?" yes="Remove" onConfirm={() => remove(l.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
