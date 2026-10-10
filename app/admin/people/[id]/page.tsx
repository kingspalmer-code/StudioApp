import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import { duration, list, pageName, PROBLEM, requireAdmin, since, STEPS, type Person } from "@/lib/admin";
import { STATUS_TEXT, type SupportTicket } from "@/lib/support";
import AdminNav from "../../AdminNav";

type Row = { kind: string; name: string; path: string; ms: number; meta: { text?: string; step?: number }; created_at: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

function describe(r: Row) {
  if (r.kind === "view") return `Opened ${pageName(r.path)}`;
  if (r.kind === "error") return `${PROBLEM[r.name] ?? "Error"} on ${pageName(r.path)}${r.meta?.text ? `: “${r.meta.text}”` : ""}`;
  if (r.name === "ask") return `Asked Oatcake: “${r.meta?.text ?? ""}”`;
  if (r.name === "ask_to_person") return "Went from Ask Oatcake to messaging the team";
  if (r.name === "walkthrough_skip") return `Skipped the walkthrough at “${r.meta?.text ?? ""}”`;
  if (r.name === "walkthrough_done") return "Finished the walkthrough";
  if (r.name === "form_start") return `Started filling in a form on ${pageName(r.path)}`;
  if (r.name === "form_send") return `Sent a form on ${pageName(r.path)}`;
  return `${r.name} on ${pageName(r.path)}`;
}

// One person: their set-up progress, help messages, and a timeline of what they've done lately.
export default async function AdminPerson({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, shell } = await requireAdmin();
  const [people, { data: rows }, { data: tickets }, { data: sum }] = await Promise.all([
    list<Person>(supabase.rpc("admin_people")),
    supabase.from("activity").select("kind, name, path, ms, meta, created_at").eq("user_id", id).neq("kind", "time").order("created_at", { ascending: false }).limit(300).returns<Row[]>(),
    supabase.from("support_tickets").select("*").eq("user_id", id).order("updated_at", { ascending: false }).returns<SupportTicket[]>(),
    supabase.rpc("admin_summary").single<{ unread_help: number }>(),
  ]);
  const p = people.find((x) => x.user_id === id);
  if (!p) notFound();

  // Group the timeline by day, and fold repeated visits to the same page together.
  const groups: { day: string; items: (Row & { count: number })[] }[] = [];
  for (const r of rows ?? []) {
    const d = day(r.created_at);
    let g = groups[groups.length - 1];
    if (!g || g.day !== d) groups.push((g = { day: d, items: [] }));
    const prev = g.items[g.items.length - 1];
    if (prev && prev.kind === "view" && r.kind === "view" && prev.path === r.path) prev.count++;
    else g.items.push({ ...r, count: 1 });
  }

  return (
    <Shell {...shell}>
      <AdminNav current="people" unread={sum?.unread_help} />
      <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/admin/people">‹ People</Link></p>
      <h1 className="large">{p.name || p.email}</h1>
      <p className="sub">
        <a href={`mailto:${p.email}`}>{p.email}</a> · {p.workspace ?? "No workspace yet"} · signed up {since(p.signed_up)}
      </p>

      <div className="stats admin-stats">
        <div className="stat"><b>{since(p.last_seen ?? p.last_sign_in)}</b><span>Last seen</span></div>
        <div className="stat"><b>{p.no_tracking ? "–" : duration(p.active_ms_7d)}</b><span>Time this week</span></div>
        <div className="stat"><b>{p.no_tracking ? "–" : duration(p.active_ms)}</b><span>Time in all</span></div>
        <div className="stat"><b>{p.days_active}</b><span>Days they&apos;ve used it</span></div>
      </div>
      {p.no_tracking && <p className="foot">They&apos;ve turned usage stats off, so there&apos;s no timeline.</p>}

      <div className="cols">
        <div>
          <p className="eyebrow">Set-up</p>
          <div className="group">
            {STEPS.map((s) => (
              <div className="row" key={s.key}>
                <span className={`tick${s.done(p) ? " on" : ""}`} aria-hidden="true">{s.done(p) ? "✓" : ""}</span>
                <div className="ctl" style={{ color: s.done(p) ? undefined : "var(--label-2)" }}>{s.label}</div>
              </div>
            ))}
            <div className="row"><span className="k">Jobs</span><div className="ctl">{p.jobs}</div></div>
            <div className="row"><span className="k">Customers</span><div className="ctl">{p.customers}</div></div>
            <div className="row"><span className="k">Quotes &amp; invoices</span><div className="ctl">{p.docs} made, {p.docs_sent} sent</div></div>
            <div className="row"><span className="k">Walkthrough</span><div className="ctl">{p.walkthrough ? "Seen" : "Not yet"}</div></div>
          </div>

          <p className="eyebrow">Help messages</p>
          <div className="group">
            {(tickets ?? []).map((t) => (
              <Link key={t.id} href={`/admin/support/${t.id}`} className="row nav-row">
                <div className="ctl"><div style={{ fontWeight: 600 }}>{t.subject || `Message from ${since(t.created_at)}`}</div></div>
                <span className={`chip help-status ${t.status}`}>{STATUS_TEXT[t.status]}</span>
              </Link>
            ))}
            {!tickets?.length && <div className="empty">None.</div>}
          </div>
        </div>

        <div>
          <p className="eyebrow">What they&apos;ve been doing</p>
          {groups.map((g) => (
            <div key={g.day}>
              <p className="timeline-day">{g.day}</p>
              <div className="group">
                {g.items.map((r, i) => (
                  <div className={`row timeline-row${r.kind === "error" ? " problem" : ""}`} key={i}>
                    <span className="when">{time(r.created_at)}</span>
                    <div className="ctl">{describe(r)}{r.count > 1 ? ` (${r.count} times)` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!groups.length && <div className="group"><div className="empty">Nothing yet.</div></div>}
        </div>
      </div>
    </Shell>
  );
}
