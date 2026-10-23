"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { PLAN_COLUMNS, type PlanItem } from "@/lib/plan";
import { blockTime, daysLabel, readRoutine, type RoutineBlock } from "@/lib/routine";

// "Tell Oatcake": a stream of thoughts typed or dictated in one go, sorted into things on the
// calendar, to-dos, and a "To get" list. Nothing is added until the person has looked it over.

export type DumpKind = "event" | "todo" | "get";
export type DumpItem = { title: string; kind: DumpKind; date: string | null; time: string | null; notes: string };
export type DumpRoutine = Omit<RoutineBlock, "id">;
// A change to something already on the list: null leaves that part as it is.
export type DumpChange = { id: number; was: string; title: string | null; date: string | null; time: string | null; clear_date: boolean; done: boolean; remove: boolean };

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const dateOrNull = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const timeOrNull = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
const KINDS: DumpKind[] = ["event", "todo", "get"];

// The name of the to-do that shopping and errands go under, as steps.
const GET_LIST = "To get";

export async function readBrainDump(text: string, routineIn: unknown): Promise<{ items?: DumpItem[]; routine?: DumpRoutine[]; changes?: DumpChange[]; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "This isn't switched on yet." };
  const dump = text.trim().slice(0, 4000);
  if (!dump) return { error: "Type or say what's on your mind first." };
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const { error: limit } = await supabase.rpc("note_ai_use", { what: "brain dump" });
  if (limit) return { error: limit.message.includes("Only the workspace owner") ? "Only the owner can use this for now." : limit.message };
  const routine = readRoutine(routineIn);
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  // What's already on their list, so "move the photoshoot to 8" can find it.
  const { data: open } = await supabase
    .from("plan_items")
    .select("id, parent_id, title, on_date, at_time")
    .eq("owner", member.email)
    .eq("gone", false)
    .is("done_at", null)
    .order("on_date", { ascending: false, nullsFirst: false })
    .limit(200)
    .returns<{ id: number; parent_id: number | null; title: string; on_date: string | null; at_time: string | null }[]>();
  const known = new Map((open ?? []).map((i) => [i.id, i]));
  const list = (open ?? []).length
    ? (open ?? []).map((i) => `- id ${i.id}: ${i.title}${i.on_date ? ` · ${i.on_date}` : ""}${i.at_time ? ` ${i.at_time.slice(0, 5)}` : ""}${i.parent_id ? ` (step of id ${i.parent_id})` : ""}`).join("\n")
    : "Nothing yet.";
  const week = routine.length ? routine.map((b) => `- ${b.label}: ${daysLabel(b.days)} ${blockTime(b)}`).join("\n") : "Nothing saved yet.";
  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: `You sort someone's brain dump into their to-do list and calendar. They're in the UK. Today is ${today} (${iso}).

Split the text into separate items. Write each title short and plain, in their words, with the first letter capitalised (e.g. "Leather cleaner for shoes", "Spray paint for chilli 3D print trophy", "Photoshoot").
- kind "event": something happening at a set day or time (a shoot, a meeting, a gig, an appointment).
- kind "get": something to buy or pick up (shopping, errands for an item).
- kind "todo": anything else to do.
date is YYYY-MM-DD, worked out from today: a weekday name means the next one after today ("tues" said on a Tuesday means next week's); "the 7th of November" means this year's unless that's passed. Null when no day is given. time is 24-hour HH:MM, null when none is given; "morning" alone isn't a time. notes holds any extra detail worth keeping, otherwise "".

Their usual week:
${week}

What's already on their list (id: title · day time):
${list}

If they ask to change something already on the list ("move the HopRocket photoshoot to 8 in the morning", "push the gig shoot to Friday", "I've done the leather cleaner", "cancel the dentist"), put it in changes, not items, using the id of the best match. In a change, title/date/time are the new values, or null to leave them as they are (moving only the time keeps the day); clear_date true takes it off the calendar; done true ticks it off; remove true deletes it. Only change things they clearly mean.

If they describe something that happens every week (office days, a regular train, a class), put it in routine instead of items: days as numbers 1 = Monday to 7 = Sunday, start and end as HH:MM (end null for something at one time, like a train). Don't repeat what's already in their usual week. Don't invent anything they didn't say.`,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items", "routine", "changes"],
            properties: {
              changes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "title", "date", "time", "clear_date", "done", "remove"],
                  properties: {
                    id: { type: "integer" },
                    title: { type: ["string", "null"] },
                    date: { type: ["string", "null"] },
                    time: { type: ["string", "null"] },
                    clear_date: { type: "boolean" },
                    done: { type: "boolean" },
                    remove: { type: "boolean" },
                  },
                },
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "kind", "date", "time", "notes"],
                  properties: {
                    title: { type: "string" },
                    kind: { type: "string", enum: KINDS },
                    date: { type: ["string", "null"] },
                    time: { type: ["string", "null"] },
                    notes: { type: "string" },
                  },
                },
              },
              routine: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "days", "start", "end"],
                  properties: {
                    label: { type: "string" },
                    days: { type: "array", items: { type: "integer" } },
                    start: { type: "string" },
                    end: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
        },
      },
      messages: [{ role: "user", content: dump }],
    });
    const out = JSON.parse(response.content.find((b) => b.type === "text")?.text ?? "{}");
    const items: DumpItem[] = (Array.isArray(out.items) ? out.items : [])
      .map((i: Record<string, unknown>) => ({
        title: String(i.title ?? "").trim().slice(0, 300),
        kind: KINDS.includes(i.kind as DumpKind) ? (i.kind as DumpKind) : "todo",
        date: dateOrNull(i.date),
        time: dateOrNull(i.date) ? timeOrNull(i.time) : null,
        notes: String(i.notes ?? "").trim().slice(0, 1000),
      }))
      .filter((i: DumpItem) => i.title)
      .slice(0, 40);
    const found = readRoutine(out.routine).map(({ label, days, start, end }) => ({ label, days, start, end }));
    const changes: DumpChange[] = (Array.isArray(out.changes) ? out.changes : [])
      .filter((c: Record<string, unknown>) => typeof c.id === "number" && known.has(c.id))
      .map((c: Record<string, unknown>) => ({
        id: c.id as number,
        was: known.get(c.id as number)!.title,
        title: typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 300) : null,
        date: dateOrNull(c.date),
        time: timeOrNull(c.time),
        clear_date: c.clear_date === true,
        done: c.done === true,
        remove: c.remove === true,
      }))
      .filter((c: DumpChange) => c.title || c.date || c.time || c.clear_date || c.done || c.remove)
      .slice(0, 40);
    if (!items.length && !found.length && !changes.length) return { error: "Oatcake couldn't find anything to add or change in that. Try saying it another way." };
    return { items, routine: found, changes };
  } catch (e) {
    console.error("readBrainDump", e);
    return { error: "Oatcake couldn't read that just now. Try again in a moment." };
  }
}

// Adds what the person kept. Things to get go as steps under one "To get" to-do, made if there
// isn't an open one already; everything else goes at the end of the list.
export async function addBrainDump(input: DumpItem[]): Promise<{ items?: PlanItem[]; error?: string }> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const items = input
    .map((i) => ({ ...i, title: String(i.title ?? "").trim().slice(0, 300), date: dateOrNull(i.date), time: timeOrNull(i.time), notes: String(i.notes ?? "").trim().slice(0, 4000) }))
    .filter((i) => i.title)
    .slice(0, 40);
  if (!items.length) return { error: "Nothing ticked to add." };
  const { data: tops } = await supabase
    .from("plan_items")
    .select(PLAN_COLUMNS)
    .eq("owner", member.email)
    .is("parent_id", null)
    .eq("gone", false)
    .order("rank", { ascending: false })
    .returns<PlanItem[]>();
  let end = tops?.[0]?.rank ?? 0;
  const added: PlanItem[] = [];
  const gets = items.filter((i) => i.kind === "get");
  let list = (tops ?? []).find((t) => !t.done_at && t.title.trim().toLowerCase() === GET_LIST.toLowerCase());
  if (gets.length && !list) {
    const { data, error } = await supabase.from("plan_items").insert({ title: GET_LIST, owner: member.email, remind: null, rank: ++end }).select(PLAN_COLUMNS).single<PlanItem>();
    if (error) return { error: error.message };
    list = data;
    added.push(data);
  }
  let step = 0;
  if (list) {
    const { data: last } = await supabase.from("plan_items").select("rank").eq("parent_id", list.id).order("rank", { ascending: false }).limit(1).returns<{ rank: number }[]>();
    step = last?.[0]?.rank ?? 0;
  }
  const rows = items.map((i) => ({
    title: i.title,
    notes: i.notes,
    owner: member.email,
    parent_id: i.kind === "get" ? list!.id : null,
    on_date: i.date,
    at_time: i.date ? i.time : null,
    // Timed things remind at the time; things with only a day at 8am; undated ones never.
    remind: i.date ? 0 : null,
    rank: i.kind === "get" ? ++step : ++end,
  }));
  const { data, error } = await supabase.from("plan_items").insert(rows).select(PLAN_COLUMNS).returns<PlanItem[]>();
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { items: [...added, ...(data ?? [])] };
}

