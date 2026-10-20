import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import QueueWidgets from "@/components/QueueWidgets";
import Shell from "@/components/Shell";
import SplitHost from "@/components/SplitHost";
import TicketRow from "@/components/TicketRow";
import { businessOatcakes, hatchBase, oatcakesEarned, STARTER_OATCAKES } from "@/lib/pet";
import { daysFromToday, finalStage, formatDate, isAtRisk, isDone, money, sortQueue, stageColor } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { withMine } from "@/lib/workspace";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import type { Ticket } from "@/lib/types";
import { loadWidgets } from "@/lib/widgets";

type Session = Awaited<ReturnType<typeof requireMember>>;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const session = asClient(await requireMember(["manager", "designer", "client"], "requests"));
  if (session.member.role === "client") return <ClientOverview session={session} business={(await searchParams).business} />;
  const { supabase, member, businesses, self, ctx, terms, workspace, shell, viewing } = session;
  // Managers get the widget row too, with an oatcake for Pickle for every request they send.
  const manager = member.role === "manager" && !viewing;
  const [{ data }, earned] = await Promise.all([
    supabase.from("tickets").select(LIST_COLUMNS).returns<ListTicket[]>(),
    manager ? oatcakesEarned(supabase, member, ctx) : Promise.resolve(0),
  ]);
  const all = data ?? [];
  const open = sortQueue(all, ctx);
  const done = all
    .filter((t) => isDone(t, ctx))
    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
  const risk = open.filter((t) => isAtRisk(t, ctx));
  const byId = Object.fromEntries(withMine(businesses, self, workspace.kind).map((b) => [b.id, b]));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const deliveredThisMonth = done.filter((t) => t.delivered_at && new Date(t.delivered_at) >= monthStart).length;

  const unpaid = all.reduce((sum, t) => sum + Math.max(0, (t.quote_amount ?? 0) - (t.paid_amount ?? 0)), 0);
  const stats = [
    { n: open.length, label: `Open ${terms.jobs}` },
    workspace.kind !== "studio"
      ? { n: money(unpaid), label: "Quoted, not yet paid", color: unpaid ? "var(--orange)" : undefined }
      : { n: open.filter((t) => { const d = daysFromToday(t.deadline); return d >= 0 && d <= 7; }).length, label: "Due this week" },
    { n: risk.length, label: "At risk", color: risk.length ? "var(--red)" : undefined },
    { n: deliveredThisMonth, label: "Delivered this month", color: "var(--green)" },
  ];

  const widgets = manager
    ? <QueueWidgets {...await loadWidgets(supabase, all, ctx, byId, { earned, base: hatchBase(member, earned) })} earnHint="Send a request to earn an oatcake" />
    : null;

  return (
    <Shell {...shell}>
      {widgets}
      <h1 className="large">Overview</h1>
      <p className="sub">Workload and progress across all your {workspace.kind === "solo" ? terms.jobs : terms.clients}.</p>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <b style={s.color ? { color: s.color } : undefined}>{s.n}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Working alone, there's nobody to break the work down by. */}
      {workspace.kind !== "solo" && (
        <>
          <p className="eyebrow">By {terms.client}</p>
          <div className="biz-grid">
            {businesses.filter((b) => workspace.kind === "studio" || open.some((t) => t.business_id === b.id)).map((b) => {
              const ts = all.filter((t) => t.business_id === b.id);
              const counts = ctx.stages.map((st) => ({ st, n: ts.filter((t) => t.status === st.key).length }));
              const total = ts.length || 1;
              const next = open.filter((t) => t.business_id === b.id).sort((x, y) => x.deadline.localeCompare(y.deadline))[0];
              return (
                <div className="biz" key={b.id}>
                  <h4><BizBadge biz={b} size={26} />{b.name}</h4>
                  <div className="meter" role="img" aria-label={counts.map((c) => `${c.n} ${c.st.label}`).join(", ")}>
                    {counts.map((c) => (
                      <i key={c.st.key} style={{ width: `${(c.n / total) * 100}%`, background: stageColor(c.st.color) }} />
                    ))}
                  </div>
                  <div className="legend">
                    {counts.filter((c) => c.n).map((c) => (
                      <span key={c.st.key}>
                        <span className="dot" style={{ background: stageColor(c.st.color), width: 7, height: 7 }} />
                        {c.n} {c.st.label}
                      </span>
                    ))}
                    {!ts.length && <span>No {terms.jobs} yet</span>}
                  </div>
                  <div className="kv">
                    <span>Next due</span>
                    <b>{next ? `${next.title} · ${formatDate(next.deadline)}` : "Nothing open"}</b>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <SplitHost warm={risk.slice(0, 2).map((t) => t.id)}>
      <div className="cols" style={{ marginTop: 6 }}>
        <div>
          <p className="eyebrow">At risk</p>
          <div className="group">
            {risk.length ? risk.map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} plan={member.role === "designer" && !viewing} />) : <div className="empty">Nothing at risk right now.</div>}
          </div>
          <p className="foot">Should already have started, or waiting on the client within 5 days of the deadline.</p>
        </div>
        <div>
          <p className="eyebrow">Delivered recently</p>
          <div className="group">
            {done.length ? done.slice(0, 10).map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} />) : <div className="empty">Nothing delivered yet.</div>}
          </div>
        </div>
      </div>
      </SplitHost>
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
    previewing || !petBiz ? Promise.resolve(0) : businessOatcakes(supabase, petBiz, ctx),
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
    .sort((a, b) => (b.delivered_at ?? b.deadline).localeCompare(a.delivered_at ?? a.deadline));
  const [widgets, { data: draftRows }] = await Promise.all([
    // While the studio previews a client, Pickle stays out of it: it's the client's own pet.
    loadWidgets(supabase, all, ctx, byId, previewing || !petBiz ? undefined : { earned, base: Math.min(0, earned - STARTER_OATCAKES), owner: { business: petBiz } }),
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
    { n: open.filter((t) => { const d = daysFromToday(t.deadline); return d >= 0 && d <= 7; }).length, label: "Due this week" },
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
