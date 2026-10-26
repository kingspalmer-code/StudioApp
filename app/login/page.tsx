import FilmGrain from "@/components/FilmGrain";
import OatcakeLogo from "@/components/OatcakeLogo";
import LoginForm from "./LoginForm";
import LoginIntro, { INTRO_SCRIPT } from "./LoginIntro";
import { safeNext } from "@/lib/next-path";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; next?: string }> }) {
  const { error, email, next } = await searchParams;
  return (
    <div className="login-screen">
      <FilmGrain />
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <LoginIntro>
        <div className="login-logo">
          <OatcakeLogo height={44} />
        </div>
        <LoginForm
          initialEmail={typeof email === "string" ? email.slice(0, 200) : ""}
          next={safeNext(typeof next === "string" ? next : null) ?? "/"}
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
