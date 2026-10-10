import Shell from "@/components/Shell";
import { requireMember } from "@/lib/session";
import SetPassword from "./SetPassword";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams;
  const { supabase, member } = await requireMember();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasPassword = Boolean(user?.user_metadata?.has_password);

  return (
    <Shell member={member}>
      <div style={{ maxWidth: 520 }}>
        <h1 className="large">{setup && !hasPassword ? "Set a password" : "Your account"}</h1>
        <p className="sub">
          {setup && !hasPassword
            ? "Set a password so next time you can sign in straight away, without waiting for an email."
            : `Signed in as ${member.email}.`}
        </p>
        <SetPassword hasPassword={hasPassword} skippable={Boolean(setup)} />
      </div>
    </Shell>
  );
}
