import Link from "next/link";
import FilmGrain from "@/components/FilmGrain";
import OatcakeLogo from "@/components/OatcakeLogo";
import LoginForm from "./LoginForm";
import LoginIntro, { INTRO_SCRIPT } from "./LoginIntro";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const { error, email } = await searchParams;
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
          initialError={
            error === "no-access"
              ? "That email isn't on Oatcake yet. Use \"Get started\" below."
              : error === "link"
                ? "That sign-in link has expired or was already used. Request a new one."
                : null
          }
        />
        <p className="login-about">
          Oatcake is a job tracker for small creative businesses and their clients: requests, drafts, to-dos, quotes and invoices in one place.{" "}
          <Link href="/privacy">Privacy</Link>
        </p>
      </LoginIntro>
    </div>
  );
}
