import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataLayer } from "../../../src/lib/data/loader";
import type { Index } from "../../../src/lib/data/types";
import { mountProblemCompanies } from "../../../src/views/problem-companies";
import { findLockedCompaniesChip } from "../../../src/lib/dom/selectors";
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
    expect(chip.classList.contains("lce-root")).toBe(true);
    expect(chip.classList.contains("rounded-full")).toBe(true);
    expect(chip.classList.contains("bg-fill-secondary")).toBe(true);
    expect(chip.textContent).toContain("Companies");
    expect(chip.textContent).toContain("3");
    expect(chip.getAttribute("aria-expanded")).toBe("false");

    const locked = [...document.querySelectorAll<HTMLElement>("div.flex.gap-1 > div")].find(
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
    expect(panel.classList.contains("lce-root")).toBe(true);

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
      {
        text: "Amazon",
        href: "/company/amazon/?favoriteSlug=amazon-thirty-days",
      },
      {
        text: "Google",
        href: "/company/google/?favoriteSlug=google-thirty-days",
      },
    ]);
    expect(
      sections[0]!.querySelector("a")!.classList.contains("bg-fill-secondary")
    ).toBe(true);

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
    const locked = [...document.querySelectorAll<HTMLElement>("div.flex.gap-1 > div")].find(
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

  it("waits for the page title to switch before rendering (problem → problem)", async () => {
    loadFixture();
    const titleLink = document.querySelector<HTMLAnchorElement>(
      '[role="heading"] a[href^="/problems/"]'
    )!;
    // Simulate the previous problem still rendered while the next one loads.
    titleLink.setAttribute("href", "/problems/add-two-numbers/");

    let resolveEntries!: (value: typeof ENTRIES) => void;
    let resolveIndex!: (value: Index) => void;
    const data = fakeData([]);
    data.companiesForProblem = () =>
      new Promise((resolve) => (resolveEntries = resolve));
    data.index = () => new Promise((resolve) => (resolveIndex = resolve));

    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data,
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    resolveEntries(ENTRIES);
    resolveIndex(index);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(document.querySelector(".lce-chip--companies")).toBeNull();

    titleLink.setAttribute("href", "/problems/two-sum/");
    await vi.waitFor(() =>
      expect(document.querySelector(".lce-chip--companies")).not.toBeNull()
    );
    teardown();
  });

  it("re-finds the locked chip after data resolves (chip replaced mid-flight)", async () => {
    loadFixture();
    let resolveEntries!: (value: typeof ENTRIES) => void;
    let resolveIndex!: (value: Index) => void;
    const data = fakeData([]);
    data.companiesForProblem = () =>
      new Promise((resolve) => (resolveEntries = resolve));
    data.index = () => new Promise((resolve) => (resolveIndex = resolve));

    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data,
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const located = findLockedCompaniesChip(document);
    expect(located).not.toBeNull();
    const { chip: stale, row } = located!;
    const fresh = stale.cloneNode(true) as HTMLElement;
    row.replaceChild(fresh, stale);

    resolveEntries(ENTRIES);
    resolveIndex(index);
    await vi.waitFor(() =>
      expect(document.querySelector(".lce-chip--companies")).not.toBeNull()
    );

    expect(fresh.style.display).toBe("none");
    expect(stale.style.display).toBe("");
    teardown();
    expect(fresh.style.display).toBe("");
  });

  it("restores the native chip and removes its UI on teardown", async () => {
    loadFixture();
    const teardown = await mount(fakeData([...ENTRIES]));

    expect(document.querySelector(".lce-chip--companies")).not.toBeNull();
    teardown();

    expect(document.querySelector(".lce-chip--companies")).toBeNull();
    expect(document.querySelector(".lce-panel")).toBeNull();
    const locked = [...document.querySelectorAll<HTMLElement>("div.flex.gap-1 > div")].find(
      (node) => node.querySelector('img[alt="premium lock icon"]') !== null
    )!;
    expect(locked.style.display).toBe("");
  });
});
