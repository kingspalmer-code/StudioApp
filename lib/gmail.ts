import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Sending quotes and invoices through the business's own Gmail. Google signs them in once
// (Settings > Quotes & invoices > Connect Gmail); we keep only the refresh token, encrypted, and
// swap it for a short-lived access token each time something is sent. The only permission asked
// for is gmail.send: Oatcake can send as them but can't read their mail.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const STATE_COOKIE = "gmail_state";

export const gmailReady = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.MAIL_TOKEN_KEY);

export const callbackUrl = (origin: string) => `${origin}/api/mail/google/callback`;

export function authUrl(origin: string, state: string, hint?: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: `openid email ${GMAIL_SCOPE}`,
    access_type: "offline",
    // Always ask, so Google hands back a refresh token even if they connected before.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (hint) q.set("login_hint", hint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// The key is 32 random bytes, as base64 (openssl rand -base64 32).
function key() {
  const k = Buffer.from(process.env.MAIL_TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("MAIL_TOKEN_KEY must be 32 bytes of base64");
  return k;
}

export function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function unseal(sealed: string) {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("Unknown token format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}

async function token(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, out: out as Record<string, string> };
}

// After Google sends them back: the refresh token and which address they signed in as.
export async function exchangeCode(code: string, origin: string) {
  const { ok, out } = await token({ code, grant_type: "authorization_code", redirect_uri: callbackUrl(origin) });
  if (!ok || !out.refresh_token || !out.id_token) return null;
  if (!String(out.scope ?? "").split(" ").includes(GMAIL_SCOPE)) return null;
  // The id token comes straight from Google over TLS, so reading it without checking the signature is fine.
  const claims = JSON.parse(Buffer.from(out.id_token.split(".")[1], "base64url").toString("utf8"));
  if (!claims.email || claims.email_verified === false) return null;
  return { refreshToken: out.refresh_token, email: String(claims.email).toLowerCase() };
}

export async function revoke(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => {});
}

// Header text with anything beyond plain ASCII (an é in a business name, a £) encoded for email.
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const lines = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n");

export type Mail = { fromName: string; from: string; to: string; replyTo?: string; subject: string; text: string; html: string; attachment?: { filename: string; content: Buffer; type?: string } };

function mime(m: Mail) {
  const mixed = `mixed_${randomBytes(8).toString("hex")}`;
  const alt = `alt_${randomBytes(8).toString("hex")}`;
  const file = m.attachment?.filename.replace(/["\r\n]/g, "") ?? "";
  const type = (m.attachment?.type || "application/octet-stream").replace(/[^\w.+\/-]/g, "");
  return [
    `From: ${word(m.fromName.replace(/["\r\n]/g, ""))} <${m.from}>`,
    `To: ${m.to}`,
    ...(m.replyTo && m.replyTo !== m.from ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${word(m.subject.replace(/[\r\n]/g, " "))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lines(Buffer.from(m.text, "utf8").toString("base64")),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lines(Buffer.from(m.html, "utf8").toString("base64")),
    `--${alt}--`,
    ...(m.attachment
      ? [
          `--${mixed}`,
          `Content-Type: ${type}; name="${word(file)}"`,
          `Content-Disposition: attachment; filename="${word(file)}"`,
          "Content-Transfer-Encoding: base64",
          "",
          lines(m.attachment.content.toString("base64")),
        ]
      : []),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

// "reconnect" means Google no longer accepts the sign-in (they revoked it, changed their password,
// or the app is still in testing and the week is up); anything else is a one-off failure.
export async function sendViaGmail(sealedToken: string, m: Mail): Promise<{ ok: true } | { ok: false; reconnect: boolean; detail: string }> {
  let refresh: string;
  try {
    refresh = unseal(sealedToken);
  } catch {
    return { ok: false, reconnect: true, detail: "token unreadable" };
  }
  const t = await token({ refresh_token: refresh, grant_type: "refresh_token" });
  if (!t.ok || !t.out.access_token) return { ok: false, reconnect: t.out.error === "invalid_grant", detail: JSON.stringify(t.out) };
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${t.out.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime(m), "utf8").toString("base64url") }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, reconnect: res.status === 401 || res.status === 403, detail: `${res.status} ${await res.text()}` };
}
