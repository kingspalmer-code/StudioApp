"use server";

import { createClient } from "@/lib/supabase/server";
import { deviceLabel } from "@/lib/support";
import { pushReady, pushRpc, sendAlert } from "@/lib/push";

async function myEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

type Keys = { endpoint: string; keys: { p256dh: string; auth: string } };

// This phone or browser turned alerts on. Your other devices' choices carry over to it.
export async function saveDevice(sub: Keys): Promise<{ error?: string }> {
  const email = await myEmail();
  if (!email) return { error: "Sign in again, then try that." };
  if (!pushReady()) return { error: "Alerts aren't set up on the server yet." };
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "This browser gave Oatcake an address it can't use." };
  const ok = await pushRpc("push_save", {
    p_email: email,
    p_endpoint: sub.endpoint,
    p_p256dh: sub.keys.p256dh,
    p_auth: sub.keys.auth,
    p_device: await deviceLabel(),
  });
  return ok === null ? { error: "Couldn't save that. Try again." } : {};
}

export async function forgetDevice(endpoint: string) {
  const email = await myEmail();
  if (!email || !pushReady()) return;
  await pushRpc("push_forget", { p_endpoint: endpoint, p_email: email });
}

// Which alerts you get applies to all your devices.
export async function setAlertKinds(kinds: { new_requests: boolean; morning: boolean }) {
  const email = await myEmail();
  if (!email || !pushReady()) return;
  await pushRpc("push_set_kinds", { p_email: email, p_new_requests: Boolean(kinds.new_requests), p_morning: Boolean(kinds.morning) });
}

export async function sendTestAlert(): Promise<{ error?: string }> {
  const email = await myEmail();
  if (!email) return { error: "Sign in again, then try that." };
  const sent = await sendAlert([email], { title: "Oatcake", body: "Alerts are on. You'll hear from me here.", url: "/account", tag: "test" });
  return sent ? {} : { error: "That didn't reach any of your devices. Turn alerts off and on again here." };
}
