import { describe, expect, it } from "vitest";
import type { CompanyShard, Index } from "../../../src/lib/data/types";
import {
  WINDOW_TABS,
  buildRows,
  defaultDirection,
  facets,
  windowRows,
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
      topics: [0, 1],
      freqScore: 100,
    },
    "add-two-numbers": {
      id: 2,
      title: "Add Two Numbers",
      difficulty: "Medium",
      acceptance: 49.5,
      topics: [2],
      freqScore: 90,
    },
    "median-of-two-sorted-arrays": {
      id: 4,
      title: "Median of Two Sorted Arrays",
      difficulty: "Hard",
      acceptance: 47.8,
      topics: [0],
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
  difficulties: [],
  topics: [],
  sort: "frequency",
  direction: "descending",
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
      {
        ...shard,
        d30: [
          ["ghost", 10],
          ["two-sum", 100],
        ],
      },
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
      query({ window: "all", difficulties: ["Hard"] })
    );
    expect(rows.map((row) => row.slug)).toEqual([
      "median-of-two-sorted-arrays",
    ]);
  });

  it("sorts by frequency by default, then title, then acceptance, then difficulty", () => {
    expect(
      buildRows(shard, index, query({ window: "all" })).map((row) => row.slug)
    ).toEqual(["two-sum", "add-two-numbers", "median-of-two-sorted-arrays"]);

    expect(
      buildRows(
        shard,
        index,
        query({ window: "all", sort: "title", direction: "ascending" })
      ).map((row) => row.slug)
    ).toEqual(["add-two-numbers", "median-of-two-sorted-arrays", "two-sum"]);

    expect(
      buildRows(shard, index, query({ window: "all", sort: "acceptance" })).map(
        (row) => row.slug
      )
    ).toEqual(["two-sum", "add-two-numbers", "median-of-two-sorted-arrays"]);

    const swapped: Index = {
      ...index,
      problems: {
        ...index.problems,
        "two-sum": { ...index.problems["two-sum"]!, difficulty: "Hard" },
        "add-two-numbers": {
          ...index.problems["add-two-numbers"]!,
          difficulty: "Easy",
        },
      },
    };
    expect(
      buildRows(
        shard,
        swapped,
        query({ window: "all", sort: "difficulty", direction: "ascending" })
      ).map((row) => row.slug)
    ).toEqual(["add-two-numbers", "median-of-two-sorted-arrays", "two-sum"]);
  });

  it("filters by several difficulties at once", () => {
    const rows = buildRows(
      shard,
      index,
      query({ window: "all", difficulties: ["Easy", "Hard"] })
    );
    expect(rows.map((row) => row.slug)).toEqual([
      "two-sum",
      "median-of-two-sorted-arrays",
    ]);
  });

  it("filters by topics, matching any selected topic", () => {
    const pick = (topics: number[]) =>
      buildRows(shard, index, query({ window: "all", topics })).map(
        (row) => row.slug
      );
    expect(pick([0])).toEqual(["two-sum", "median-of-two-sorted-arrays"]);
    expect(pick([2])).toEqual(["add-two-numbers"]);
    expect(pick([1, 2])).toEqual(["two-sum", "add-two-numbers"]);
    expect(pick([99])).toEqual([]);
  });

  it("reverses every sort key, keeping title A→Z as the tie-break", () => {
    const order = (sort: "frequency" | "acceptance" | "title" | "difficulty") =>
      buildRows(
        shard,
        index,
        query({ window: "all", sort, direction: "ascending" })
      ).map((row) => row.slug);
    expect(order("frequency")).toEqual([
      "median-of-two-sorted-arrays",
      "add-two-numbers",
      "two-sum",
    ]);
    expect(order("acceptance")).toEqual([
      "median-of-two-sorted-arrays",
      "add-two-numbers",
      "two-sum",
    ]);
    expect(
      buildRows(
        shard,
        index,
        query({ window: "all", sort: "title", direction: "descending" })
      ).map((row) => row.slug)
    ).toEqual(["two-sum", "median-of-two-sorted-arrays", "add-two-numbers"]);

    const tied: CompanyShard = {
      ...shard,
      all: [
        ["two-sum", 50],
        ["add-two-numbers", 50],
      ],
    };
    for (const direction of ["ascending", "descending"] as const) {
      expect(
        buildRows(tied, index, query({ window: "all", direction })).map(
          (row) => row.slug
        )
      ).toEqual(["add-two-numbers", "two-sum"]);
    }
  });

  it("picks a natural first direction per column", () => {
    expect(defaultDirection("frequency")).toBe("descending");
    expect(defaultDirection("acceptance")).toBe("descending");
    expect(defaultDirection("title")).toBe("ascending");
    expect(defaultDirection("difficulty")).toBe("ascending");
  });

  it("renumbers positions after filtering and sorting", () => {
    const rows = buildRows(
      shard,
      index,
      query({ window: "all", sort: "title", direction: "ascending" })
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

describe("facets", () => {
  it("counts difficulties and topics over a window, most common topic first", () => {
    const counts = facets(windowRows(shard, index, "all"));
    expect(counts.difficulty).toEqual({ Easy: 1, Medium: 1, Hard: 1 });
    expect(counts.topics).toEqual([
      { id: 0, count: 2 },
      { id: 1, count: 1 },
      { id: 2, count: 1 },
    ]);
  });
});
