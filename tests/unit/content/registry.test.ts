import { afterEach, describe, expect, it, vi } from "vitest";
import { createViews } from "../../../src/content/registry";

function matchedName(pathname: string): string | null {
  return createViews().find((view) => view.match(pathname))?.name ?? null;
}

describe("createViews matchers", () => {
  it.each([
    ["/company/google", "company"],
    ["/company/google/", "company"],
    ["/company/larsen-toubro", "company"],
    ["/problems/two-sum", "problem"],
    ["/problems/two-sum/description/", "problem"],
    ["/problems/two-sum/solutions", "problem"],
    ["/problemset", "problemset"],
    ["/problemset/", "problemset"],
    ["/problem-list", "problem-list"],
    ["/problem-list/foo/", "problem-list"],
  ])("%s → %s", (pathname, expected) => {
    expect(matchedName(pathname)).toBe(expected);
  });

  it.each([
    "/",
    "/company",
    "/company/",
    "/contest/weekly-contest-400",
    "/problems/",
    "/discuss",
    "/u/somebody/",
  ])("%s matches no view", (pathname) => {
    expect(matchedName(pathname)).toBeNull();
  });
});

describe("stub views", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("log lce:<name> mounted when debug is on, and return a teardown", async () => {
    localStorage.setItem("lce:debug", "1");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const company = createViews().find((view) => view.name === "company");
    expect(company).toBeDefined();

    const teardown = await company!.mount({
      url: new URL("https://leetcode.com/company/google/"),
    });

    expect(spy).toHaveBeenCalledWith("[lce]", "lce:company mounted");
    expect(typeof teardown).toBe("function");
    teardown();
  });
});
