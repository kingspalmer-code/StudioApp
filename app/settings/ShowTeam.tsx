"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Takes Team out of the sidebar, the phone tab bar and the Mac app's bar, for this account only.
// The page still works from its link, and alerts about tasks still arrive.
export default function ShowTeam({ on }: { on: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setValue(next);
    setBusy(true);
    await createClient().auth.updateUser({ data: { hide_team: !next } });
    await createClient().auth.refreshSession();
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="group">
      <div className="row">
        <div className="ctl">
          <div style={{ fontWeight: 600 }}>Show Team</div>
          <div className="when">Employees and their to-do lists, in the menu on your phone, computer and the Mac app.</div>
        </div>
        <input type="checkbox" role="switch" className="switch" checked={value} disabled={busy} onChange={(e) => change(e.target.checked)} aria-label="Show Team in the menu" />
      </div>
    </div>
  );
}
