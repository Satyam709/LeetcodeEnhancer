import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { checkSlugs, slugVariants } from "../../../tools/sync-data/check-slugs";

const response = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

describe("checkSlugs", () => {
  it("classifies ok, not-found, and unknown without throwing", async () => {
    const fake = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/amazon/")) return response(200);
      if (url.includes("/ghost/")) return response(404);
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const results = await checkSlugs(["amazon", "ghost", "flaky"], fake);
    expect(results).toEqual([
      { slug: "amazon", status: "ok" },
      { slug: "ghost", status: "not-found" },
      { slug: "flaky", status: "unknown" },
    ]);
  });

  it("treats blocked responses (403) as unknown, not not-found", async () => {
    const fake = vi.fn(async () => response(403)) as unknown as typeof fetch;
    expect(await checkSlugs(["amazon"], fake)).toEqual([
      { slug: "amazon", status: "unknown" },
    ]);
  });

  it("treats 410 as not-found", async () => {
    const fake = vi.fn(async () => response(410)) as unknown as typeof fetch;
    expect(await checkSlugs(["gone"], fake)).toEqual([
      { slug: "gone", status: "not-found" },
    ]);
  });
});

describe("slugVariants", () => {
  it("suggests hyphen-free and first-word variants", () => {
    expect(slugVariants("j-p-morgan")).toEqual(["jpmorgan"]);
    expect(slugVariants("apollo-io")).toEqual(["apolloio", "apollo"]);
  });

  it("omits the input and duplicates", () => {
    expect(slugVariants("amazon")).toEqual([]);
  });
});

describe("company-aliases.json", () => {
  it("holds well-formed slugs, including the verified non-obvious mappings", async () => {
    const aliases = JSON.parse(
      await readFile("tools/sync-data/company-aliases.json", "utf8")
    ) as Record<string, string>;

    for (const [name, slug] of Object.entries(aliases)) {
      expect(slug, `alias for ${name}`).toMatch(/^[a-z0-9-]+$/);
    }
    expect(aliases["J.P. Morgan"]).toBe("jpmorgan");
    expect(aliases["X"]).toBe("twitter");
    expect(aliases["Apollo.io"]).toBe("apolloio");
  });
});
