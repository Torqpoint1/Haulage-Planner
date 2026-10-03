"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PodResult } from "@/lib/drivers/pod";
import {
  deleteQueued,
  filePaths,
  listQueued,
  putQueued,
  type QueuedPod,
} from "@/lib/drivers/queue";
import { createClient } from "@/lib/supabase/client";
import { recordPod } from "./actions";

const RETRY_MS = 20_000;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Upload an entry's files, then record it. Never throws: a failure says whether to retry. */
async function send(entry: QueuedPod): Promise<PodResult> {
  const paths = filePaths(entry);
  try {
    const storage = createClient().storage.from("organisation-files");
    const uploads: [string | null, Blob | null][] = [
      [paths.signature, entry.signature],
      ...entry.photos.map((p, i): [string, Blob] => [paths.photos[i], p]),
    ];
    for (const [path, blob] of uploads) {
      if (!path || !blob) continue;
      // Upsert: a retry after a dropped connection may find the file already there.
      const { error } = await storage.upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) return { ok: false, error: "Waiting for signal to upload photos.", retry: true };
    }
    return await recordPod({
      ...entry.submission,
      signaturePath: paths.signature,
      photoPaths: paths.photos,
    });
  } catch {
    // No connection: the request never reached us.
    return { ok: false, error: "Waiting for signal.", retry: true };
  }
}

/**
 * The phone's outbox, kept in IndexedDB. Sends whenever there's a connection:
 * straight after saving, when the phone comes back online, when the app comes
 * back to the foreground, and every 20 seconds while anything is waiting.
 */
export function usePodQueue(userId: string) {
  const router = useRouter();
  const [entries, setEntries] = useState<QueuedPod[]>([]);
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  // The browser can say it's online with no real connection; a failed send says otherwise.
  const [reachable, setReachable] = useState(true);
  const online = browserOnline && reachable;
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    try {
      setEntries(await listQueued(userId));
    } catch {
      setEntries([]);
    }
    setReady(true);
  }, [userId]);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    let sent = 0;
    try {
      const waiting = (await listQueued(userId)).filter((e) => e.state === "waiting");
      for (const entry of waiting) {
        const result = await send(entry);
        if (result.ok) {
          await deleteQueued(entry.clientId);
          sent++;
          setReachable(true);
          continue;
        }
        await putQueued({
          ...entry,
          attempts: entry.attempts + 1,
          error: result.error,
          state: result.retry ? "waiting" : "rejected",
        });
        if (result.retry) {
          setReachable(false);
          break; // No signal: try the rest later, in order.
        }
      }
    } catch {
      // IndexedDB unavailable; nothing we can do here.
    } finally {
      busy.current = false;
      setSending(false);
      await reload();
      if (sent) router.refresh();
    }
  }, [userId, reload, router]);

  const enqueue = useCallback(
    async (entry: QueuedPod) => {
      await putQueued(entry);
      await reload();
      void flush();
    },
    [reload, flush],
  );

  const retry = useCallback(
    async (clientId: string) => {
      const entry = entries.find((e) => e.clientId === clientId);
      if (!entry) return;
      await putQueued({ ...entry, state: "waiting", error: null });
      await flush();
    },
    [entries, flush],
  );

  const discard = useCallback(
    async (clientId: string) => {
      await deleteQueued(clientId);
      await reload();
    },
    [reload],
  );

  useEffect(() => {
    // Read the outbox and send what's waiting once the page is up.
    const start = window.setTimeout(() => void reload().then(flush), 0);
    const goOnline = () => {
      setReachable(true);
      void flush();
    };
    const onVisible = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, flush]);

  const waiting = entries.some((e) => e.state === "waiting");
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, flush]);

  return { entries, online, sending, ready, enqueue, retry, discard, flush };
}
