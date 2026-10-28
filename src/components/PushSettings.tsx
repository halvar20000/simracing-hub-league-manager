"use client";

import { useEffect, useState } from "react";
import {
  deletePushSubscription,
  getPushTopics,
  savePushSubscription,
  sendTestPush,
  updatePushTopics,
} from "@/lib/actions/push";

type Topic = { key: string; label: string };

type State =
  | "loading"
  | "unsupported"
  | "ios-install-first"
  | "denied"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/**
 * Per-device push notification switch + topic picker. Lives on /app and on
 * /profile#notifications. Every device subscribes on its own.
 */
export default function PushSettings({
  publicKey,
  topics,
  defaultTopics,
}: {
  publicKey: string;
  topics: Topic[];
  defaultTopics: string[];
}) {
  const [state, setState] = useState<State>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(defaultTopics);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        // iOS Safari only exposes Web Push inside the installed home-screen app.
        setState(isIos() && !isStandalone() ? "ios-install-first" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) {
        setState("off");
        return;
      }
      setEndpoint(sub.endpoint);
      const stored = await getPushTopics(sub.endpoint);
      if (stored) {
        setSelected(stored);
      } else {
        // Browser still subscribed but the server lost it (e.g. pruned) — re-save.
        await savePushSubscription(sub.toJSON(), defaultTopics, navigator.userAgent);
      }
      setState("on");
    })().catch(() => setState("unsupported"));
  }, [defaultTopics]);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await savePushSubscription(sub.toJSON(), selected, navigator.userAgent);
      if (!res.ok) {
        setNote(res.error ?? "Could not save this device.");
        return;
      }
      setEndpoint(sub.endpoint);
      setState("on");
      setNote("Notifications are on for this device.");
    } catch {
      setNote("Your browser refused the subscription. Try again, or check its site settings.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setState("off");
      setNote("Notifications are off for this device.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: string) {
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key];
    setSelected(next);
    if (endpoint) await updatePushTopics(endpoint, next);
  }

  async function test() {
    setBusy(true);
    try {
      const { sent } = await sendTestPush();
      setNote(
        sent > 0
          ? `Test sent to ${sent} device${sent === 1 ? "" : "s"}.`
          : "No device reached — switch notifications off and on again."
      );
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50";

  return (
    <div className="space-y-3">
      {state === "loading" && <p className="text-sm text-zinc-500">Checking this device…</p>}
      {state === "unsupported" && (
        <p className="text-sm text-zinc-400">
          This browser can&apos;t receive push notifications. On Android use
          Chrome; on iPhone install the app to your home screen first.
        </p>
      )}
      {state === "ios-install-first" && (
        <p className="text-sm text-amber-300">
          On iPhone and iPad, notifications only work in the installed app:
          tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open
          CAS League from your home screen and switch them on there.
        </p>
      )}
      {state === "denied" && (
        <p className="text-sm text-amber-300">
          Notifications are blocked for this site. Allow them in your
          browser&apos;s (or phone&apos;s) settings for league.simracing-hub.com,
          then reload this page.
        </p>
      )}
      {state === "off" && (
        <button type="button" onClick={enable} disabled={busy} className={`${btn} bg-[#ff6b35] text-zinc-950 hover:bg-orange-400`}>
          {busy ? "Enabling…" : "Turn on notifications"}
        </button>
      )}
      {(state === "off" || state === "on") && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
            Notify me about
          </legend>
          {topics.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-orange-500"
                checked={selected.includes(t.key)}
                onChange={() => toggle(t.key)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={test} disabled={busy} className={`${btn} border border-zinc-700 text-zinc-200 hover:bg-zinc-800`}>
            Send a test
          </button>
          <button type="button" onClick={disable} disabled={busy} className={`${btn} border border-zinc-700 text-zinc-400 hover:bg-zinc-800`}>
            Turn off on this device
          </button>
        </div>
      )}
      {note && <p className="text-sm text-emerald-400">{note}</p>}
    </div>
  );
}
