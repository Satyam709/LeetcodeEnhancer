import {
  DataUnavailable,
  createDataLayer,
  type DataLayer,
} from "./loader";

interface ExtensionRuntime {
  getURL(path: string): string;
}

/**
 * Find the extension runtime namespace (Chrome's `chrome`, Firefox's `browser`)
 * without assuming either exists. Returns null outside extension contexts.
 */
function detectRuntime(): ExtensionRuntime | null {
  const globals = globalThis as Record<string, unknown>;
  for (const name of ["chrome", "browser"]) {
    const ns = globals[name] as
      | { runtime?: { getURL?: unknown } }
      | undefined;
    const getURL = ns?.runtime?.getURL;
    if (ns?.runtime !== undefined && typeof getURL === "function") {
      return { getURL: (getURL as (p: string) => string).bind(ns.runtime) };
    }
  }
  return null;
}

/**
 * The production data layer: fetch-reads the bundled artifacts relative to the
 * extension root (paths look like "data/meta.json"). Failing to reach the
 * runtime or a resource degrades to DataUnavailable — the page stays native.
 */
export function createBrowserDataLayer(): DataLayer {
  return createDataLayer({
    loadJson: async (path: string): Promise<unknown> => {
      const runtime = detectRuntime();
      if (runtime === null) throw new DataUnavailable(path);

      let response: Response;
      try {
        response = await fetch(runtime.getURL(path));
      } catch {
        throw new DataUnavailable(path);
      }
      if (!response.ok) throw new DataUnavailable(path);
      return response.json();
    },
  });
}
