import { describe, expect, it } from "vitest";
import { buildArtifacts } from "../../../tools/sync-data/build-artifacts";
import type { CompanyWindows } from "../../../tools/sync-data/schema";
import type { ProblemRow } from "../../../tools/sync-data/transform";
import { BANDS, BUDGETS, validateArtifacts } from "../../../tools/sync-data/validate";

const row = (slug: string): ProblemRow => ({
  slug,
  title: slug,
  difficulty: "Easy",
  acceptance: 50,
  frequency: 50,
  topics: [],
});

const win = (partial: Partial<CompanyWindows>): CompanyWindows => ({
  d30: [],
  d3m: [],
  d6m: [],
  g6m: [],
  all: [],
  ...partial,
});

const base = () =>
  buildArtifacts(
    [
      { slug: "alpha", name: "Alpha", windows: win({ d30: [row("two-sum")] }) },
      {
        slug: "beta",
        name: "Beta",
        windows: win({ all: [row("two-sum"), row("three-sum")] }),
      },
    ],
    {
      source: { repo: "r", commitSha: "s", commitDate: "d" },
      enriched: false,
      rejectedRows: 0,
    }
  );

describe("BUDGETS", () => {
  it("is 4 MB total and 700 KB for the index", () => {
    expect(BUDGETS).toEqual({
      totalBytes: 4 * 1024 * 1024,
      indexBytes: 700 * 1024,
    });
  });
});

describe("BANDS", () => {
  it("expects the spec floors: 400 companies, 3000 problems", () => {
    expect(BANDS).toEqual({ minCompanies: 400, minProblems: 3000 });
  });
});

describe("validateArtifacts", () => {
  it("passes for a valid artifact set", () => {
    expect(validateArtifacts(base())).toEqual({ ok: true, errors: [] });
  });

  it("rejects a schema version mismatch", () => {
    const a = base();
    (a.meta as { schemaVersion: number }).schemaVersion = 2;
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("schemaVersion");
  });

  it("rejects a shard problem slug that is not in the index", () => {
    const a = base();
    a.companyShards.get("alpha")!.d30.push(["ghost", 10]);
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("ghost");
  });

  it("rejects an index entry without a shard", () => {
    const a = base();
    a.companyShards.delete("beta");
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("beta");
  });

  it("rejects a shard without an index entry", () => {
    const a = base();
    a.companyShards.set("zzz", { d30: [], d3m: [], d6m: [], g6m: [], all: [] });
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("zzz");
  });

  it("rejects duplicate company slugs", () => {
    const a = base();
    a.index.companies.push({ ...a.index.companies[0]! });
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("duplicate company slug");
  });

  it("rejects topic indices out of range", () => {
    const a = base();
    a.index.problems["two-sum"].topics = [7];
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("topic index out of range");
  });

  it("rejects invalid slugs", () => {
    const a = base();
    a.companyShards.get("alpha")!.d30.push(["Two Sum", 10]);
    const r = validateArtifacts(a);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain('invalid problem slug: "Two Sum"');
  });

  it("enforces the total size budget", () => {
    const r = validateArtifacts(base(), { totalBytes: 10, indexBytes: 10 });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("total size budget exceeded");
    expect(r.errors.join("\n")).toContain("index size budget exceeded");
  });

  it("enforces the index size budget separately", () => {
    const r = validateArtifacts(base(), {
      totalBytes: Number.MAX_SAFE_INTEGER,
      indexBytes: 10,
    });
    expect(r.errors.join("\n")).toContain("index size budget exceeded");
    expect(r.errors.join("\n")).not.toContain("total size budget exceeded");
  });

  it("enforces count bands when provided", () => {
    const companies = validateArtifacts(base(), BUDGETS, {
      minCompanies: 3,
      minProblems: 0,
    });
    expect(companies.ok).toBe(false);
    expect(companies.errors.join("\n")).toContain(
      "company count below expected band: 2 < 3"
    );

    const problems = validateArtifacts(base(), BUDGETS, {
      minCompanies: 0,
      minProblems: 3,
    });
    expect(problems.ok).toBe(false);
    expect(problems.errors.join("\n")).toContain(
      "problem count below expected band: 2 < 3"
    );
  });

  it("passes the count bands when the artifact set reaches them", () => {
    const r = validateArtifacts(base(), BUDGETS, {
      minCompanies: 2,
      minProblems: 2,
    });
    expect(r).toEqual({ ok: true, errors: [] });
  });
});
