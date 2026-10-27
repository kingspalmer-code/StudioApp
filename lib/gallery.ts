import type { SupabaseClient } from "@supabase/supabase-js";
import { signedUrls } from "./signed";
import type { TagPerson } from "@/app/gallery/TagPicker";

// Things the studio added straight to the Gallery, without a job (supabase/migrations/051_gallery_items.sql).
export type GalleryItem = { id: number; business_id: string; path: string; name: string; mime: string; size: number; caption: string; tagged: string[]; added_by: string; created_at: string };
export type Tag = { item_id: number; email: string; name: string };

export const GALLERY_COLUMNS = "id, business_id, path, name, mime, size, caption, tagged, added_by, created_at";

// The items someone can see (the database decides), newest first, each with a link to its full picture.
export async function galleryItems(supabase: SupabaseClient) {
  const { data } = await supabase.from("gallery_items").select(GALLERY_COLUMNS).order("created_at", { ascending: false }).returns<GalleryItem[]>();
  const items = data ?? [];
  const urls = items.length ? await signedUrls(supabase, "deliveries", items.map((i) => i.path)) : {};
  return items.map((i) => ({ ...i, view: urls[i.path] ?? null }));
}

// The names of who's tagged, which clients can't otherwise look up.
export async function tagNames(supabase: SupabaseClient, ids: number[]) {
  if (!ids.length) return [] as Tag[];
  const { data } = await supabase.rpc("gallery_tag_names", { p_ids: ids });
  return (data as Tag[] | null) ?? [];
}

// Everyone with a login in the workspace apart from you, for tagging. The studio can read them all.
export async function taggablePeople(supabase: SupabaseClient, me: string, bizName: Map<string, string>): Promise<TagPerson[]> {
  const [{ data: members }, { data: links }] = await Promise.all([
    supabase.from("members").select("email, full_name, role, business_id").returns<{ email: string; full_name: string; role: string; business_id: string | null }[]>(),
    supabase.from("member_businesses").select("email, business_id").returns<{ email: string; business_id: string }[]>(),
  ]);
  return (members ?? [])
    .filter((m) => m.email !== me)
    .map((m) => ({
      email: m.email,
      name: m.full_name || m.email,
      role: m.role,
      businesses: [m.business_id, ...(links ?? []).filter((l) => l.email === m.email).map((l) => l.business_id)].filter((b): b is string => Boolean(b)),
      biz: (m.business_id && bizName.get(m.business_id)) || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
