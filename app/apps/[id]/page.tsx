import Link from "next/link";
import { notFound } from "next/navigation";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import type { App, AppBackground } from "@/lib/apps";
import { requireMember } from "@/lib/session";
import PatternApp from "./PatternApp";

// One app. Pattern apps: recolour the client's pattern and save it to their gallery of backgrounds.
export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, member, businesses, shell, viewing } = await requireMember(["designer", "manager"]);
  const [{ data: app }, { data: saved }] = await Promise.all([
    supabase.from("apps").select("*").eq("id", id).maybeSingle<App>(),
    supabase.from("app_backgrounds").select("*").eq("app_id", id).order("created_at", { ascending: false }).returns<AppBackground[]>(),
  ]);
  const biz = businesses.find((b) => b.id === app?.business_id);
  if (!app || !biz) notFound();
  const list = saved ?? [];
  const bucket = supabase.storage.from("apps");
  const [source, thumbs, downloads] = await Promise.all([
    app.source_path ? bucket.createSignedUrl(app.source_path, 3600).then((r) => r.data?.signedUrl ?? null) : Promise.resolve(null),
    list.length ? bucket.createSignedUrls(list.map((b) => b.thumb_path), 3600).then((r) => r.data ?? []) : Promise.resolve([]),
    list.length ? bucket.createSignedUrls(list.flatMap((b) => [b.image_path, b.svg_path]), 3600, { download: true }).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const url = Object.fromEntries([...thumbs, ...downloads].filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  const backgrounds = list.map((b) => ({ ...b, thumb: url[b.thumb_path] ?? "", jpg: url[b.image_path] ?? "", svg: url[b.svg_path] ?? "" }));
  const canEdit = member.role === "designer" && !viewing;

  return (
    <Shell {...shell}>
      <p className="eyebrow"><Link href="/apps">Apps</Link></p>
      <h1 className="large app-title">{app.name}</h1>
      <p className="sub gallery-biz"><BizBadge biz={biz} size={18} /> {biz.name}</p>
      <PatternApp app={app} slug={biz.slug} source={source} backgrounds={backgrounds} canEdit={canEdit} />
    </Shell>
  );
}
