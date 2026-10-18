"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NavIcon } from "@/components/NavIcons";
import { alwaysOnComputer, onPhoneTab } from "@/lib/menu";

type Hidden = { phoneTabs?: string[]; computer: string[] };
type Links = { href: string; label: string; icon?: string }[];

// Which buttons show in the menu: the tab bar on phones (the rest go under More), and the sidebar on
// computers and the Mac app. Saved to this account. The first one always stays, so the menu is never
// empty, Settings always stays on computers so these switches can't be lost, and hidden pages still
// open from links and alerts.
export default function MenuButtons({ links, hidden }: { links: Links; hidden: Hidden }) {
  const router = useRouter();
  // The phone switches start from the default few until the owner has picked their own.
  const [phone, setPhone] = useState(() => links.filter((l, i) => onPhoneTab(l.href, i, hidden.phoneTabs)).map((l) => l.href));
  const [computer, setComputer] = useState(hidden.computer);
  const [busy, setBusy] = useState(false);
  const value = { phone, computer };
  async function toggle(where: "phone" | "computer", href: string, on: boolean) {
    const nextPhone = where === "phone" ? (on ? [...phone, href] : phone.filter((h) => h !== href)) : phone;
    const nextComputer = where === "computer" ? (on ? computer.filter((h) => h !== href) : [...computer, href]) : computer;
    setPhone(nextPhone);
    setComputer(nextComputer);
    setBusy(true);
    await createClient().auth.updateUser({ data: { phone_tabs: nextPhone, hide_computer: nextComputer } });
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
            {i > 0 && !phone.includes(l.href) && <div className="when">Under More on your phone</div>}
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
              checked={fixed || (where === "phone" ? value.phone.includes(l.href) : !value.computer.includes(l.href))}
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
