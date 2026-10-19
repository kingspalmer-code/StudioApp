"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { flashSaved, previousPage } from "./Saved";

// A form that shows it worked once its action has saved (components/Saved.tsx), then moves on:
// - "back": you came here to edit this, so go back to the page you were on (or `fallback`). A job
//   open beside the queue closes its panel instead, back to the queue (components/SplitPanel.tsx).
// - "close": folds away the <details> it sits in, so the row goes back to how it looks normally.
// - "stay": just the note, for settings you keep working through on the same page.
export default function SaveForm({
  action,
  saved = "Saved",
  then = "stay",
  fallback = "/",
  className,
  id,
  children,
}: {
  action: (formData: FormData) => Promise<unknown>;
  saved?: string;
  then?: "back" | "close" | "stay";
  fallback?: string;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      id={id}
      className={className}
      action={async (fd) => {
        await action(fd);
        if (then === "back" && window.top !== window.self) {
          window.parent.postMessage({ type: "oatcake:done", text: saved }, location.origin);
          return;
        }
        flashSaved(saved);
        if (then === "back") router.push(previousPage() ?? fallback);
        if (then === "close") {
          const box = ref.current?.closest("details");
          if (box) box.open = false;
        }
      }}
    >
      {children}
    </form>
  );
}
