import { redirect } from "next/navigation";
import { HOME, requireMember } from "@/lib/session";

export default async function Home() {
  const { member } = await requireMember();
  redirect(HOME[member.role]);
}
