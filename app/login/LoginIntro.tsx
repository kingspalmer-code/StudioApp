"use client";

import { stagger, useAnimate } from "motion/react";
import { useEffect } from "react";

// First visit only: the logo fades in at the centre of the screen, glides up into place with a
// spring, then the tagline and sign-in boxes rise in beneath it. A tiny script in the page hides
// those pieces before the first paint (see INTRO_SCRIPT) so nothing flashes.
export const INTRO_KEY = "oc-intro-seen";
export const INTRO_SCRIPT = `try{if(!sessionStorage.getItem("${INTRO_KEY}"))document.documentElement.classList.add("oc-intro")}catch(e){}`;

export default function LoginIntro({ children }: { children: React.ReactNode }) {
  const [scope, animate] = useAnimate<HTMLElement>();

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("oc-intro") || !scope.current) return;
    const logo = scope.current.querySelector<HTMLElement>(".login-logo");
    const rest = Array.from(scope.current.querySelectorAll<HTMLElement>(".login-sub, .login-what, .login-invited, .auth form > *, .auth > div:not(.login-logo) > *"));
    const done = () => {
      try { sessionStorage.setItem(INTRO_KEY, "1"); } catch {}
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!logo || still) {
      root.classList.remove("oc-intro");
      if (logo) animate([logo, ...rest], { opacity: [0, 1] }, { duration: 0.5 });
      done();
      return;
    }

    const r = logo.getBoundingClientRect();
    const dy = window.innerHeight / 2 - (r.top + r.height / 2);
    Object.assign(logo.style, { opacity: "0", transform: `translateY(${dy}px) scale(1.12)`, filter: "blur(10px)" });
    rest.forEach((el) => Object.assign(el.style, { opacity: "0" }));
    root.classList.remove("oc-intro");

    (async () => {
      await animate(logo, { opacity: 1, filter: "blur(0px)" }, { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] });
      animate(logo, { y: [dy, 0], scale: [1.12, 1] }, { type: "spring", stiffness: 110, damping: 19, mass: 1 });
      await animate(
        rest,
        { opacity: [0, 1], y: [10, 0], filter: ["blur(4px)", "blur(0px)"] },
        { delay: stagger(0.06, { startDelay: 0.32 }), duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }
      );
      [logo, ...rest].forEach((el) => el.style.removeProperty("filter"));
      done();
    })();
  }, [animate, scope]);

  return <main ref={scope} className="auth">{children}</main>;
}
