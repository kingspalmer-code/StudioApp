import Link from "next/link";
import Shell from "@/components/Shell";
import Submit from "@/components/Submit";
import { requireMember } from "@/lib/session";
import { modeTitle } from "@/lib/workspace";
import { renameWorkspace } from "../actions";
import SectionHead from "../SectionHead";
import WorkMode from "../WorkMode";

export default async function WorkspaceSettingsPage() {
  const { supabase, terms, workspace, shell, viewing } = await requireMember(["designer"]);
  // Clients and managers, whose logins pause if the workspace stops taking requests from businesses.
  const { count: loggedIn } = await supabase.from("members").select("email", { count: "exact", head: true }).in("role", ["client", "manager"]);

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 640 }}>
        <SectionHead title="Workspace" />

        <p className="eyebrow">Name</p>
        <form action={renameWorkspace}>
          <div className="group">
            <div className="row">
              <label htmlFor="ws-name">Name</label>
              <div className="ctl"><input id="ws-name" name="name" defaultValue={workspace.name} required /></div>
              <Submit className="link" type="submit">Save</Submit>
            </div>
          </div>
        </form>
        {workspace.kind !== "solo" && (
          <p className="foot">
            {terms.Clients} and their contact details are on the <Link href="/customers">{terms.Clients} page</Link>.
          </p>
        )}

        <p className="eyebrow">How you work</p>
        {viewing ? (
          <div className="group"><div className="row"><div className="ctl">{modeTitle(workspace.kind)}</div></div></div>
        ) : (
          <WorkMode kind={workspace.kind} loggedIn={loggedIn ?? 0} />
        )}
        <p className="foot">
          Sets the words Oatcake uses and who can send you {terms.jobs}. Switching never deletes anything.
        </p>
      </div>
    </Shell>
  );
}
