import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, revoke, seal, STATE_COOKIE } from "@/lib/gmail";
import { requireEditor } from "@/lib/session";

// Google sends them back here after they've allowed (or refused) sending from their Gmail.
export async function GET(req: NextRequest) {
  const { supabase, workspace, member } = await requireEditor(["designer"], "quotes");
  const url = new URL(req.url);
  const back = (mail: string) => {
    const res = NextResponse.redirect(`${url.origin}/settings/documents?mail=${mail}`);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/mail/google" });
    return res;
  };
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || state !== req.cookies.get(STATE_COOKIE)?.value) return back("error");
  if (!code) return back(url.searchParams.get("error") === "access_denied" ? "denied" : "error");

  const got = await exchangeCode(code, url.origin);
  if (!got) return back("scope");
  const { error } = await supabase.from("mail_accounts").upsert({
    workspace_id: workspace.id,
    provider: "gmail",
    email: got.email,
    refresh_token: seal(got.refreshToken),
    connected_by: member.email,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("gmail connect", error);
    await revoke(got.refreshToken);
    return back("error");
  }
  return back("connected");
}
