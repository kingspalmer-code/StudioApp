import Link from "next/link";
import { headers } from "next/headers";
import Shell from "@/components/Shell";
import Submit from "@/components/Submit";
import { removeEmployee } from "@/app/tasks/actions";
import StaffList from "@/app/tasks/StaffList";
import { requireMember } from "@/lib/session";
import { loadStaffList } from "@/lib/staff";
import type { Member } from "@/lib/types";
import AddEmployee from "./AddEmployee";
import InviteLink from "./InviteLink";

// The owner's view of their employees: add someone, send them an invite, and set and check their to-do list.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { who } = await searchParams;
  const { supabase, member, shell, viewing } = await requireMember(["designer"]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz"}`;
  const [{ data }, { data: signedIn }] = await Promise.all([
    supabase.from("members").select("email, full_name, role, business_id").eq("role", "staff").order("full_name").returns<Member[]>(),
    supabase.rpc("members_signed_in"),
  ]);
  const staff = data ?? [];
  const hasSignedIn = new Set((signedIn as string[] | null) ?? []);
  const current = staff.find((s) => s.email === who) ?? staff[0];
  const list = current ? await loadStaffList(supabase, current.email) : null;
  const name = (m: Member) => m.full_name || m.email;

  return (
    <Shell {...shell}>
      <h1 className="large">Team</h1>
      <p className="sub">Add the people who work for you and give them a to-do list. They sign in and see only their list: they tick things off, add notes, and can add tasks of their own.</p>
      <div className="cols team">
        <div>
          {current && list ? (
            <>
              {staff.length > 1 && (
                <nav className="seg team-pick" aria-label="Employees">
                  {staff.map((s) => (
                    <Link key={s.email} href={`/team?who=${encodeURIComponent(s.email)}`} aria-current={s.email === current.email ? "page" : undefined}>
                      {name(s).split(" ")[0]}
                    </Link>
                  ))}
                </nav>
              )}
              <h2 className="team-name">{name(current)}&apos;s to-do</h2>
              <StaffList list={list} assignee={current.email} me={member.email} owner />
            </>
          ) : (
            <div className="group"><div className="empty">No employees yet. Add someone to set them tasks.</div></div>
          )}
        </div>
        <div>
          {staff.length > 0 && (
            <>
              <p className="eyebrow">Your team</p>
              <div className="group">
                {staff.map((s) => (
                  <div className="row person-row" key={s.email}>
                    <div className="ctl">
                      <div style={{ fontWeight: 600 }}>{name(s)}</div>
                      <div className="when">{s.email}{!hasSignedIn.has(s.email) && " · Not signed in yet"}</div>
                      {!viewing && <InviteLink url={`${origin}/login?email=${encodeURIComponent(s.email)}`} email={s.email} />}
                    </div>
                    {!viewing && (
                      <form action={removeEmployee.bind(null, s.email)}>
                        <Submit className="link" style={{ color: "var(--red)" }} type="submit">Remove</Submit>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {!viewing && <AddEmployee origin={origin} />}
        </div>
      </div>
    </Shell>
  );
}
