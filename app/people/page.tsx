import { redirect } from "next/navigation";
import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import { removeMember, setOtherBusinesses, startPreview } from "@/app/actions";
import { requireMember } from "@/lib/session";
import type { Member } from "@/lib/types";
import AddMember from "./AddMember";
import InviteButton from "./InviteButton";
import Submit from "@/components/Submit";

const ROLE_LABEL = { designer: "Designer", manager: "Manager", client: "Client", staff: "Employee" };

export default async function PeoplePage() {
  const { supabase, member, businesses, workspace, shell } = await requireMember(["designer"]);
  if (workspace.kind === "solo") redirect("/queue");
  const [{ data }, { data: signedIn }, { data: links }] = await Promise.all([
    supabase.from("members").select("*").order("role").order("email").returns<Member[]>(),
    supabase.rpc("members_signed_in"),
    supabase.from("member_businesses").select("email, business_id").returns<{ email: string; business_id: string }[]>(),
  ]);
  // Clients who can also request work for other businesses.
  const others: Record<string, string[]> = {};
  for (const l of links ?? []) (others[l.email] ??= []).push(l.business_id);
  const hasSignedIn = new Set((signedIn as string[] | null) ?? []);
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));

  return (
    <Shell {...shell}>
      <h1 className="large">People</h1>
      <p className="sub">Only people listed here can get in. Clients see their own business's requests (or several, if you give them more than one); managers see the overview, and can send requests for any businesses you tick. Anyone who hasn't signed in yet can be sent an invite.</p>
      {businesses.length > 0 && (
        <form action={startPreview} className="preview-switch preview-start">
          <span className="when">See the request pages as a client sees them:</span>
          <select name="business" aria-label="Client to preview">
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Submit className="link" type="submit">Preview</Submit>
        </form>
      )}
      <div className="cols">
        <div>
          <p className="eyebrow">Who has access</p>
          <div className="group">
            {(data ?? []).map((m) => {
              const b = m.business_id ? byId[m.business_id] : undefined;
              const also = m.role !== "designer" ? (others[m.email] ?? []).filter((id) => id !== m.business_id && byId[id]) : [];
              return (
                <div className="row person-row" key={m.email}>
                  {b ? <BizBadge biz={b} /> : <span className="badge" style={{ width: 28, height: 28, background: "var(--fill)" }} />}
                  <div className="ctl">
                    <div style={{ fontWeight: 600 }}>{m.full_name || m.email}</div>
                    <div className="when">
                      {m.email} · {ROLE_LABEL[m.role]}{b ? ` · ${b.name}` : ""}
                      {also.length > 0 && ` + ${also.map((id) => byId[id].name).join(", ")}`}
                      {!hasSignedIn.has(m.email) && " · Not signed in yet"}
                    </div>
                    {(m.role === "manager" || (m.role === "client" && businesses.length > 1)) && (
                      <details className="also-for">
                        <summary className="link">{m.role === "manager" ? "Can send requests for…" : "Can also request for…"}</summary>
                        <form action={setOtherBusinesses.bind(null, m.email)}>
                          {businesses.filter((x) => x.id !== m.business_id).map((x) => (
                            <label key={x.id} className="also-opt">
                              <input type="checkbox" name="also" value={x.id} defaultChecked={also.includes(x.id)} /> {x.name}
                            </label>
                          ))}
                          <Submit className="btn" type="submit">Save</Submit>
                        </form>
                      </details>
                    )}
                  </div>
                  {m.email !== member.email && (
                    <span className="person-actions">
                      {!hasSignedIn.has(m.email) && <InviteButton email={m.email} />}
                      <form action={removeMember.bind(null, m.email)}>
                        <Submit className="link" style={{ color: "var(--red)" }} type="submit">Remove</Submit>
                      </form>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <AddMember businesses={businesses} />
      </div>
    </Shell>
  );
}
