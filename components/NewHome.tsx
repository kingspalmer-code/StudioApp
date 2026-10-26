"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveProfile } from "@/lib/supabase/client";
import { flashSaved } from "./Saved";
import { NavIcon } from "./NavIcons";
import type { HomeMode } from "@/lib/menu";

const LATER = "oatcake-new-home-later";

const CHOICES: { mode: HomeMode; icon: string; title: string; text: string }[] = [
  { mode: "life", icon: "/today", title: "Life and work", text: "Open on Today, with your jobs, clients and quotes under one Work button." },
  { mode: "work", icon: "/queue", title: "Just work", text: "Open on Jobs, with the menu the way it was. Today and Habits can still be added." },
];

// The two ways an owner's Oatcake can open (lib/menu.ts HomeMode), as two cards to pick from.
// Used by the one-time card below and by Settings > Menu.
export function HomeModeChoice({ current, onPicked }: { current?: HomeMode; onPicked?: (mode: HomeMode) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<HomeMode | null>(null);
  async function pick(mode: HomeMode) {
    setBusy(mode);
    const { error } = await saveProfile({ data: { home_mode: mode } });
    setBusy(null);
    if (error) return;
    flashSaved();
    onPicked?.(mode);
    // Moving across: land on the new home rather than a page that's no longer in the menu.
    if (mode !== current) router.push(mode === "work" ? "/queue" : "/today");
    router.refresh();
  }
  return (
    <div className="home-modes" role="radiogroup" aria-label="How Oatcake opens">
      {CHOICES.map((c) => (
        <button key={c.mode} type="button" role="radio" aria-checked={current === c.mode} className="home-mode" disabled={busy !== null} onClick={() => pick(c.mode)}>
          <span className="home-mode-icon"><NavIcon href={c.icon} /></span>
          <span className="home-mode-text">
            <b>{busy === c.mode ? "Saving…" : c.title}</b>
            <span>{c.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Shown once to owners whose workspace was set up before Today became the home page, so anyone who
// used Oatcake purely for client work can keep it that way. "Decide later" hides it until next visit.
export default function NewHome() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let later = false;
    try {
      later = sessionStorage.getItem(LATER) === "1";
    } catch {}
    setOpen(!later);
  }, []);
  if (!open) return null;
  function later() {
    try {
      sessionStorage.setItem(LATER, "1");
    } catch {}
    setOpen(false);
  }
  return (
    <div className="new-home-layer" role="dialog" aria-modal="true" aria-labelledby="new-home-title">
      <div className="new-home-card">
        <p className="new-home-eyebrow">Something new</p>
        <h2 id="new-home-title" className="new-home-title">Oatcake has a new home</h2>
        <p className="new-home-notes">
          Oatcake now opens on Today: somewhere to jot things down, the few things for today, your habits and Pickle. Nothing has gone anywhere. Your jobs,
          clients and quotes are all under Work.
        </p>
        <p className="new-home-notes">If you use Oatcake just for client work, you can keep it the way it was. Change your mind any time in Settings, Menu.</p>
        <HomeModeChoice onPicked={() => setOpen(false)} />
        <button type="button" className="link new-home-later" onClick={later}>Decide later</button>
      </div>
    </div>
  );
}
