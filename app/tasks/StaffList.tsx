import Submit from "@/components/Submit";
import type { loadStaffList } from "@/lib/staff";
import { addStaffTask } from "./actions";
import StaffTaskRow from "./StaffTaskRow";

type List = Awaited<ReturnType<typeof loadStaffList>>;

// How far through their list someone is: signed off (and today's daily tasks done), waiting for
// sign-off, and still to do.
export function Progress({ progress }: { progress: List["progress"] }) {
  const { done, waiting, todo, late } = progress;
  const total = done + waiting + todo;
  if (!total) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="staff-progress" aria-label={`${done} of ${total} done`}>
      <div className="bar">
        <i className="done" style={{ width: pct(done) }} />
        <i className="waiting" style={{ width: pct(waiting) }} />
      </div>
      <p>
        <b>{Math.round((done / total) * 100)}%</b> done · {done} of {total}
        {waiting > 0 && <span className="w"> · {waiting} waiting for sign-off</span>}
        {late > 0 && <span className="late"> · {late} overdue</span>}
      </p>
    </div>
  );
}

// An employee's list, as they see it on To-do and as the owner sees it on Team. On To-do the
// employee adds their own things to the list below it instead, so adding here is switched off.
export default function StaffList({ list, assignee, me, owner, open, adding = true }: { list: List; assignee: string; me: string; owner: boolean; open?: number; adding?: boolean }) {
  const { daily, waiting, todo, done, today, progress } = list;
  const row = (t: List["todo"][number]) => (
    <StaffTaskRow key={t.id} task={t} today={today} me={me} owner={owner} canRemove={owner || t.created_by === me} open={t.id === open} />
  );
  return (
    <>
      <Progress progress={progress} />
      {adding && <form action={addStaffTask} className="group quick staff-add">
        <input type="hidden" name="assignee" value={assignee} />
        <div className="row">
          <span className="check ghost" aria-hidden="true" />
          <div className="ctl">
            <input name="title" aria-label="New task" placeholder="Add a task…" required autoComplete="off" maxLength={300} />
          </div>
        </div>
        <div className="row">
          <div className="ctl">
            <textarea name="details" aria-label="Notes for this task" placeholder="Notes (optional): what needs doing, how…" rows={1} maxLength={2000} />
          </div>
        </div>
        <div className="row staff-add-opts">
          <label className="staff-opt">
            Due <input type="date" name="due" aria-label="Due date" />
          </label>
          <label className="staff-opt">
            <input type="checkbox" name="daily" /> Every day
          </label>
          <Submit className="btn small" type="submit">Add</Submit>
        </div>
      </form>}

      {waiting.length > 0 && (
        <>
          <p className="eyebrow">{owner ? "Ready for you to sign off" : "Waiting for sign-off"}</p>
          <div className="group">{waiting.map(row)}</div>
        </>
      )}

      {daily.length > 0 && (
        <>
          <p className="eyebrow">Every day · {daily.filter((t) => t.done).length} of {daily.length} done today</p>
          <div className="group">{daily.map(row)}</div>
        </>
      )}

      <p className="eyebrow">To do</p>
      <div className="group">
        {todo.map(row)}
        {!todo.length && <div className="empty">{owner ? "Nothing on their list. Add a task above." : "All done. Nice work."}</div>}
      </div>

      {done.length > 0 && (
        <>
          <p className="eyebrow">Signed off</p>
          <div className="group">{done.map(row)}</div>
        </>
      )}
      <p className="foot">
        {owner
          ? "When a task is ticked off it waits for you to confirm it. Tasks set to every day come back unticked each morning."
          : "Ticking a task off asks for it to be signed off. Tap a task to see its notes or reply. Tasks set to every day come back unticked each morning."}
      </p>
    </>
  );
}
