import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCompanies } from "../../../tools/sync-data/index";

const FIXTURE = path.resolve(process.cwd(), "tests/fixtures/mini-source");

describe("loadCompanies", () => {
  it("skips the CSV header row and keeps every data row", async () => {
    const { companies, rejectedRows } = await loadCompanies(
      FIXTURE,
      ["Foo Corp"],
      {}
    );

    expect(rejectedRows).toBe(0);
    expect(companies).toHaveLength(1);
    const [foo] = companies;
    expect(foo?.slug).toBe("foo-corp");
    expect(foo?.name).toBe("Foo Corp");
    expect(foo?.windows.d30.map((r) => r.slug)).toEqual([
      "two-sum",
      "valid-parentheses",
    ]);
  });

  it("resolves curated aliases over derivation", async () => {
    const { companies } = await loadCompanies(FIXTURE, ["Bar Inc"], {
      "Bar Inc": "bar-inc-alias",
    });

    expect(companies).toHaveLength(1);
    expect(companies[0]?.slug).toBe("bar-inc-alias");
  });
});
