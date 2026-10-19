import { redirect } from "next/navigation";

// Employees' to-do list now sits at the top of To-do, above their own to-dos and the calendar.
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  redirect(Number(open) ? `/calendar?task=${Number(open)}#t${Number(open)}` : "/calendar");
}
