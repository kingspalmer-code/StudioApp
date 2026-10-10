import { redirect } from "next/navigation";
import FilmGrain from "@/components/FilmGrain";
import OatcakeLogo from "@/components/OatcakeLogo";
import Tracker from "@/components/Tracker";
import { createClient } from "@/lib/supabase/server";
import WelcomeForm from "./WelcomeForm";

// The setup helper waits on Claude, which can take a little while.
export const maxDuration = 60;

// First stop for someone who has signed in but doesn't have a workspace yet.
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("members").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  if (member) redirect("/");

  return (
    <div className="login-screen">
      <FilmGrain />
      {!user.user_metadata?.no_tracking && <Tracker />}
      <main className="auth welcome">
        <div className="login-logo">
          <OatcakeLogo height={36} />
        </div>
        <WelcomeForm email={user.email ?? ""} hasPassword={Boolean(user.user_metadata?.has_password)} helper={Boolean(process.env.ANTHROPIC_API_KEY)} />
      </main>
    </div>
  );
}
