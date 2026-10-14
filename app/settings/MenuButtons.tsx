"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NavIcon } from "@/components/NavIcons";
import { alwaysOnComputer } from "@/lib/menu";

type Hidden = { phone: string[]; computer: string[] };

// Which buttons show in the menu: the tab bar on phones, and the sidebar on computers and the Mac app.
// Saved to this account. The first one always stays, so the menu is never empty, Settings always
// stays on computers so these switches can't be lost, and hidden pages still open from links and alerts.
export default function MenuButtons({ links, hidden }: { links: { href: string; label: string; icon?: string }[]; hidden: Hidden }) {
  const router = useRouter();
  const [value, setValue] = useState<Hidden>(hidden);
  const [busy, setBusy] = useState(false);
  async function toggle(where: keyof Hidden, href: string, on: boolean) {
    const next = { ...value, [where]: on ? value[where].filter((h) => h !== href) : [...value[where], href] };
    setValue(next);
    setBusy(true);
    await createClient().auth.updateUser({ data: { hide_phone: next.phone, hide_computer: next.computer } });
    await createClient().auth.refreshSession();
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="group menu-buttons">
      <div className="row menu-head">
        <div className="ctl" />
        <span>Phone</span>
        <span>Computer</span>
      </div>
      {links.map((l, i) => (
        <div className="row" key={l.href}>
          <span className="menu-icon"><NavIcon href={l.icon ?? l.href} /></span>
          <div className="ctl">
            <div style={{ fontWeight: 600 }}>{l.label}</div>
            {i === 0 && <div className="when">Always shown</div>}
            {i > 0 && alwaysOnComputer(l.href, i) && <div className="when">Always shown on computers</div>}
          </div>
          {(["phone", "computer"] as const).map((where) => {
            const fixed = where === "computer" ? alwaysOnComputer(l.href, i) : i === 0;
            return (
            <input
              key={where}
              type="checkbox"
              role="switch"
              className="switch"
              checked={fixed || !value[where].includes(l.href)}
              disabled={fixed || busy}
              onChange={(e) => toggle(where, l.href, e.target.checked)}
              aria-label={`Show ${l.label} on ${where === "phone" ? "your phone" : "computers"}`}
            />
            );
          })}
        </div>
      ))}
    </div>
  );
}
