"use client";

import Link from "next/link";
import { Silkscreen } from "next/font/google";
import { useEffect, useState, useTransition } from "react";
import { Blob, hatFor, stageFor } from "@/components/QueueWidgets";
import type { PetView } from "@/lib/pet";
import { hatOf } from "@/lib/pickle/art";
import { CATALOGUE, GAME_CAP, ITEM, SHELVES, lookOf, type Item, type Shelf, type Worn } from "@/lib/pickle/catalogue";
import { buyPickleItem, wearPickleItem } from "./actions";
import Dash from "./Dash";
import Lab from "./Lab";

const pixel = Silkscreen({ weight: "400", subsets: ["latin"] });

type Place = "shop" | "arcade" | "lab";

// Pickle's World: his device up top (the shell colour is one of the things you can buy), and the
// places underneath. Trying something on shows it on him straight away; Buy keeps it.
export default function PickleWorld({ pet: start, lab }: { pet: PetView | null; lab: boolean }) {
  const [pet, setPet] = useState(start);
  const [place, setPlace] = useState<Place>("shop");
  const [trying, setTrying] = useState<Item | null>(null);
  const [say, setSay] = useState<string | null>(null);
  useEffect(() => {
    if (!say) return;
    const t = setTimeout(() => setSay(null), 2600);
    return () => clearTimeout(t);
  }, [say]);

  if (!pet) return <p className="pw-empty">Pickle is hatching…</p>;
  const worn: Worn = trying ? { ...pet.worn, [trying.slot]: trying.id } : pet.worn;
  const look = lookOf(worn);
  const places: { key: Place; label: string; icon: React.ReactNode }[] = [
    { key: "shop", label: "Shop", icon: <path d="M5 8h14l-1 12H6zM9 8a3 3 0 016 0" /> },
    { key: "arcade", label: "Arcade", icon: <><rect x="3" y="7" width="18" height="11" rx="4" /><path d="M8 11v3M6.5 12.5h3" /></> },
    ...(lab ? [{ key: "lab" as const, label: "Lab", icon: <path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7.5 15h9" /> }] : []),
  ];

  return (
    <div className="pw">
      <header className="pw-head">
        <div>
          <p className="pw-kicker"><Link href="/today">Today</Link></p>
          <h1 className="pw-title">Pickle&apos;s World</h1>
        </div>
        <span className={`pw-tin ${pixel.className}`} title="Oatcakes in the tin">
          <OatcakeIcon /> {pet.tin}
        </span>
      </header>

      <div className="pw-device" style={{ ["--shell" as string]: look.shell?.body, ["--shell-ink" as string]: look.shell?.ink }}>
        <div className={`pw-screen lcd screen-${look.screen} ${pixel.className}`}>
          <span className="pw-name">Pickle <small>LV {pet.level}</small></span>
          <span className="pw-says">{say ?? (trying ? "ooh!" : `Day ${pet.streak}`)}</span>
          <Walker>
            <Blob mood="happy" stage={stageFor(pet.level)} hat={hatOf(look.wear, hatFor(pet.level))} wear={look.wear} paint={look.paint} />
          </Walker>
        </div>
        <div className="pw-buttons" aria-hidden="true"><i /><i /><i /></div>
      </div>

      <nav className="pw-places" aria-label="Places">
        {places.map((p) => (
          <button key={p.key} type="button" aria-pressed={place === p.key} onClick={() => { setPlace(p.key); setTrying(null); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{p.icon}</svg>
            {p.label}
          </button>
        ))}
      </nav>

      {place === "shop" && <Shop pet={pet} trying={trying} onTry={setTrying} onPet={setPet} onSay={setSay} />}
      {place === "arcade" && (
        <section className="pw-place">
          <p className="pw-blurb">Games pay 1 oatcake for every 100 points, up to {GAME_CAP} a day, so playing is a treat and never beats the real work.</p>
          <Dash pet={pet} look={look} font={pixel.style.fontFamily} onPet={setPet} onSay={setSay} />
          <p className="pw-soon">Coming next: Trolley Launch, then Pickle&apos;s Bakery.</p>
        </section>
      )}
      {place === "lab" && <Lab />}
    </div>
  );
}

// Pickle wanders his screen on his own, a few steps at a time.
function Walker({ children }: { children: React.ReactNode }) {
  const [x, setX] = useState(40);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setX(6 + Math.random() * 74), 2600);
    return () => clearInterval(t);
  }, []);
  return <span className="pw-walk" style={{ left: `${x}%` }}>{children}</span>;
}

function Shop({ pet, trying, onTry, onPet, onSay }: { pet: PetView; trying: Item | null; onTry: (i: Item | null) => void; onPet: (p: PetView) => void; onSay: (s: string) => void }) {
  const [shelf, setShelf] = useState<Shelf>("Clothes");
  const [busy, start] = useTransition();
  const owned = new Set(pet.owned);
  const wearing = new Set(Object.values(pet.worn));
  const act = (run: () => Promise<PetView | null>, said: string) =>
    start(async () => {
      const next = await run();
      if (next) { onPet(next); onSay(said); }
      onTry(null);
    });

  if (!pet.shop) return <p className="pw-blurb">The shop opens once Pickle has moved over to the new oatcakes. It won&apos;t be long.</p>;
  const t = trying;
  const locked = t?.needs && !owned.has(t.needs);
  const always = t?.slot === "shell" || t?.slot === "screen";
  return (
    <section className="pw-place">
      <div className="pw-shelves" role="tablist" aria-label="Shelves">
        {SHELVES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={shelf === s} onClick={() => { setShelf(s); onTry(null); }}>{s}</button>
        ))}
      </div>
      <div className="pw-items">
        {CATALOGUE.filter((i) => i.shelf === shelf).map((i) => (
          <button key={i.id} type="button" className="pw-item" aria-pressed={t ? t.id === i.id : wearing.has(i.id)} onClick={() => onTry(t?.id === i.id ? null : i)}>
            <ItemPic item={i} />
            <b>{i.name}</b>
            {owned.has(i.id) ? <span className="pw-owned">{wearing.has(i.id) ? "Wearing" : "Yours"}</span> : <span className="pw-price"><OatcakeIcon /> {i.price}</span>}
          </button>
        ))}
      </div>
      <div className="pw-try" aria-live="polite">
        {!t ? (
          <p>{shelf === "Paints" && !owned.has("screen-colour") ? "Paints need the Colour screen, on the Screens shelf." : "Tap something to try it on."}</p>
        ) : (
          <>
            <p><b>{t.name}</b>{t.note ? ` · ${t.note}` : ""}{locked ? ` · needs the ${ITEM[t.needs!].name} first` : ""}</p>
            {owned.has(t.id) ? (
              wearing.has(t.id) ? (
                !always && <button type="button" className="btn small plain" disabled={busy} onClick={() => act(() => wearPickleItem(t.slot, null), "ta-da")}>Take off</button>
              ) : (
                <button type="button" className="btn small" disabled={busy} onClick={() => act(() => wearPickleItem(t.slot, t.id), "ta-da")}>Wear</button>
              )
            ) : (
              <>
                <button type="button" className="btn small" disabled={busy || !!locked || pet.tin < t.price} onClick={() => act(() => buyPickleItem(t.id), "thank u!")}>
                  Buy for {t.price}
                </button>
                {pet.tin < t.price && <span className="pw-short">{t.price - pet.tin} more to go</span>}
              </>
            )}
            <button type="button" className="btn small plain" onClick={() => onTry(null)}>Stop trying on</button>
          </>
        )}
      </div>
    </section>
  );
}

function ItemPic({ item }: { item: Item }) {
  if (item.shell) return <span className="pw-swatch" style={{ background: item.shell.body }} />;
  if (item.screen) return <span className={`pw-swatch lcd screen-${item.screen}`} />;
  const look = lookOf({ [item.slot]: item.id, ...(item.paint ? { screen: "screen-colour" } : {}) });
  return (
    <span className={`pw-pic lcd screen-${look.screen}`}>
      <Blob mood="happy" stage="kid" hat={hatOf(look.wear, null)} wear={look.wear} paint={look.paint} />
    </span>
  );
}

export function OatcakeIcon() {
  return (
    <svg className="pw-oc" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7.5" cy="8" r="1" fill="currentColor" /><circle cx="12.5" cy="8.5" r="1" fill="currentColor" /><circle cx="10" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}
