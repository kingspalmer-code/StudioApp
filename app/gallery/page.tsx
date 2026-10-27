import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import SplitHost from "@/components/SplitHost";
import { coversFor } from "@/lib/deliveries";
import { formatDate, isDone } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import type { Ticket } from "@/lib/types";
import Thumb from "@/components/Thumb";
import { galleryItems, taggablePeople, tagNames } from "@/lib/gallery";
import { canPreview } from "@/lib/preview";
import AddToGallery from "./AddToGallery";

// Every finished piece of work someone can see, newest first: the studio and managers see every
// business, a client sees their own businesses. Opening one shows its files to view or download.
// Employees never see jobs, so they have no gallery. On wide screens a job opens in the panel on
// the right, like a job beside the queue.
// The studio can also add pictures straight to the Gallery and tag people on them (lib/gallery.ts):
// those mix in by date, and anyone tagged sees them too, whatever business they're for.
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ year?: string; type?: string; business?: string }> }) {
  const { year, type, business } = await searchParams;
  const { supabase, member, businesses, self, ctx, terms, workspace, shell } = asClient(await requireMember(["manager", "designer", "client"], "requests"));
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  // The database already limits a client to their businesses; this also scopes a studio preview of one client.
  const client = member.role === "client";
  let query = supabase.from("tickets").select(LIST_COLUMNS);
  if (client) query = query.in("business_id", member.business_ids ?? []);
  const studio = member.role === "designer" && !shell.readOnly && !shell.viewing && !shell.preview;
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const [{ data }, added, people] = await Promise.all([
    query.returns<ListTicket[]>(),
    galleryItems(supabase),
    studio ? taggablePeople(supabase, member.email, bizName) : Promise.resolve([]),
  ]);
  // A studio preview of one client shows only what that client would see of their own.
  const pieces = client ? added.filter((i) => (member.business_ids ?? []).includes(i.business_id) || i.tagged.includes(member.email)) : added;
  const names = await tagNames(supabase, pieces.filter((i) => i.tagged.length).map((i) => i.id));
  const finished = (data ?? [])
    .filter((t) => isDone(t, ctx))
    .map((t) => ({ ...t, when: t.delivered_at ?? t.deadline ?? t.updated_at }))
    .sort((a, b) => b.when.localeCompare(a.when));
  // Only finished jobs with files delivered on them: this is a gallery of the work itself.
  const covers = await coversFor(supabase, finished.map((t) => t.id));
  const withFiles = finished.filter((t) => covers[t.id]?.count);
  const bizIds = [...new Set([...withFiles, ...pieces].map((t) => t.business_id))].filter((id) => byId[id]);
  const inBiz = withFiles.filter((t) => !business || t.business_id === business);
  const piecesIn = pieces.filter((i) => !business || i.business_id === business);
  const years = [...new Set([...inBiz.map((t) => t.when), ...piecesIn.map((i) => i.created_at)].map((w) => w.slice(0, 4)))].sort().reverse();
  const types = [...new Set(inBiz.map((t) => t.type))].sort();
  const shown = inBiz.filter((t) => (!year || t.when.startsWith(year)) && (!type || t.type === type));
  // Added pictures have no job type, so a type filter leaves them out.
  const shownPieces = piecesIn.filter((i) => (!year || i.created_at.startsWith(year)) && !type);
  const tagsOf = (id: number) => names.filter((n) => n.item_id === id);
  const cards = [
    ...shown.map((t) => ({ kind: "job" as const, when: t.when, t })),
    ...shownPieces.map((i) => ({ kind: "piece" as const, when: i.created_at, i })),
  ].sort((a, b) => b.when.localeCompare(a.when));
  const href = (b?: string, y?: string, ty?: string) => {
    const q = new URLSearchParams();
    if (b) q.set("business", b);
    if (y) q.set("year", y);
    if (ty) q.set("type", ty);
    return `/gallery${q.size ? `?${q}` : ""}`;
  };

  return (
    <Shell {...shell}>
      <h1 className="large">Gallery</h1>
      <p className="sub">{client ? <>Everything that&apos;s been finished for you, and anything you&apos;re tagged in.</> : workspace.kind === "solo" ? `Every ${terms.job} you've finished.` : <>Everything that&apos;s been finished for your {terms.clients}.</>} Open one to view or download its files.</p>
      {studio && <AddToGallery businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} selfId={self?.id ?? null} people={people} solo={workspace.kind === "solo"} />}
      <div className="archive-filters">
        {bizIds.length > 1 && workspace.kind !== "solo" && (
          <nav className="seg" aria-label={terms.client}>
            <Link href={href(undefined, year, type)} aria-current={!business ? "page" : undefined}>All</Link>
            {bizIds.map((id) => (
              <Link key={id} href={href(id, year, type)} aria-current={business === id ? "page" : undefined}>{byId[id].name}</Link>
            ))}
          </nav>
        )}
        {years.length > 1 && (
          <nav className="seg" aria-label="Year">
            <Link href={href(business, undefined, type)} aria-current={!year ? "page" : undefined}>All years</Link>
            {years.map((y) => <Link key={y} href={href(business, y, type)} aria-current={year === y ? "page" : undefined}>{y}</Link>)}
          </nav>
        )}
        {types.length > 1 && (
          <nav className="seg" aria-label="Type">
            <Link href={href(business, year, undefined)} aria-current={!type ? "page" : undefined}>All types</Link>
            {types.map((ty) => <Link key={ty} href={href(business, year, ty)} aria-current={type === ty ? "page" : undefined}>{ty}</Link>)}
          </nav>
        )}
      </div>
      {cards.length ? (
        <SplitHost>
        <div className="gallery">
          {cards.map((c) => {
            if (c.kind === "piece") {
              const i = c.i;
              const tags = tagsOf(i.id);
              const me = i.tagged.includes(member.email);
              return (
                <Link key={`g${i.id}`} href={`/gallery/${i.id}`} className="gallery-card">
                  <span className="gallery-img">
                    {canPreview(i.mime, i.name) ? <Thumb bucket="deliveries" path={i.path} full={i.view} video={i.mime.startsWith("video/")} canMake={studio} /> : <span>{i.name}</span>}
                  </span>
                  <b>{i.caption || i.name}</b>
                  <small className="when gallery-biz">
                    <BizBadge biz={byId[i.business_id]} size={16} />
                    {byId[i.business_id]?.name ?? (client ? "" : "My business")} · {formatDate(i.created_at)}
                  </small>
                  {tags.length > 0 && (
                    <small className="when gallery-tags">
                      {me ? "You're tagged" : `Tagged: ${tags.map((t) => t.name.split(" ")[0]).join(", ")}`}
                    </small>
                  )}
                </Link>
              );
            }
            const t = c.t;
            return (
              <Link key={t.id} href={`/tickets/${t.id}`} className="gallery-card">
                <span className="gallery-img">
                  {covers[t.id]?.path ? <Thumb bucket="deliveries" path={covers[t.id]!.path!} full={covers[t.id]!.url} /> : <span>{t.type}</span>}
                </span>
                <b>{t.title}</b>
                <small className="when gallery-biz">
                  <BizBadge biz={byId[t.business_id]} size={16} />
                  {byId[t.business_id]?.name ?? ""} · {formatDate(t.when)} · {covers[t.id]!.count} file{covers[t.id]!.count > 1 ? "s" : ""}
                </small>
              </Link>
            );
          })}
        </div>
        </SplitHost>
      ) : (
        <div className="group"><div className="empty">{studio ? "Nothing here yet. Add a picture above, or finish a job." : "Nothing finished yet."}</div></div>
      )}
    </Shell>
  );
}
