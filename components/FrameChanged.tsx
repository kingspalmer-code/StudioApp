"use client";

import { useEffect, useRef } from "react";

// A job open beside the queue (components/SplitPanel.tsx) is the job page in a frame, with its own
// router, so finishing it or changing its stage only refreshed the frame and the queue next to it
// stayed as it was. The page passes the time it was drawn; when it's drawn again (after a button
// in it saved something), this tells the window around it, which refreshes the queue.
export default function FrameChanged({ at }: { at: number }) {
  const first = useRef(at);
  useEffect(() => {
    if (at === first.current || window.parent === window) return;
    window.parent.postMessage({ type: "oatcake:changed" }, window.location.origin);
  }, [at]);
  return null;
}
