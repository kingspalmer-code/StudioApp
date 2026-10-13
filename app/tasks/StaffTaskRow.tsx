"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/priority";
import type { ListedTask } from "@/lib/staff";
import { removeStaffTask, saveStaffNote, setStaffTaskDone } from "./actions";
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
  new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

// One to-do: tick it off, then say how it went. The owner sees the same row, with the note and,
// for daily tasks, which of the last seven days it got done.
export default function StaffTaskRow({ task, today, canRemove, showWeek }: { task: ListedTask; today: string; canRemove: boolean; showWeek?: boolean }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const due = task.done ? null : dueText(task.due, today);
  const note = task.tick?.note ?? "";
  return (
    <div className={`task staff-task${task.done ? " done" : ""}`} style={{ opacity: pending ? 0.5 : 1 }}>
      <button
        type="button"
        className="check"
        aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        aria-pressed={task.done}
        onClick={() => start(() => setStaffTaskDone(task.id, task.daily, !task.done))}
      />
      <div className="main">
        <span className="t">{task.title}</span>
        <span className="m">
          {task.daily && <span>Every day</span>}
          {due && <span className={due.late ? "late" : ""}>{due.text}</span>}
          {task.done && task.tick && <span>Done {at(task.tick.done_at)}</span>}
          {showWeek && task.daily && (
            <span className="week" aria-label={`Done ${task.week.filter(Boolean).length} of the last 7 days`}>
              {task.week.map((d, i) => <i key={i} className={d ? "on" : ""} />)}
            </span>
          )}
        </span>
        {task.done && task.tick && (editing ? (
          <form
            className="staff-note"
            action={async (fd) => {
              await saveStaffNote(task.id, task.tick!.day, fd);
              setEditing(false);
            }}
          >
            <textarea name="note" defaultValue={note} placeholder="How did it go? Anything to flag?" rows={2} autoFocus />
            <Submit className="btn small" type="submit">Save note</Submit>
          </form>
        ) : note ? (
          <button type="button" className="staff-note-text" onClick={() => setEditing(true)} title="Edit note">{note}</button>
        ) : (
          <button type="button" className="link staff-add-note" onClick={() => setEditing(true)}>Add a note</button>
        ))}
      </div>
      {canRemove && (
        <div className="task-tools">
          <button type="button" className="del" aria-label={`Remove "${task.title}"`} onClick={() => start(() => removeStaffTask(task.id))}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
