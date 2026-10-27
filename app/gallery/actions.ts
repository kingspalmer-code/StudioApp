"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { email, origin } from "@/lib/finished";
import { firstTime, pushReady, sendAlert } from "@/lib/push";
import { withPreviews } from "@/lib/preview";
import { requireEditor } from "@/lib/session";
import { isSelf, MY_BUSINESS, SELF_PREFIX } from "@/lib/workspace";

type Upload = { path: string; name: string; mime: string; size: number };
type Result = { ids?: number[]; error?: string };

const cleanTags = (list: string[]) => [...new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean))].slice(0, 50);

// The workspace's own business, for pictures that aren't for a client. Made the first time it's needed.
export async function myBusinessId(): Promise<string | null> {
  const { supabase, self } = await requireEditor(["designer"], "requests");
  if (self) return self.id;
  const { data: rows } = await supabase.from("businesses").select("id, slug").returns<{ id: string; slug: string }[]>();
  const own = (rows ?? []).find(isSelf);
  if (own) return own.id;
  const { data: made } = await supabase
    .from("businesses")
    .insert({ name: MY_BUSINESS, slug: `${SELF_PREFIX}${Math.random().toString(36).slice(2, 10)}`, color: "#8a7a70" })
    .select("id")
    .single<{ id: string }>();
  return made?.id ?? null;
}

// Files already uploaded to deliveries/<business>/gallery/ go into the Gallery, each with the same
// caption and tags. The database puts it in the tagged people's bell; this emails them and alerts
// their phones.
export async function addToGallery(businessId: string, files: Upload[], caption: string, tagged: string[]): Promise<Result> {
  const { supabase, member, workspace } = await requireEditor(["designer"], "requests");
  const ok = files.filter((f) => f.path.startsWith(`${businessId}/gallery/`));
  if (!ok.length) return { error: "Nothing was uploaded." };
  const tags = cleanTags(tagged);
  const { data, error } = await supabase
    .from("gallery_items")
    .insert(ok.map((f) => ({ business_id: businessId, path: f.path, name: f.name.slice(0, 200), mime: f.mime, size: f.size, caption: caption.trim().slice(0, 1000), tagged: tags })))
    .select("id")
    .returns<{ id: number }[]>();
  if (error) return { error: `That didn't save. ${error.message}` };
  const ids = (data ?? []).map((d) => d.id);
  if (ids.length && tags.length) after(() => tellTagged(supabase, ids, tags, { name: workspace.name, replyTo: member.email, by: member.full_name || workspace.name }).catch(() => {}));
  revalidatePath("/gallery");
  return { ids };
}

// Changes who's tagged; only people newly tagged hear about it.
export async function setGalleryTags(id: number, tagged: string[]): Promise<Result> {
  const { supabase, member, workspace } = await requireEditor(["designer"], "requests");
  const tags = cleanTags(tagged);
  const { data: before } = await supabase.from("gallery_items").select("tagged").eq("id", id).maybeSingle<{ tagged: string[] }>();
  if (!before) return { error: "That's gone. Refresh the page." };
  const { error } = await supabase.from("gallery_items").update({ tagged: tags }).eq("id", id);
  if (error) return { error: `That didn't save. ${error.message}` };
  const fresh = tags.filter((e) => !before.tagged.includes(e));
  if (fresh.length) after(() => tellTagged(supabase, [id], fresh, { name: workspace.name, replyTo: member.email, by: member.full_name || workspace.name }).catch(() => {}));
  revalidatePath("/gallery");
  revalidatePath(`/gallery/${id}`);
  return { ids: [id] };
}

export async function setGalleryCaption(id: number, caption: string): Promise<Result> {
  const { supabase } = await requireEditor(["designer"], "requests");
  const { error } = await supabase.from("gallery_items").update({ caption: caption.trim().slice(0, 1000) }).eq("id", id);
  if (error) return { error: `That didn't save. ${error.message}` };
  revalidatePath("/gallery");
  revalidatePath(`/gallery/${id}`);
  return { ids: [id] };
}

// Takes it out of the Gallery, with its file and preview.
export async function removeFromGallery(id: number): Promise<Result> {
  const { supabase } = await requireEditor(["designer"], "requests");
  const { data: item } = await supabase.from("gallery_items").select("path").eq("id", id).maybeSingle<{ path: string }>();
  if (!item) return {};
  const { error } = await supabase.from("gallery_items").delete().eq("id", id);
  if (error) return { error: `That didn't remove. ${error.message}` };
  await supabase.storage.from("deliveries").remove(withPreviews([item.path]));
  revalidatePath("/gallery");
  return {};
}

// Email and a phone alert for each person tagged, once per picture. Several pictures added together
// make one message, linking to the first.
async function tellTagged(supabase: SupabaseClient, ids: number[], emails: string[], studio: { name: string; replyTo: string; by: string }) {
  emails = emails.filter((e) => e !== studio.replyTo);
  if (!emails.length) return;
  const [{ data: people }, { data: items }] = await Promise.all([
    supabase.from("members").select("email, full_name").in("email", emails).returns<{ email: string; full_name: string }[]>(),
    supabase.from("gallery_items").select("id, caption, name").in("id", ids).order("id").returns<{ id: number; caption: string; name: string }[]>(),
  ]);
  const first = items?.[0];
  if (!first || !people?.length) return;
  const told: typeof people = [];
  for (const p of people) if (!pushReady() || (await firstTime("tagged", `${first.id}:${p.email}`))) told.push(p);
  if (!told.length) return;
  const what = first.caption.trim() || (ids.length > 1 ? `${ids.length} pictures` : "a picture");
  const subject = `${studio.by} tagged you in the Gallery`;
  const link = `${await origin()}/gallery/${first.id}`;
  const line = `${studio.by} tagged you in ${ids.length > 1 ? `${ids.length} pictures` : "a picture"} in ${studio.name}'s Gallery${first.caption.trim() ? `: "${first.caption.trim().slice(0, 200)}"` : "."}`;
  await Promise.all([
    ...told.map((p) => email(p.email, subject, [p.full_name ? `Hi ${p.full_name.split(" ")[0]},` : "Hi,", line], link, "See it in Oatcake", studio.name, studio.replyTo)),
    sendAlert(told.map((p) => p.email), { title: subject, body: what.slice(0, 120), url: `/gallery/${first.id}`, tag: `gallery-${first.id}` }),
  ]);
}
