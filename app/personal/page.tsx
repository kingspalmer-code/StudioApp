import { redirect } from "next/navigation";

// Personal to-dos moved into To-do (migration 043), the one place for to-dos.
export default function PersonalPage() {
  redirect("/calendar");
}
