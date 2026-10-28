"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (push notifications + offline page). Production only, so
 * `next dev` never runs a stale worker.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the site works without it, only push/offline are missing.
    });
  }, []);
  return null;
}
