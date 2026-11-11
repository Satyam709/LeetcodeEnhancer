import { describe, expect, it } from "vitest";
import { problemShardName } from "../../../../src/lib/data/shards";

describe("problemShardName", () => {
  it.each([
    ["two-sum", "tw.json"],
    ["x", "x_.json"],
    ["3sum", "3s.json"],
    ["a-b", "a_.json"],
    ["Two-Sum", "tw.json"],
  ])("%s → %s", (slug, expected) => {
    expect(problemShardName(slug)).toBe(expected);
  });
});
