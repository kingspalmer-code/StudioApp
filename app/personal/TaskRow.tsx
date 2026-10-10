"use client";

import { useTransition } from "react";
import { deleteTask, setTaskDone, setTaskDue, setTaskFlag } from "./actions";
import type { PersonalProject, PersonalTask } from "@/lib/types";

export default function TaskRow({
  task,
  project,
  dueLabel,
  overdue,
}: {
  task: PersonalTask;
  project?: PersonalProject;
  dueLabel: string | null;
  overdue: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className={`task${task.done ? " done" : ""}`} style={{ opacity: pending ? 0.5 : 1 }}>
      <button
        type="button"
        className="check"
        aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        aria-pressed={task.done}
        onClick={() => start(() => setTaskDone(task.id, !task.done))}
        style={project ? ({ "--check": project.color } as React.CSSProperties) : undefined}
      />
      <div className="main">
        <span className="t">{task.title}</span>
        <span className="m">
          {dueLabel && <span className={overdue && !task.done ? "late" : ""}>{dueLabel}</span>}
          {project && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span className="dot" style={{ background: project.color, width: 7, height: 7 }} />
              {project.name}
            </span>
          )}
        </span>
      </div>
      <div className="task-tools">
        <button
          type="button"
          className={`flag${task.flagged ? " on" : ""}`}
          aria-label={task.flagged ? "Unflag" : "Flag"}
          aria-pressed={task.flagged}
          onClick={() => start(() => setTaskFlag(task.id, !task.flagged))}
        >
          ⚑
        </button>
        <input
          type="date"
          aria-label="Due date"
          value={task.due ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            start(() => setTaskDue(task.id, v));
          }}
        />
        <button type="button" className="del" aria-label={`Delete "${task.title}"`} onClick={() => start(() => deleteTask(task.id))}>
          ×
        </button>
      </div>
    </div>
  );
}
