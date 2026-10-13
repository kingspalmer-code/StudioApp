import { redirect } from "next/navigation";
import SendCustomerLink from "@/components/SendCustomerLink";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import { isDone } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Business, Ticket } from "@/lib/types";
import { deleteCustomer, saveCustomer } from "../settings/actions";
import Submit from "@/components/Submit";

function CustomerFields({ b }: { b?: Business }) {
  return (
    <div className="group">
      <div className="row"><label>Name</label><div className="ctl"><input name="name" defaultValue={b?.name} required placeholder="Smith's Bakery" /></div></div>
      <div className="row"><label>Phone</label><div className="ctl"><input name="phone" type="tel" defaultValue={b?.phone} /></div></div>
      <div className="row"><label>Email</label><div className="ctl"><input name="email" type="email" defaultValue={b?.email} /></div></div>
      <div className="row"><label>Address</label><div className="ctl"><input name="address" defaultValue={b?.address} /></div></div>
      <div className="row stack"><label>Notes</label><textarea name="notes" defaultValue={b?.notes} placeholder="Anything worth remembering" /></div>
    </div>
  );
}

export default async function CustomersPage() {
  const { supabase, businesses, ctx, terms, workspace, shell } = await requireMember(["designer"]);
  // Working alone, there are no customers to keep.
  if (workspace.kind === "solo") redirect("/queue");
  const { data } = await supabase.from("tickets").select("business_id, status").returns<Pick<Ticket, "business_id" | "status">[]>();
  const jobs = data ?? [];

  return (
    <Shell {...shell}>
      <h1 className="large">{terms.Clients}</h1>
      <p className="sub">Everyone you do {terms.jobs} for, with their contact details.</p>
      <div className="cols">
        <div>
          <p className="eyebrow">All {terms.clients}</p>
          <div className="group">
            {businesses.map((b) => {
              const mine = jobs.filter((j) => j.business_id === b.id);
              const open = mine.filter((j) => !isDone(j, ctx)).length;
              return (
                <details className="cust" key={b.id}>
                  <summary className="row">
                    <BizBadge biz={b} />
                    <div className="ctl">
                      <div style={{ fontWeight: 600 }}>{b.name}</div>
                      <div className="when">
                        {[b.phone, open ? `${open} open` : null, `${mine.length} ${mine.length === 1 ? terms.job : terms.jobs}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className="chev" aria-hidden="true">›</span>
                  </summary>
                  <form action={saveCustomer.bind(null, b.id)} className="cust-edit">
                    <CustomerFields b={b} />
                    <div style={{ display: "flex", gap: 16, margin: "10px 4px 4px" }}>
                      <Submit className="link" type="submit">Save</Submit>
                      {mine.length === 0 && (
                        <Submit className="link" style={{ color: "var(--red)" }} formAction={deleteCustomer.bind(null, b.id)}>Delete</Submit>
                      )}
                    </div>
                  </form>
                  {workspace.kind === "trade" && b.email && <div className="group" style={{ marginTop: 8 }}><SendCustomerLink id={b.id} name={b.name} /></div>}
                </details>
              );
            })}
            {!businesses.length && <div className="empty">No {terms.clients} yet. Add one here, or just type a new name when you add a {terms.job}.</div>}
          </div>
        </div>
        <form action={saveCustomer.bind(null, null)} id="add">
          <p className="eyebrow">Add a {terms.client}</p>
          <CustomerFields />
          <Submit className="btn wide" style={{ marginTop: 14 }}>Add {terms.client}</Submit>
        </form>
      </div>
    </Shell>
  );
}
