import { DataUnavailable, createDataLayer, type DataLayer } from "./loader";
import type { DataRequest, FileResponse, MetaResponse } from "./protocol";
import type { Meta } from "./types";

interface ExtensionRuntime {
  getURL(path: string): string;
  sendMessage?(message: DataRequest): Promise<unknown>;
}

/** How long to wait for the background worker before using the bundle. */
const SNAPSHOT_TIMEOUT_MS = 2000;

/**
 * Find the extension runtime namespace (Chrome's `chrome`, Firefox's `browser`)
 * without assuming either exists. Returns null outside extension contexts.
 */
function detectRuntime(): ExtensionRuntime | null {
  const globals = globalThis as Record<string, unknown>;
  for (const name of ["chrome", "browser"]) {
    const ns = globals[name] as
      { runtime?: { getURL?: unknown; sendMessage?: unknown } } | undefined;
    const runtime = ns?.runtime;
    const getURL = runtime?.getURL;
    if (runtime !== undefined && typeof getURL === "function") {
      const sendMessage = runtime.sendMessage;
      return {
        getURL: (getURL as (p: string) => string).bind(runtime),
        ...(typeof sendMessage === "function"
          ? {
              sendMessage: (
                sendMessage as (m: DataRequest) => Promise<unknown>
              ).bind(runtime),
            }
          : {}),
      };
    }
  }
  return null;
}

/**
 * Ask the background worker which snapshot is active. Anything other than a
 * well-formed cache answer within the timeout means "use the bundle".
 */
async function resolveSnapshot(
  runtime: ExtensionRuntime
): Promise<Meta | null> {
  if (runtime.sendMessage === undefined) return null;
  try {
    const response = (await Promise.race([
      runtime.sendMessage({ type: "lce:data:meta" }),
      new Promise((resolve) => setTimeout(resolve, SNAPSHOT_TIMEOUT_MS, null)),
    ])) as MetaResponse | null | undefined;
    return response?.origin === "cache" ? response.meta : null;
  } catch {
    return null;
  }
}

async function loadBundled(runtime: ExtensionRuntime, path: string) {
  let response: Response;
  try {
    response = await fetch(runtime.getURL(path));
  } catch {
    throw new DataUnavailable(path);
  }
  if (!response.ok) throw new DataUnavailable(path);
  return response.json();
}

async function loadCached(
  runtime: ExtensionRuntime,
  meta: Meta,
  path: string
): Promise<unknown> {
  if (path === "data/meta.json") return meta;
  const file = meta.files[path.replace(/^data\//, "")];
  if (file === undefined || runtime.sendMessage === undefined) {
    throw new DataUnavailable(path);
  }
  let response: FileResponse | null | undefined;
  try {
    response = (await runtime.sendMessage({
      type: "lce:data:file",
      path: path.replace(/^data\//, ""),
      sha256: file.sha256,
    })) as FileResponse | null | undefined;
  } catch {
    throw new DataUnavailable(path);
  }
  if (!response?.ok) throw new DataUnavailable(path);
  try {
    return JSON.parse(response.text);
  } catch {
    throw new DataUnavailable(path);
  }
}

/**
 * The production data layer. The first read asks the background worker for
 * the active snapshot and pins it for the layer's lifetime, so one page never
 * mixes files from two snapshots (problem shards index into index.json).
 * A downloaded snapshot is read through messages; otherwise the bundled
 * artifacts are fetch-read via runtime.getURL ("data/meta.json"). Failing to
 * reach the runtime or a resource degrades to DataUnavailable — the page
 * stays native.
 */
export function createBrowserDataLayer(): DataLayer {
  let snapshot: Promise<Meta | null> | null = null;
  return createDataLayer({
    loadJson: async (path: string): Promise<unknown> => {
      const runtime = detectRuntime();
      if (runtime === null) throw new DataUnavailable(path);
      snapshot ??= resolveSnapshot(runtime);
      const meta = await snapshot;
      return meta === null
        ? loadBundled(runtime, path)
        : loadCached(runtime, meta, path);
    },
  });
}
