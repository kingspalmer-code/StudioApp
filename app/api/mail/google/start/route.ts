import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, gmailReady, STATE_COOKIE } from "@/lib/gmail";
import { requireEditor } from "@/lib/session";

// Settings > Quotes & invoices > Connect Gmail: off to Google to sign in and allow sending.
export async function GET(req: Request) {
  const { member } = await requireEditor(["designer"], "quotes");
  const origin = new URL(req.url).origin;
  if (!gmailReady()) return NextResponse.redirect(`${origin}/settings/documents?mail=off`);
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(origin, state, member.email));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/mail/google", maxAge: 600 });
  return res;
}
