import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

// Emails someone a link to sign in. Uses a throwaway client so the sender's own session is untouched.
// The email template reads invited_by and workspace to say who invited them (only on their first email).
export async function emailInvite(email: string, invitedBy: string, workspace: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${proto}://${host}/auth/confirm`, data: { invited_by: invitedBy, workspace } },
  });
  return error ? error.message : null;
}
