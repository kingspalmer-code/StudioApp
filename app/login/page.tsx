import FilmGrain from "@/components/FilmGrain";
import OatcakeLogo from "@/components/OatcakeLogo";
import LoginForm from "./LoginForm";
import LoginIntro, { INTRO_SCRIPT } from "./LoginIntro";
import Story from "./Story";
import { safeNext } from "@/lib/next-path";
import "./story.css";

// oatcake.xyz for anyone signed out: the sign-in fills the first screen, and scrolling down tells
// you what Oatcake is (Story.tsx). The Mac app and Home Screen icons only show the sign-in.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; next?: string; start?: string }> }) {
  const { error, email, next, start } = await searchParams;
  return (
    <>
      <div className="login-screen" id="top">
        <FilmGrain />
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
        <LoginIntro>
          <div className="login-logo">
            <OatcakeLogo height={44} />
          </div>
          <LoginForm
            start={start === "1"}
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
        <a className="st-cue" href="#story">
          What is Oatcake?
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </a>
      </div>
      <div id="story">
        <Story />
      </div>
    </>
  );
}
