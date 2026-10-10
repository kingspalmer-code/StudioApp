import Link from "next/link";
import { signOut } from "@/app/actions";
import Shell from "@/components/Shell";
import ThemeToggle from "@/components/ThemeToggle";
import { requireMember } from "@/lib/session";
import SetPassword from "./SetPassword";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams;
  const { supabase, member, businesses, shell } = await requireMember();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasPassword = Boolean(user?.user_metadata?.has_password);

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 520 }}>
        <h1 className="large">{setup && !hasPassword ? "Set a password" : "Your account"}</h1>
        <p className="sub">
          {setup && !hasPassword
            ? "Set a password so next time you can sign in straight away, without waiting for an email."
            : `Signed in as ${member.email}.`}
        </p>
        <SetPassword hasPassword={hasPassword} skippable={Boolean(setup)} />

        {!setup && (
          <>
            <p className="eyebrow">Appearance</p>
            <div className="group">
              <div className="row">
                <span className="k">Theme</span>
                <div className="ctl" style={{ display: "flex", justifyContent: "flex-end" }}><ThemeToggle /></div>
              </div>
            </div>

            {(member.role === "designer" || shell.isAdmin) && (
              <div className="group" style={{ marginTop: 22 }}>
                {member.role === "designer" && (
                  <Link href="/settings" className="row nav-row" data-tour="settings">
                    <div className="ctl">
                      <div style={{ fontWeight: 600 }}>Settings</div>
                      <div className="when">Stages, the job form, and your quote and invoice style</div>
                    </div>
                    <span className="when">›</span>
                  </Link>
                )}
                {member.role === "designer" && (
                  <Link href="/queue?tour=1" className="row nav-row">
                    <div className="ctl" style={{ fontWeight: 600 }}>Show me around again</div>
                    <span className="when">›</span>
                  </Link>
                )}
                {shell.isAdmin && (
                  <Link href="/admin" className="row nav-row">
                    <div className="ctl" style={{ fontWeight: 600 }}>Admin</div>
                    <span className="when">›</span>
                  </Link>
                )}
              </div>
            )}

            <form action={signOut} style={{ marginTop: 22 }}>
              <button className="btn plain wide" type="submit" style={{ marginTop: 0, color: "var(--red)" }}>Sign out</button>
            </form>
          </>
        )}
      </div>
    </Shell>
  );
}
