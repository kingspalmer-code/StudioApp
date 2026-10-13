import { redirect } from "next/navigation";
import OatcakeLogo from "@/components/OatcakeLogo";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";
import { clientsLogIn } from "@/lib/workspace";
import { signOut } from "../actions";

// Where clients and managers land when the workspace they belong to no longer takes requests from
// businesses (its owner switched to Customers or Just me). Nothing is deleted; switching back lets them in again.
export default async function PausedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: row } = await supabase
    .from("members")
    .select("role, workspaces(name, kind, owner_name)")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle<{ role: string; workspaces: Pick<Workspace, "name" | "kind" | "owner_name"> | null }>();
  if (!row) redirect("/welcome");
  if (row.role === "designer" || !row.workspaces || clientsLogIn(row.workspaces.kind)) redirect("/");
  const who = row.workspaces.owner_name || row.workspaces.name;

  return (
    <main className="auth">
      <div className="login-logo"><OatcakeLogo height={30} /></div>
      <h1 className="large">Your access is paused</h1>
      <p className="sub">
        {row.workspaces.name} isn&apos;t taking requests through Oatcake at the moment, so there&apos;s nothing to see here for now.
        Your past requests are kept safe. Get in touch with {who} directly if you need anything.
      </p>
      <form action={signOut}><button className="btn">Sign out</button></form>
    </main>
  );
}
