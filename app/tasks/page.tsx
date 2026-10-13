import Shell from "@/components/Shell";
import { requireMember } from "@/lib/session";
import { loadStaffList } from "@/lib/staff";
import StaffList from "./StaffList";

// An employee's own to-do list: everything the owner set them, plus anything they add themselves.
export default async function TasksPage() {
  const { supabase, member, workspace, shell } = await requireMember(["staff"]);
  const list = await loadStaffList(supabase, member.email);
  const first = (member.full_name || "").split(" ")[0];
  return (
    <Shell {...shell}>
      <h1 className="large">{first ? `${first}'s to-do` : "Your to-do"}</h1>
      <p className="sub">Set by {workspace.owner_name || workspace.name}. Tick things off as you go, and add a note to say how it went.</p>
      <div className="staff-list">
        <StaffList list={list} assignee={member.email} me={member.email} owner={false} />
      </div>
    </Shell>
  );
}
