import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import SupportComposer from "@/components/SupportComposer";
import SupportThread from "@/components/SupportThread";
import { requireMember } from "@/lib/session";
import { attachmentUrls, ticketTitle, type SupportMessage, type SupportTicket } from "@/lib/support";
import { replyTicket, setTicketStatus } from "../actions";

export default async function HelpConversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id: raw } = await params;
  const { sent } = await searchParams;
  const id = Number(raw);
  const { supabase, shell } = await requireMember();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: t } = await supabase.from("support_tickets").select("*").eq("id", id).eq("user_id", user!.id).maybeSingle<SupportTicket>();
  if (!t) notFound();
  const { data: messages } = await supabase.from("support_messages").select("*").eq("ticket_id", id).order("created_at").returns<SupportMessage[]>();
  const urls = await attachmentUrls(supabase, messages ?? []);
  await supabase.rpc("support_seen", { p_ticket: id, p_as_oatcake: false });
  const solved = t.status === "solved";

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 560 }}>
        <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}><Link href="/help">‹ Help</Link></p>
        <h1 className="large">{ticketTitle(t, messages?.[0]?.body)}</h1>
        {sent && <p className="notice">Sent. We&apos;ll reply here and email you at {t.email}.</p>}
        <SupportThread messages={messages ?? []} urls={urls} mine="user" />
        {solved ? (
          <p className="foot">
            This is marked as solved.{" "}
            <button form="reopen" className="link" type="submit">Reopen it</button> if you still need help.
          </p>
        ) : (
          <>
            <SupportComposer action={replyTicket.bind(null, id, false)} placeholder="Reply…" />
            <p className="foot">
              All sorted? <button form="solve" className="link" type="submit">Mark as solved</button>
            </p>
          </>
        )}
        <form id="reopen" action={setTicketStatus.bind(null, id, "open", false)} hidden />
        <form id="solve" action={setTicketStatus.bind(null, id, "solved", false)} hidden />
      </div>
    </Shell>
  );
}
