"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Lets people turn usage stats off (they're on by default).
export default function UsageStats({ on }: { on: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setValue(next);
    setBusy(true);
    await createClient().auth.updateUser({ data: { no_tracking: !next } });
    await createClient().auth.refreshSession();
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="row">
      <div className="ctl">
        <div style={{ fontWeight: 600 }}>Share usage stats</div>
        <div className="when">Which pages you use and for how long, so we can make Oatcake easier. Never what you type.</div>
      </div>
      <input type="checkbox" role="switch" className="switch" checked={value} disabled={busy} onChange={(e) => change(e.target.checked)} aria-label="Share usage stats" />
    </div>
  );
}
