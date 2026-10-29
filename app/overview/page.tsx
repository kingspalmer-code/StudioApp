import Link from "next/link";
import QueueWidgets from "@/components/QueueWidgets";
import HomeBlocks from "@/components/HomeBlocks";
import Shell from "@/components/Shell";
import SplitHost from "@/components/SplitHost";
import TicketRow from "@/components/TicketRow";
import { businessOatcakes, STARTER_OATCAKES } from "@/lib/pet";
import { dueWithin, finalStage, isDone, stageColor } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import { loadWidgets } from "@/lib/widgets";

type Session = Awaited<ReturnType<typeof requireMember>>;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ business?: string; view?: string; biz?: string }> }) {
  const session = asClient(await requireMember(["manager", "designer", "client"], "requests"));
  const { business, view, biz } = await searchParams;
  if (session.member.role === "client") return <ClientOverview session={session} business={business} />;
  const { data } = await session.supabase.from("tickets").select(LIST_COLUMNS).returns<ListTicket[]>();
  const { terms, workspace } = session;
  // The owner's and managers' Overview is a page of blocks they can change with Customise
  // (lib/layouts.ts): totals, the work by client, at risk and delivered to start with.
  return (
    <Shell {...session.shell}>
      <HomeBlocks
        session={session}
        all={data ?? []}
        page="overview"
        title="Overview"
        view={view}
        biz={biz}
        head={<>
          <h1 className="large">Overview</h1>
          <p className="sub">Workload and progress across all your {workspace.kind === "solo" ? terms.jobs : terms.clients}.</p>
        </>}
      />
    </Shell>
  );
}

// A client's Overview, where they land: the widget row (Pickle is the business's, shared by all its
// logins, and earns an oatcake for every one of its jobs that's finished), a few totals, then every open request grouped by where it's up to.
async function ClientOverview({ session, business }: { session: Session; business?: string }) {
  const { supabase, member, businesses, ctx, workspace, shell } = session;
  const previewing = Boolean(shell.preview);
  const owner = workspace.owner_name || "the studio";
  const myBizes = (member.business_ids ?? []).map((id) => businesses.find((b) => b.id === id)).filter((b) => b !== undefined);
  const several = myBizes.length > 1;
  const only = several ? myBizes.find((b) => b.id === business) : undefined;
  const ids = only ? [only.id] : myBizes.map((b) => b.id);
  const byId = Object.fromEntries(myBizes.map((b) => [b.id, b]));

  // The business whose Pickle shows: the one picked above, else their main business.
  const petBiz = only?.id ?? member.business_id ?? myBizes[0]?.id;
  const [{ data }, earned, { data: sharedRows }] = await Promise.all([
    supabase.from("tickets").select(LIST_COLUMNS).in("business_id", ids).order("deadline").returns<ListTicket[]>(),
    previewing || !petBiz ? Promise.resolve({ n: 0, w: 0 }) : businessOatcakes(supabase, petBiz, ctx),
    // Other businesses' jobs the studio has shared with them, kept apart from their own.
    previewing || only
      ? Promise.resolve({ data: [] as ListTicket[] })
      : supabase.from("tickets").select(LIST_COLUMNS).contains("tell", [member.email]).order("deadline").returns<ListTicket[]>(),
  ]);
  const own = new Set(myBizes.map((b) => b.id));
  const shared = (sharedRows ?? []).filter((t) => !own.has(t.business_id));
  const allBiz = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const all = data ?? [];
  const open = all.filter((t) => !isDone(t, ctx));
  const done = all
    .filter((t) => isDone(t, ctx))
    .sort((a, b) => (b.delivered_at ?? b.deadline ?? b.updated_at).localeCompare(a.delivered_at ?? a.deadline ?? a.updated_at));
  const [widgets, { data: draftRows }] = await Promise.all([
    // While the studio previews a client, Pickle stays out of it: it's the client's own pet.
    loadWidgets(supabase, all, ctx, byId, previewing || !petBiz ? undefined : { earned, base: Math.min(0, earned.n - STARTER_OATCAKES), owner: { business: petBiz } }),
    open.length
      ? supabase.from("ticket_drafts").select("ticket_id, final_at").in("ticket_id", open.map((t) => t.id)).returns<{ ticket_id: number; final_at: string | null }[]>()
      : Promise.resolve({ data: [] }),
  ]);
  const withDraft = new Set((draftRows ?? []).filter((d) => !d.final_at).map((d) => d.ticket_id));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const waiting = open.filter((t) => t.status === "waiting" || withDraft.has(t.id)).length;
  const stats = [
    { n: open.length, label: "In progress" },
    { n: waiting, label: "Waiting on you", color: waiting ? "var(--orange)" : undefined },
    ctx.noDates ? { n: done.length, label: "Finished in all" } : { n: open.filter((t) => dueWithin(t, ctx, 7)).length, label: "Due this week" },
    { n: done.filter((t) => t.delivered_at && new Date(t.delivered_at) >= monthStart).length, label: "Finished this month", color: "var(--green)" },
  ];
  // Open requests under the stage they're at, in the studio's order of stages.
  const final = finalStage(ctx);
  const groups = ctx.stages
    .filter((st) => st.key !== final)
    .map((st) => ({ st, items: open.filter((t) => t.status === st.key) }))
    .filter((g) => g.items.length);
  const row = (t: ListTicket) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} showBusiness={several && !only} draft={withDraft.has(t.id)} />;
  const q = (path: string) => (only ? `${path}${path.includes("?") ? "&" : "?"}business=${only.id}` : path);

  return (
    <Shell {...shell}>
      <QueueWidgets {...widgets} earnHint="Each finished project earns an oatcake" petBusiness={petBiz} />
      <div className="client-overview">
        <div className="overview-head">
          <div>
            <h1 className="large">Overview</h1>
            <p className="sub">How your requests to {owner} are going.</p>
          </div>
          <Link href={q("/portal?new=1")} className="btn">+ New request</Link>
        </div>
        {several && (
          <nav className="seg portal-businesses" aria-label="Business">
            <Link href="/overview" aria-current={!only ? "page" : undefined}>All</Link>
            {myBizes.map((b) => <Link key={b.id} href={`/overview?business=${b.id}`} aria-current={only?.id === b.id ? "page" : undefined}>{b.name}</Link>)}
          </nav>
        )}
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <b style={s.color ? { color: s.color } : undefined}>{s.n}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <SplitHost warm={open.slice(0, 2).map((t) => t.id)}>
          {groups.length ? (
            groups.map(({ st, items }) => (
              <div key={st.key}>
                <p className="eyebrow">
                  <span className="dot" style={{ background: stageColor(st.color), width: 7, height: 7 }} /> {st.label} · {items.length}
                </p>
                <div className="group">{items.map(row)}</div>
              </div>
            ))
          ) : (
            <>
              <p className="eyebrow">In progress</p>
              <div className="group">
                <div className="empty">{all.length ? "Nothing in progress right now." : "No requests yet. Send your first one and it shows here."}</div>
              </div>
            </>
          )}

          {shared.length > 0 && (
            <>
              <p className="eyebrow">Shared with you · {shared.length}</p>
              <div className="group">{shared.map((t) => <TicketRow key={t.id} t={t} biz={allBiz[t.business_id]} ctx={ctx} showBusiness />)}</div>
            </>
          )}

          {done.length > 0 && (
            <>
              <div className="eyebrow-row">
                <p className="eyebrow">Recently finished</p>
                <Link href={q("/portal/archive")} className="eyebrow-link">See all {done.length} ›</Link>
              </div>
              <div className="group">{done.slice(0, 5).map(row)}</div>
            </>
          )}
        </SplitHost>
      </div>
    </Shell>
  );
}
