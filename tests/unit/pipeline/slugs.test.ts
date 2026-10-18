import { describe, expect, it } from "vitest";
import { deriveCompanySlug, resolveCompanySlug } from "../../../tools/sync-data/slugs";

describe("deriveCompanySlug", () => {
  it.each([
    ["Amazon", "amazon"],
    ["American Express", "american-express"],
    ["AQR Capital Management", "aqr-capital-management"],
    ["ByteDance", "bytedance"],
    ["AMD", "amd"],
    ["CARS24", "cars24"],
    ["DP world", "dp-world"],
    ["Analytics quotient", "analytics-quotient"],
    ["Apollo.io", "apollo-io"],
    ["Goldman Sachs", "goldman-sachs"],
  ])("derives %s -> %s", (name, slug) => {
    expect(deriveCompanySlug(name)).toBe(slug);
  });

  it("collapses separator runs and trims the edges", () => {
    expect(deriveCompanySlug("  a  &  b  ")).toBe("a-b");
    expect(deriveCompanySlug("J.P. Morgan")).toBe("j-p-morgan");
    expect(deriveCompanySlug("AT&T")).toBe("at-t");
  });

  it("is idempotent on slugs", () => {
    expect(deriveCompanySlug("goldman-sachs")).toBe("goldman-sachs");
  });
});

describe("resolveCompanySlug", () => {
  it("alias wins over derivation", () => {
    expect(resolveCompanySlug("J.P. Morgan", { "J.P. Morgan": "jpmorgan" })).toBe("jpmorgan");
  });

  it("falls back to derivation when no alias exists", () => {
    expect(resolveCompanySlug("Stripe", { "J.P. Morgan": "jpmorgan" })).toBe("stripe");
  });
});
