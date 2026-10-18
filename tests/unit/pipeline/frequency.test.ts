import { describe, expect, it } from "vitest";
import {
  mostRecentWindow,
  normalizeScores,
  rawScore,
  windowWeight,
} from "../../../tools/sync-data/frequency";

describe("windowWeight", () => {
  it("weights windows by recency", () => {
    expect(windowWeight("d30")).toBe(1.0);
    expect(windowWeight("d3m")).toBe(0.7);
    expect(windowWeight("d6m")).toBe(0.55);
    expect(windowWeight("g6m")).toBe(0.3);
    expect(windowWeight("all")).toBe(0.15);
  });
});

describe("mostRecentWindow", () => {
  it("picks the most recent window", () => {
    expect(mostRecentWindow(["all", "d6m", "d3m"])).toBe("d3m");
  });

  it("returns a single window unchanged", () => {
    expect(mostRecentWindow(["all"])).toBe("all");
  });

  it("throws on an empty list (caller must guard)", () => {
    expect(() => mostRecentWindow([])).toThrow();
  });
});

describe("rawScore", () => {
  it("computes a weighted raw score", () => {
    expect(
      rawScore([
        { window: "d30", frequency: 50 },
        { window: "all", frequency: 100 },
      ])
    ).toBeCloseTo(0.65);
  });

  it("scales a single window's frequency by its weight", () => {
    expect(rawScore([{ window: "g6m", frequency: 50 }])).toBeCloseTo(0.15);
  });

  it("is zero with no windows", () => {
    expect(rawScore([])).toBe(0);
  });
});

describe("normalizeScores", () => {
  it("normalizes against p99 and clamps", () => {
    const scores = normalizeScores([100, 1, 1, 1, 1]);
    expect(scores[0]).toBe(100);
    expect(scores[1]).toBe(1);
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeScores([])).toEqual([]);
  });

  it("returns zeros when every score is zero", () => {
    expect(normalizeScores([0, 0])).toEqual([0, 0]);
  });

  it("preserves input order", () => {
    expect(normalizeScores([50, 100])).toEqual([50, 100]);
  });
});
