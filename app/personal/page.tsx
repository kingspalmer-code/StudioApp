import Link from "next/link";
import Shell from "@/components/Shell";
import { daysFromToday, formatDate, todayISO } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { PersonalProject, PersonalTask } from "@/lib/types";
import { addProject, addTask, archiveProject } from "./actions";
import TaskRow from "./TaskRow";
import Submit from "@/components/Submit";

const COLORS = ["#382a25", "#d9822b", "#3f8f4f", "#3a6ea5", "#94508f", "#c8456b"];

function dueText(due: string | null): string | null {
  if (!due) return null;
  const n = daysFromToday(due);
  if (n < -1) return `${-n} days overdue`;
  if (n === -1) return "Yesterday";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return new Date(due + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
  return formatDate(due);
}

export default async function PersonalPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "today" } = await searchParams;
  const { supabase, member, businesses, shell } = await requireMember(["designer"]);
  const [{ data: taskRows }, { data: projectRows }] = await Promise.all([
    supabase.from("personal_tasks").select("*").order("due", { ascending: true, nullsFirst: false }).order("created_at").returns<PersonalTask[]>(),
    supabase.from("personal_projects").select("*").eq("archived", false).order("created_at").returns<PersonalProject[]>(),
  ]);
  const tasks = taskRows ?? [];
  const projects = projectRows ?? [];
  const byProject = Object.fromEntries(projects.map((p) => [p.id, p]));
  const open = tasks.filter((t) => !t.done);
  const today = todayISO();

  const lists = {
    today: open.filter((t) => t.due && t.due <= today),
    upcoming: open.filter((t) => t.due && t.due > today),
    anytime: open.filter((t) => !t.due),
    flagged: open.filter((t) => t.flagged),
    done: tasks
      .filter((t) => t.done)
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""))
      .slice(0, 30),
  };
  const projectId = view.startsWith("p") ? Number(view.slice(1)) : null;
  const project = projectId ? byProject[projectId] : undefined;

  const views: { id: string; label: string; n: number; color: string }[] = [
    { id: "today", label: "Today", n: lists.today.length, color: "var(--blue)" },
    { id: "upcoming", label: "Upcoming", n: lists.upcoming.length, color: "var(--red)" },
    { id: "anytime", label: "Anytime", n: lists.anytime.length, color: "var(--label-2)" },
    { id: "flagged", label: "Flagged", n: lists.flagged.length, color: "var(--orange)" },
    { id: "done", label: "Completed", n: tasks.filter((t) => t.done).length, color: "var(--green)" },
  ];

  let shown: PersonalTask[];
  let title: string;
  if (project) {
    shown = open.filter((t) => t.project_id === project.id);
    title = project.name;
  } else {
    shown = lists[(view in lists ? view : "today") as keyof typeof lists];
    title = views.find((v) => v.id === view)?.label ?? "Today";
  }

  // Group upcoming by day so the list reads like a calendar.
  const groups: { label: string; items: PersonalTask[] }[] = [];
  if (view === "upcoming") {
    for (const t of shown) {
      const label = dueText(t.due) ?? "";
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(t);
      else groups.push({ label, items: [t] });
    }
  } else groups.push({ label: "", items: shown });

  const doneInProject = project ? tasks.filter((t) => t.project_id === project.id && t.done).length : 0;

  return (
    <Shell {...shell}>
      <p className="sub" style={{ margin: "0 0 4px" }}>Only you can see this.</p>
      <div className="personal">
        <aside>
          {tasks.length > 0 && <div className="smart">
            {views.map((v) => (
              <Link key={v.id} href={`/personal?view=${v.id}`} className="smart-tile" aria-current={view === v.id ? "page" : undefined}>
                <span className="dot" style={{ background: v.color, width: 10, height: 10 }} />
                <b>{v.n}</b>
                <span>{v.label}</span>
              </Link>
            ))}
          </div>}
          <p className="eyebrow">Projects</p>
          <div className="group">
            {projects.map((p) => {
              const n = open.filter((t) => t.project_id === p.id).length;
              return (
                <Link key={p.id} href={`/personal?view=p${p.id}`} className="row proj" aria-current={projectId === p.id ? "page" : undefined}>
                  <span className="dot" style={{ background: p.color, width: 12, height: 12 }} />
                  <span className="ctl">{p.name}</span>
                  <span className="when">{n}</span>
                </Link>
              );
            })}
            <form action={addProject} className="row">
              <div className="ctl"><input name="name" aria-label="New project name" placeholder="New project" required /></div>
              <select name="color" aria-label="Colour" className="swatch-select">
                {COLORS.map((c, i) => <option key={c} value={c}>{["Oat", "Amber", "Green", "Blue", "Plum", "Rose"][i]}</option>)}
              </select>
              <Submit className="link" type="submit">Add</Submit>
            </form>
          </div>
        </aside>

        <section>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
            <h1 className="large" style={project ? { color: project.color } : undefined}>{title}</h1>
            {project && (
              <form action={archiveProject.bind(null, project.id)}>
                <Submit className="btn plain small" type="submit">Archive project</Submit>
              </form>
            )}
          </div>
          {project && (
            <p className="sub">{shown.length} to do · {doneInProject} done</p>
          )}

          {view !== "done" && (
            <form action={addTask} className="group quick">
              <input type="hidden" name="project_id" value={project?.id ?? ""} />
              <input type="hidden" name="default_due" value={view === "today" ? today : ""} />
              <div className="row">
                <span className="check ghost" aria-hidden="true" />
                <div className="ctl">
                  <input name="title" aria-label="New to-do" placeholder={`Add a to-do${view === "today" ? " for today" : ""}… try "Call printer tomorrow !"`} required autoComplete="off" />
                </div>
                <Submit className="link" type="submit">Add</Submit>
              </div>
            </form>
          )}

          {groups.map((g) => (
            <div key={g.label || "all"}>
              {g.label && <p className="eyebrow">{g.label}</p>}
              <div className="group" style={{ marginTop: g.label ? 0 : 12 }}>
                {g.items.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={t.project_id && !project ? byProject[t.project_id] : undefined}
                    dueLabel={view === "upcoming" ? null : dueText(t.due)}
                    overdue={!!t.due && t.due < today}
                  />
                ))}
                {!g.items.length && (
                  <div className="empty">
                    {view === "today" ? "Nothing due today." : view === "done" ? "Nothing ticked off yet." : "Nothing here yet."}
                  </div>
                )}
              </div>
            </div>
          ))}
          {view === "today" && (
            <p className="foot">Add "tomorrow", a weekday or "next week" to set a date, and "!" to flag it.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}
