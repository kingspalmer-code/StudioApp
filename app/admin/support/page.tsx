import Link from "next/link";
import Shell from "@/components/Shell";
import { requireAdmin, since } from "@/lib/admin";
import { ticketTitle, type SupportTicket } from "@/lib/support";
import AdminNav from "../AdminNav";

const TABS = [
  { key: "answer", label: "To answer" },
  { key: "waiting", label: "Waiting on them" },
  { key: "solved", label: "Solved" },
] as const;

// The support inbox: help messages from everyone, newest activity first.
export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show: raw } = await searchParams;
  const show = TABS.some((t) => t.key === raw) ? raw! : "answer";
  const { supabase, shell } = await requireAdmin();
  let q = supabase.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
  q = show === "answer" ? q.eq("status", "open") : q.eq("status", show);
  const [{ data: tickets }, { data: sum }] = await Promise.all([q.returns<SupportTicket[]>(), supabase.rpc("admin_summary").single<{ unread_help: number }>()]);
  const ids = (tickets ?? []).map((t) => t.id);
  const { data: msgs } = ids.length
    ? await supabase.from("support_messages").select("ticket_id, body, from_oatcake").in("ticket_id", ids).order("created_at", { ascending: false })
    : { data: [] as { ticket_id: number; body: string; from_oatcake: boolean }[] };
  const latest: Record<number, string> = {};
  const first: Record<number, string> = {};
  for (const m of msgs ?? []) {
    latest[m.ticket_id] ??= m.body;
    if (!m.from_oatcake) first[m.ticket_id] = m.body;
  }

  return (
    <Shell {...shell}>
      <AdminNav current="support" unread={sum?.unread_help} />
      <h1 className="large">Support</h1>
      <p className="sub">Messages people send from Help. You get an email for each one, and your replies email them back.</p>
      <nav className="seg" aria-label="Show" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "answer" ? "/admin/support" : `/admin/support?show=${t.key}`} aria-current={t.key === show ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <div className="group">
        {(tickets ?? []).map((t) => {
          const unread = t.last_from === "user" && (!t.admin_seen_at || t.admin_seen_at < t.updated_at);
          return (
            <Link key={t.id} href={`/admin/support/${t.id}`} className="row nav-row">
              {unread && <span className="unread-dot" aria-label="Unread" />}
              <div className="ctl">
                <div style={{ fontWeight: unread ? 700 : 600 }}>{t.name || t.email} · {ticketTitle(t, first[t.id])}</div>
                <div className="when clamp">{latest[t.id]}</div>
              </div>
              <span className="when">{since(t.updated_at)}</span>
            </Link>
          );
        })}
        {!tickets?.length && <div className="empty">{show === "answer" ? "Nothing to answer. Nice." : "None here."}</div>}
      </div>
    </Shell>
  );
}
