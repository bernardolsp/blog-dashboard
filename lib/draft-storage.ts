import type { Post } from "@/lib/types";

const DATABASE_NAME = "blog-dashboard";
const DATABASE_VERSION = 1;
const STORE_NAME = "post-drafts";

export interface DraftRecord {
  id: string;
  owner: string;
  repo: string;
  postKey: string;
  sourceUpdatedAt?: string;
  savedAt: string;
  post: Post;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => T | Promise<T>) {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    Promise.resolve(callback(store))
      .then((result) => {
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
        };
      })
      .catch((error) => {
        database.close();
        reject(error);
      });
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function buildDraftKey(owner: string, repo: string, postKey: string) {
  return `${owner}/${repo}:${postKey}`;
}

export async function getDraft(owner: string, repo: string, postKey: string) {
  return withStore("readonly", async (store) => {
    const request = store.get(buildDraftKey(owner, repo, postKey));
    const result = await requestToPromise(request);
    return (result as DraftRecord | undefined) ?? null;
  });
}

export async function saveDraft(record: DraftRecord) {
  return withStore("readwrite", async (store) => {
    const request = store.put(record);
    await requestToPromise(request);
  });
}

export async function deleteDraft(owner: string, repo: string, postKey: string) {
  return withStore("readwrite", async (store) => {
    const request = store.delete(buildDraftKey(owner, repo, postKey));
    await requestToPromise(request);
  });
}

export async function listDrafts(owner: string, repo: string) {
  return withStore("readonly", async (store) => {
    const request = store.getAll();
    const result = await requestToPromise(request);
    const drafts = Array.isArray(result) ? (result as DraftRecord[]) : [];

    return drafts.filter((draft) => draft.owner === owner && draft.repo === repo);
  });
}
