"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notYetFinished, tellRequesters } from "@/lib/finished";
import type { Draft, DraftFile } from "@/lib/deliveries";
import { finalStage } from "@/lib/priority";
import { requireEditor } from "@/lib/session";

async function draftOf(ticketId: number, draftId: number) {
  const session = await requireEditor(["designer"]);
  const { supabase } = session;
  const [{ data: draft }, { data: files }] = await Promise.all([
    supabase.from("ticket_drafts").select("*").eq("id", draftId).eq("ticket_id", ticketId).maybeSingle<Draft>(),
    supabase.from("ticket_draft_files").select("*").eq("draft_id", draftId).order("created_at").returns<DraftFile[]>(),
  ]);
  return { ...session, draft, files: files ?? [] };
}

// The client's happy with a draft: its files become the job's finished files (which is what the
// galleries show) and the job moves to the last stage. The draft and its notes stay as a record.
// Returns a problem to show, if there was one.
export async function sendDraftAsFinal(ticketId: number, draftId: number): Promise<string | undefined> {
  const { supabase, ctx, member, workspace, terms, draft, files } = await draftOf(ticketId, draftId);
  if (!draft) return "That draft has gone. Refresh the page.";
  if (draft.final_at) return;
  if (files.length) {
    const { error } = await supabase
      .from("ticket_deliveries")
      .insert(files.map((f) => ({ ticket_id: ticketId, path: f.path, url: f.url, name: f.name, size: f.size, mime: f.mime })));
    if (error) return `Couldn't add the files: ${error.message}`;
  }
  await supabase.from("ticket_drafts").update({ final_at: new Date().toISOString() }).eq("id", draftId);
  const finishing = await notYetFinished(supabase, [ticketId], finalStage(ctx));
  await supabase.from("tickets").update({ status: finalStage(ctx) }).eq("id", ticketId);
  // Tell the person who asked for it, by email and on their phone.
  if (finishing.length) after(() => tellRequesters(supabase, finishing, { name: workspace.name, replyTo: member.email, terms }).catch(() => {}));
  revalidatePath("/", "layout");
}

// Removes a draft with its files and notes. Files that were sent as final stay in the finished files.
export async function removeDraft(ticketId: number, draftId: number): Promise<string | undefined> {
  const { supabase, draft, files } = await draftOf(ticketId, draftId);
  if (!draft) return;
  const paths = files.map((f) => f.path).filter((p) => p !== null);
  const { data: kept } = paths.length
    ? await supabase.from("ticket_deliveries").select("path").in("path", paths).returns<{ path: string }[]>()
    : { data: [] };
  const keep = new Set((kept ?? []).map((d) => d.path));
  const gone = paths.filter((p) => !keep.has(p));
  const { error } = await supabase.from("ticket_drafts").delete().eq("id", draftId);
  if (error) return `Couldn't remove it: ${error.message}`;
  if (gone.length) await supabase.storage.from("deliveries").remove(gone);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/portal");
}
