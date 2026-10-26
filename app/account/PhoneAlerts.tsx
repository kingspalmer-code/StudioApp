"use client";

import { useEffect, useState } from "react";
import { forgetDevice, saveDevice, sendTestAlert, setAlertKinds } from "./actions";

type Kinds = { new_requests: boolean; morning: boolean };
type State = "checking" | "desktop" | "unsupported" | "home-screen" | "blocked" | "off" | "on";

// The push service wants the public key as bytes.
function keyBytes(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Alerts on this phone or computer. For the studio: new client requests straight away, and a
// morning nudge about anything due. For clients and managers: when work they asked for is finished.
// iPhones only allow this once Oatcake is on the Home Screen.
export default function PhoneAlerts({ ready, publicKey, kinds: initial, studio }: { ready: boolean; publicKey: string; kinds: Kinds; studio: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [kinds, setKinds] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      // The Mac app shows new requests itself while it's open (see desktop/), so there's nothing to turn on.
      if ("__TAURI_INTERNALS__" in window) return setState("desktop");
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "home-screen" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const res = await saveDevice(sub.toJSON() as Parameters<typeof saveDevice>[0]);
      if (res.error) {
        await sub.unsubscribe();
        setNote(res.error);
        return;
      }
      setState("on");
      setNote("Alerts are on for this device.");
    } catch {
      setNote("This device wouldn't turn alerts on. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote("");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await forgetDevice(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  async function change(next: Kinds) {
    setKinds(next);
    await setAlertKinds(next);
  }

  async function test() {
    setBusy(true);
    setNote("");
    const res = await sendTestAlert();
    setNote(res.error ?? "Sent. It should pop up in a few seconds.");
    setBusy(false);
  }

  const explain: Partial<Record<State, string>> = {
    "home-screen": "On iPhone and iPad, add Oatcake to your Home Screen first: tap the Share button, then Add to Home Screen. Open Oatcake from there and turn alerts on here.",
    desktop: studio
      ? "The Oatcake app on this Mac shows a notification for each new client request while it's open. Nothing to turn on."
      : "Turn alerts on from Oatcake on your phone, or in a web browser.",
    unsupported: "This browser can't show alerts. Try Chrome, Edge, Firefox or Safari.",
    blocked: "Alerts are blocked for Oatcake in this browser's settings. Allow notifications for oatcake.xyz, then come back here.",
  };

  return (
    <>
      <div className="row">
        <div className="ctl">
          <div style={{ fontWeight: 600 }}>Alerts on this device</div>
          <div className="when">
            {!ready
              ? "Alerts aren't switched on for Oatcake yet."
              : (explain[state] ??
                (studio
                  ? "A pop-up when a client sends a new request, and one gentle nudge each morning."
                  : "A pop-up when work you asked for is finished. You'll get an email too."))}
          </div>
          {note && <div className="when" style={{ marginTop: 4, color: "var(--label)" }}>{note}</div>}
        </div>
        {ready && (state === "on" || state === "off") && (
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={state === "on"}
            disabled={busy}
            onChange={(e) => (e.target.checked ? turnOn() : turnOff())}
            aria-label="Alerts on this device"
          />
        )}
      </div>
      {ready && state === "on" && (
        <>
          {studio && (
            <>
              <div className="row">
                <div className="ctl">
                  <div style={{ fontWeight: 600 }}>New client requests</div>
                  <div className="when">As soon as a client sends one from their portal.</div>
                </div>
                <input type="checkbox" role="switch" className="switch" checked={kinds.new_requests} onChange={(e) => change({ ...kinds, new_requests: e.target.checked })} aria-label="New client requests" />
              </div>
              <div className="row">
                <div className="ctl">
                  <div style={{ fontWeight: 600 }}>Morning nudge</div>
                  <div className="when">One alert first thing, naming a single small place to start. Nothing on, nothing sent.</div>
                </div>
                <input type="checkbox" role="switch" className="switch" checked={kinds.morning} onChange={(e) => change({ ...kinds, morning: e.target.checked })} aria-label="Morning nudge" />
              </div>
            </>
          )}
          <button type="button" className="row nav-row" onClick={test} disabled={busy} style={{ width: "100%", textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
            <div className="ctl" style={{ fontWeight: 600 }}>Send a test alert</div>
            <span className="when">›</span>
          </button>
        </>
      )}
    </>
  );
}
