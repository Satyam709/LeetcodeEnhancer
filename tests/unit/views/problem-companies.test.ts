import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataLayer } from "../../../src/lib/data/loader";
import type { Index } from "../../../src/lib/data/types";
import {
  groupCompanies,
  mountProblemCompanies as rawMount,
} from "../../../src/views/problem-companies";
import {
  findLockedCompaniesAccordion,
  findLockedCompaniesChip,
} from "../../../src/lib/dom/selectors";
import { fixtureDocument, hasFixture } from "../../helpers/dom-fixtures";

/** Every mount is torn down after each test, even when an assertion throws. */
const live: (() => void)[] = [];
const mountProblemCompanies: typeof rawMount = (deps) => {
  const teardown = rawMount(deps);
  live.push(teardown);
  return teardown;
};

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
    topics: async () => [],
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
    expect(document.querySelector(".lce-acc")).not.toBeNull()
  );
  return teardown;
}

const ENTRIES: { companyIdx: number; windows: WindowKey[] }[] = [
  { companyIdx: 0, windows: ["d30", "d3m", "all"] },
  { companyIdx: 1, windows: ["g6m", "all"] },
  { companyIdx: 2, windows: ["d6m"] },
];

afterEach(() => {
  for (const teardown of live.splice(0)) teardown();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** The native nodes we hide: the locked chip and the locked accordion item. */
function lockedNodes(): { chip: HTMLElement; item: HTMLElement } {
  const chip = [
    ...document.querySelectorAll<HTMLElement>("div.flex.gap-1 > div"),
  ].find(
    (node) => node.querySelector('img[alt="premium lock icon"]') !== null
  )!;
  const item = [
    ...document.querySelectorAll<HTMLElement>('[class*="premium-text"]'),
  ]
    .find((node) => node.closest(".group.cursor-pointer") !== null)!
    .closest(".group.cursor-pointer")!.parentElement!.parentElement!;
  return { chip, item };
}

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("groupCompanies", () => {
  it("files each company once under its most recent window, sorted by name", () => {
    const groups = groupCompanies(
      [
        { companyIdx: 0, windows: ["d30", "d3m", "all"] },
        { companyIdx: 1, windows: ["g6m", "all"] },
        { companyIdx: 2, windows: ["d6m"] },
        { companyIdx: 0, windows: ["all"] },
        { companyIdx: 9, windows: ["d30"] },
      ],
      index
    );
    expect(groups.total).toBe(3);
    expect(groups.recent.map((e) => [e.company.name, e.window])).toEqual([
      ["Amazon", "d6m"],
      ["Google", "d30"],
    ]);
    expect(groups.earlier.map((e) => [e.company.name, e.window])).toEqual([
      ["Meta", "g6m"],
    ]);
  });
});

describe.skipIf(!hasProblem)("problem selectors (accordion)", () => {
  it("finds the locked Companies accordion item, not the chip", () => {
    loadFixture();
    const found = findLockedCompaniesAccordion(document);
    expect(found).not.toBeNull();
    expect(found!.header.textContent).toContain("Companies");
    expect(found!.item.previousElementSibling?.tagName).toBe("HR");
  });
});

describe.skipIf(!hasProblem)("mountProblemCompanies", () => {
  it("replaces the locked chip with a native-looking working chip", async () => {
    loadFixture();
    const teardown = await mount(fakeData(ENTRIES));

    const chip = document.querySelector<HTMLButtonElement>(".lce-chip")!;
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.classList.contains("lce-root")).toBe(true);
    expect(chip.classList.contains("rounded-full")).toBe(true);
    expect(chip.classList.contains("bg-fill-secondary")).toBe(true);
    expect(chip.textContent).toBe("Companies");

    const { chip: locked } = lockedNodes();
    expect(locked.style.display).toBe("none");
    expect(chip.nextElementSibling).toBe(locked);
    teardown();
  });

  it("replaces the locked accordion item with a working one grouped by recency", async () => {
    loadFixture();
    const teardown = await mount(fakeData(ENTRIES));

    const { item } = lockedNodes();
    expect(item.style.display).toBe("none");
    const acc = document.querySelector<HTMLElement>(".lce-acc")!;
    expect(item.nextElementSibling).toBe(acc);
    expect(acc.querySelector(".lce-acc__count")!.textContent).toBe("3");

    const header = acc.querySelector<HTMLButtonElement>(".lce-acc__header")!;
    const body = acc.querySelector<HTMLElement>(".lce-acc__body")!;
    expect(body.hidden).toBe(true);
    header.click();
    expect(body.hidden).toBe(false);
    expect(header.getAttribute("aria-expanded")).toBe("true");

    const groups = [...acc.querySelectorAll(".lce-acc__group")].map(
      (group) => ({
        label: group.querySelector(".lce-acc__label")!.firstChild!.textContent,
        tags: [...group.querySelectorAll("a")].map((a) => a.textContent),
      })
    );
    expect(groups).toEqual([
      { label: "Last 6 months", tags: ["Amazon", "Google"] },
      { label: "Earlier", tags: ["Meta"] },
    ]);

    const google = [...acc.querySelectorAll("a")].find(
      (a) => a.textContent === "Google"
    )!;
    expect(google.getAttribute("href")).toBe(
      "/company/google/?favoriteSlug=google-thirty-days"
    );
    expect(google.getAttribute("target")).toBe("_blank");
    expect(google.title).toBe("Google: asked last 30 days");
    expect(google.classList.contains("bg-fill-secondary")).toBe(true);

    header.click();
    expect(body.hidden).toBe(true);
    teardown();
  });

  it("opens the accordion and scrolls to it when the chip is clicked", async () => {
    loadFixture();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const teardown = await mount(fakeData(ENTRIES));

    document.querySelector<HTMLButtonElement>(".lce-chip")!.click();
    const acc = document.querySelector<HTMLElement>(".lce-acc")!;
    expect(acc.querySelector<HTMLElement>(".lce-acc__body")!.hidden).toBe(
      false
    );
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(acc);
    teardown();
  });

  it("collapses long groups behind a Show all toggle", async () => {
    loadFixture();
    const many: Index = {
      ...index,
      companies: Array.from({ length: 40 }, (_, i) => ({
        slug: `c${i}`,
        name: `Company ${String(i).padStart(2, "0")}`,
        counts: [1, 1, 1, 1, 1],
      })),
    };
    const data = fakeData(
      many.companies.map((_, i) => ({ companyIdx: i, windows: ["d30"] }))
    );
    data.index = async () => many;
    const teardown = await mount(data);

    const group = document.querySelector(".lce-acc__group")!;
    const visible = () => group.querySelectorAll("a:not([hidden])").length;
    expect(visible()).toBe(24);
    group.querySelector<HTMLButtonElement>(".lce-acc__more")!.click();
    expect(visible()).toBe(40);
    expect(group.querySelector(".lce-acc__more")).toBeNull();
    teardown();
  });

  it("leaves the native UI alone when the problem has no company data", async () => {
    loadFixture();
    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data: fakeData([]),
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-chip")).toBeNull();
    expect(document.querySelector(".lce-acc")).toBeNull();
    const { chip, item } = lockedNodes();
    expect(chip.style.display).toBe("");
    expect(item.style.display).toBe("");
    teardown();
  });

  it("no-ops when nothing is premium-locked", async () => {
    loadFixture();
    document
      .querySelectorAll('img[alt="premium lock icon"]')
      .forEach((img) => img.remove());
    document.querySelectorAll('[class*="premium-text"]').forEach((label) => {
      label.className = "";
    });
    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data: fakeData([...ENTRIES]),
      timeoutMs: 50,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-chip")).toBeNull();
    expect(document.querySelector(".lce-acc")).toBeNull();
    teardown();
  });

  it("waits for the page title to switch before rendering (problem → problem)", async () => {
    loadFixture();
    const titleLink = document.querySelector<HTMLAnchorElement>(
      '[role="heading"] a[href^="/problems/"]'
    )!;
    // Simulate the previous problem still rendered while the next one loads.
    titleLink.setAttribute("href", "/problems/add-two-numbers/");

    const teardown = mountProblemCompanies({
      url: new URL("https://leetcode.com/problems/two-sum/"),
      data: fakeData(ENTRIES),
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(document.querySelector(".lce-acc")).toBeNull();

    titleLink.setAttribute("href", "/problems/two-sum/");
    await vi.waitFor(() =>
      expect(document.querySelector(".lce-acc")).not.toBeNull()
    );
    teardown();
  });

  it("re-attaches when React replaces the locked chip after mount", async () => {
    loadFixture();
    const teardown = await mount(fakeData(ENTRIES));

    const { row } = { row: lockedNodes().chip.parentElement! };
    const stale = lockedNodes().chip;
    const fresh = stale.cloneNode(true) as HTMLElement;
    fresh.style.display = "";
    row.replaceChild(fresh, stale);
    await nextFrame();

    expect(fresh.style.display).toBe("none");
    expect(fresh.previousElementSibling).toBe(
      document.querySelector(".lce-chip")
    );
    expect(document.querySelectorAll(".lce-chip")).toHaveLength(1);
    teardown();
    expect(fresh.style.display).toBe("");
  });

  it("re-attaches when React re-renders the accordion list", async () => {
    loadFixture();
    const teardown = await mount(fakeData(ENTRIES));
    const acc = document.querySelector(".lce-acc")!;
    acc.querySelector<HTMLButtonElement>(".lce-acc__header")!.click();

    // React rebuilds the whole list: our item is dropped, a fresh locked item appears.
    const { item } = lockedNodes();
    const list = item.parentElement!;
    const fresh = item.cloneNode(true) as HTMLElement;
    fresh.style.display = "";
    acc.remove();
    list.replaceChild(fresh, item);
    await nextFrame();

    expect(fresh.style.display).toBe("none");
    expect(fresh.nextElementSibling).toBe(acc);
    // Same node, so the open state survives.
    expect(acc.classList.contains("is-open")).toBe(true);
    expect(document.querySelectorAll(".lce-acc")).toHaveLength(1);
    teardown();
  });

  it("re-hides a native node React shows again", async () => {
    loadFixture();
    const teardown = await mount(fakeData(ENTRIES));
    const { item } = lockedNodes();
    item.style.display = "";
    // A sibling re-render is what wakes the watcher in the real page.
    item.parentElement!.append(document.createElement("div"));
    await nextFrame();
    expect(item.style.display).toBe("none");
    teardown();
  });

  it("restores the native UI and removes ours on teardown", async () => {
    loadFixture();
    const teardown = await mount(fakeData([...ENTRIES]));
    teardown();

    expect(document.querySelector(".lce-chip")).toBeNull();
    expect(document.querySelector(".lce-acc")).toBeNull();
    const { chip, item } = lockedNodes();
    expect(chip.style.display).toBe("");
    expect(item.style.display).toBe("");
  });
});
