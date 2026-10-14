import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import { KIND_LABEL, type App, type AppBackground, type AppModel } from "@/lib/apps";
import { asClient, requireMember } from "@/lib/session";
import NewApp from "./NewApp";

// Apps made for clients, each belonging to one business. Opening one uses it.
export default async function AppsPage() {
  const { supabase, member, businesses, terms, workspace, shell, viewing } = asClient(await requireMember(["designer", "manager", "client"]));
  const [{ data: apps }, { data: latest }, { data: latestModels }] = await Promise.all([
    supabase.from("apps").select("*").order("created_at").returns<App[]>(),
    supabase.from("app_backgrounds").select("app_id, thumb_path, created_at").order("created_at", { ascending: false }).limit(200).returns<AppBackground[]>(),
    supabase.from("app_models").select("app_id, thumb_path, created_at").not("thumb_path", "is", null).order("created_at", { ascending: false }).limit(200).returns<AppModel[]>(),
  ]);
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  // Each app's card shows the background or model saved in it most recently.
  const cover: Record<string, string> = {};
  for (const b of latest ?? []) cover[b.app_id] ??= b.thumb_path;
  for (const m of latestModels ?? []) if (m.thumb_path) cover[m.app_id] ??= m.thumb_path;
  const paths = Object.values(cover);
  const signed = paths.length ? (await supabase.storage.from("apps").createSignedUrls(paths, 3600)).data ?? [] : [];
  const url = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]));
  // A client (or the studio previewing one) only sees their own businesses' apps.
  const list = (apps ?? []).filter((a) => byId[a.business_id] && (member.role !== "client" || member.business_ids?.includes(a.business_id)));

  return (
    <Shell {...shell}>
      <h1 className="large">Apps</h1>
      <p className="sub">{member.role === "client" ? "Tools made for you. Open one to use it." : <>Tools made for your {terms.clients}, one {terms.client} each. Open one to use it.</>}</p>
      {member.role === "designer" && !viewing && businesses.length > 0 && (
        <div className="app-new-wrap"><NewApp businesses={businesses} workspaceId={workspace.id} clientWord={terms.client} /></div>
      )}
      {list.length ? (
        <div className="gallery apps-list">
          {list.map((a) => (
            <Link key={a.id} href={`/apps/${a.id}`} className="gallery-card">
              <span className={`gallery-img${a.kind === "model" ? " model-cover" : ""}`}>
                {cover[a.id] && url[cover[a.id]] ? <img src={url[cover[a.id]]} alt="" loading="lazy" /> : <span>{KIND_LABEL[a.kind] ?? "App"}</span>}
              </span>
              <b>{a.name}</b>
              <small className="when gallery-biz">
                <BizBadge biz={byId[a.business_id]} size={16} />
                {byId[a.business_id].name}
              </small>
            </Link>
          ))}
        </div>
      ) : (
        <div className="group"><div className="empty">No apps yet.{member.role === "designer" ? " Make one for a " + terms.client + " to get started." : ""}</div></div>
      )}
    </Shell>
  );
}
