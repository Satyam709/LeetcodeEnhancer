import { describe, expect, it } from "vitest";
import { transformRow } from "../../../tools/sync-data/transform";
import { WINDOW_FILES } from "../../../tools/sync-data/windows";

describe("WINDOW_FILES", () => {
  it("maps the five source files in recency order", () => {
    expect(WINDOW_FILES).toEqual([
      { file: "1. Thirty Days.csv", key: "d30" },
      { file: "2. Three Months.csv", key: "d3m" },
      { file: "3. Six Months.csv", key: "d6m" },
      { file: "4. More Than Six Months.csv", key: "g6m" },
      { file: "5. All.csv", key: "all" },
    ]);
  });
});

describe("transformRow", () => {
  it("transforms a valid row", () => {
    const r = transformRow([
      "MEDIUM",
      "Two Sum",
      "100.0",
      "0.005800918768980581",
      "https://leetcode.com/problems/two-sum",
      "Array, Hash Table",
    ]);
    expect(r).toEqual({
      ok: true,
      value: {
        slug: "two-sum",
        title: "Two Sum",
        difficulty: "Medium",
        acceptance: 58.0,
        frequency: 100,
        topics: ["Array", "Hash Table"],
      },
    });
  });

  it("normalizes difficulty casing", () => {
    const r = transformRow(["hard", "X", "1", "0.5", "https://leetcode.com/problems/x", ""]);
    expect(r.ok && r.value.difficulty).toBe("Hard");
  });

  it("accepts links with trailing slash, query, or extra path", () => {
    for (const link of [
      "https://leetcode.com/problems/two-sum/",
      "https://leetcode.com/problems/two-sum/?envType=company",
      "https://leetcode.com/problems/two-sum/description/",
    ]) {
      const r = transformRow(["EASY", "Two Sum", "1", "0.5", link, ""]);
      expect(r.ok && r.value.slug).toBe("two-sum");
    }
  });

  it("rounds acceptance to one decimal and clamps to 0..100", () => {
    const rows: [string, number][] = [
      ["0.00345678", 34.6],
      ["2", 100],
    ];
    for (const [raw, expected] of rows) {
      const r = transformRow(["EASY", "X", "1", raw, "https://leetcode.com/problems/x", ""]);
      expect(r.ok && r.value.acceptance).toBe(expected);
    }
  });

  it("clamps frequency to 0..100", () => {
    const r = transformRow(["EASY", "X", "150", "0.5", "https://leetcode.com/problems/x", ""]);
    expect(r.ok && r.value.frequency).toBe(100);
  });

  it("splits topics, trims, and drops empties", () => {
    const r = transformRow([
      "EASY", "X", "1", "0.5", "https://leetcode.com/problems/x", "Array, , Two Pointers ",
    ]);
    expect(r.ok && r.value.topics).toEqual(["Array", "Two Pointers"]);
  });

  it.each([
    [["EASY", "X", "1", "0.5", "not-a-url", ""], "bad link"],
    [["EXPERT", "X", "1", "0.5", "https://leetcode.com/problems/x", ""], "bad difficulty"],
    [["EASY", "X"], "short row"],
    [["EASY", "X", "abc", "0.5", "https://leetcode.com/problems/x", ""], "bad frequency"],
    [["EASY", "X", "1", "abc", "https://leetcode.com/problems/x", ""], "bad acceptance"],
  ])("rejects %j", (row, reason) => {
    const r = transformRow(row as string[]);
    expect(r).toEqual({ ok: false, reason });
  });
});
