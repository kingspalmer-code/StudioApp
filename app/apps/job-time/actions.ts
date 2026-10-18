"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";

const PATH = "/apps/job-time";
const editor = () => requireEditor(["designer"], "requests");
const num = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

// A past job typed in by hand.
export async function addTiming(input: { type: string; size: string; days: string; note: string }) {
  const { supabase, workspace, member } = await editor();
  const days = num(input.days, 3650);
  if (!days) return { error: "Say how many days it took." };
  const { error } = await supabase.from("job_timings").insert({
    workspace_id: workspace.id,
    type: input.type.trim().slice(0, 80),
    size: num(input.size, 1e8),
    days,
    note: input.note.trim().slice(0, 200),
    created_by: member.email,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeTiming(id: number) {
  const { supabase } = await editor();
  await supabase.from("job_timings").delete().eq("id", id);
  revalidatePath(PATH);
}

// A finished job whose dates don't tell the real story: leave it out, or say how many days it took.
// Putting it back the way its dates say removes the correction.
export async function correctJob(ticketId: number, change: { skip: boolean; days: string | null }) {
  const { supabase, workspace, member } = await editor();
  const days = change.days == null ? null : num(change.days, 3650);
  if (!change.skip && !days) {
    await supabase.from("job_timings").delete().eq("ticket_id", ticketId);
  } else {
    const { error } = await supabase
      .from("job_timings")
      .upsert({ workspace_id: workspace.id, ticket_id: ticketId, skip: change.skip, days: change.skip ? null : days, created_by: member.email }, { onConflict: "ticket_id" });
    if (error) return { error: error.message };
  }
  revalidatePath(PATH);
  return { ok: true };
}

// Sets the type's working days (Settings > Job types) to the estimate.
export async function setTypeDays(typeId: number, days: number) {
  const { supabase } = await requireEditor(["designer"], "settings");
  const lead = Math.max(0, Math.min(365, Math.ceil(days)));
  await supabase.from("job_types").update({ lead_days: lead }).eq("id", typeId);
  revalidatePath(PATH);
}

// "Describe the job": the AI reads a description and picks the type and size, so the sums can run.
// It never makes up the estimate itself.
export async function readDescription(text: string, types: string[], sizeLabel: string): Promise<{ type?: string; size?: number | null; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "This isn't switched on yet." };
  const description = text.trim().slice(0, 1500);
  if (!description) return { error: "Describe the job first." };
  if (!types.length) return { error: "Add a job type first." };
  const { supabase, workspace } = await editor();
  const { error: limit } = await supabase.rpc("note_ai_use", { what: "job time" });
  if (limit) return { error: limit.message };
  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      system: `You help ${workspace.name}, a small UK business, estimate a job. Read the job description and pick which of their job types it is.${
        sizeLabel ? ` Also give its size as "${sizeLabel}", as one number, if the description says or plainly implies it; otherwise null.` : " Set size to null."
      } Don't estimate how long it takes.`,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["type", "size"],
            properties: { type: { type: "string", enum: types }, size: { type: ["number", "null"] } },
          },
        },
      },
      messages: [{ role: "user", content: description }],
    });
    const out = JSON.parse(response.content.find((b) => b.type === "text")?.text ?? "{}");
    return { type: types.includes(out.type) ? out.type : types[0], size: sizeLabel ? num(out.size, 1e8) : null };
  } catch (e) {
    console.error("readDescription", e);
    return { error: "Oatcake couldn't read that just now. Pick the type and size yourself." };
  }
}
