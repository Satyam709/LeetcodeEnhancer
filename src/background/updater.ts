import { isMeta } from "../lib/data/loader";
import {
  DATA_BRANCH,
  DATA_PATH,
  DATA_REPO,
  type CheckStatus,
} from "../lib/data/protocol";
import type { Meta } from "../lib/data/types";
import type { SnapshotStore, StoreState } from "./store";

/** Parallel downloads per check. */
const CONCURRENCY = 6;
/** A remote snapshot claiming more than this is rejected outright. */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
/** Artifact paths as the pipeline writes them ("companies/x.json"). */
const SAFE_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\.json$/;

export interface UpdaterDeps {
  fetch: typeof fetch;
  store: SnapshotStore;
  /** The meta.json shipped inside the extension, or null if unreadable. */
  bundledMeta: () => Promise<Meta | null>;
  /** Hex sha256 of raw bytes (crypto.subtle in the worker). */
  sha256: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
  /** Base URL (no trailing slash) the snapshot's files are read from. */
  resolveBase?: (fetchImpl: typeof fetch) => Promise<string>;
  now?: () => Date;
}

/**
 * Pin to the data branch's current commit: jsDelivr caches `@branch` URLs for
 * hours, but `@<sha>` is immutable, so meta.json and every shard it lists are
 * guaranteed to come from the same publish.
 */
export async function resolveJsDelivrBase(
  fetchImpl: typeof fetch
): Promise<string> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${DATA_REPO}/commits/${DATA_BRANCH}`,
    { headers: { accept: "application/vnd.github+json" } }
  );
  if (!res.ok) throw new Error(`data branch lookup: HTTP ${res.status}`);
  const sha = ((await res.json()) as { sha?: unknown }).sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("data branch lookup: no commit sha");
  }
  return `https://cdn.jsdelivr.net/gh/${DATA_REPO}@${sha}/${DATA_PATH}`;
}

/** Whichever of the cached and bundled snapshots is newer (null = bundle). */
export function effectiveSnapshot(
  active: Meta | null,
  bundled: Meta | null
): Meta | null {
  if (active === null) return null;
  if (bundled !== null && bundled.generatedAt >= active.generatedAt) {
    return null;
  }
  return active;
}

function validRemote(meta: Meta): string | null {
  let total = 0;
  for (const [path, file] of Object.entries(meta.files)) {
    if (!SAFE_PATH.test(path) || path.includes("..")) {
      return `unsafe path in remote meta: ${path}`;
    }
    if (
      typeof file?.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(file.sha256)
    ) {
      return `bad sha256 for ${path}`;
    }
    total += typeof file.bytes === "number" ? file.bytes : 0;
  }
  if (total > MAX_TOTAL_BYTES) return `remote snapshot too large (${total} B)`;
  return null;
}

async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await work(items[next++]!);
    }
  );
  await Promise.all(runners);
}

/**
 * One update check. Downloads only files whose sha256 is neither cached nor
 * shipped in the bundle, verifies each against the remote meta, and switches
 * `active` only once the whole snapshot is present. Any failure keeps the
 * current snapshot and is recorded as `lastError`. Never throws.
 */
export async function checkForUpdate(deps: UpdaterDeps): Promise<CheckStatus> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const resolveBase = deps.resolveBase ?? resolveJsDelivrBase;
  let state: StoreState;
  try {
    state = await deps.store.getState();
  } catch (err) {
    return { outcome: "failed", lastCheck: now, lastError: message(err) };
  }

  const record = async (
    outcome: CheckStatus["outcome"],
    patch: Partial<StoreState>
  ): Promise<CheckStatus> => {
    const next = { ...state, ...patch, lastCheck: now };
    try {
      await deps.store.setState(next);
    } catch (err) {
      return { outcome: "failed", lastCheck: now, lastError: message(err) };
    }
    return { outcome, lastCheck: now, lastError: next.lastError };
  };

  try {
    const bundled = await deps.bundledMeta();
    const base = await resolveBase(deps.fetch);

    const metaRes = await deps.fetch(`${base}/meta.json`);
    if (!metaRes.ok) throw new Error(`meta.json: HTTP ${metaRes.status}`);
    const remote: unknown = await metaRes.json();
    // A schema this build doesn't understand is not an error, just not for us.
    if (!isMeta(remote)) return record("current", { lastError: null });
    const invalid = validRemote(remote);
    if (invalid !== null) throw new Error(invalid);

    const current = effectiveSnapshot(state.active, bundled) ?? bundled;
    if (current !== null && remote.generatedAt <= current.generatedAt) {
      return record("current", { lastError: null });
    }

    const missing: [string, string][] = [];
    for (const [path, { sha256 }] of Object.entries(remote.files)) {
      if (bundled?.files[path]?.sha256 === sha256) continue;
      if (await deps.store.hasBlob(sha256)) continue;
      missing.push([path, sha256]);
    }

    await pool(missing, CONCURRENCY, async ([path, sha256]) => {
      const res = await deps.fetch(`${base}/${path}`);
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if ((await deps.sha256(bytes)) !== sha256) {
        throw new Error(`${path}: sha256 mismatch`);
      }
      await deps.store.putBlob(sha256, new TextDecoder().decode(bytes));
    });

    const status = await record("updated", {
      active: remote,
      previous: state.active,
      lastError: null,
    });
    if (status.outcome === "updated") {
      await collectGarbage(deps.store, [remote, state.active]).catch(() => {});
    }
    return status;
  } catch (err) {
    return record("failed", { lastError: message(err) });
  }
}

/** Drop every cached blob not referenced by the given snapshots. */
export async function collectGarbage(
  store: SnapshotStore,
  snapshots: (Meta | null)[]
): Promise<void> {
  const keep = new Set<string>();
  for (const meta of snapshots) {
    for (const file of Object.values(meta?.files ?? {})) keep.add(file.sha256);
  }
  await store.retainBlobs(keep);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
