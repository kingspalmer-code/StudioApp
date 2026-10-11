"use client";

import { stagger, useAnimate } from "motion/react";
import { useEffect } from "react";

// First visit only: the logo fades in at the centre of the screen and glides up into place, the
// "One place for / Built for" wheels blur in beneath it and hold for a moment so they can turn,
// then the sign-in boxes rise in. A tap or key press skips the wait. A tiny script in the page
// hides those pieces before the first paint (see INTRO_SCRIPT) so nothing flashes.
export const INTRO_KEY = "oc-intro-seen";
export const INTRO_SCRIPT = `try{if(!localStorage.getItem("${INTRO_KEY}"))document.documentElement.classList.add("oc-intro")}catch(e){}`;

const HOLD_MS = 2600;
const ease = [0.2, 0.8, 0.2, 1] as const;

export default function LoginIntro({ children }: { children: React.ReactNode }) {
  const [scope, animate] = useAnimate<HTMLElement>();

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("oc-intro") || !scope.current) return;
    const logo = scope.current.querySelector<HTMLElement>(".login-logo");
    const wheels = scope.current.querySelector<HTMLElement>(".login-wheels");
    const rest = Array.from(scope.current.querySelectorAll<HTMLElement>(".login-sub, .auth form > *, .auth > div:not(.login-logo):not(.login-wheels) > *"));
    const done = () => {
      try { localStorage.setItem(INTRO_KEY, "1"); } catch {}
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const all = [logo, wheels, ...rest].filter((el): el is HTMLElement => Boolean(el));

    if (!logo || still) {
      root.classList.remove("oc-intro");
      animate(all, { opacity: [0, 1] }, { duration: 0.5 });
      done();
      return;
    }

    let skip = () => {};
    const skipped = new Promise<void>((resolve) => (skip = resolve));
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });

    const r = logo.getBoundingClientRect();
    const dy = window.innerHeight / 2 - (r.top + r.height / 2);
    Object.assign(logo.style, { opacity: "0", transform: `translateY(${dy}px) scale(1.12)`, filter: "blur(10px)" });
    [wheels, ...rest].forEach((el) => el && Object.assign(el.style, { opacity: "0" }));
    root.classList.remove("oc-intro");

    (async () => {
      await animate(logo, { opacity: 1, filter: "blur(0px)" }, { duration: 0.5, ease });
      animate(logo, { y: [dy, 0], scale: [1.12, 1] }, { type: "spring", stiffness: 110, damping: 19, mass: 1 });
      if (wheels) {
        await animate(
          wheels,
          { opacity: [0, 1], y: [14, 0], scale: [0.98, 1], filter: ["blur(12px)", "blur(0px)"] },
          { delay: 0.3, duration: 0.9, ease }
        );
        await Promise.race([new Promise((r) => setTimeout(r, HOLD_MS)), skipped]);
      }
      await animate(
        rest,
        { opacity: [0, 1], y: [10, 0], filter: ["blur(4px)", "blur(0px)"] },
        { delay: stagger(0.06), duration: 0.5, ease }
      );
      all.forEach((el) => el.style.removeProperty("filter"));
      done();
    })();

    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [animate, scope]);

  return <main ref={scope} className="auth">{children}</main>;
}
