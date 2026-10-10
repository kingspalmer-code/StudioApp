"use server";

import { revalidatePath } from "next/cache";
import { STAGE_COLORS } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import { slugify } from "@/lib/workspace";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => revalidatePath("/", "layout");

export async function renameWorkspace(formData: FormData) {
  const { supabase, workspace } = await requireMember(["designer"]);
  const name = text(formData, "name");
  if (name) await supabase.from("workspaces").update({ name }).eq("id", workspace.id);
  done();
}

export async function saveStage(id: number, formData: FormData) {
  const { supabase } = await requireMember(["designer"]);
  const label = text(formData, "label");
  const color = text(formData, "color");
  if (!label) return;
  await supabase
    .from("stages")
    .update({ label, color: (STAGE_COLORS as readonly string[]).includes(color) ? color : "blue" })
    .eq("id", id);
  done();
}

export async function addStage(formData: FormData) {
  const { supabase, ctx, workspace } = await requireMember(["designer"]);
  const label = text(formData, "label");
  if (!label) return;
  // New stages go just before the last one, which stays the "finished" stage.
  const last = ctx.stages[ctx.stages.length - 1];
  const position = last ? last.position : 0;
  if (last) await supabase.from("stages").update({ position: position + 1 }).eq("id", last.id);
  await supabase.from("stages").insert({
    workspace_id: workspace.id,
    key: slugify(label).replace(/-/g, "_"),
    label,
    color: "blue",
    position,
  });
  done();
}

// Moves a stage up or down by swapping places with its neighbour.
export async function moveStage(id: number, dir: -1 | 1) {
  const { supabase, ctx } = await requireMember(["designer"]);
  const i = ctx.stages.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ctx.stages.length) return;
  const reordered = [...ctx.stages];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  await Promise.all(reordered.map((s, n) => supabase.from("stages").update({ position: n }).eq("id", s.id)));
  done();
}

export async function deleteStage(id: number) {
  const { supabase, ctx } = await requireMember(["designer"]);
  const stage = ctx.stages.find((s) => s.id === id);
  if (!stage || ctx.stages.length <= 2) return;
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", stage.key);
  if (count) return;
  await supabase.from("stages").delete().eq("id", id);
  done();
}

export async function saveType(id: number, formData: FormData) {
  const { supabase } = await requireMember(["designer"]);
  const name = text(formData, "name");
  const lead = Math.max(0, Math.min(365, parseInt(text(formData, "lead_days"), 10) || 0));
  if (name) await supabase.from("job_types").update({ name, lead_days: lead }).eq("id", id);
  done();
}

export async function addType(formData: FormData) {
  const { supabase, ctx, workspace } = await requireMember(["designer"]);
  const name = text(formData, "name");
  const lead = Math.max(0, Math.min(365, parseInt(text(formData, "lead_days"), 10) || 3));
  if (!name) return;
  const position = Math.max(-1, ...ctx.types.map((t) => t.position)) + 1;
  await supabase.from("job_types").insert({ workspace_id: workspace.id, name, lead_days: lead, position });
  done();
}

export async function deleteType(id: number) {
  const { supabase, ctx } = await requireMember(["designer"]);
  if (ctx.types.length <= 1) return;
  await supabase.from("job_types").delete().eq("id", id);
  done();
}

export async function saveCustomer(id: string | null, formData: FormData) {
  const { supabase } = await requireMember(["designer"]);
  const name = text(formData, "name");
  if (!name) return;
  const fields = {
    name,
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    address: text(formData, "address"),
    notes: text(formData, "notes"),
  };
  if (id) await supabase.from("businesses").update(fields).eq("id", id);
  else await supabase.from("businesses").insert({ ...fields, slug: slugify(name), color: "#8a7a70" });
  done();
}

// Only customers with no jobs can be removed, so no history is lost.
export async function deleteCustomer(id: string) {
  const { supabase } = await requireMember(["designer"]);
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("business_id", id);
  if (count) return;
  await supabase.from("businesses").delete().eq("id", id);
  done();
}
