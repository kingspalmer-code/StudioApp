"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deviceLabel, notifyInbox, notifyPerson, type SupportTicket } from "@/lib/support";

type State = { error?: string } | null;

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// A screenshot must be in the sender's own folder; anything else is ignored.
const cleanAttachment = (fd: FormData, uid: string) => {
  const p = String(fd.get("attachment") ?? "");
  return p.startsWith(`${uid}/`) && /^[\w/-]+\.(jpe?g|png|webp|gif)$/i.test(p) ? p : "";
};

export async function openTicket(_prev: State, fd: FormData): Promise<State> {
  const { supabase, user } = await signedIn();
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  const { data: id, error } = await supabase.rpc("support_open", {
    p_subject: "",
    p_body: body,
    p_page: String(fd.get("page") ?? "").slice(0, 300),
    p_device: await deviceLabel(),
    p_attachment: cleanAttachment(fd, user.id),
  });
  if (error || !id) return { error: error?.message ?? "That didn't send. Try again." };
  const { data: t } = await supabase.from("support_tickets").select("*").eq("id", id).single<SupportTicket>();
  if (t) await notifyInbox(t, body, true);
  redirect(`/help/${id}?sent=1`);
}

export async function replyTicket(id: number, asOatcake: boolean, _prev: State, fd: FormData): Promise<State> {
  const { supabase, user } = await signedIn();
  const body = String(fd.get("body") ?? "").trim();
  const attachment = cleanAttachment(fd, user.id);
  if (!body && !attachment) return { error: "Write a message first." };
  const { error } = await supabase.rpc("support_reply", { p_ticket: id, p_body: body, p_attachment: attachment, p_as_oatcake: asOatcake });
  if (error) return { error: error.message };
  const { data: t } = await supabase.from("support_tickets").select("*").eq("id", id).single<SupportTicket>();
  if (t) await (asOatcake ? notifyPerson(t, body || "(a screenshot)") : notifyInbox(t, body || "(a screenshot)", false));
  revalidatePath(asOatcake ? `/admin/support/${id}` : `/help/${id}`);
  return null;
}

export async function setTicketStatus(id: number, status: SupportTicket["status"], asOatcake: boolean) {
  const { supabase } = await signedIn();
  await supabase.rpc("support_set_status", { p_ticket: id, p_status: status });
  revalidatePath(asOatcake ? `/admin/support/${id}` : `/help/${id}`);
  revalidatePath(asOatcake ? "/admin/support" : "/help");
}
