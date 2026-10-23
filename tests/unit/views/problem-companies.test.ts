import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataLayer } from "../../../src/lib/data/loader";
import type { Index } from "../../../src/lib/data/types";
import { mountProblemCompanies } from "../../../src/views/problem-companies";
import { fixtureDocument, hasFixture } from "../../helpers/dom-fixtures";

const hasProblem = hasFixture("problem-two-sum");
const PROBLEM_BODY = hasProblem
  ? fixtureDocument("problem-two-sum").body.innerHTML
  : "";

const index: Index = {
  companies: [
    { slug: "google", name: "Google", counts: [1, 1, 1, 1, 1] },
    { slug: "meta", name: "Meta", counts: [0, 0, 0, 1, 1] },
    { slug: "amazon", name: "Amazon", counts: [0, 0, 1, 0, 0] },
  ],
  problems: {
    "two-sum": {
      id: 1,
      title: "Two Sum",
      difficulty: "Easy",
      acceptance: 58,
      topics: [],
      freqScore: 100,
    },
  },
};

type WindowKey = "d30" | "d3m" | "d6m" | "g6m" | "all";

function fakeData(
  entries: { companyIdx: number; windows: WindowKey[] }[]
): DataLayer {
  return {
    meta: async () => {
      throw new Error("unused");
    },
    index: async () => index,
    company: async () => null,
    companiesForProblem: async () => entries,
    derivedFrequency: async () => undefined,
  };
}

function loadFixture(): void {
  document.body.innerHTML = PROBLEM_BODY;
}

async function mount(data: DataLayer, timeoutMs = 1000): Promise<() => void> {
  const teardown = mountProblemCompanies({
    url: new URL("https://leetcode.com/problems/two-sum/"),
    data,
    timeoutMs,
  });
  await vi.waitFor(() =>
    expect(document.querySelector(".lce-chip--companies")).not.toBeNull()
  );
  return teardown;
}

const ENTRIES: { companyIdx: number; windows: WindowKey[] }[] = [
  { companyIdx: 0, windows: ["d30", "d3m", "all"] },
  { companyIdx: 1, windows: ["g6m", "all"] },
  { companyIdx: 2, windows: ["d6m"] },
];

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe.skipIf(!hasProblem)("mountProblemCompanies", () => {
  it("hides the locked native chip and replaces it with a working one", async () => {
    loadFixture();
    const teardown = await mount(fakeData(ENTRIES));

    const chip = document.querySelector(".lce-chip--companies")!;
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.textContent).toContain("Companies");
    expect(chip.textContent).toContain("3");
    expect(chip.getAttribute("aria-expanded")).toBe("false");

    const locked = [...document.querySelectorAll("div.flex.gap-1 > div")].find(
      (node) => node.querySelector('img[alt="premium lock icon"]') !== null
    )!;
    expect(locked.style.display).toBe("none");
    teardown();
  });

  it("toggles a panel grouped by recency with company links", async () => {
    loadFixture();
    const teardown = await mount(fakeData([...ENTRIES]));

    const chip = document.querySelector<HTMLButtonElement>(
      ".lce-chip--companies"
    )!;
    const panel = document.querySelector<HTMLElement>(".lce-panel")!;
    expect(panel.hidden).toBe(true);

    chip.click();
    expect(panel.hidden).toBe(false);
    expect(chip.getAttribute("aria-expanded")).toBe("true");

    const sections = [...panel.querySelectorAll(".lce-panel__section")];
    expect(sections.map((s) => s.querySelector(".lce-panel__title")?.textContent)).toEqual([
      "Last 6 months2",
      "More than 6 months1",
      "All time2",
    ]);

    const lastSix = [...sections[0]!.querySelectorAll("a")].map((a) => ({
      text: a.textContent,
      href: a.getAttribute("href"),
    }));
    expect(lastSix).toEqual([
      { text: "Amazon", href: "/company/amazon/" },
      { text: "Google", href: "/company/google/" },
    ]);

    const moreThanSix = sections[1]!.querySelectorAll("a");
    expect([...moreThanSix].map((a) => a.textContent)).toEqual(["Meta"]);

    chip.click();
    expect(panel.hidden).toBe(true);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    teardown();
  });

  it("leaves the native chip alone when the problem has no company data", async () => {
    loadFixture();
    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data: fakeData([]),
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-chip--companies")).toBeNull();
    expect(document.querySelector(".lce-panel")).toBeNull();
    const locked = [...document.querySelectorAll("div.flex.gap-1 > div")].find(
      (node) => node.querySelector('img[alt="premium lock icon"]') !== null
    )!;
    expect(locked.style.display).not.toBe("none");
    teardown();
  });

  it("no-ops when the native chip is not premium-locked", async () => {
    loadFixture();
    document
      .querySelectorAll('img[alt="premium lock icon"]')
      .forEach((img) => img.remove());
    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data: fakeData([...ENTRIES]),
      timeoutMs: 50,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-chip--companies")).toBeNull();
    expect(document.querySelector(".lce-panel")).toBeNull();
    teardown();
  });

  it("restores the native chip and removes its UI on teardown", async () => {
    loadFixture();
    const teardown = await mount(fakeData([...ENTRIES]));

    expect(document.querySelector(".lce-chip--companies")).not.toBeNull();
    teardown();

    expect(document.querySelector(".lce-chip--companies")).toBeNull();
    expect(document.querySelector(".lce-panel")).toBeNull();
    const locked = [...document.querySelectorAll("div.flex.gap-1 > div")].find(
      (node) => node.querySelector('img[alt="premium lock icon"]') !== null
    )!;
    expect(locked.style.display).toBe("");
  });
});
