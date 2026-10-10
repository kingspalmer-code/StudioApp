import OatcakeLogo from "@/components/OatcakeLogo";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-screen">
      <main className="auth">
        <div className="login-logo">
          <OatcakeLogo height={44} />
        </div>
        <p className="login-sub">Organised by design.</p>
        <LoginForm
          initialError={
            error === "no-access"
              ? "That email isn't set up yet. Use \"Create an account\" below."
              : error === "link"
                ? "That sign-in link has expired or was already used. Request a new one."
                : null
          }
        />
      </main>
    </div>
  );
}
