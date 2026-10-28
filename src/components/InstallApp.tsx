"use client";

import { useEffect, useState } from "react";
import { isStandalone } from "@/components/PushSettings";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "loading" | "installed" | "prompt" | "ios" | "android-manual" | "desktop";

/**
 * "Install the app" card. Android/Chrome/Edge get the real install prompt;
 * iPhone gets the Share → Add to Home Screen steps (Safari has no prompt API).
 */
export default function InstallApp() {
  const [mode, setMode] = useState<Mode>("loading");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setMode("installed");
      return;
    }
    const ua = navigator.userAgent;
    const ios =
      /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setMode(ios ? "ios" : /Android/.test(ua) ? "android-manual" : "desktop");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setMode("installed");
  }

  if (mode === "loading") return <p className="text-sm text-zinc-500">…</p>;

  if (mode === "installed") {
    return (
      <p className="text-sm text-emerald-400">
        ✓ You are using the installed CAS League app.
      </p>
    );
  }

  if (mode === "prompt") {
    return (
      <button
        type="button"
        onClick={install}
        className="rounded bg-[#ff6b35] px-4 py-2 font-semibold text-zinc-950 hover:bg-orange-400"
      >
        Install the app
      </button>
    );
  }

  if (mode === "ios") {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
        <li>
          Open this page in <strong>Safari</strong>.
        </li>
        <li>
          Tap <strong>Share</strong>{" "}
          <svg className="inline h-4 w-4 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
          </svg>{" "}
          at the bottom of the screen.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong> and tap <strong>Add</strong>.
        </li>
        <li>Open CAS League from your home screen and turn on notifications below.</li>
      </ol>
    );
  }

  if (mode === "android-manual") {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
        <li>
          Open this page in <strong>Chrome</strong>.
        </li>
        <li>
          Tap the <strong>⋮</strong> menu → <strong>Install app</strong> (or{" "}
          <strong>Add to Home screen</strong>).
        </li>
      </ol>
    );
  }

  return (
    <p className="text-sm text-zinc-300">
      Open <strong>league.simracing-hub.com/app</strong> on your phone to
      install it. In Chrome or Edge on this computer you can also install it
      from the address bar.
    </p>
  );
}
