import Link from "next/link";
import Shell from "@/components/Shell";
import { duration, lastNudges, list, nextStep, requireAdmin, since, STEPS, type Person } from "@/lib/admin";
import AdminNav from "../AdminNav";

const ROLE: Record<string, string> = { designer: "Owner", manager: "Manager", client: "Client", staff: "Employee" };

// Everyone who has signed up, newest first, with how far they've got and how much they use Oatcake.
export default async function AdminPeople() {
  const { supabase, shell } = await requireAdmin();
  const [people, { data: sum }, nudged] = await Promise.all([
    list<Person>(supabase.rpc("admin_people")),
    supabase.rpc("admin_summary").single<{ unread_help: number }>(),
    lastNudges(supabase),
  ]);

  return (
    <Shell {...shell}>
      <AdminNav current="people" unread={sum?.unread_help} />
      <h1 className="large">People</h1>
      <p className="sub">Everyone who has signed up, newest first. Open someone to see what they&apos;ve been doing.</p>
      <div className="group admin-table people-table">
        <div className="row table-head"><span>Person</span><span>Set-up</span><span>Last seen</span><span>This week</span><span>All time</span></div>
        {people.map((p) => {
          const done = STEPS.filter((s) => s.done(p)).length;
          const owner = p.role === "designer" || !p.role;
          return (
            <Link key={p.user_id} href={`/admin/people/${p.user_id}`} className="row nav-row">
              <span>
                <b>{p.name || p.email}</b>
                <small className="when">
                  {p.workspace ? `${p.workspace} · ${ROLE[p.role ?? ""] ?? ""}` : "No workspace yet"}
                  {p.is_admin ? " · Admin" : ""}
                  {p.open_help ? ` · ${p.open_help} help open` : ""}
                  {nudged[p.user_id] ? ` · nudged ${since(nudged[p.user_id])}` : ""}
                </small>
              </span>
              <span>
                {owner ? (
                  <>
                    <span className="steps" aria-label={`${done} of ${STEPS.length} set-up steps`}>
                      {STEPS.map((s) => <i key={s.key} className={s.done(p) ? "on" : undefined} />)}
                    </span>
                    <small className="when">{nextStep(p)?.missing ?? "All set up"}</small>
                  </>
                ) : (
                  <small className="when">Joined someone&apos;s workspace</small>
                )}
              </span>
              <span><small className="m-label">Last seen </small>{since(p.last_seen ?? p.last_sign_in)}</span>
              <span>{p.no_tracking ? "Stats off" : duration(p.active_ms_7d)}<small className="m-label"> this week</small></span>
              <span>{p.no_tracking ? "–" : `${duration(p.active_ms)} · ${p.days_active}d`}<small className="m-label"> in all</small></span>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
