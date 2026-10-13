"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// A customer replying on one of their jobs from their own page.
export async function customerReply(token: string, job: number, formData: FormData): Promise<{ error?: string }> {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return {};
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_reply", { token, job, message });
  if (error) return { error: error.message };
  revalidatePath(`/c/${token}`);
  return {};
}
