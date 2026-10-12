import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Phone alerts through Web Push. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// PUSH_SECRET in Vercel; without them nothing is sent and the Account page says so.
// The database only lets the push_* functions in with PUSH_SECRET (see migration 014).
export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SECRET = process.env.PUSH_SECRET ?? "";

export function pushReady() {
  return Boolean(VAPID_PUBLIC && process.env.VAPID_PRIVATE_KEY && SECRET);
}

// Calls one of the push_* database functions with the alerts secret. Null means it failed.
export async function pushRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc(fn, { p_secret: SECRET, ...args });
  if (error) {
    console.error(fn, error.message);
    return null;
  }
  // Functions that return nothing come back as null; count them as done.
  return (data ?? true) as T;
}

export type Alert = { title: string; body: string; url: string; tag?: string };
export type AlertKind = "new_requests" | "morning";

type Sub = { endpoint: string; p256dh: string; auth: string };

// Sends an alert to every device these people have turned alerts on for. Pass kind to skip devices
// that have that kind switched off. Devices the push service has forgotten are removed.
export async function sendAlert(emails: string[], alert: Alert, kind?: AlertKind): Promise<number> {
  if (!pushReady() || !emails.length) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@oatcake.xyz", VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY!);
  const subs = (await pushRpc<Sub[]>("push_targets", { p_emails: emails, p_kind: kind ?? null })) ?? [];
  const payload = JSON.stringify(alert);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await pushRpc("push_forget", { p_endpoint: s.endpoint, p_email: null });
        else console.error("push send", status, (e as Error).message);
      }
    })
  );
  return sent;
}

// Records that an alert went out. False if it already had, so callers send each one once.
export async function firstTime(kind: string, ref: string): Promise<boolean> {
  return (await pushRpc<boolean>("push_first", { p_kind: kind, p_ref: ref })) === true;
}
