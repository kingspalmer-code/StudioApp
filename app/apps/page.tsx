import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import type { App, AppBackground } from "@/lib/apps";
import { asClient, requireMember } from "@/lib/session";
import NewApp from "./NewApp";

// What "Request an app" starts the Help message with.
const REQUEST = "App request: I'd like an app that ";

// Apps made for clients, each belonging to one business. Opening one uses it. Everyone has this
// page, with a way to ask for a new app through Help.
export default async function AppsPage() {
  const { supabase, member, businesses, terms, workspace, shell, viewing } = asClient(await requireMember());
  const [{ data: apps }, { data: latest }] = await Promise.all([
    supabase.from("apps").select("*").order("created_at").returns<App[]>(),
    supabase.from("app_backgrounds").select("app_id, thumb_path, created_at").order("created_at", { ascending: false }).limit(200).returns<AppBackground[]>(),
  ]);
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  // Each app's card shows the background saved in it most recently.
  const cover: Record<string, string> = {};
  for (const b of latest ?? []) cover[b.app_id] ??= b.thumb_path;
  const paths = Object.values(cover);
  const signed = paths.length ? (await supabase.storage.from("apps").createSignedUrls(paths, 3600)).data ?? [] : [];
  const url = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]));
  // A client (or the studio previewing one) only sees their own businesses' apps.
  const list = (apps ?? []).filter((a) => byId[a.business_id] && (member.role !== "client" || member.business_ids?.includes(a.business_id)));

  return (
    <Shell {...shell}>
      <h1 className="large">Apps</h1>
      <p className="sub">
        {member.role === "designer" ? <>Tools made for your {terms.clients}, one {terms.client} each.</> : "Small tools made to take a fiddly job off your hands."} Got a task you do over and over? Ask for an app that does it for you.
      </p>
      <div className="app-new-wrap">
        {member.role === "designer" && !viewing && businesses.length > 0 && <NewApp businesses={businesses} workspaceId={workspace.id} clientWord={terms.client} />}
        <Link className="btn plain" href={`/help?from=/apps&q=${encodeURIComponent(REQUEST)}`}>Request an app</Link>
      </div>
      {list.length ? (
        <div className="gallery apps-list">
          {list.map((a) => (
            <Link key={a.id} href={`/apps/${a.id}`} className="gallery-card">
              <span className="gallery-img">
                {cover[a.id] && url[cover[a.id]] ? <img src={url[cover[a.id]]} alt="" loading="lazy" /> : <span>Pattern backgrounds</span>}
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
        <div className="group">
          <div className="empty">
            No apps here yet. Tell us what slows you down, such as resizing images, making the same graphic every week or tidying files, and we&apos;ll build an app for it.
          </div>
        </div>
      )}
    </Shell>
  );
}
