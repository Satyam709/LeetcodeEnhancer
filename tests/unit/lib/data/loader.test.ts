import { describe, expect, it } from "vitest";
import {
  DataUnavailable,
  createDataLayer,
} from "../../../../src/lib/data/loader";

const META = {
  schemaVersion: 1,
  source: {
    repo: "liquidslr/leetcode-company-wise-problems",
    commitSha: "abc123",
    commitDate: "2026-08-16",
  },
  generatedAt: "2026-10-18T00:00:00.000Z",
  enriched: false,
  counts: { companies: 2, problems: 2, entries: 3, rejectedRows: 0 },
  files: {},
};

const INDEX = {
  companies: [{ slug: "google", name: "Google", counts: [1, 0, 1, 0, 0] }],
  problems: {
    "two-sum": {
      id: 1,
      title: "Two Sum",
      difficulty: "Easy",
      acceptance: 5321,
      topics: [12],
      freqScore: 87,
    },
  },
};

const GOOGLE = {
  d30: [["two-sum", 87]],
  d3m: [],
  d6m: [],
  g6m: [],
  all: [["two-sum", 87]],
};

const TWO_SUM_SHARD = {
  "two-sum": [
    [0, 18],
    [1, 1],
  ],
};

const FILES = {
  "data/meta.json": META,
  "data/index.json": INDEX,
  "data/companies/google.json": GOOGLE,
  "data/problems/tw.json": TWO_SUM_SHARD,
};

function fixtureLoader(files: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    loadJson: async (path: string): Promise<unknown> => {
      calls.push(path);
      if (Object.prototype.hasOwnProperty.call(files, path)) return files[path];
      throw new DataUnavailable(path);
    },
  };
}

describe("createDataLayer", () => {
  it("memoizes index() and company(); the meta gate loads once", async () => {
    const loader = fixtureLoader(FILES);
    const layer = createDataLayer({ loadJson: loader.loadJson });

    await layer.index();
    await layer.index();
    await layer.company("google");
    await layer.company("google");

    expect(loader.calls.filter((p) => p === "data/index.json")).toHaveLength(1);
    expect(
      loader.calls.filter((p) => p === "data/companies/google.json")
    ).toHaveLength(1);
    expect(loader.calls.filter((p) => p === "data/meta.json")).toHaveLength(1);
  });

  it("rejects with DataUnavailable when schemaVersion is not 1 — from every accessor", async () => {
    const loader = fixtureLoader({
      ...FILES,
      "data/meta.json": { ...META, schemaVersion: 2 },
    });
    const layer = createDataLayer({ loadJson: loader.loadJson });

    await expect(layer.meta()).rejects.toBeInstanceOf(DataUnavailable);
    await expect(layer.index()).rejects.toBeInstanceOf(DataUnavailable);
    await expect(layer.company("google")).rejects.toBeInstanceOf(
      DataUnavailable
    );
    await expect(layer.companiesForProblem("two-sum")).rejects.toBeInstanceOf(
      DataUnavailable
    );
    await expect(layer.derivedFrequency("two-sum")).rejects.toBeInstanceOf(
      DataUnavailable
    );
  });

  it("rejects with DataUnavailable when meta.json has an invalid shape", async () => {
    const loader = fixtureLoader({
      ...FILES,
      "data/meta.json": { schemaVersion: 1 },
    });
    const layer = createDataLayer({ loadJson: loader.loadJson });

    await expect(layer.meta()).rejects.toBeInstanceOf(DataUnavailable);
  });

  it("returns null for a missing company shard (memoized) and [] for a missing problem shard", async () => {
    const loader = fixtureLoader(FILES);
    const layer = createDataLayer({ loadJson: loader.loadJson });

    await expect(layer.company("nope")).resolves.toBeNull();
    await expect(layer.company("nope")).resolves.toBeNull();
    expect(
      loader.calls.filter((p) => p === "data/companies/nope.json")
    ).toHaveLength(1);

    await expect(layer.companiesForProblem("zzz")).resolves.toEqual([]);
  });

  it("decodes the window mask into canonical window keys (memoized per shard)", async () => {
    const loader = fixtureLoader(FILES);
    const layer = createDataLayer({ loadJson: loader.loadJson });

    const expected = [
      { companyIdx: 0, windows: ["d3m", "all"] }, // 18 = d3m(2) + all(16)
      { companyIdx: 1, windows: ["d30"] }, // 1 = d30
    ];
    await expect(layer.companiesForProblem("two-sum")).resolves.toEqual(
      expected
    );
    await expect(layer.companiesForProblem("two-sum")).resolves.toEqual(
      expected
    );

    expect(
      loader.calls.filter((p) => p === "data/problems/tw.json")
    ).toHaveLength(1);
  });

  it("derivedFrequency returns the index freqScore or undefined", async () => {
    const loader = fixtureLoader(FILES);
    const layer = createDataLayer({ loadJson: loader.loadJson });

    await expect(layer.derivedFrequency("two-sum")).resolves.toBe(87);
    await expect(layer.derivedFrequency("unknown")).resolves.toBeUndefined();
  });

  it("loads topic names (memoized) and treats a malformed file as unavailable", async () => {
    const loader = fixtureLoader({
      ...FILES,
      "data/topics.json": ["Array", "Hash Table"],
    });
    const layer = createDataLayer({ loadJson: loader.loadJson });
    await expect(layer.topics()).resolves.toEqual(["Array", "Hash Table"]);
    await layer.topics();
    expect(loader.calls.filter((c) => c === "data/topics.json")).toHaveLength(
      1
    );

    const broken = createDataLayer({
      loadJson: fixtureLoader({ ...FILES, "data/topics.json": { nope: 1 } })
        .loadJson,
    });
    await expect(broken.topics()).rejects.toBeInstanceOf(DataUnavailable);
  });
});
