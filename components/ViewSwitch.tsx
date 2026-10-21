"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { saveProfile } from "@/lib/supabase/client";

// One side of the Priority list / Board switch above the jobs. Picking a side also saves it to the
// account (user_metadata jobs_view), so the jobs open that way next time, on every device.
export default function ViewSwitch({ href, view, current, remember, children }: { href: string; view: "list" | "board"; current: boolean; remember: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      onClick={() => {
        if (remember && !current) saveProfile({ data: { jobs_view: view } }).catch(() => {});
      }}
    >
      {children}
    </Link>
  );
}
