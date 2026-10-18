"use server";

import { revalidatePath } from "next/cache";
import { TIME_COLUMNS, type TimeLog } from "@/lib/hours";
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
};

// Logs time already worked: on a job, a to-do, or both.
export async function logTime(input: { ticket_id?: number | null; plan_item_id?: number | null; minutes: number; day?: string; note?: string }): Promise<Result> {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const minutes = Math.round(input.minutes);
  if (!(minutes >= 1 && minutes <= 10080)) return { error: "Enter a time, like 1.5 or 1:30." };
  const ticket_id = await jobFor(supabase, input.plan_item_id, input.ticket_id);
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : undefined;
  const { data, error } = await supabase
    .from("time_logs")
    .insert({ ticket_id, plan_item_id: input.plan_item_id ?? null, minutes, note: String(input.note ?? "").trim().slice(0, 500), ...(day ? { day } : {}) })
    .select(TIME_COLUMNS)
    .single<TimeLog>();
  if (error) return { error: error.message };
  refresh(ticket_id);
  return { log: data };
}

// Starts a timer. Any timer you already had running stops first, so only one runs at a time.
export async function startTimer(input: { ticket_id?: number | null; plan_item_id?: number | null }): Promise<{ log?: TimeLog; stopped?: TimeLog[]; error?: string }> {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const stopped = await stopRunning(supabase, member.email);
  const ticket_id = await jobFor(supabase, input.plan_item_id, input.ticket_id);
  const { data, error } = await supabase
    .from("time_logs")
    .insert({ ticket_id, plan_item_id: input.plan_item_id ?? null, started_at: new Date().toISOString() })
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
