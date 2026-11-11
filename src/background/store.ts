import type { Meta } from "../lib/data/types";

export interface StoreState {
  /** The downloaded snapshot in use; every file it lists is in `blobs`. */
  active: Meta | null;
  /** The snapshot it replaced, kept so pages mid-read finish consistently. */
  previous: Meta | null;
  lastCheck: string | null;
  lastError: string | null;
}

export const EMPTY_STATE: StoreState = {
  active: null,
  previous: null,
  lastCheck: null,
  lastError: null,
};

/** Content-addressed artifact cache plus one state record. */
export interface SnapshotStore {
  getState(): Promise<StoreState>;
  setState(state: StoreState): Promise<void>;
  hasBlob(sha256: string): Promise<boolean>;
  getBlob(sha256: string): Promise<string | undefined>;
  putBlob(sha256: string, text: string): Promise<void>;
  /** Delete every blob whose sha is not in `keep`. */
  retainBlobs(keep: Set<string>): Promise<void>;
}

const DB_NAME = "lce-data";
const BLOBS = "blobs";
const STATE = "state";
const STATE_KEY = "state";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function open(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(BLOBS);
    req.result.createObjectStore(STATE);
  };
  return request(req);
}

/** The IndexedDB-backed store used by the background worker. */
export function createIdbStore(): SnapshotStore {
  let db: Promise<IDBDatabase> | null = null;
  const conn = () => (db ??= open());

  async function store(name: string, mode: IDBTransactionMode) {
    const tx = (await conn()).transaction(name, mode);
    return { tx, os: tx.objectStore(name) };
  }

  return {
    async getState() {
      const { os } = await store(STATE, "readonly");
      const value = (await request(os.get(STATE_KEY))) as
        StoreState | undefined;
      return { ...EMPTY_STATE, ...value };
    },
    async setState(state) {
      const { tx, os } = await store(STATE, "readwrite");
      os.put(state, STATE_KEY);
      await done(tx);
    },
    async hasBlob(sha256) {
      const { os } = await store(BLOBS, "readonly");
      return (await request(os.count(sha256))) > 0;
    },
    async getBlob(sha256) {
      const { os } = await store(BLOBS, "readonly");
      return (await request(os.get(sha256))) as string | undefined;
    },
    async putBlob(sha256, text) {
      const { tx, os } = await store(BLOBS, "readwrite");
      os.put(text, sha256);
      await done(tx);
    },
    async retainBlobs(keep) {
      const { tx, os } = await store(BLOBS, "readwrite");
      const keys = (await request(os.getAllKeys())) as string[];
      for (const key of keys) if (!keep.has(key)) os.delete(key);
      await done(tx);
    },
  };
}
