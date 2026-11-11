import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserDataLayer } from "../../../../src/lib/data/browser";
import { DataUnavailable } from "../../../../src/lib/data/loader";

const META = {
  schemaVersion: 1,
  source: { repo: "r", commitSha: "abc123", commitDate: "2026-08-16" },
  generatedAt: "2026-10-18T00:00:00.000Z",
  enriched: false,
  counts: { companies: 2, problems: 2, entries: 3, rejectedRows: 0 },
  files: {},
};

const GOOGLE = {
  d30: [["two-sum", 87]],
  d3m: [],
  d6m: [],
  g6m: [],
  all: [["two-sum", 87]],
};

const jsonResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response;
const notFound = { ok: false, json: async () => ({}) } as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserDataLayer", () => {
  it("degrades to DataUnavailable when no extension runtime is present (never throws at creation)", async () => {
    const layer = createBrowserDataLayer();
    await expect(layer.meta()).rejects.toBeInstanceOf(DataUnavailable);
    await expect(layer.company("google")).rejects.toBeInstanceOf(
      DataUnavailable
    );
  });

  it("loads through chrome.runtime.getURL + fetch", async () => {
    const getURL = vi.fn((p: string) => `chrome-extension://abc/${p}`);
    vi.stubGlobal("chrome", { runtime: { getURL } });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("data/meta.json")) return jsonResponse(META);
      if (url.endsWith("data/companies/google.json"))
        return jsonResponse(GOOGLE);
      return notFound;
    });
    vi.stubGlobal("fetch", fetchMock);

    const layer = createBrowserDataLayer();
    await expect(layer.company("google")).resolves.toEqual(GOOGLE);

    expect(getURL).toHaveBeenCalledWith("data/meta.json");
    expect(getURL).toHaveBeenCalledWith("data/companies/google.json");
    expect(fetchMock).toHaveBeenCalledWith(
      "chrome-extension://abc/data/meta.json"
    );
  });

  it("supports the Firefox browser namespace and maps 404s to a missing shard (null)", async () => {
    const getURL = vi.fn((p: string) => `moz-extension://abc/${p}`);
    vi.stubGlobal("browser", { runtime: { getURL } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("data/meta.json") ? jsonResponse(META) : notFound
      )
    );

    const layer = createBrowserDataLayer();
    await expect(layer.meta()).resolves.toMatchObject({ schemaVersion: 1 });
    await expect(layer.company("nope")).resolves.toBeNull();
    expect(getURL).toHaveBeenCalledWith("data/companies/nope.json");
  });
  it("reads a downloaded snapshot through background messages when it is active", async () => {
    const cached = {
      ...META,
      generatedAt: "2026-11-08T00:00:00.000Z",
      files: { "companies/google.json": { sha256: "f".repeat(64), bytes: 10 } },
    };
    const sendMessage = vi.fn(async (msg: { type: string }) => {
      if (msg.type === "lce:data:meta")
        return { origin: "cache", meta: cached };
      if (msg.type === "lce:data:file") {
        return { ok: true, text: JSON.stringify(GOOGLE) };
      }
      return null;
    });
    const getURL = vi.fn((p: string) => `chrome-extension://abc/${p}`);
    vi.stubGlobal("chrome", { runtime: { getURL, sendMessage } });
    const fetchMock = vi.fn(async () => notFound);
    vi.stubGlobal("fetch", fetchMock);

    const layer = createBrowserDataLayer();
    await expect(layer.meta()).resolves.toEqual(cached);
    await expect(layer.company("google")).resolves.toEqual(GOOGLE);
    // Not in the snapshot's file list: missing shard, no message sent.
    await expect(layer.company("nope")).resolves.toBeNull();

    expect(sendMessage).toHaveBeenCalledWith({
      type: "lce:data:file",
      path: "companies/google.json",
      sha256: "f".repeat(64),
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pins the snapshot for the layer's lifetime", async () => {
    const sendMessage = vi.fn(async () => ({ origin: "bundle" }));
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (p: string) => `chrome-extension://abc/${p}`,
        sendMessage,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("data/meta.json")
          ? jsonResponse(META)
          : url.endsWith("google.json")
            ? jsonResponse(GOOGLE)
            : notFound
      )
    );

    const layer = createBrowserDataLayer();
    await layer.company("google");
    await layer.company("other");
    await layer.topics().catch(() => {});
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("falls back to the bundle when the background worker cannot be reached", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("Receiving end does not exist.");
    });
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (p: string) => `chrome-extension://abc/${p}`,
        sendMessage,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("data/meta.json") ? jsonResponse(META) : notFound
      )
    );

    const layer = createBrowserDataLayer();
    await expect(layer.meta()).resolves.toEqual(META);
  });
});
