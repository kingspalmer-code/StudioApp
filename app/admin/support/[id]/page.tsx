import Link from "next/link";
import { notFound } from "next/navigation";
import { replyTicket, setTicketStatus } from "@/app/help/actions";
import Shell from "@/components/Shell";
import SupportComposer from "@/components/SupportComposer";
import SupportThread from "@/components/SupportThread";
import { pageName, requireAdmin, since } from "@/lib/admin";
import { attachmentUrls, STATUS_TEXT, ticketTitle, type SupportMessage, type SupportTicket } from "@/lib/support";
import AdminNav from "../../AdminNav";

// One help conversation, answered as Oatcake. The person gets an email with each reply.
export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { supabase, shell } = await requireAdmin();
  const { data: t } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle<SupportTicket>();
  if (!t) notFound();
  await supabase.rpc("support_seen", { p_ticket: id, p_as_oatcake: true });
  const [{ data: messages }, { data: ws }, { data: sum }] = await Promise.all([
    supabase.from("support_messages").select("*").eq("ticket_id", id).order("created_at").returns<SupportMessage[]>(),
    t.workspace_id ? supabase.from("workspaces").select("name").eq("id", t.workspace_id).maybeSingle<{ name: string }>() : Promise.resolve({ data: null }),
    supabase.rpc("admin_summary").single<{ unread_help: number }>(),
  ]);
  const urls = await attachmentUrls(supabase, messages ?? []);
  const first = (messages ?? []).find((m) => !m.from_oatcake)?.body;

  return (
    <Shell {...shell}>
      <AdminNav current="support" unread={sum?.unread_help} />
      <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/admin/support">‹ Support</Link></p>
      <h1 className="large">{ticketTitle(t, first)}</h1>
      <div className="cols">
        <div>
          <SupportThread messages={messages ?? []} urls={urls} mine="oatcake" />
          <SupportComposer action={replyTicket.bind(null, id, true)} placeholder={`Reply to ${t.name || t.email}…`} label="Send reply" />
          <p className="foot">They&apos;ll get an email with your reply, and it marks this as waiting on them.</p>
        </div>
        <div>
          <p className="eyebrow">About</p>
          <div className="group">
            <div className="row"><span className="k">From</span><div className="ctl"><Link href={`/admin/people/${t.user_id}`}>{t.name || t.email}</Link></div></div>
            <div className="row"><span className="k">Email</span><div className="ctl"><a href={`mailto:${t.email}`}>{t.email}</a></div></div>
            {ws && <div className="row"><span className="k">Workspace</span><div className="ctl">{ws.name}</div></div>}
            {t.page && <div className="row"><span className="k">Sent from</span><div className="ctl">{pageName(t.page.replace(/\/\d+(?=\/|$)/g, "/[id]"))} <span className="when">{t.page}</span></div></div>}
            {t.device && <div className="row"><span className="k">Device</span><div className="ctl">{t.device}</div></div>}
            <div className="row"><span className="k">Started</span><div className="ctl">{since(t.created_at)}</div></div>
            <div className="row"><span className="k">Status</span><div className="ctl"><span className={`chip help-status ${t.status}`}>{STATUS_TEXT[t.status]}</span></div></div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {t.status !== "solved" ? (
              <form action={setTicketStatus.bind(null, id, "solved", true)}><button className="btn plain small" type="submit">Mark solved</button></form>
            ) : (
              <form action={setTicketStatus.bind(null, id, "open", true)}><button className="btn plain small" type="submit">Reopen</button></form>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
