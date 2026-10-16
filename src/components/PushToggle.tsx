"use client";

import { useEffect, useState } from "react";
import { api, isIos, isStandalone } from "@/lib/client";
import { Button, ErrorText } from "./ui";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "needs-install" | "not-configured" | "denied" | "off" | "on";

async function detect(): Promise<State> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (!VAPID) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted") return "off";
  // Re-attach on every visit: after signing in as someone else, this device follows them.
  await api("/api/push/subscribe", { body: sub.toJSON() }).catch(() => {});
  return "on";
}

/** Notification status for this device, with a button to turn it on (must be a tap on iOS). */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    let alive = true;
    detect().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      await api("/api/push/subscribe", { body: sub.toJSON() });
      setState("on");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setError(null);
    try {
      await api("/api/push/test", { body: {} });
      setTestSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (state === "loading") return null;
  if (compact && (state === "on" || state === "unsupported" || state === "not-configured")) return null;

  const messages: Partial<Record<State, string>> = {
    "needs-install": "Add Day Vlog to your Home Screen to get the hourly drops.",
    unsupported: "This browser can't receive notifications.",
    "not-configured": "Push isn't configured on the server yet (VAPID keys).",
    denied: "Notifications are blocked. Turn them on in Settings → Notifications → Day Vlog.",
  };

  return (
    <div className="flex flex-col gap-3">
      {state === "off" ? (
        <Button onClick={enable} busy={busy}>
          Turn on drop notifications
        </Button>
      ) : null}
      {state === "on" && !compact ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ok">Notifications are on for this device.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={test}>
              {testSent ? "Sent ✓" : "Send a test"}
            </Button>
            <Button variant="secondary" onClick={disable} busy={busy}>
              Turn off
            </Button>
          </div>
        </div>
      ) : null}
      {messages[state] ? <p className="text-sm text-muted">{messages[state]}</p> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
