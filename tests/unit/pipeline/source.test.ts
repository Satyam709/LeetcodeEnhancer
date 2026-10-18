import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverCompanies, fetchSource } from "../../../tools/sync-data/source";

const FIXTURE = path.resolve(process.cwd(), "tests/fixtures/mini-source");

describe("discoverCompanies", () => {
  it("finds only folders that contain all five window files", async () => {
    expect(await discoverCompanies(FIXTURE)).toEqual(["Bar Inc", "Foo Corp"]);
  });
});

describe("fetchSource", () => {
  it("passes a local path through with fallback metadata", async () => {
    const result = await fetchSource({ localPath: FIXTURE });
    expect(result.dir).toBe(FIXTURE);
    expect(result.commitSha).toBe("unknown");
    expect(result.commitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
