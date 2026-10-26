import { redirect } from "next/navigation";
import { homeFor, requireMember } from "@/lib/session";

export default async function Home() {
  const { member, mode } = await requireMember();
  redirect(homeFor(member.role, mode));
}
