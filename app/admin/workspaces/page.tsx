import Shell from "@/components/Shell";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/priority";
import type { Workspace } from "@/lib/types";
import { viewWorkspace } from "../actions";
import AdminNav from "../AdminNav";
import CreateWorkspace from "../CreateWorkspace";

export default async function AdminWorkspaces() {
  const { supabase, shell } = await requireAdmin();
  const [{ data }, { data: sum }] = await Promise.all([
    supabase.from("workspaces").select("*").order("created_at").returns<(Workspace & { created_at: string })[]>(),
    supabase.rpc("admin_summary").single<{ unread_help: number }>(),
  ]);

  return (
    <Shell {...shell}>
      <AdminNav current="workspaces" unread={sum?.unread_help} />
      <h1 className="large">Workspaces</h1>
      <p className="sub">Everyone using Oatcake. Set someone up here, then tell them to sign in at oatcake.xyz with their email. View opens a workspace read-only, so you can see how it&apos;s going without changing anything.</p>
      <div className="cols">
        <div>
          <p className="eyebrow">All workspaces</p>
          <div className="group">
            {(data ?? []).map((w) => (
              <div className="row" key={w.id}>
                <div className="ctl">
                  <div style={{ fontWeight: 600 }}>{w.name}</div>
                  <div className="when">{w.kind === "trade" ? "Trade" : "Design studio"} · {w.owner_name || "No name"} · since {formatDate(w.created_at)}</div>
                </div>
                {w.id !== shell.member.workspace_id && (
                  <form action={viewWorkspace.bind(null, w.id)}>
                    <button className="btn small" type="submit">View</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
        <CreateWorkspace />
      </div>
    </Shell>
  );
}
