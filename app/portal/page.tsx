import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { requireMember } from "@/lib/session";
import type { Ticket } from "@/lib/types";
import NewRequestForm from "./NewRequestForm";

export default async function PortalPage() {
  const { supabase, member, businesses } = await requireMember(["client", "designer"]);
  const isDesigner = member.role === "designer";
  const myBiz = businesses.find((b) => b.id === member.business_id);

  let tickets: Ticket[] = [];
  if (!isDesigner) {
    const { data } = await supabase.from("tickets").select("*").order("deadline").returns<Ticket[]>();
    tickets = (data ?? []).sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  }

  return (
    <Shell member={member}>
      <h1 className="large">New design request</h1>
      <p className="sub">
        {isDesigner
          ? "Log a request that came in by WhatsApp or email so it joins the queue."
          : `Tell Kingsley what ${myBiz?.name ?? "your business"} needs. The more you include now, the fewer back-and-forths later.`}
      </p>
      <div className={isDesigner ? "" : "cols"} style={isDesigner ? { maxWidth: 640 } : undefined}>
        <NewRequestForm
          businesses={isDesigner ? businesses : myBiz ? [myBiz] : []}
          defaultName={member.full_name}
          isDesigner={isDesigner}
        />
        {!isDesigner && (
          <div>
            <p className="eyebrow">{myBiz?.name} requests</p>
            <div className="group">
              {tickets.length ? (
                tickets.map((t) => <TicketRow key={t.id} t={t} biz={myBiz} showBusiness={false} />)
              ) : (
                <div className="empty">No requests yet. Send your first one with the form.</div>
              )}
            </div>
            <p className="foot">Tap a request to see its status and any notes from Kingsley.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
