import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildArtifacts,
  problemShardName,
  writeArtifacts,
} from "../../../tools/sync-data/build-artifacts";
import { sha256 } from "../../../tools/sync-data/hash";
import type {
  CompanyData,
  CompanyWindows,
  SourceInfo,
} from "../../../tools/sync-data/schema";
import type { ProblemRow } from "../../../tools/sync-data/transform";

const SOURCE: SourceInfo = {
  repo: "liquidslr/leetcode-company-wise-problems",
  commitSha: "abc123",
  commitDate: "2026-08-01",
};

const row = (slug: string, frequency: number): ProblemRow => ({
  slug,
  title: slug === "two-sum" ? "Two Sum" : "3Sum",
  difficulty: "Medium",
  acceptance: slug === "two-sum" ? 58 : 34,
  frequency,
  topics:
    slug === "two-sum" ? ["Array", "Hash Table"] : ["Array", "Two Pointers"],
});

const win = (partial: Partial<CompanyWindows>): CompanyWindows => ({
  d30: [],
  d3m: [],
  d6m: [],
  g6m: [],
  all: [],
  ...partial,
});

const fixture: CompanyData[] = [
  {
    slug: "beta",
    name: "Beta Inc",
    windows: win({ d3m: [row("two-sum", 70)], all: [row("two-sum", 90)] }),
  },
  {
    slug: "alpha",
    name: "Alpha Corp",
    windows: win({
      d30: [row("two-sum", 55), row("two-sum", 80), row("three-sum", 80)],
    }),
  },
  {
    slug: "gamma",
    name: "Gamma LLC",
    windows: win({ all: [row("three-sum", 100)] }),
  },
];

const build = () =>
  buildArtifacts(fixture, { source: SOURCE, enriched: false, rejectedRows: 7 });

describe("problemShardName", () => {
  it.each([
    ["two-sum", "tw.json"],
    ["x", "x_.json"],
    ["3sum", "3s.json"],
    ["a-b", "a_.json"],
  ])("%s -> %s", (slug, name) => {
    expect(problemShardName(slug)).toBe(name);
  });
});

describe("buildArtifacts", () => {
  it("sorts companies by name and counts each window", () => {
    const { index } = build();
    expect(index.companies).toEqual([
      { slug: "alpha", name: "Alpha Corp", counts: [2, 0, 0, 0, 0] },
      { slug: "beta", name: "Beta Inc", counts: [0, 1, 0, 0, 1] },
      { slug: "gamma", name: "Gamma LLC", counts: [0, 0, 0, 0, 1] },
    ]);
  });

  it("dedupes to max frequency and sorts desc with slug tiebreak", () => {
    const { companyShards } = build();
    expect(companyShards.get("alpha")?.d30).toEqual([
      ["three-sum", 80],
      ["two-sum", 80],
    ]);
  });

  it("keeps empty windows as empty arrays with all five keys", () => {
    const shard = build().companyShards.get("beta");
    expect(Object.keys(shard ?? {}).sort()).toEqual([
      "all",
      "d30",
      "d3m",
      "d6m",
      "g6m",
    ]);
    expect(shard?.d30).toEqual([]);
  });

  it("interns topics so equal strings share an index", () => {
    const { topics, index } = build();
    expect(topics).toEqual(["Array", "Hash Table", "Two Pointers"]);
    expect(index.problems["two-sum"].topics).toEqual([0, 1]);
    expect(index.problems["three-sum"].topics).toEqual([0, 2]);
  });

  it("keeps problem metadata, with id null when not enriched", () => {
    const { index } = build();
    expect(index.problems["two-sum"]).toMatchObject({
      id: null,
      title: "Two Sum",
      difficulty: "Medium",
      acceptance: 58,
    });
  });

  it("groups problem shards with window masks per company", () => {
    const { problemShards } = build();
    expect(problemShards.get("tw.json")).toEqual({
      "two-sum": [
        [0, 1],
        [1, 18],
      ],
    });
    expect(problemShards.get("th.json")).toEqual({
      "three-sum": [
        [0, 1],
        [2, 16],
      ],
    });
  });

  it("scores frequency per problem", () => {
    const { index } = build();
    expect(index.problems["two-sum"].freqScore).toBe(100);
    expect(index.problems["three-sum"].freqScore).toBe(74);
  });

  it("records exact counts and provenance in meta", () => {
    const { meta } = build();
    expect(meta.schemaVersion).toBe(1);
    expect(meta.source).toEqual(SOURCE);
    expect(meta.enriched).toBe(false);
    expect(meta.counts).toEqual({
      companies: 3,
      problems: 2,
      entries: 4,
      rejectedRows: 7,
    });
    expect(Number.isNaN(Date.parse(meta.generatedAt))).toBe(false);
  });
});

describe("writeArtifacts", () => {
  it("writes every file atomically, hashing all but meta.json", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lce-artifacts-"));
    const target = path.join(dir, "data");
    // Pre-existing content must be replaced, not merged.
    await mkdir(path.join(target, "companies"), { recursive: true });
    await writeFile(path.join(target, "stale.json"), "{}");

    await writeArtifacts(target, build());

    const meta = JSON.parse(
      await readFile(path.join(target, "meta.json"), "utf8")
    );
    const rels = Object.keys(meta.files).sort();
    expect(rels).toEqual(
      [
        "companies/alpha.json",
        "companies/beta.json",
        "companies/gamma.json",
        "index.json",
        "problems/th.json",
        "problems/tw.json",
        "topics.json",
      ].sort()
    );
    for (const rel of rels) {
      const text = await readFile(path.join(target, rel), "utf8");
      expect(meta.files[rel]).toEqual({
        sha256: sha256(text),
        bytes: Buffer.byteLength(text),
      });
    }
    expect(meta.files["meta.json"]).toBeUndefined();

    const alpha = JSON.parse(
      await readFile(path.join(target, "companies/alpha.json"), "utf8")
    );
    expect(alpha.d30).toEqual([
      ["three-sum", 80],
      ["two-sum", 80],
    ]);

    await expect(readFile(path.join(target, "stale.json"), "utf8")).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });
});
