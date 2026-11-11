// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  effectiveSnapshot,
  resolveJsDelivrBase,
  type UpdaterDeps,
} from "../../../src/background/updater";
import {
  EMPTY_STATE,
  type SnapshotStore,
  type StoreState,
} from "../../../src/background/store";
import type { Meta } from "../../../src/lib/data/types";

const BASE = "https://cdn.test/v1";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function meta(files: Record<string, string>, generatedAt: string): Meta {
  return {
    schemaVersion: 1,
    source: { repo: "r", commitSha: "abc", commitDate: "2026-11-01" },
    generatedAt,
    enriched: false,
    counts: { companies: 1, problems: 1, entries: 1, rejectedRows: 0 },
    files: Object.fromEntries(
      Object.entries(files).map(([f, text]) => [
        f,
        { sha256: sha(text), bytes: text.length },
      ])
    ),
  };
}

function fakeStore(initial: Partial<StoreState> = {}) {
  let state: StoreState = { ...EMPTY_STATE, ...initial };
  const blobs = new Map<string, string>();
  const store: SnapshotStore = {
    getState: async () => state,
    setState: async (next) => {
      state = next;
    },
    hasBlob: async (s) => blobs.has(s),
    getBlob: async (s) => blobs.get(s),
    putBlob: async (s, text) => {
      blobs.set(s, text);
    },
    retainBlobs: async (keep) => {
      for (const key of [...blobs.keys()])
        if (!keep.has(key)) blobs.delete(key);
    },
  };
  return { store, blobs, state: () => state };
}

/** Serves `${BASE}/<path>` from a map; records every requested path. */
function fakeFetch(files: Record<string, string>) {
  const requested: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = url.slice(BASE.length + 1);
    requested.push(path);
    const body = files[path];
    if (body === undefined) return new Response("", { status: 404 });
    return new Response(body, { status: 200 });
  });
  return { fetch: impl as unknown as typeof fetch, requested };
}

const BUNDLE_FILES = {
  "index.json": '{"v":"old"}',
  "companies/a.json": '{"a":1}',
};
const BUNDLED = meta(BUNDLE_FILES, "2026-11-01T00:00:00.000Z");

const NEW_FILES = {
  "index.json": '{"v":"new"}',
  "companies/a.json": '{"a":1}',
  "companies/b.json": '{"b":2}',
};
const REMOTE = meta(NEW_FILES, "2026-11-08T00:00:00.000Z");

function deps(
  store: SnapshotStore,
  fetchImpl: typeof fetch,
  bundled: Meta | null = BUNDLED
): UpdaterDeps {
  return {
    fetch: fetchImpl,
    store,
    bundledMeta: async () => bundled,
    sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    resolveBase: async () => BASE,
    now: () => new Date("2026-11-11T00:00:00.000Z"),
  };
}

describe("checkForUpdate", () => {
  it("downloads only files that are neither bundled nor cached, then activates", async () => {
    const { store, blobs, state } = fakeStore();
    const net = fakeFetch({
      "meta.json": JSON.stringify(REMOTE),
      ...NEW_FILES,
    });

    const status = await checkForUpdate(deps(store, net.fetch));

    expect(status).toEqual({
      outcome: "updated",
      lastCheck: "2026-11-11T00:00:00.000Z",
      lastError: null,
    });
    expect(net.requested.sort()).toEqual([
      "companies/b.json",
      "index.json",
      "meta.json",
    ]);
    expect(state().active).toEqual(REMOTE);
    expect(blobs.get(sha(NEW_FILES["index.json"]))).toBe(
      NEW_FILES["index.json"]
    );
    expect(blobs.has(sha(NEW_FILES["companies/a.json"]))).toBe(false);
  });

  it("is a no-op when the remote snapshot is not newer", async () => {
    const { store, state } = fakeStore();
    const net = fakeFetch({ "meta.json": JSON.stringify(BUNDLED) });

    const status = await checkForUpdate(deps(store, net.fetch));

    expect(status.outcome).toBe("current");
    expect(net.requested).toEqual(["meta.json"]);
    expect(state().active).toBeNull();
    expect(state().lastCheck).toBe("2026-11-11T00:00:00.000Z");
  });

  it("keeps the current snapshot when a file fails its sha256 check", async () => {
    const { store, state } = fakeStore();
    const net = fakeFetch({
      "meta.json": JSON.stringify(REMOTE),
      ...NEW_FILES,
      "companies/b.json": '{"b":"tampered"}',
    });

    const status = await checkForUpdate(deps(store, net.fetch));

    expect(status.outcome).toBe("failed");
    expect(status.lastError).toMatch(/companies\/b\.json: sha256 mismatch/);
    expect(state().active).toBeNull();
  });

  it("ignores a remote snapshot in a schema this build does not understand", async () => {
    const { store, state } = fakeStore();
    const net = fakeFetch({
      "meta.json": JSON.stringify({ ...REMOTE, schemaVersion: 2 }),
    });

    const status = await checkForUpdate(deps(store, net.fetch));

    expect(status.outcome).toBe("current");
    expect(state().active).toBeNull();
  });

  it("rejects unsafe paths in the remote meta", async () => {
    const { store } = fakeStore();
    const evil = {
      ...REMOTE,
      files: { "../x.json": { sha256: "0".repeat(64), bytes: 1 } },
    };
    const net = fakeFetch({ "meta.json": JSON.stringify(evil) });

    const status = await checkForUpdate(deps(store, net.fetch));

    expect(status.outcome).toBe("failed");
    expect(net.requested).toEqual(["meta.json"]);
  });

  it("records network failures without throwing", async () => {
    const { store, state } = fakeStore();
    const failing = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;

    const status = await checkForUpdate(deps(store, failing));

    expect(status).toMatchObject({ outcome: "failed", lastError: "offline" });
    expect(state().lastError).toBe("offline");
  });

  it("garbage-collects blobs older than the previous generation", async () => {
    const { store, blobs, state } = fakeStore();
    await checkForUpdate(
      deps(
        store,
        fakeFetch({ "meta.json": JSON.stringify(REMOTE), ...NEW_FILES }).fetch
      )
    );

    const third = {
      "index.json": '{"v":"third"}',
      "companies/a.json": '{"a":1}',
      "companies/b.json": '{"b":3}',
    };
    const thirdMeta = meta(third, "2026-11-15T00:00:00.000Z");
    await checkForUpdate(
      deps(
        store,
        fakeFetch({ "meta.json": JSON.stringify(thirdMeta), ...third }).fetch
      )
    );
    expect(state().active).toEqual(thirdMeta);
    expect(state().previous).toEqual(REMOTE);
    // The previous generation survives for pages still reading it.
    expect(blobs.has(sha(NEW_FILES["index.json"]))).toBe(true);

    const fourth = { ...third, "index.json": '{"v":"fourth"}' };
    const fourthMeta = meta(fourth, "2026-11-22T00:00:00.000Z");
    await checkForUpdate(
      deps(
        store,
        fakeFetch({ "meta.json": JSON.stringify(fourthMeta), ...fourth }).fetch
      )
    );
    expect(blobs.has(sha(NEW_FILES["index.json"]))).toBe(false);
    expect(blobs.has(sha(third["index.json"]))).toBe(true);
    expect(blobs.has(sha(fourth["index.json"]))).toBe(true);
  });
});

describe("effectiveSnapshot", () => {
  it("prefers the bundle once an extension update ships data at least as new", () => {
    expect(effectiveSnapshot(REMOTE, BUNDLED)).toEqual(REMOTE);
    expect(effectiveSnapshot(BUNDLED, REMOTE)).toBeNull();
    expect(effectiveSnapshot(null, BUNDLED)).toBeNull();
    expect(effectiveSnapshot(REMOTE, null)).toEqual(REMOTE);
  });
});

describe("resolveJsDelivrBase", () => {
  it("pins the CDN URL to the data branch head commit", async () => {
    const head = "a".repeat(40);
    const impl = vi.fn(async (_url: string) => Response.json({ sha: head }));
    await expect(
      resolveJsDelivrBase(impl as unknown as typeof fetch)
    ).resolves.toBe(
      `https://cdn.jsdelivr.net/gh/Satyam709/LeetcodeEnhancer@${head}/v1`
    );
    expect(String(impl.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/Satyam709/LeetcodeEnhancer/commits/data"
    );
  });

  it("fails when the branch lookup fails", async () => {
    const impl = vi.fn(async () => new Response("", { status: 403 }));
    await expect(
      resolveJsDelivrBase(impl as unknown as typeof fetch)
    ).rejects.toThrow(/HTTP 403/);
  });
});
