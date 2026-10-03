"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that keeps the run page and its files on the
 * phone (public/sw.js), and hands it the files this page has already loaded.
 * Production only: in development it would get in the way of live reloading.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (cancelled) return;
        const urls = [
          ...performance.getEntriesByType("resource").map((e) => e.name),
          ...[...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src),
          ...[...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].map(
            (l) => l.href,
          ),
        ];
        registration.active?.postMessage({ type: "precache", urls });
      })
      .catch(() => {
        // Offline support is a bonus; the page works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

/** Forget the cached run on this phone, e.g. when signing out. */
export function clearOfflineRun() {
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage("clear");
  }
}
