"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/priority";
import type { ListedTask } from "@/lib/staff";
import { addTaskNote, confirmStaffTask, removeStaffTask, reopenStaffTask, saveTaskDetails, setStaffTaskDone } from "./actions";
import Submit from "@/components/Submit";

function dueText(due: string | null, today: string): { text: string; late: boolean } | null {
  if (!due) return null;
  const n = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (n < -1) return { text: `${-n} days overdue`, late: true };
  if (n === -1) return { text: "Due yesterday", late: true };
  if (n === 0) return { text: "Due today", late: false };
  if (n === 1) return { text: "Due tomorrow", late: false };
  return { text: `Due ${formatDate(due)}`, late: false };
}

const at = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

const EVENT = { ask: "said it's finished and asked for sign-off", confirm: "signed it off", reopen: "sent it back" };

// One to-do. Tap it to open its notes and replies. An employee ticking a one-off task asks for
// sign-off; the owner confirms it or sends it back. Daily tasks are just ticked for the day.
export default function StaffTaskRow({
  task,
  today,
  me,
  owner,
  canRemove,
  open: startOpen = false,
}: {
  task: ListedTask;
  today: string;
  me: string;
  owner: boolean;
  canRemove: boolean;
  open?: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(startOpen);
  const [editing, setEditing] = useState(false);
  const due = task.state === "todo" ? dueText(task.due, today) : null;
  const replies = task.notes.filter((n) => n.kind === "note").length;
  // An employee can untick until it's signed off; after that only the owner can reopen it.
  const canToggle = owner || task.daily || task.state !== "done";
  return (
    <div id={`t${task.id}`} className={`task staff-task${task.done ? " done" : ""}${open ? " open" : ""}`} style={{ opacity: pending ? 0.5 : 1 }}>
      <button
        type="button"
        className={`check${task.state === "waiting" ? " waiting" : ""}`}
        aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        aria-pressed={task.done}
        disabled={!canToggle}
        onClick={() => start(() => setStaffTaskDone(task.id, task.daily, !task.done, task.title))}
      />
      <div className="main">
        <button type="button" className="staff-open" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="t">{task.title}</span>
          <span className="m">
            {task.daily && <span>Every day</span>}
            {due && <span className={due.late ? "late" : ""}>{due.text}</span>}
            {task.state === "waiting" && <span className="chip-wait">Waiting for sign-off</span>}
            {task.state === "done" && !task.daily && <span className="chip-done">Signed off</span>}
            {task.daily && task.done && task.tick && <span>Done {at(task.tick.done_at)}</span>}
            {owner && task.daily && (
              <span className="week" aria-label={`Done ${task.week.filter(Boolean).length} of the last 7 days`}>
                {task.week.map((d, i) => <i key={i} className={d ? "on" : ""} />)}
              </span>
            )}
            {(task.details || replies > 0) && !open && (
              <span>{[task.details ? "Notes" : "", replies ? `${replies} ${replies === 1 ? "reply" : "replies"}` : ""].filter(Boolean).join(" · ")}</span>
            )}
          </span>
        </button>

        {owner && task.state === "waiting" && (
          <div className="signoff">
            <button type="button" className="btn small" onClick={() => start(() => confirmStaffTask(task.id, task.title))}>Confirm it&apos;s done</button>
            <button type="button" className="btn small plain" onClick={() => setOpen(true)}>Send back…</button>
          </div>
        )}

        {open && (
          <div className="staff-thread">
            {owner && editing ? (
              <form
                className="staff-note"
                action={async (fd) => {
                  await saveTaskDetails(task.id, fd);
                  setEditing(false);
                }}
              >
                <textarea name="details" defaultValue={task.details} placeholder="What needs doing, how, anything to watch out for…" rows={3} autoFocus />
                <Submit className="btn small" type="submit">Save notes</Submit>
              </form>
            ) : task.details ? (
              <div className="staff-details">
                <p>{task.details}</p>
                {owner && <button type="button" className="link" onClick={() => setEditing(true)}>Edit notes</button>}
              </div>
            ) : (
              owner && <button type="button" className="link staff-add-note" onClick={() => setEditing(true)}>Add notes for this task</button>
            )}

            {task.notes.length > 0 && (
              <ul className="staff-replies">
                {task.notes.map((n) => (
                  <li key={n.id} className={`${n.author === me ? "mine" : ""} ${n.kind}`}>
                    {n.kind === "note" ? (
                      <>
                        <span className="who">{n.author === me ? "You" : n.author_name} · {at(n.created_at)}</span>
                        <span className="body">{n.body}</span>
                      </>
                    ) : (
                      <>
                        <span className="event">{n.author === me ? "You" : n.author_name} {EVENT[n.kind]} · {at(n.created_at)}</span>
                        {n.body && <span className="body">{n.body}</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {owner && task.state === "waiting" ? (
              <form action={reopenStaffTask.bind(null, task.id, task.title)} className="staff-reply">
                <textarea name="body" placeholder="Reply, or say what still needs doing and send it back…" rows={2} />
                <span className="staff-reply-btns">
                  <Submit className="btn small plain" type="submit">Send back</Submit>
                  <Submit className="btn small" type="submit" formAction={addTaskNote.bind(null, task.id, task.title)}>Reply</Submit>
                </span>
              </form>
            ) : (
              <form action={addTaskNote.bind(null, task.id, task.title)} className="staff-reply">
                <textarea name="body" placeholder={owner ? "Write a reply…" : "Add a note or ask a question…"} rows={2} required />
                <Submit className="btn small" type="submit">{task.notes.length ? "Reply" : "Add note"}</Submit>
              </form>
            )}
            {canRemove && (
              <button type="button" className="link staff-remove" onClick={() => start(() => removeStaffTask(task.id))}>Remove task</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
