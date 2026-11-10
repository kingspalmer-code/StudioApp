"use server";

import { revalidatePath } from "next/cache";
import { PAY_COLUMNS, TIME_COLUMNS, type PayLog, type TimeLog } from "@/lib/hours";
import { requireEditor } from "@/lib/session";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Result = { log?: TimeLog; error?: string };

// Time logged on a to-do counts towards the job that to-do belongs to.
async function jobFor(supabase: Supabase, planItem: number | null | undefined, ticket: number | null | undefined) {
  if (ticket) return ticket;
  if (!planItem) return null;
  const { data } = await supabase.from("plan_items").select("ticket_id").eq("id", planItem).maybeSingle<{ ticket_id: number | null }>();
  return data?.ticket_id ?? null;
}

const refresh = (ticket: number | null) => {
  if (ticket) revalidatePath(`/tickets/${ticket}`);
  revalidatePath("/hours");
};

// The rate someone last logged hours at, so time from a timer or the job page is paid the same.
// Quietly nothing if the rate column isn't there yet.
async function lastRate(supabase: Supabase, email: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("time_logs")
    .select("rate")
    .eq("who", email)
    .eq("gone", false)
    .not("rate", "is", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ rate: number | null }>();
  return error ? null : (data?.rate ?? null);
}

// The rate as typed: pounds, at most 10,000 an hour, or none.
const cleanRate = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : null;
};
const cleanDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

// Logs time already worked: on a job, a to-do, or both.
export async function logTime(input: { ticket_id?: number | null; plan_item_id?: number | null; minutes: number; day?: string; note?: string }): Promise<Result> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const minutes = Math.round(input.minutes);
  if (!(minutes >= 1 && minutes <= 10080)) return { error: "Enter a time, like 1.5 or 1:30." };
  const [ticket_id, rate] = await Promise.all([jobFor(supabase, input.plan_item_id, input.ticket_id), lastRate(supabase, member.email)]);
  const day = cleanDay(input.day);
  const { data, error } = await supabase
    .from("time_logs")
    .insert({ ticket_id, plan_item_id: input.plan_item_id ?? null, minutes, note: String(input.note ?? "").trim().slice(0, 500), ...(day ? { day } : {}), ...(rate != null ? { rate } : {}) })
    .select(TIME_COLUMNS)
    .single<TimeLog>();
  if (error) return { error: error.message };
  refresh(ticket_id);
  return { log: data };
}

// Starts a timer. Any timer you already had running stops first, so only one runs at a time.
export async function startTimer(input: { ticket_id?: number | null; plan_item_id?: number | null }): Promise<{ log?: TimeLog; stopped?: TimeLog[]; error?: string }> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const [stopped, ticket_id, rate] = await Promise.all([stopRunning(supabase, member.email), jobFor(supabase, input.plan_item_id, input.ticket_id), lastRate(supabase, member.email)]);
  const { data, error } = await supabase
    .from("time_logs")
    .insert({ ticket_id, plan_item_id: input.plan_item_id ?? null, started_at: new Date().toISOString(), ...(rate != null ? { rate } : {}) })
    .select(TIME_COLUMNS)
    .single<TimeLog>();
  if (error) return { error: error.message, stopped };
  refresh(ticket_id);
  return { log: data, stopped };
}

async function stopRunning(supabase: Supabase, email: string, only?: number): Promise<TimeLog[]> {
  let q = supabase.from("time_logs").select(TIME_COLUMNS).eq("who", email).is("minutes", null).eq("gone", false);
  if (only) q = q.eq("id", only);
  const { data: running } = await q.returns<TimeLog[]>();
  const now = Date.now();
  const done = await Promise.all(
    (running ?? []).map(async (l) => {
      const minutes = Math.min(10080, Math.max(1, Math.round((now - Date.parse(l.started_at!)) / 60000)));
      const { data } = await supabase.from("time_logs").update({ minutes }).eq("id", l.id).select(TIME_COLUMNS).maybeSingle<TimeLog>();
      refresh(l.ticket_id);
      return data;
    })
  );
  return done.filter((l): l is TimeLog => Boolean(l));
}

// Stops a timer and keeps the time (at least a minute).
export async function stopTimer(id: number): Promise<Result> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const [log] = await stopRunning(supabase, member.email, id);
  return log ? { log } : { error: "That timer isn't running." };
}

// Takes a log off. It stays in the database, out of sight.
export async function removeTimeLog(id: number): Promise<Result> {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const { data, error } = await supabase.from("time_logs").update({ gone: true }).eq("id", id).select("ticket_id").maybeSingle<{ ticket_id: number | null }>();
  if (error) return { error: error.message };
  refresh(data?.ticket_id ?? null);
  return {};
}

// ---- Hours and pay (/hours) ----

type HoursInput = { day: string; ticket_id: number | null; work_type: string; minutes: number; rate: number | string | null; note?: string };
type PayResult = { log?: PayLog; error?: string };

function cleanHours(input: HoursInput) {
  const minutes = Math.round(Number(input.minutes));
  if (!(minutes >= 1 && minutes <= 10080)) return { error: "Enter a time, like 1.5 or 1:30." };
  const day = cleanDay(input.day);
  if (!day) return { error: "Pick a date." };
  return {
    row: {
      day,
      minutes,
      ticket_id: Number(input.ticket_id) || null,
      work_type: String(input.work_type ?? "").trim().slice(0, 80),
      rate: cleanRate(input.rate),
      note: String(input.note ?? "").trim().slice(0, 500),
    },
  };
}

// Logs hours from the Hours page: a date, a job (or none), the kind of work, the time and the rate.
export async function logHours(input: HoursInput): Promise<PayResult> {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const c = cleanHours(input);
  if (!c.row) return { error: c.error };
  const { data, error } = await supabase.from("time_logs").insert(c.row).select(PAY_COLUMNS).single<PayLog>();
  if (error) return { error: error.message };
  refresh(c.row.ticket_id);
  return { log: data };
}

// Changes a log: your own, or anyone's for the owner (and employees allowed to change Team).
export async function updateHours(id: number, input: HoursInput): Promise<PayResult> {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const c = cleanHours(input);
  if (!c.row) return { error: c.error };
  const { data, error } = await supabase.from("time_logs").update(c.row).eq("id", id).select(PAY_COLUMNS).maybeSingle<PayLog>();
  if (error) return { error: error.message };
  if (!data) return { error: "You can't change that one." };
  refresh(c.row.ticket_id);
  return { log: data };
}

// The owner marks hours paid (or not). The database only lets the owner do this.
export async function setPaid(ids: number[], paid: boolean): Promise<{ logs?: PayLog[]; error?: string }> {
  const { supabase, member } = await requireEditor(["designer"]);
  if (member.staff) return { error: "Only the owner can mark hours paid." };
  const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 2000);
  if (!clean.length) return { logs: [] };
  const { data, error } = await supabase
    .from("time_logs")
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .in("id", clean)
    .not("minutes", "is", null)
    .select(PAY_COLUMNS)
    .returns<PayLog[]>();
  if (error) return { error: error.message };
  revalidatePath("/hours");
  return { logs: data ?? [] };
}

// Stops the Hours page timer and files it under a job (or none), in one go. The time counts up to
// when Stop was pressed, not when the job was picked, so taking a while to choose costs nothing.
export async function finishTimer(id: number, input: { ticket_id: number | null; ended_at?: string }): Promise<PayResult> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const { data: running } = await supabase
    .from("time_logs")
    .select("id, started_at")
    .eq("id", id)
    .eq("who", member.email)
    .is("minutes", null)
    .eq("gone", false)
    .maybeSingle<{ id: number; started_at: string | null }>();
  if (!running?.started_at) return { error: "That timer isn't running any more." };
  const start = Date.parse(running.started_at);
  const now = Date.now();
  const asked = Date.parse(String(input.ended_at ?? ""));
  const end = Number.isFinite(asked) ? Math.min(now, Math.max(start, asked)) : now;
  const minutes = Math.min(10080, Math.max(1, Math.round((end - start) / 60000)));
  const ticket_id = Number(input.ticket_id) || null;
  const { data, error } = await supabase.from("time_logs").update({ minutes, ticket_id }).eq("id", id).select(PAY_COLUMNS).maybeSingle<PayLog>();
  if (error) return { error: /isn't one of yours/.test(error.message) ? "That job can't take hours." : error.message };
  if (!data) return { error: "Couldn't save that." };
  refresh(ticket_id);
  return { log: data };
}
