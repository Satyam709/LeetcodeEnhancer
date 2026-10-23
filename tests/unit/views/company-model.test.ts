import { describe, expect, it } from "vitest";
import type { CompanyShard, Index } from "../../../src/lib/data/types";
import {
  WINDOW_TABS,
  buildRows,
  formatAcceptance,
  formatCount,
  formatUpdated,
} from "../../../src/views/company-page/model";

const index: Index = {
  companies: [{ slug: "google", name: "Google", counts: [2, 2, 2, 2, 3] }],
  problems: {
    "two-sum": {
      id: 1,
      title: "Two Sum",
      difficulty: "Easy",
      acceptance: 58,
      topics: [],
      freqScore: 100,
    },
    "add-two-numbers": {
      id: 2,
      title: "Add Two Numbers",
      difficulty: "Medium",
      acceptance: 49.5,
      topics: [],
      freqScore: 90,
    },
    "median-of-two-sorted-arrays": {
      id: 4,
      title: "Median of Two Sorted Arrays",
      difficulty: "Hard",
      acceptance: 47.8,
      topics: [],
      freqScore: 40,
    },
  },
};

const shard: CompanyShard = {
  d30: [
    ["two-sum", 100],
    ["add-two-numbers", 72.8],
  ],
  d3m: [],
  d6m: [],
  g6m: [],
  all: [
    ["two-sum", 100],
    ["add-two-numbers", 78.6],
    ["median-of-two-sorted-arrays", 12.5],
  ],
};

const query = (
  overrides: Partial<Parameters<typeof buildRows>[2]> = {}
): Parameters<typeof buildRows>[2] => ({
  window: "d30",
  search: "",
  difficulty: "all",
  sort: "frequency",
  ...overrides,
});

describe("buildRows", () => {
  it("slices the requested window and keeps its frequency values", () => {
    const rows = buildRows(shard, index, query());
    expect(rows.map((row) => row.slug)).toEqual(["two-sum", "add-two-numbers"]);
    expect(rows[1]!.frequency).toBe(72.8);
    expect(rows[0]!.position).toBe(1);
  });

  it("skips shard slugs missing from the problem index", () => {
    const rows = buildRows(
      { ...shard, d30: [["ghost", 10], ["two-sum", 100]] },
      index,
      query()
    );
    expect(rows.map((row) => row.slug)).toEqual(["two-sum"]);
  });

  it("searches titles and slugs case-insensitively", () => {
    expect(
      buildRows(shard, index, query({ window: "all", search: "MEDIAN" })).map(
        (row) => row.slug
      )
    ).toEqual(["median-of-two-sorted-arrays"]);
    expect(
      buildRows(shard, index, query({ window: "all", search: "add-two" })).map(
        (row) => row.slug
      )
    ).toEqual(["add-two-numbers"]);
  });

  it("filters by difficulty", () => {
    const rows = buildRows(
      shard,
      index,
      query({ window: "all", difficulty: "Hard" })
    );
    expect(rows.map((row) => row.slug)).toEqual([
      "median-of-two-sorted-arrays",
    ]);
  });

  it("sorts by frequency by default, then title, then acceptance", () => {
    expect(
      buildRows(shard, index, query({ window: "all" })).map((row) => row.slug)
    ).toEqual([
      "two-sum",
      "add-two-numbers",
      "median-of-two-sorted-arrays",
    ]);

    expect(
      buildRows(shard, index, query({ window: "all", sort: "title" })).map(
        (row) => row.slug
      )
    ).toEqual([
      "add-two-numbers",
      "median-of-two-sorted-arrays",
      "two-sum",
    ]);

    expect(
      buildRows(shard, index, query({ window: "all", sort: "acceptance" })).map(
        (row) => row.slug
      )
    ).toEqual([
      "two-sum",
      "add-two-numbers",
      "median-of-two-sorted-arrays",
    ]);
  });

  it("renumbers positions after filtering and sorting", () => {
    const rows = buildRows(
      shard,
      index,
      query({ window: "all", sort: "title" })
    );
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });
});

describe("formatters", () => {
  it("formats acceptance with one decimal and a percent sign", () => {
    expect(formatAcceptance(58)).toBe("58.0%");
    expect(formatAcceptance(44.7)).toBe("44.7%");
  });

  it("formats counts with thousands separators", () => {
    expect(formatCount(2344)).toBe("2,344");
    expect(formatCount(7)).toBe("7");
  });

  it("formats the source date, falling back to the raw value", () => {
    expect(formatUpdated("2026-08-16")).toBe("Aug 16, 2026");
    expect(formatUpdated("not-a-date")).toBe("not-a-date");
  });
});

describe("WINDOW_TABS", () => {
  it("pins the five native window labels in order", () => {
    expect(WINDOW_TABS).toEqual([
      { key: "d30", label: "30 days" },
      { key: "d3m", label: "3 months" },
      { key: "d6m", label: "6 months" },
      { key: "g6m", label: "More than 6 months" },
      { key: "all", label: "All" },
    ]);
  });
});
