import OatcakeLogo from "@/components/OatcakeLogo";
import { Flakes, Oatcake } from "./LoginArt";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-screen">
      <Flakes />
      <Oatcake size={520} className="big-oatcake" />
      <Oatcake size={150} className="small-oatcake" />
      <main className="auth">
        <div className="login-logo">
          <OatcakeLogo height={44} />
        </div>
        <p className="login-sub">Organised by design.</p>
        <LoginForm
          playful
          initialError={
            error === "no-access"
              ? "That email doesn't have access yet. Ask whoever runs your Oatcake to add you."
              : error === "link"
                ? "That sign-in link has expired or was already used. Request a new one."
                : null
          }
        />
      </main>
    </div>
  );
}
