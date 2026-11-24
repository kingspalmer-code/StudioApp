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

// Pictures added together (one Add to Gallery, so the same business, the same person and the very
// same moment) sit in one folder, so a shoot of twenty photos takes one tile rather than twenty.
// Items arrive newest first; each folder keeps that order and the first picture is its cover.
export const batchKey = (i: Pick<GalleryItem, "business_id" | "added_by" | "created_at">) => `${i.business_id}|${i.added_by}|${i.created_at}`;

export function inFolders<T extends GalleryItem>(items: T[]): T[][] {
  const folders = new Map<string, T[]>();
  for (const i of items) {
    const key = batchKey(i);
    const f = folders.get(key);
    if (f) f.push(i);
    else folders.set(key, [i]);
  }
  // Within a folder, the order they were picked in (ids go up as they're added).
  return [...folders.values()].map((f) => f.sort((a, b) => a.id - b.id));
}

// The other pictures added at the same time as this one, itself included, in the order they were added.
export async function folderOf(supabase: SupabaseClient, item: GalleryItem) {
  const { data } = await supabase
    .from("gallery_items")
    .select(GALLERY_COLUMNS)
    .eq("business_id", item.business_id)
    .eq("added_by", item.added_by)
    .eq("created_at", item.created_at)
    .order("id")
    .returns<GalleryItem[]>();
  return data?.length ? data : [item];
}

// Line icon for a folder of pictures: two frames, one behind the other.
export const FOLDER_ICON_PATH = "M8 7h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM4 16V5a1 1 0 0 1 1-1h11M7 17l3.5-3.5L14 17M14 15.5l1.5-1.5L20 18";
