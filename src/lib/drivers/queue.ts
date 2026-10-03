/**
 * The phone's outbox for proof of delivery (spec 9.8: "works with a weak
 * signal"). Each submission, with its signature and photos, is saved in
 * IndexedDB the moment the driver presses save, so it survives losing signal,
 * closing the browser or the phone restarting. It is sent when there's a
 * connection and deleted only once the server has accepted it.
 */
import type { PodSubmission } from "./pod";

export type QueuedPod = {
  clientId: string;
  /** Whose phone queue this is; another login on the same phone doesn't send it. */
  userId: string;
  organisationId: string;
  loadId: string;
  stopId: string;
  siteName: string;
  /** Everything except the file paths, which are known once uploaded. */
  submission: Omit<PodSubmission, "signaturePath" | "photoPaths">;
  signature: Blob | null;
  photos: Blob[];
  state: "waiting" | "rejected";
  error: string | null;
  attempts: number;
  queuedAt: string;
};

const DB_NAME = "haulage-planner";
const STORE = "pod-queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "clientId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function putQueued(entry: QueuedPod): Promise<void> {
  await tx("readwrite", (s) => s.put(entry));
}

export async function listQueued(userId: string): Promise<QueuedPod[]> {
  const all = await tx<QueuedPod[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedPod[]>);
  return all
    .filter((e) => e.userId === userId)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function deleteQueued(clientId: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(clientId));
}

/** Storage paths for an entry's files, inside the stop's folder. */
export function filePaths(entry: QueuedPod) {
  const folder = `${entry.organisationId}/pods/${entry.stopId}/${entry.clientId}`;
  return {
    signature: entry.signature ? `${folder}/signature.png` : null,
    photos: entry.photos.map((p, i) => `${folder}/photo-${i + 1}.${extension(p.type)}`),
  };
}

function extension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  return "jpg";
}
