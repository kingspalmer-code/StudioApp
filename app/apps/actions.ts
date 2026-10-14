"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppBackground } from "@/lib/apps";
import { requireEditor } from "@/lib/session";

// Removes one saved background and its files.
export async function deleteBackground(id: string) {
  const { supabase } = await requireEditor(["designer"]);
  const { data: bg } = await supabase.from("app_backgrounds").select("*").eq("id", id).maybeSingle<AppBackground>();
  if (!bg) return;
  const { error } = await supabase.from("app_backgrounds").delete().eq("id", id);
  if (error) throw new Error("That background couldn't be removed. Try again.");
  await supabase.storage.from("apps").remove([bg.image_path, bg.thumb_path, bg.svg_path]);
  revalidatePath(`/apps/${bg.app_id}`);
}

// Removes an app, every background saved in it and all their files.
export async function deleteApp(id: string) {
  const { supabase } = await requireEditor(["designer"]);
  const [{ data: app }, { data: bgs }] = await Promise.all([
    supabase.from("apps").select("id, source_path").eq("id", id).maybeSingle<{ id: string; source_path: string | null }>(),
    supabase.from("app_backgrounds").select("image_path, thumb_path, svg_path").eq("app_id", id).returns<AppBackground[]>(),
  ]);
  if (!app) redirect("/apps");
  const paths = [app.source_path, ...(bgs ?? []).flatMap((b) => [b.image_path, b.thumb_path, b.svg_path])].filter((p): p is string => Boolean(p));
  for (let i = 0; i < paths.length; i += 900) await supabase.storage.from("apps").remove(paths.slice(i, i + 900));
  // Files first: who may remove them is checked against the app, so it has to still be there.
  const { error } = await supabase.from("apps").delete().eq("id", id);
  if (error) throw new Error("That app couldn't be removed. Try again.");
  revalidatePath("/apps");
  redirect("/apps");
}
