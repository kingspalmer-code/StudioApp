import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import type { App, AppBackground } from "@/lib/apps";
import { asClient, requireMember } from "@/lib/session";
import NewApp from "./NewApp";
import { signedUrls } from "@/lib/signed";

// What "Request an app" starts the Help message with.
const REQUEST = "App request: I'd like an app that ";

// Apps: built-in tools everyone can use (the 3D viewer), then apps made for clients, each belonging
// to one business. Opening one uses it. Everyone has this page, with a way to ask for a new app
// through Help.
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
  const url = await signedUrls(supabase, "apps", paths);
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
      <div className="gallery apps-list">
        {/* Built in: there for everyone, not tied to a client. */}
        <Link href="/apps/3d-viewer" className="gallery-card">
          <span className="gallery-img app-builtin">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M32 8 54 20v24L32 56 10 44V20Z" />
              <path d="M10 20l22 12 22-12M32 32v24" />
            </svg>
          </span>
          <b>3D viewer</b>
          <small className="when">Open STL models to turn, zoom and light</small>
        </Link>
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
    </Shell>
  );
}
