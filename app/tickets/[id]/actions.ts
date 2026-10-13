"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { logEvents, notYetFinished, tellDraft, tellRequesters } from "@/lib/finished";
import type { Draft, DraftFile } from "@/lib/deliveries";
import { finalStage, reviewStage } from "@/lib/priority";
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
  await logEvents(supabase, finishing, "finished", { stage: finalStage(ctx), draft_id: draftId, files: files.map((f) => f.name), actor: member.full_name || member.email });
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

// Tells the client, and anyone picked to keep updated, about a draft that was just shared.
// Sharing a draft is sending the job for review: it moves to the review stage (unless it's already
// there or finished) and goes on the job's progress timeline with its files and who was told.
export async function tellAboutDraft(ticketId: number, draftId: number) {
  const { supabase, ctx, member, workspace, terms, draft, files } = await draftOf(ticketId, draftId);
  if (!draft || Date.now() - Date.parse(draft.created_at) > 30 * 60_000) return;
  const { data: logged } = await supabase.from("ticket_events").select("id").eq("draft_id", draftId).eq("kind", "draft").limit(1);
  if (!logged?.length) {
    const review = reviewStage(ctx);
    const { data: t } = await supabase.from("tickets").select("status").eq("id", ticketId).maybeSingle<{ status: string }>();
    if (review && t && t.status !== review.key && t.status !== finalStage(ctx)) await supabase.from("tickets").update({ status: review.key }).eq("id", ticketId);
    await logEvents(supabase, [ticketId], "draft", { draft_id: draftId, files: files.map((f) => f.name), actor: member.full_name || member.email });
    revalidatePath("/", "layout");
  }
  after(() => tellDraft(supabase, ticketId, draftId, { name: workspace.name, replyTo: member.email, terms }).catch(() => {}));
}

// Who the studio keeps updated on a job: one of the business's clients or managers, or nobody.
export async function setNotify(ticketId: number, email: string) {
  const { supabase } = await requireEditor(["designer"]);
  await supabase.from("tickets").update({ notify: email || null }).eq("id", ticketId);
  revalidatePath(`/tickets/${ticketId}`);
}
