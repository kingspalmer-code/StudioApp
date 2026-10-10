import BizBadge from "@/components/BizBadge";
import Shell from "@/components/Shell";
import { removeMember } from "@/app/actions";
import { requireMember } from "@/lib/session";
import type { Member } from "@/lib/types";
import AddMember from "./AddMember";

const ROLE_LABEL = { designer: "Designer", manager: "Manager", client: "Client" };

export default async function PeoplePage() {
  const { supabase, member, businesses, shell } = await requireMember(["designer"]);
  const { data } = await supabase.from("members").select("*").order("role").order("email").returns<Member[]>();
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));

  return (
    <Shell {...shell}>
      <h1 className="large">People</h1>
      <p className="sub">Only people listed here can sign in. Clients see their own business's requests; managers see the overview.</p>
      <div className="cols">
        <div>
          <p className="eyebrow">Who has access</p>
          <div className="group">
            {(data ?? []).map((m) => {
              const b = m.business_id ? byId[m.business_id] : undefined;
              return (
                <div className="row" key={m.email}>
                  {b ? <BizBadge biz={b} /> : <span className="badge" style={{ width: 28, height: 28, background: "var(--fill)" }} />}
                  <div className="ctl">
                    <div style={{ fontWeight: 600 }}>{m.full_name || m.email}</div>
                    <div className="when">{m.email} · {ROLE_LABEL[m.role]}{b ? ` · ${b.name}` : ""}</div>
                  </div>
                  {m.email !== member.email && (
                    <form action={removeMember.bind(null, m.email)}>
                      <button className="link" style={{ color: "var(--red)" }} type="submit">Remove</button>
                    </form>
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
