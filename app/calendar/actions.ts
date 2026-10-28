"use server";

import { revalidatePath } from "next/cache";
import { parseCapture } from "@/lib/quickadd";
import { requireEditor } from "@/lib/session";
import { CARD_COLOURS, CARD_SIZES, PLAN_COLUMNS, type CardSize, type PlanItem } from "@/lib/plan";

// Every change on the calendar page is made straight away on screen; these save it. Each returns
// the saved row (or an error) so the page can put things back if the save didn't go through.
type Result = { item?: PlanItem; error?: string };

const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
const dateOrNull = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const timeOrNull = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(v) ? v : null);
const remindOrNull = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 10080 ? Math.round(v) : null);

export async function addPlanItem(input: {
  title: string;
  parent_id?: number | null;
  ticket_id?: number | null;
  grp?: string;
  owner?: string;
  on_date?: string | null;
  at_time?: string | null;
  rank: number;
}): Promise<Result> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const title = clean(input.title, 300);
  if (!title) return { error: "Give it a name." };
  const { data, error } = await supabase
    .from("plan_items")
    .insert({
      title,
      parent_id: input.parent_id ?? null,
      ticket_id: input.ticket_id ?? null,
      ...(input.grp ? { grp: clean(input.grp, 60) } : {}),
      owner: input.owner || member.email,
      on_date: dateOrNull(input.on_date),
      at_time: timeOrNull(input.at_time),
      remind: 0,
      rank: Number.isFinite(input.rank) ? input.rank : 0,
    })
    .select(PLAN_COLUMNS)
    .single<PlanItem>();
  return error ? { error: error.message } : { item: data };
}

export type PlanPatch = Partial<Pick<PlanItem, "title" | "notes" | "on_date" | "end_date" | "at_time" | "colour" | "grp" | "place" | "size" | "remind" | "ticket_id" | "owner" | "rank" | "parent_id">> & { done?: boolean };

export async function updatePlanItem(id: number, patch: PlanPatch): Promise<Result> {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const row: Record<string, unknown> = {};
  if ("title" in patch) {
    const title = clean(patch.title, 300);
    if (!title) return { error: "Give it a name." };
    row.title = title;
  }
  if ("notes" in patch) row.notes = clean(patch.notes, 4000);
  if ("on_date" in patch) row.on_date = dateOrNull(patch.on_date);
  if ("end_date" in patch) row.end_date = dateOrNull(patch.end_date);
  if ("colour" in patch) row.colour = CARD_COLOURS.some((c) => c.key === patch.colour) ? patch.colour : null;
  if ("grp" in patch) row.grp = clean(patch.grp, 60);
  if ("place" in patch) row.place = clean(patch.place, 200);
  if ("size" in patch) row.size = CARD_SIZES.includes(patch.size as CardSize) ? patch.size : "s";
  // Off the calendar means no last day either; a last day before the first one is dropped.
  if ("on_date" in row && row.on_date === null) row.end_date = null;
  if (typeof row.on_date === "string" && typeof row.end_date === "string" && row.end_date <= row.on_date) row.end_date = null;
  if ("at_time" in patch) row.at_time = timeOrNull(patch.at_time);
  if ("remind" in patch) row.remind = remindOrNull(patch.remind);
  if ("ticket_id" in patch) row.ticket_id = typeof patch.ticket_id === "number" ? patch.ticket_id : null;
  if ("owner" in patch && patch.owner) row.owner = patch.owner;
  if ("rank" in patch && Number.isFinite(patch.rank)) row.rank = patch.rank;
  if ("parent_id" in patch) row.parent_id = typeof patch.parent_id === "number" && patch.parent_id !== id ? patch.parent_id : null;
  if ("done" in patch) row.done_at = patch.done ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("plan_items").update(row).eq("id", id).select(PLAN_COLUMNS).maybeSingle<PlanItem>();
  if (error) return { error: error.message };
  if (!data) return { error: "That isn't yours to change." };
  // A to-do handed to someone else, or moved to another job, takes its steps with it.
  const follow = { ...(row.owner ? { owner: row.owner } : {}), ...("ticket_id" in row ? { ticket_id: row.ticket_id } : {}) };
  if (Object.keys(follow).length && data.parent_id === null) await supabase.from("plan_items").update(follow).eq("parent_id", id);
  return { item: data };
}

// Takes something off the list and the calendar, with its steps.
export async function removePlanItem(id: number): Promise<Result> {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const [{ error }] = await Promise.all([
    supabase.from("plan_items").update({ gone: true }).eq("id", id),
    supabase.from("plan_items").update({ gone: true }).eq("parent_id", id),
  ]);
  return error ? { error: error.message } : {};
}

// "What's on your mind?" on Today and in the + sheet. One note can hold several things, each
// with its own day ("photoshoot 5th Nov, gig 14th at Bam Bam"): each goes in on its own, on the
// calendar when it has a day. "!" puts them at the top of the list instead of the bottom.
export async function quickAddToDo(formData: FormData): Promise<{ items?: PlanItem[]; error?: string }> {
  const raw = clean(formData.get("title"), 300);
  if (!raw) return { error: "Give it a name." };
  const parsed = parseCapture(raw).filter((p) => p.title).slice(0, 12);
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const flagged = parsed.some((p) => p.flagged);
  const { data: ends } = await supabase.from("plan_items").select("rank").eq("owner", member.email).is("parent_id", null).eq("gone", false).order("rank", { ascending: flagged }).limit(1).returns<{ rank: number }[]>();
  const end = ends?.[0]?.rank ?? 0;
  const rows = parsed.map((p, n) => ({
    title: p.title.slice(0, 300),
    owner: member.email,
    on_date: dateOrNull(p.due),
    at_time: p.due ? timeOrNull(p.time) : null,
    place: p.place.slice(0, 200),
    remind: 0,
    // Flagged ones go above the top in the order typed; the rest after the end.
    rank: flagged ? end - parsed.length + n : end + 1 + n,
  }));
  const { data, error } = await supabase.from("plan_items").insert(rows).select(PLAN_COLUMNS).returns<PlanItem[]>();
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { items: data ?? [] };
}
