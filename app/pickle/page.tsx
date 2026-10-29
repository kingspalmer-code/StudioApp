import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { hatchBase, oatcakesEarned, visitPet } from "@/lib/pet";
import { requireMember } from "@/lib/session";
import PickleWorld from "./PickleWorld";
import "./pickle.css";

export const metadata: Metadata = { title: "Pickle's World" };

// Pickle's own page, through the World key on his widget: the shop (shells, screens, paints and
// clothes), the arcade, and for platform admins the Lab, where earn rates are checked against
// prices. Everything sold lives in lib/pickle/catalogue.ts; the sums are in lib/pet.ts.
export default async function PicklePage() {
  const { supabase, member, ctx, shell, viewing } = await requireMember();
  // Pickle is your own, so there's nothing to show while viewing someone else's workspace.
  if (viewing) redirect("/today");
  const earned = await oatcakesEarned(supabase, member, ctx);
  const pet = await visitPet(supabase, earned, hatchBase(member, earned));
  return (
    <Shell {...shell}>
      <PickleWorld pet={pet} lab={shell.isAdmin} />
    </Shell>
  );
}
