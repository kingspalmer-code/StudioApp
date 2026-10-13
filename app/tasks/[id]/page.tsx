import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";

// Where alerts about a task point: the employee's own list, or that employee's list on Team.
export default async function TaskLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member } = await requireMember(["designer", "staff"]);
  if (member.role === "staff") redirect(`/tasks?open=${Number(id)}#t${Number(id)}`);
  const { data } = await supabase.from("staff_tasks").select("assignee").eq("id", Number(id)).maybeSingle<{ assignee: string }>();
  redirect(data ? `/team?who=${encodeURIComponent(data.assignee)}&open=${Number(id)}#t${Number(id)}` : "/team");
}
