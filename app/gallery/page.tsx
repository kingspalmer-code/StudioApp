import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import SplitHost from "@/components/SplitHost";
import { coversFor } from "@/lib/deliveries";
import { formatDate, isDone } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import type { Ticket } from "@/lib/types";

// Every finished piece of work someone can see, newest first: the studio and managers see every
// business, a client sees their own businesses. Read-only: opening one shows its files to view or
// download, nothing here changes anything. Employees never see jobs, so they have no gallery.
// On wide screens a piece opens in the panel on the right, like a job beside the queue.
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ year?: string; type?: string; business?: string }> }) {
  const { year, type, business } = await searchParams;
  const { supabase, member, businesses, ctx, terms, workspace, shell } = asClient(await requireMember(["manager", "designer", "client"], "requests"));
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  // The database already limits a client to their businesses; this also scopes a studio preview of one client.
  const client = member.role === "client";
  let query = supabase.from("tickets").select(LIST_COLUMNS);
  if (client) query = query.in("business_id", member.business_ids ?? []);
  const { data } = await query.returns<ListTicket[]>();
  const finished = (data ?? [])
    .filter((t) => isDone(t, ctx))
    .map((t) => ({ ...t, when: t.delivered_at ?? t.deadline ?? t.updated_at }))
    .sort((a, b) => b.when.localeCompare(a.when));
  // Only finished jobs with files delivered on them: this is a gallery of the work itself.
  const covers = await coversFor(supabase, finished.map((t) => t.id));
  const withFiles = finished.filter((t) => covers[t.id]?.count);
  const bizIds = [...new Set(withFiles.map((t) => t.business_id))].filter((id) => byId[id]);
  const inBiz = withFiles.filter((t) => !business || t.business_id === business);
  const years = [...new Set(inBiz.map((t) => t.when.slice(0, 4)))];
  const types = [...new Set(inBiz.map((t) => t.type))].sort();
  const shown = inBiz.filter((t) => (!year || t.when.startsWith(year)) && (!type || t.type === type));
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
      <p className="sub">{client ? <>Everything that&apos;s been finished for you.</> : workspace.kind === "solo" ? `Every ${terms.job} you've finished.` : <>Everything that&apos;s been finished for your {terms.clients}.</>} Open one to view or download its files.</p>
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
      {shown.length ? (
        <SplitHost>
        <div className="gallery">
          {shown.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="gallery-card">
              <span className="gallery-img">
                {covers[t.id]?.url ? <img src={covers[t.id]!.url!} alt="" loading="lazy" /> : <span>{t.type}</span>}
              </span>
              <b>{t.title}</b>
              <small className="when gallery-biz">
                <BizBadge biz={byId[t.business_id]} size={16} />
                {byId[t.business_id]?.name ?? ""} · {formatDate(t.when)} · {covers[t.id]!.count} file{covers[t.id]!.count > 1 ? "s" : ""}
              </small>
            </Link>
          ))}
        </div>
        </SplitHost>
      ) : (
        <div className="group"><div className="empty">Nothing finished yet.</div></div>
      )}
    </Shell>
  );
}
