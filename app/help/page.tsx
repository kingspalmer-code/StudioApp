import Link from "next/link";
import Shell from "@/components/Shell";
import SupportComposer from "@/components/SupportComposer";
import { requireMember } from "@/lib/session";
import { STATUS_TEXT, ticketTitle, type SupportTicket } from "@/lib/support";
import { openTicket } from "./actions";

const ago = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

// Help & support: message Oatcake, and see earlier conversations and their replies.
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ from?: string; q?: string }> }) {
  const { from, q } = await searchParams;
  const { supabase, member, shell } = await requireMember();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false })
    .returns<SupportTicket[]>();
  const ids = (tickets ?? []).map((t) => t.id);
  const { data: firsts } = ids.length
    ? await supabase.from("support_messages").select("ticket_id, body").in("ticket_id", ids).eq("from_oatcake", false).order("created_at")
    : { data: [] as { ticket_id: number; body: string }[] };
  const first: Record<number, string> = {};
  for (const m of firsts ?? []) first[m.ticket_id] ??= m.body;
  const page = from && from.startsWith("/") ? from.slice(0, 200) : "";

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 560 }}>
        <h1 className="large">Help</h1>
        <p className="sub">Stuck, spotted something odd, or have an idea? Tell us here and we&apos;ll reply on this page and by email.</p>
        <SupportComposer action={openTicket} page={page} initial={q ? q.slice(0, 500) : ""} placeholder="What's happening, or what are you trying to do?" autoFocus={Boolean(q)} />
        {member.role === "designer" && process.env.ANTHROPIC_API_KEY && (
          <p className="foot">For quick how-to questions, Ask Oatcake at the top of the page answers straight away.</p>
        )}

        {Boolean(tickets?.length) && (
          <>
            <p className="eyebrow">Your messages</p>
            <div className="group">
              {tickets!.map((t) => {
                const unread = t.last_from === "oatcake" && t.updated_at > t.user_seen_at && t.status !== "solved";
                return (
                  <Link key={t.id} href={`/help/${t.id}`} className="row nav-row">
                    {unread && <span className="unread-dot" aria-label="New reply" />}
                    <div className="ctl">
                      <div style={{ fontWeight: unread ? 700 : 600 }}>{ticketTitle(t, first[t.id])}</div>
                      <div className="when">{t.last_from === "oatcake" ? "Oatcake replied" : "You wrote"} · {ago(t.updated_at)}</div>
                    </div>
                    <span className={`chip help-status ${t.status}`}>{t.status === "waiting" ? "Replied" : STATUS_TEXT[t.status]}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
