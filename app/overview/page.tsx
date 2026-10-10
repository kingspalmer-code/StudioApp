import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { STATUSES, daysFromToday, formatDate, isAtRisk, sortQueue } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Ticket } from "@/lib/types";

export default async function OverviewPage() {
  const { supabase, member, businesses } = await requireMember(["manager", "designer"]);
  const { data } = await supabase.from("tickets").select("*").returns<Ticket[]>();
  const all = data ?? [];
  const open = sortQueue(all);
  const done = all
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
  const risk = open.filter(isAtRisk);
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const deliveredThisMonth = done.filter((t) => t.delivered_at && new Date(t.delivered_at) >= monthStart).length;

  const stats = [
    { n: open.length, label: "Open projects" },
    { n: open.filter((t) => { const d = daysFromToday(t.deadline); return d >= 0 && d <= 7; }).length, label: "Due this week" },
    { n: risk.length, label: "At risk", color: risk.length ? "var(--red)" : undefined },
    { n: deliveredThisMonth, label: "Delivered this month", color: "var(--green)" },
  ];

  return (
    <Shell member={member}>
      <h1 className="large">Overview</h1>
      <p className="sub">Workload and progress across all five businesses.</p>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <b style={s.color ? { color: s.color } : undefined}>{s.n}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <p className="eyebrow">By business</p>
      <div className="biz-grid">
        {businesses.map((b) => {
          const ts = all.filter((t) => t.business_id === b.id);
          const counts = STATUSES.map((st) => ({ st, n: ts.filter((t) => t.status === st.id).length }));
          const total = ts.length || 1;
          const next = open.filter((t) => t.business_id === b.id).sort((x, y) => x.deadline.localeCompare(y.deadline))[0];
          return (
            <div className="biz" key={b.id}>
              <h4><span className="dot" style={{ background: b.color }} />{b.name}</h4>
              <div className="meter" role="img" aria-label={counts.map((c) => `${c.n} ${c.st.label}`).join(", ")}>
                {counts.map((c) => (
                  <i key={c.st.id} style={{ width: `${(c.n / total) * 100}%`, background: c.st.color }} />
                ))}
              </div>
              <div className="legend">
                {counts.filter((c) => c.n).map((c) => (
                  <span key={c.st.id}>
                    <span className="dot" style={{ background: c.st.color, width: 7, height: 7 }} />
                    {c.n} {c.st.label}
                  </span>
                ))}
                {!ts.length && <span>No requests yet</span>}
              </div>
              <div className="kv">
                <span>Next due</span>
                <b>{next ? `${next.title} · ${formatDate(next.deadline)}` : "Nothing open"}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cols" style={{ marginTop: 6 }}>
        <div>
          <p className="eyebrow">At risk</p>
          <div className="group">
            {risk.length ? risk.map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} />) : <div className="empty">Nothing at risk right now.</div>}
          </div>
          <p className="foot">Should already have started, or waiting on the client within 5 days of the deadline.</p>
        </div>
        <div>
          <p className="eyebrow">Delivered recently</p>
          <div className="group">
            {done.length ? done.slice(0, 10).map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} />) : <div className="empty">Nothing delivered yet.</div>}
          </div>
        </div>
      </div>
    </Shell>
  );
}
