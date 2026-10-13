import Submit from "@/components/Submit";
import type { loadStaffList } from "@/lib/staff";
import { addStaffTask } from "./actions";
import StaffTaskRow from "./StaffTaskRow";

type List = Awaited<ReturnType<typeof loadStaffList>>;

// An employee's list, as they see it on To-do and as the owner sees it on Team.
export default function StaffList({ list, assignee, me, owner }: { list: List; assignee: string; me: string; owner: boolean }) {
  const { daily, todo, done, today } = list;
  const row = (t: List["todo"][number]) => (
    <StaffTaskRow key={t.id} task={t} today={today} canRemove={owner || t.created_by === me} showWeek={owner} />
  );
  return (
    <>
      <form action={addStaffTask} className="group quick staff-add">
        <input type="hidden" name="assignee" value={assignee} />
        <div className="row">
          <span className="check ghost" aria-hidden="true" />
          <div className="ctl">
            <input name="title" aria-label="New task" placeholder="Add a task…" required autoComplete="off" maxLength={300} />
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
      </form>

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
          <p className="eyebrow">Done</p>
          <div className="group">{done.map(row)}</div>
        </>
      )}
      <p className="foot">Tasks set to every day come back unticked each morning.</p>
    </>
  );
}
