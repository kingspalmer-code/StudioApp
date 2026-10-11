"use client";

import { useId, type Ref } from "react";
import { useReducedMotion } from "motion/react";
import { EATING, STILL, STILL_SMALL } from "./oatcakeBiscuitSvg";

// Oatcake's little helper mark: a hand-inked oatcake with a bite out of it. While Oatcake is
// working it gets eaten bite by bite and a fresh one appears. Ink follows the text colour.
export default function OatcakeBiscuit({
  eating = false,
  small = false,
  className,
  ref,
}: {
  eating?: boolean;
  small?: boolean;
  className?: string;
  ref?: Ref<SVGSVGElement>;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduce = useReducedMotion();
  const markup = (eating && !reduce ? EATING : small ? STILL_SMALL : STILL).replaceAll("__UID__", uid);
  return (
    <svg
      ref={ref}
      key={eating ? "eat" : "still"}
      viewBox="0 0 240 240"
      aria-hidden="true"
      className={["oc-biscuit", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
