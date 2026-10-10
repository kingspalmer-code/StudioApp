import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { coversFor } from "@/lib/deliveries";
import { formatDate, isDone } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Ticket } from "@/lib/types";

// Every finished project for this business as a gallery, newest first, to look back on or download again.
export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ year?: string; type?: string }> }) {
  const { year, type } = await searchParams;
  const { supabase, member, ctx, shell } = await requireMember();
  if (member.role !== "client") redirect("/");
  const { data } = await supabase.from("tickets").select("*").returns<Ticket[]>();
  const finished = (data ?? [])
    .filter((t) => isDone(t, ctx))
    .map((t) => ({ ...t, when: t.delivered_at ?? t.deadline }))
    .sort((a, b) => b.when.localeCompare(a.when));
  const years = [...new Set(finished.map((t) => t.when.slice(0, 4)))];
  const types = [...new Set(finished.map((t) => t.type))].sort();
  const shown = finished.filter((t) => (!year || t.when.startsWith(year)) && (!type || t.type === type));
  const covers = await coversFor(supabase, shown.map((t) => t.id));
  const href = (y?: string, ty?: string) => {
    const q = new URLSearchParams();
    if (y) q.set("year", y);
    if (ty) q.set("type", ty);
    return `/portal/archive${q.size ? `?${q}` : ""}`;
  };

  return (
    <Shell {...shell}>
      <div className="portal">
        <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/portal">‹ Requests</Link></p>
        <h1 className="large">Archive</h1>
        <p className="sub">Everything that&apos;s been finished for you. Open one to view or download its files again.</p>
        {(years.length > 1 || types.length > 1) && (
          <div className="archive-filters">
            {years.length > 1 && (
              <nav className="seg" aria-label="Year">
                <Link href={href(undefined, type)} aria-current={!year ? "page" : undefined}>All years</Link>
                {years.map((y) => <Link key={y} href={href(y, type)} aria-current={year === y ? "page" : undefined}>{y}</Link>)}
              </nav>
            )}
            {types.length > 1 && (
              <nav className="seg" aria-label="Type">
                <Link href={href(year, undefined)} aria-current={!type ? "page" : undefined}>All types</Link>
                {types.map((ty) => <Link key={ty} href={href(year, ty)} aria-current={type === ty ? "page" : undefined}>{ty}</Link>)}
              </nav>
            )}
          </div>
        )}
        {shown.length ? (
          <div className="gallery">
            {shown.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="gallery-card">
                <span className="gallery-img">
                  {covers[t.id]?.url ? <img src={covers[t.id]!.url!} alt="" loading="lazy" /> : <span>{t.type}</span>}
                </span>
                <b>{t.title}</b>
                <small className="when">{formatDate(t.when)}{covers[t.id]?.count ? ` · ${covers[t.id]!.count} file${covers[t.id]!.count > 1 ? "s" : ""}` : ""}</small>
              </Link>
            ))}
          </div>
        ) : (
          <div className="group"><div className="empty">Nothing finished yet.</div></div>
        )}
      </div>
    </Shell>
  );
}
