"use server";

import { revalidatePath } from "next/cache";
import { ADDABLE_KINDS } from "@/lib/fields";
import { CORE_KEYS, coreFields, readCore, type CoreKey, type CoreSettings } from "@/lib/core-fields";
import { STAGE_COLORS } from "@/lib/priority";
import { requireEditor } from "@/lib/session";
import type { WorkspaceKind } from "@/lib/types";
import { MODES, slugify } from "@/lib/workspace";
import { sendCustomerLink } from "@/lib/customers";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => revalidatePath("/", "layout");

export async function renameWorkspace(formData: FormData) {
  const { supabase, workspace } = await requireEditor(["designer"], "settings");
  const name = text(formData, "name");
  if (name) await supabase.from("workspaces").update({ name }).eq("id", workspace.id);
  done();
}

export async function saveStage(id: number, formData: FormData) {
  const { supabase } = await requireEditor(["designer"], "settings");
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
  const { supabase, ctx, workspace } = await requireEditor(["designer"], "settings");
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
  const { supabase, ctx } = await requireEditor(["designer"], "settings");
  const i = ctx.stages.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ctx.stages.length) return;
  const reordered = [...ctx.stages];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  await Promise.all(reordered.map((s, n) => supabase.from("stages").update({ position: n }).eq("id", s.id)));
  done();
}

export async function deleteStage(id: number) {
  const { supabase, ctx } = await requireEditor(["designer"], "settings");
  const stage = ctx.stages.find((s) => s.id === id);
  if (!stage || ctx.stages.length <= 2) return;
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", stage.key);
  if (count) return;
  await supabase.from("stages").delete().eq("id", id);
  done();
}

export async function saveType(id: number, formData: FormData) {
  const { supabase } = await requireEditor(["designer"], "settings");
  const name = text(formData, "name");
  const lead = Math.max(0, Math.min(365, parseInt(text(formData, "lead_days"), 10) || 0));
  if (name) await supabase.from("job_types").update({ name, lead_days: lead }).eq("id", id);
  done();
}

export async function addType(formData: FormData) {
  const { supabase, ctx, workspace } = await requireEditor(["designer"], "settings");
  const name = text(formData, "name");
  const lead = Math.max(0, Math.min(365, parseInt(text(formData, "lead_days"), 10) || 3));
  if (!name) return;
  const position = Math.max(-1, ...ctx.types.map((t) => t.position)) + 1;
  await supabase.from("job_types").insert({ workspace_id: workspace.id, name, lead_days: lead, position });
  done();
}

export async function deleteType(id: number) {
  const { supabase, ctx } = await requireEditor(["designer"], "settings");
  if (ctx.types.length <= 1) return;
  await supabase.from("job_types").delete().eq("id", id);
  done();
}

export async function saveCustomer(id: string | null, formData: FormData) {
  const { supabase } = await requireEditor(["designer"], "clients");
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
  const { supabase } = await requireEditor(["designer"], "clients");
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("business_id", id);
  if (count) return;
  await supabase.from("businesses").delete().eq("id", id);
  done();
}

// Job form --------------------------------------------------------------------------
const KINDS = new Set<string>(ADDABLE_KINDS);
const doneForm = () => {
  revalidatePath("/settings/form");
  revalidatePath("/portal");
};

export async function addField(formData: FormData) {
  const { supabase, workspace } = await requireEditor(["designer"], "settings");
  const label = text(formData, "label");
  const kind = text(formData, "kind");
  if (!label || !KINDS.has(kind)) return;
  const { data: last } = await supabase.from("job_fields").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("job_fields").insert({
    workspace_id: workspace.id,
    key: `${kind === "heading" ? "h" : "f"}_${Math.random().toString(36).slice(2, 10)}`,
    label,
    kind,
    position: (last?.position ?? -1) + 1,
  });
  doneForm();
}

export async function saveField(id: number, formData: FormData) {
  const { supabase, ctx } = await requireEditor(["designer"], "settings");
  const label = text(formData, "label");
  if (!label) return;
  const kind = text(formData, "kind");
  const typeIds = formData
    .getAll("type_ids")
    .map((v) => Number(v))
    .filter((n) => ctx.types.some((t) => t.id === n));
  const options = text(formData, "options")
    .split(/\n|,/)
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 50);
  await supabase
    .from("job_fields")
    .update({
      label,
      hint: text(formData, "hint"),
      required: formData.get("required") != null,
      on_form: formData.get("on_form") != null,
      // Every type ticked means no limit.
      type_ids: typeIds.length === ctx.types.length ? [] : typeIds,
      ...(KINDS.has(kind) && kind !== "heading" ? { kind } : {}),
      ...(formData.has("options") ? { options } : {}),
    })
    .eq("id", id);
  doneForm();
}

// The fields at the top of the form (see lib/core-fields.ts), saved on the workspace.
async function editCore(change: (s: CoreSettings, mode: { trade: boolean; solo: boolean }) => CoreSettings) {
  const { supabase, workspace } = await requireEditor(["designer"], "settings");
  const mode = { trade: workspace.kind !== "studio", solo: workspace.kind === "solo" };
  const next = change(readCore(workspace.core_fields), mode);
  await supabase.from("workspaces").update({ core_fields: next }).eq("id", workspace.id);
  doneForm();
}

const isCore = (k: string): k is CoreKey => (CORE_KEYS as string[]).includes(k);

export async function saveCoreField(key: string, formData: FormData) {
  if (!isCore(key)) return;
  const label = text(formData, "label").slice(0, 60);
  const hint = text(formData, "hint").slice(0, 120);
  await editCore((s) => ({ ...s, fields: { ...s.fields, [key]: { ...s.fields?.[key], label, hint } } }));
}

export async function setCoreHidden(key: string, hidden: boolean) {
  if (!isCore(key)) return;
  await editCore((s, mode) => {
    if (!coreFields(s, mode).find((f) => f.key === key)?.canHide) return s;
    return { ...s, fields: { ...s.fields, [key]: { ...s.fields?.[key], hidden } } };
  });
}

export async function moveCoreField(key: string, dir: -1 | 1) {
  if (!isCore(key)) return;
  await editCore((s, mode) => {
    // Move among the fields this workspace shows; customer and phone, when not shown, stay first.
    const shown = coreFields(s, mode).map((f) => f.key);
    const i = shown.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shown.length) return s;
    [shown[i], shown[j]] = [shown[j], shown[i]];
    return { ...s, order: [...CORE_KEYS.filter((k) => !shown.includes(k)), ...shown] };
  });
}

export async function setFieldHidden(id: number, hidden: boolean) {
  const { supabase } = await requireEditor(["designer"], "settings");
  await supabase.from("job_fields").update({ hidden }).eq("id", id);
  doneForm();
}

export async function moveField(id: number, dir: -1 | 1) {
  const { supabase } = await requireEditor(["designer"], "settings");
  const { data: fields } = await supabase.from("job_fields").select("id, hidden").order("position").order("id");
  // Moves past switched-off fields so each tap visibly moves it one place on the form.
  const list = fields ?? [];
  const i = list.findIndex((f) => f.id === id);
  if (i < 0) return;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].hidden && !list[i].hidden) j += dir;
  if (j < 0 || j >= list.length) return;
  const reordered = [...list];
  const [moved] = reordered.splice(i, 1);
  reordered.splice(j, 0, moved);
  await Promise.all(reordered.map((f, n) => supabase.from("job_fields").update({ position: n }).eq("id", f.id)));
  doneForm();
}

export async function deleteField(id: number) {
  const { supabase } = await requireEditor(["designer"], "settings");
  await supabase.from("job_fields").delete().eq("id", id).eq("builtin", false);
  doneForm();
}

// Settings > How you work. Only changes the words Oatcake uses and which pages show; nothing is
// deleted. Leaving Businesses pauses client and manager logins until it's switched back.
export async function setWorkMode(kind: WorkspaceKind): Promise<{ error?: string }> {
  if (!MODES.some((m) => m.kind === kind)) return { error: "Pick one of the three." };
  const { supabase, workspace } = await requireEditor(["designer"], "settings");
  const { error } = await supabase.from("workspaces").update({ kind }).eq("id", workspace.id);
  if (error) return { error: error.message };
  done();
  return {};
}

// Customers workspaces: turn the public request link on or off. The link's address comes from the
// workspace name the first time it's turned on, and stays the same after that.
export async function setRequestsOpen(open: boolean): Promise<{ error?: string }> {
  const { supabase, workspace } = await requireEditor(["designer"], "settings");
  if (workspace.kind !== "trade") return { error: "Request links are for Customers workspaces." };
  let slug = workspace.request_slug;
  if (!slug && open) {
    const base = workspace.name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "jobs";
    for (const candidate of [base, ...Array.from({ length: 4 }, () => `${base}-${Math.random().toString(36).slice(2, 5)}`)]) {
      const { error } = await supabase.from("workspaces").update({ request_slug: candidate, requests_open: true }).eq("id", workspace.id);
      if (!error) { slug = candidate; break; }
      if (error.code !== "23505") return { error: error.message };
    }
    if (!slug) return { error: "Couldn't make a link just now. Try again." };
  } else {
    const { error } = await supabase.from("workspaces").update({ requests_open: open }).eq("id", workspace.id);
    if (error) return { error: error.message };
  }
  done();
  return {};
}

// Emails a customer the link to their own page, where they can follow all their jobs.
export async function emailCustomerLink(id: string): Promise<{ error?: string; sent?: string }> {
  const { supabase, workspace, member, terms } = await requireEditor(["designer"], "clients");
  const { data: c } = await supabase.from("businesses").select("id, name, email, access_token").eq("id", id).maybeSingle<{ id: string; name: string; email: string; access_token: string }>();
  if (!c) return { error: "Couldn't find them." };
  const problem = await sendCustomerLink(c, { name: workspace.name, replyTo: member.email, terms });
  return problem ? { error: problem } : { sent: c.email };
}
