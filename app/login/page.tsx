import FilmGrain from "@/components/FilmGrain";
import OatcakeLogo from "@/components/OatcakeLogo";
import LoginForm from "./LoginForm";
import LoginIntro, { INTRO_SCRIPT } from "./LoginIntro";
import Wheels from "./Wheels";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-screen">
      <FilmGrain />
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <LoginIntro>
        <div className="login-logo">
          <OatcakeLogo height={44} />
        </div>
        <p className="login-sub">Organised by design.</p>
        <Wheels />
        <p className="login-invited">Invited by your designer? Sign in with the email they used.</p>
        <LoginForm
          initialError={
            error === "no-access"
              ? "That email isn't on Oatcake yet. Use \"Get started\" below."
              : error === "link"
                ? "That sign-in link has expired or was already used. Request a new one."
                : null
          }
        />
      </LoginIntro>
    </div>
  );
}
