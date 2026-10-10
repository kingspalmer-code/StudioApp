import Link from "next/link";
import Shell from "@/components/Shell";
import { duration, isOwner, list, nextStep, pageName, PROBLEM, requireAdmin, since, STEPS, type Person } from "@/lib/admin";
import AdminNav from "./AdminNav";

type Summary = {
  people: number;
  workspaces: number;
  signups_7d: number;
  signups_prev_7d: number;
  active_7d: number;
  active_prev_7d: number;
  active_30d: number;
  active_ms_7d: number;
  open_help: number;
  unread_help: number;
};
type Day = { day: string; signups: number; active: number; active_ms: number };
type PageRow = { path: string; views: number; people: number; ms: number; form_starts: number; form_sends: number };
type Problem = { kind: string; name: string; path: string; detail: string; times: number; people: number; last_at: string };

const change = (now: number, before: number) => (now === before ? "same as last week" : `${now > before ? "+" : "−"}${Math.abs(now - before)} on last week`);

// Admin overview: how many people are signing up and using Oatcake, how far they get, and where they get stuck.
export default async function AdminOverview() {
  const { supabase, shell } = await requireAdmin();
  const [{ data: sum }, days, people, pages, problems, { data: asks }] = await Promise.all([
    supabase.rpc("admin_summary").single<Summary>(),
    list<Day>(supabase.rpc("admin_daily", { p_days: 30 })),
    list<Person>(supabase.rpc("admin_people")),
    list<PageRow>(supabase.rpc("admin_pages", { p_days: 30 })),
    list<Problem>(supabase.rpc("admin_problems", { p_days: 30 })),
    supabase.from("activity").select("user_id, meta, created_at").eq("kind", "action").eq("name", "ask").order("created_at", { ascending: false }).limit(15),
  ]);
  const s = sum ?? ({} as Summary);
  const all = people;
  const byId = Object.fromEntries(all.map((p) => [p.user_id, p]));
  const owners = all.filter(isOwner);
  const funnel = STEPS.map((step) => ({ ...step, n: owners.filter(step.done).length }));
  const peak = Math.max(1, ...days.map((d) => Math.max(d.active, d.signups)));
  const nudge = owners
    .filter((p) => {
      const old = Date.now() - new Date(p.signed_up).getTime() > 2 * 86400000;
      const quiet = !p.last_seen || Date.now() - new Date(p.last_seen).getTime() > 14 * 86400000;
      return (old && p.jobs === 0) || (p.jobs > 0 && quiet);
    })
    .slice(0, 12);
  const forms = pages
    .filter((p) => p.form_starts >= 2 && p.form_sends / p.form_starts < 0.75)
    .map((p) => ({ ...p, left: p.form_starts - Math.min(p.form_sends, p.form_starts) }))
    .sort((a, b) => b.left / b.form_starts - a.left / a.form_starts)
    .slice(0, 6);

  return (
    <Shell {...shell}>
      <AdminNav current="overview" unread={s.unread_help} />
      <h1 className="large">How it&apos;s going</h1>
      <p className="sub">{s.people ?? 0} people across {s.workspaces ?? 0} workspaces. Your own use isn&apos;t counted.</p>

      <div className="stats admin-stats">
        <div className="stat"><b>{s.signups_7d ?? 0}</b><span>Signed up this week</span><small>{change(s.signups_7d ?? 0, s.signups_prev_7d ?? 0)}</small></div>
        <div className="stat"><b>{s.active_7d ?? 0}</b><span>Used it this week</span><small>{change(s.active_7d ?? 0, s.active_prev_7d ?? 0)}</small></div>
        <div className="stat"><b>{s.active_7d ? duration((s.active_ms_7d ?? 0) / s.active_7d) : "–"}</b><span>Time each, this week</span><small>average per active person</small></div>
        <Link href="/admin/support" className="stat"><b>{s.unread_help ?? 0}</b><span>Help messages to answer</span><small>{s.open_help ?? 0} open in all</small></Link>
      </div>

      <p className="eyebrow">Last 30 days</p>
      <div className="group chart-card">
        <div className="chart" role="img" aria-label="People using Oatcake and signing up each day for the last 30 days">
          {days.map((d) => (
            <div key={d.day} className="chart-col" title={`${new Date(d.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}: ${d.active} active, ${d.signups} signed up`}>
              <i className="bar-active" style={{ height: `${(d.active / peak) * 100}%` }} />
              <i className="bar-signup" style={{ height: `${(d.signups / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="chart-key"><span><i className="bar-active" /> Used Oatcake</span><span><i className="bar-signup" /> Signed up</span></div>
      </div>

      <div className="cols">
        <div>
          <p className="eyebrow">Getting set up</p>
          <div className="group">
            {funnel.map((f, i) => (
              <div className="row funnel-row" key={f.key}>
                <span className="k">{f.label}</span>
                <div className="ctl">
                  <span className="funnel-bar"><i style={{ width: `${owners.length ? (f.n / owners.length) * 100 : 0}%` }} /></span>
                </div>
                <span className="funnel-n">
                  {f.n}
                  {i > 0 && funnel[i - 1].n > f.n && <small> −{funnel[i - 1].n - f.n}</small>}
                </span>
              </div>
            ))}
          </div>
          <p className="foot">Workspace owners only. The red number is how many stopped at that step.</p>

          <p className="eyebrow">Worth a nudge</p>
          <div className="group">
            {nudge.map((p) => (
              <Link key={p.user_id} href={`/admin/people/${p.user_id}`} className="row nav-row">
                <div className="ctl">
                  <div style={{ fontWeight: 600 }}>{p.name || p.email}</div>
                  <div className="when">
                    {p.jobs === 0 ? nextStep(p)?.missing : `Last seen ${since(p.last_seen)}`} · signed up {since(p.signed_up)}
                  </div>
                </div>
                <span className="when">›</span>
              </Link>
            ))}
            {!nudge.length && <div className="empty">Nobody stuck or gone quiet.</div>}
          </div>
        </div>

        <div>
          <p className="eyebrow">Where people get stuck</p>
          <div className="group">
            {problems.slice(0, 10).map((p, i) => (
              <div className="row stack" key={i}>
                <span className="k">
                  {PROBLEM[p.name] ?? p.name} · {pageName(p.path)} · {p.people} {p.people === 1 ? "person" : "people"}{p.times > p.people ? `, ${p.times} times` : ""}
                </span>
                <div className="copy">{p.detail || "–"}</div>
              </div>
            ))}
            {forms.map((f) => (
              <div className="row stack" key={f.path}>
                <span className="k">Form left unfinished · {pageName(f.path)}</span>
                <div className="copy">Started {f.form_starts} times, sent {Math.min(f.form_sends, f.form_starts)}.</div>
              </div>
            ))}
            {!problems.length && !forms.length && <div className="empty">No errors, repeated taps or unfinished forms yet.</div>}
          </div>

          <p className="eyebrow">What people ask Oatcake</p>
          <div className="group">
            {(asks ?? []).map((a, i) => (
              <div className="row stack" key={i}>
                <span className="k">{byId[a.user_id]?.name || byId[a.user_id]?.email || "Someone"} · {since(a.created_at)}</span>
                <div className="copy">{String((a.meta as { text?: string })?.text ?? "")}</div>
              </div>
            ))}
            {!asks?.length && <div className="empty">No questions yet.</div>}
          </div>
        </div>
      </div>

      <p className="eyebrow">Pages, last 30 days</p>
      <div className="group admin-table">
        <div className="row table-head"><span>Page</span><span>People</span><span>Visits</span><span>Time per visit</span><span>Total time</span></div>
        {pages.filter((p) => p.views > 0).slice(0, 20).map((p) => (
          <div className="row" key={p.path}>
            <span>{pageName(p.path)}</span>
            <span>{p.people}</span>
            <span>{p.views}</span>
            <span>{duration(p.ms / Math.max(1, p.views))}</span>
            <span>{duration(p.ms)}</span>
          </div>
        ))}
        {!pages.length && <div className="empty">Visits show here as people use Oatcake.</div>}
      </div>
    </Shell>
  );
}
