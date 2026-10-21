import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComponentProps } from "react";
import type QueueWidgets from "@/components/QueueWidgets";
import type { WeekDay } from "@/components/QueueWidgets";
import { brandFor } from "./brands";
import { coversFor } from "./deliveries";
import { visitPet, type PetOwner } from "./pet";
import { isDone, todayISO, type Ctx } from "./priority";
import type { Business, ListTicket } from "./types";

// What the widget row (components/QueueWidgets.tsx) shows, worked out from a list of jobs: the
// studio's whole queue, or a client's own requests. `pet` says what fills Pickle's tin; leave it
// out (e.g. while previewing a client) and Pickle isn't visited.
export async function loadWidgets(
  supabase: SupabaseClient,
  all: ListTicket[],
  ctx: Ctx,
  byId: Record<string, Business>,
  pet?: { earned: number; base: number; owner?: PetOwner },
): Promise<Omit<ComponentProps<typeof QueueWidgets>, "earnHint" | "petBusiness">> {
  const today = todayISO();
  const dayAt = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
  const monday = dayAt(-((new Date(today).getUTCDay() + 6) % 7));
  const sunday = dayAt(6 - ((new Date(today).getUTCDay() + 6) % 7));
  const open = all.filter((t) => !isDone(t, ctx));
  const done = all.filter((t) => isDone(t, ctx));
  // Without dates there's nothing due to put on the week ahead.
  const week: WeekDay[] | null = ctx.noDates ? null : Array.from({ length: 7 }, (_, i) => {
    const date = dayAt(i);
    return {
      date,
      label: i === 0 ? "Today" : new Date(date).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).slice(0, 2),
      today: i === 0,
      jobs: open
        .filter((t) => t.deadline && (t.deadline === date || (i === 0 && t.deadline < date)))
        .map((t) => ({ id: t.id, title: t.title, color: t.deadline! < date ? "var(--red)" : (byId[t.business_id] ? brandFor(byId[t.business_id]).color : "var(--label-3)") })),
    };
  });
  const deliveredWeek = done.filter((t) => (t.delivered_at ?? "").slice(0, 10) >= monday).length;
  const late = ctx.noDates ? null : open.filter((t) => t.deadline && t.deadline < today).length;
  const recent = done
    .filter((t) => t.delivered_at)
    .sort((a, b) => b.delivered_at!.localeCompare(a.delivered_at!))
    .slice(0, 24);
  const [covers, petView] = await Promise.all([
    coversFor(supabase, recent.map((t) => t.id)),
    pet ? visitPet(supabase, pet.earned, pet.base, pet.owner) : Promise.resolve(null),
  ]);
  const reel = recent.filter((t) => covers[t.id]?.url).slice(0, 6).map((t) => ({ id: t.id, title: t.title, url: covers[t.id]!.url! }));
  return { week, reel, pet: petView, tally: { delivered: deliveredWeek, due: ctx.noDates ? null : open.filter((t) => t.deadline && t.deadline <= sunday).length, late } };
}
