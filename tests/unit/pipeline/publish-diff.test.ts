import { describe, expect, it } from "vitest";
import { artifactsChanged } from "../../../tools/sync-data/publish-diff";
import type { Meta } from "../../../tools/sync-data/schema";

function meta(files: Record<string, string>, extra: Partial<Meta> = {}): Meta {
  return {
    schemaVersion: 1,
    source: { repo: "r", commitSha: "abc", commitDate: "2026-11-01" },
    generatedAt: "2026-11-01T00:00:00.000Z",
    enriched: false,
    counts: { companies: 1, problems: 1, entries: 1, rejectedRows: 0 },
    files: Object.fromEntries(
      Object.entries(files).map(([f, sha256]) => [f, { sha256, bytes: 1 }])
    ),
    ...extra,
  };
}

describe("artifactsChanged", () => {
  const base = meta({ "index.json": "a", "companies/x.json": "b" });

  it("is true when nothing was published yet", () => {
    expect(artifactsChanged(null, base)).toBe(true);
  });

  it("ignores generatedAt when the files are identical", () => {
    const rerun = meta(
      { "index.json": "a", "companies/x.json": "b" },
      { generatedAt: "2026-11-08T00:00:00.000Z" }
    );
    expect(artifactsChanged(base, rerun)).toBe(false);
  });

  it("detects a changed sha", () => {
    expect(
      artifactsChanged(
        base,
        meta({ "index.json": "a", "companies/x.json": "c" })
      )
    ).toBe(true);
  });

  it("detects added and removed files", () => {
    expect(
      artifactsChanged(
        base,
        meta({
          "index.json": "a",
          "companies/x.json": "b",
          "companies/y.json": "d",
        })
      )
    ).toBe(true);
    expect(artifactsChanged(base, meta({ "index.json": "a" }))).toBe(true);
    expect(
      artifactsChanged(
        base,
        meta({ "index.json": "a", "companies/z.json": "b" })
      )
    ).toBe(true);
  });

  it("detects a schema bump", () => {
    const bumped = {
      ...base,
      schemaVersion: 2,
    } as unknown as Meta;
    expect(artifactsChanged(base, bumped)).toBe(true);
  });
});
