import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Phone alerts through Web Push. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// SUPABASE_SERVICE_ROLE_KEY in Vercel; without them nothing is sent and the Account page says so.
export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushReady() {
  return Boolean(VAPID_PUBLIC && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// The subscriptions table is only reachable with the service key, never from the browser.
export function pushAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Alert = { title: string; body: string; url: string; tag?: string };
export type AlertKind = "new_requests" | "morning";

type Sub = { endpoint: string; p256dh: string; auth: string };

// Sends an alert to every device these people have turned alerts on for. Pass kind to skip devices
// that have that kind switched off. Devices the push service has forgotten are removed.
export async function sendAlert(emails: string[], alert: Alert, kind?: AlertKind): Promise<number> {
  if (!pushReady() || !emails.length) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@oatcake.xyz", VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY!);
  const db = pushAdmin();
  let query = db.from("push_subscriptions").select("endpoint, p256dh, auth").in("email", emails);
  if (kind) query = query.eq(kind, true);
  const { data, error } = await query.returns<Sub[]>();
  if (error) {
    console.error("push subscriptions", error.message);
    return 0;
  }
  const payload = JSON.stringify(alert);
  let sent = 0;
  await Promise.all(
    (data ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("push send", status, (e as Error).message);
      }
    })
  );
  return sent;
}

// Records that an alert went out. False if it already had, so callers send each one once.
export async function firstTime(kind: string, ref: string): Promise<boolean> {
  const { error } = await pushAdmin().from("push_log").insert({ kind, ref });
  if (error && error.code !== "23505") console.error("push log", error.message);
  return !error;
}
