import Link from "next/link";
import { notFound } from "next/navigation";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import type { App, AppBackground, AppModel } from "@/lib/apps";
import { asClient, requireMember } from "@/lib/session";
import ModelApp from "./ModelApp";
import PatternApp from "./PatternApp";

// One app. Pattern apps: recolour the client's pattern and save it to their gallery of backgrounds.
// 3D viewer apps: a gallery of STL models to turn, zoom and download.
export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, member, businesses, shell, viewing } = asClient(await requireMember(["designer", "manager", "client"]));
  const [{ data: app }, { data: saved }, { data: savedModels }] = await Promise.all([
    supabase.from("apps").select("*").eq("id", id).maybeSingle<App>(),
    supabase.from("app_backgrounds").select("*").eq("app_id", id).order("created_at", { ascending: false }).returns<AppBackground[]>(),
    supabase.from("app_models").select("*").eq("app_id", id).order("created_at", { ascending: false }).returns<AppModel[]>(),
  ]);
  const biz = businesses.find((b) => b.id === app?.business_id);
  if (!app || !biz || (member.role === "client" && !member.business_ids?.includes(biz.id))) notFound();
  const list = saved ?? [];
  const bucket = supabase.storage.from("apps");
  const canEdit = member.role === "designer" && !viewing;
  const header = (
    <>
      <p className="eyebrow"><Link href="/apps">Apps</Link></p>
      <h1 className="large app-title">{app.name}</h1>
      <p className="sub gallery-biz"><BizBadge biz={biz} size={18} /> {biz.name}</p>
    </>
  );

  if (app.kind === "model") {
    const ms = savedModels ?? [];
    const thumbPaths = ms.flatMap((m) => (m.thumb_path ? [m.thumb_path] : []));
    const [views, mthumbs, files] = await Promise.all([
      ms.length ? bucket.createSignedUrls(ms.map((m) => m.file_path), 3600).then((r) => r.data ?? []) : Promise.resolve([]),
      thumbPaths.length ? bucket.createSignedUrls(thumbPaths, 3600).then((r) => r.data ?? []) : Promise.resolve([]),
      ms.length ? bucket.createSignedUrls(ms.map((m) => m.file_path), 3600, { download: true }).then((r) => r.data ?? []) : Promise.resolve([]),
    ]);
    const signed = (list: { path: string | null; signedUrl: string | null }[]) => Object.fromEntries(list.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
    const [view, thumb, file] = [signed(views), signed(mthumbs), signed(files)];
    const models = ms.map((m) => ({ ...m, view: view[m.file_path] ?? "", download: file[m.file_path] ?? "", thumb: m.thumb_path ? thumb[m.thumb_path] ?? "" : "" }));
    return (
      <Shell {...shell}>
        {header}
        <ModelApp app={app} slug={biz.slug} models={models} canEdit={canEdit} />
      </Shell>
    );
  }

  const [source, thumbs, downloads] = await Promise.all([
    app.source_path ? bucket.createSignedUrl(app.source_path, 3600).then((r) => r.data?.signedUrl ?? null) : Promise.resolve(null),
    list.length ? bucket.createSignedUrls(list.map((b) => b.thumb_path), 3600).then((r) => r.data ?? []) : Promise.resolve([]),
    list.length ? bucket.createSignedUrls(list.flatMap((b) => [b.image_path, b.svg_path]), 3600, { download: true }).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const url = Object.fromEntries([...thumbs, ...downloads].filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  const backgrounds = list.map((b) => ({ ...b, thumb: url[b.thumb_path] ?? "", jpg: url[b.image_path] ?? "", svg: url[b.svg_path] ?? "" }));
  // Clients make and download backgrounds; only the studio removes them or changes the app.
  const canMake = (member.role === "designer" || member.role === "client") && !viewing;

  return (
    <Shell {...shell}>
      {header}
      <PatternApp app={app} slug={biz.slug} source={source} backgrounds={backgrounds} canEdit={canEdit} canMake={canMake} />
    </Shell>
  );
}
