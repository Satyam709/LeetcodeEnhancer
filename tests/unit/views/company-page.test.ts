import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataLayer } from "../../../src/lib/data/loader";
import type { CompanyShard, Index, Meta } from "../../../src/lib/data/types";
import { COMPANY_WALL } from "../../../src/lib/dom/selectors";
import { mountCompanyPage as rawMount } from "../../../src/views/company-page";
import { fixtureDocument, hasFixture } from "../../helpers/dom-fixtures";

/** Every mount is torn down after each test, even when an assertion throws. */
const live: (() => void)[] = [];
const mountCompanyPage: typeof rawMount = (deps) => {
  const teardown = rawMount(deps);
  live.push(teardown);
  return teardown;
};

const hasCompany = hasFixture("company-google");

const meta: Meta = {
  schemaVersion: 1,
  source: {
    repo: "liquidslr/leetcode-company-wise-problems",
    commitSha: "abc123",
    commitDate: "2026-08-16",
  },
  generatedAt: "2026-08-16T00:00:00.000Z",
  enriched: false,
  counts: { companies: 1, problems: 3, entries: 3, rejectedRows: 0 },
  files: {},
};

const index: Index = {
  companies: [{ slug: "google", name: "Google", counts: [2, 2, 2, 2, 2344] }],
  problems: {
    "two-sum": {
      id: 1,
      title: "Two Sum",
      difficulty: "Easy",
      acceptance: 58,
      topics: [0, 1],
      freqScore: 100,
    },
    "add-two-numbers": {
      id: 2,
      title: "Add Two Numbers",
      difficulty: "Medium",
      acceptance: 49.5,
      topics: [2, 3],
      freqScore: 90,
    },
    "median-of-two-sorted-arrays": {
      id: 4,
      title: "Median of Two Sorted Arrays",
      difficulty: "Hard",
      acceptance: 47.8,
      topics: [0],
      freqScore: 40,
    },
  },
};

const shard: CompanyShard = {
  d30: [
    ["two-sum", 100],
    ["add-two-numbers", 72.8],
  ],
  d3m: [],
  d6m: [],
  g6m: [],
  all: [
    ["two-sum", 100],
    ["add-two-numbers", 78.6],
    ["median-of-two-sorted-arrays", 12.5],
  ],
};

const TOPICS = ["Array", "Hash Table", "Linked List", "Math"];

function fakeData(overrides: Partial<DataLayer> = {}): DataLayer {
  return {
    meta: async () => meta,
    index: async () => index,
    company: async (slug) => (slug === "google" ? shard : null),
    companiesForProblem: async () => [],
    derivedFrequency: async (slug) => index.problems[slug]?.freqScore,
    topics: async () => TOPICS,
    ...overrides,
  };
}

function loadFixture(): void {
  document.body.innerHTML = fixtureDocument("company-google").body.innerHTML;
}

async function mount(
  data: DataLayer = fakeData(),
  timeoutMs = 1000
): Promise<() => void> {
  const teardown = mountCompanyPage({
    url: new URL("https://leetcode.com/company/google/"),
    data,
    timeoutMs,
  });
  await vi.waitFor(() =>
    expect(document.querySelector(".lce-company")).not.toBeNull()
  );
  return teardown;
}

function bulkData(count: number): DataLayer {
  const problems: Index["problems"] = {};
  const rows: [string, number][] = [];
  for (let i = 1; i <= count; i += 1) {
    const slug = `problem-${i}`;
    problems[slug] = {
      id: i,
      title: `Problem ${i}`,
      difficulty: "Easy",
      acceptance: 50,
      topics: [],
      freqScore: 50,
    };
    rows.push([slug, 100 - i / 10]);
  }
  return fakeData({
    index: async () => ({ companies: index.companies, problems }),
    company: async () => ({ d30: rows, d3m: [], d6m: [], g6m: [], all: rows }),
  });
}

function click(selector: string): void {
  const node = document.querySelector<HTMLElement>(selector);
  if (node === null) throw new Error(`no element: ${selector}`);
  node.click();
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".lce-row")];
}

afterEach(() => {
  for (const teardown of live.splice(0)) teardown();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe.skipIf(!hasCompany)("mountCompanyPage", () => {
  it("hides the locked wall and dead toolbar but keeps the native shell and free row", async () => {
    loadFixture();
    const wall = document.querySelector<HTMLElement>(COMPANY_WALL)!;
    const target = document.querySelector(".company-container")!
      .children[1] as HTMLElement;
    const toolbar = target.children[0] as HTMLElement;
    const teardown = await mount();

    // Hidden, not detached: React still owns its children.
    expect(wall.isConnected).toBe(true);
    expect(wall.style.display).toBe("none");
    expect(toolbar.style.display).toBe("none");
    const freeRowWrapper = wall.parentElement!;
    expect(freeRowWrapper.style.display).toBe("");
    expect(freeRowWrapper.textContent).toContain("free interview question");

    const container = document.querySelector(".company-container")!;
    expect(container.children).toHaveLength(2);
    expect(container.children[0]!.textContent).toContain("Saved");
    expect(container.children[1]!.querySelector(".lce-company")).not.toBeNull();

    expect(document.querySelector(".lce-company__heading")?.textContent).toBe(
      "Interview questions"
    );
    expect(document.querySelector(".lce-company__meta")?.textContent).toContain(
      "Community data, updated Aug 16, 2026"
    );
    expect(document.body.textContent).toContain("2,344 questions reported");
    teardown();
  });

  it("renders native-style tabs and linked frequency rows", async () => {
    loadFixture();
    const teardown = await mount();

    const tabs = [...document.querySelectorAll(".lce-tab")];
    expect(tabs.map((tab) => tab.firstChild?.textContent)).toEqual([
      "30 days",
      "3 months",
      "6 months",
      "More than 6 months",
      "All",
    ]);
    // Each tab carries the company's per-window question count.
    expect(
      tabs.map((tab) => tab.querySelector(".lce-tab__count")?.textContent)
    ).toEqual(["2", "2", "2", "2", "2,344"]);
    expect(
      document.querySelector(".lce-tab.is-active")?.firstChild?.textContent
    ).toBe("30 days");
    expect(
      document
        .querySelector('[data-window="d30"]')
        ?.getAttribute("aria-controls")
    ).toBe("lce-company-panel");
    expect(
      document.querySelector("#lce-company-panel")?.getAttribute("role")
    ).toBe("tabpanel");

    const rendered = rows();
    expect(rendered).toHaveLength(2);
    const first = rendered[0] as HTMLAnchorElement;
    expect(first.getAttribute("href")).toBe("/problems/two-sum/");
    expect(first.querySelector(".lce-row__title")?.textContent).toBe("Two Sum");
    expect(first.querySelector(".lce-row__acc")?.textContent).toBe("58.0%");
    expect(first.querySelector(".lce-row__diff")?.textContent).toBe("Easy");
    expect(first.querySelector(".lce-row__freq")?.getAttribute("title")).toBe(
      "Frequency 100 — share of interview reports for this company"
    );
    teardown();
  });

  it("switches windows and shows a quiet empty state", async () => {
    loadFixture();
    const teardown = await mount();

    (
      document.querySelector('[data-window="all"]') as HTMLButtonElement
    ).click();
    expect(rows()).toHaveLength(3);
    expect(
      document
        .querySelector('[data-window="all"]')
        ?.getAttribute("aria-selected")
    ).toBe("true");

    (
      document.querySelector('[data-window="d3m"]') as HTMLButtonElement
    ).click();
    expect(rows()).toHaveLength(0);
    const empty = document.querySelector<HTMLElement>(".lce-company__empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.firstChild?.textContent).toBe("No questions in this window.");
    teardown();
  });

  it("wires the tabs for keyboard navigation", async () => {
    loadFixture();
    const teardown = await mount();

    const d30 = document.querySelector<HTMLButtonElement>(
      '[data-window="d30"]'
    )!;
    const all = document.querySelector<HTMLButtonElement>(
      '[data-window="all"]'
    )!;
    expect(d30.tabIndex).toBe(0);
    expect(all.tabIndex).toBe(-1);

    d30.focus();
    d30.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    const d3m = document.querySelector<HTMLButtonElement>(
      '[data-window="d3m"]'
    )!;
    expect(document.activeElement).toBe(d3m);
    expect(d3m.getAttribute("aria-selected")).toBe("true");
    expect(d3m.tabIndex).toBe(0);

    d3m.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true })
    );
    expect(document.activeElement).toBe(all);
    expect(all.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector(".lce-tab.is-active")).toBe(all);
    teardown();
  });

  it("filters by search, difficulty and topic, with removable chips", async () => {
    loadFixture();
    const teardown = await mount();
    const search = document.querySelector<HTMLInputElement>(".lce-search")!;
    const summary = () =>
      document.querySelector(".lce-summary__count")!.textContent;
    const chipLabels = () =>
      [...document.querySelectorAll(".lce-filter-chip")].map(
        (chip) => chip.textContent
      );
    click('[data-window="all"]');
    expect(summary()).toBe("3 questions");

    search.value = "median";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain("Median of Two Sorted Arrays");
    expect(summary()).toBe("1 of 3 questions");
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    click('[data-tool="filter"]');
    const menu = document.querySelector<HTMLElement>("#lce-filter-menu")!;
    expect(menu.hidden).toBe(false);
    // Facet counts for the active window.
    expect(
      [...menu.querySelectorAll(".lce-pill")].map((pill) => pill.textContent)
    ).toEqual(["Easy1", "Medium1", "Hard1"]);
    expect(
      [...menu.querySelectorAll(".lce-filter__topic")].map(
        (topic) => topic.textContent
      )
    ).toEqual(["Array2", "Hash Table1", "Linked List1", "Math1"]);

    click('.lce-pill[data-difficulty="Medium"]');
    click('.lce-pill[data-difficulty="Hard"]');
    expect(
      rows().map((row) => row.querySelector(".lce-row__title")!.textContent)
    ).toEqual(["Add Two Numbers", "Median of Two Sorted Arrays"]);
    expect(
      menu
        .querySelector('.lce-pill[data-difficulty="Hard"]')!
        .getAttribute("aria-pressed")
    ).toBe("true");

    const array = menu.querySelector<HTMLInputElement>('[data-topic="0"]')!;
    array.click();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain("Median of Two Sorted Arrays");
    expect(chipLabels()).toEqual(["Medium", "Hard", "Array"]);
    expect(
      document.querySelector('[data-tool="filter"] .lce-tool__badge')!
        .textContent
    ).toBe("3");

    // Removing a chip updates the open menu in place.
    document
      .querySelectorAll<HTMLButtonElement>(".lce-filter-chip")[2]!
      .click();
    expect(array.checked).toBe(false);
    expect(rows()).toHaveLength(2);

    click(".lce-summary__chips .lce-link");
    expect(chipLabels()).toEqual([]);
    expect(rows()).toHaveLength(3);
    teardown();
  });

  it("narrows the topic list with its search box", async () => {
    loadFixture();
    const teardown = await mount();
    click('[data-window="all"]');
    click('[data-tool="filter"]');
    const topicSearch = document.querySelector<HTMLInputElement>(
      ".lce-filter__search"
    )!;
    topicSearch.value = "has";
    topicSearch.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = [
      ...document.querySelectorAll<HTMLElement>(".lce-filter__topic"),
    ].filter((topic) => !topic.hidden);
    expect(visible.map((topic) => topic.dataset.name)).toEqual(["hash table"]);
    teardown();
  });

  it("toggles direction on repeated header clicks", async () => {
    loadFixture();
    const teardown = await mount();
    click('[data-window="all"]');
    const titles = () =>
      rows().map((row) => row.querySelector(".lce-row__title")!.textContent);
    const header = (key: string) =>
      document.querySelector<HTMLElement>(`.lce-sort[data-sort="${key}"]`)!
        .parentElement!;

    // Default: frequency, highest first.
    expect(header("frequency").getAttribute("aria-sort")).toBe("descending");
    click('.lce-sort[data-sort="frequency"]');
    expect(header("frequency").getAttribute("aria-sort")).toBe("ascending");
    expect(titles()[0]).toBe("Median of Two Sorted Arrays");

    click('.lce-sort[data-sort="title"]');
    expect(header("title").getAttribute("aria-sort")).toBe("ascending");
    expect(header("frequency").getAttribute("aria-sort")).toBe("none");
    expect(titles()).toEqual([
      "Add Two Numbers",
      "Median of Two Sorted Arrays",
      "Two Sum",
    ]);
    click('.lce-sort[data-sort="title"]');
    expect(header("title").getAttribute("aria-sort")).toBe("descending");
    expect(titles()[0]).toBe("Two Sum");
    expect(document.querySelector('[data-tool="sort"]')!.textContent).toBe(
      "Title ↓"
    );
    teardown();
  });

  it("sorts from the sort menu and closes it", async () => {
    loadFixture();
    const teardown = await mount();
    click('[data-window="all"]');
    const menu = document.querySelector<HTMLElement>("#lce-sort-menu")!;
    const trigger = document.querySelector<HTMLElement>('[data-tool="sort"]')!;

    trigger.click();
    expect(menu.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    click('.lce-menu__item[data-sort="acceptance"]');
    expect(menu.hidden).toBe(true);
    expect(trigger.textContent).toBe("Acceptance ↓");
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    expect(
      menu
        .querySelector('[data-sort="acceptance"]')!
        .getAttribute("aria-checked")
    ).toBe("true");
    click('.lce-menu__item[data-direction="ascending"]');
    expect(trigger.textContent).toBe("Acceptance ↑");
    expect(rows()[0]!.querySelector(".lce-row__title")!.textContent).toBe(
      "Median of Two Sorted Arrays"
    );
    teardown();
  });

  it("closes menus on Escape and outside clicks, one open at a time", async () => {
    loadFixture();
    const teardown = await mount();
    const sortMenu = document.querySelector<HTMLElement>("#lce-sort-menu")!;
    const filterMenu = document.querySelector<HTMLElement>("#lce-filter-menu")!;
    const sortTrigger =
      document.querySelector<HTMLElement>('[data-tool="sort"]')!;

    sortTrigger.click();
    click('[data-tool="filter"]');
    expect(sortMenu.hidden).toBe(true);
    expect(filterMenu.hidden).toBe(false);

    filterMenu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(filterMenu.hidden).toBe(true);
    expect(document.activeElement).toBe(
      document.querySelector('[data-tool="filter"]')
    );

    sortTrigger.click();
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    );
    expect(sortMenu.hidden).toBe(true);
    teardown();
  });

  it("offers to clear filters when they exclude every question", async () => {
    loadFixture();
    const teardown = await mount();
    const search = document.querySelector<HTMLInputElement>(".lce-search")!;
    search.value = "no such problem";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    const empty = document.querySelector<HTMLElement>(".lce-company__empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain("No questions match your filters.");
    expect(
      document.querySelector<HTMLElement>(".lce-company__table")!.hidden
    ).toBe(true);
    click(".lce-company__empty .lce-link");
    expect(search.value).toBe("");
    expect(rows()).toHaveLength(2);
    teardown();
  });

  it("renders the first 100 rows and appends the rest on load more", async () => {
    loadFixture();
    const teardown = await mount(bulkData(150));

    expect(rows()).toHaveLength(100);
    const more = document.querySelector<HTMLButtonElement>(".lce-more")!;
    expect(more.hidden).toBe(false);
    expect(more.textContent).toContain("50");

    more.click();
    expect(rows()).toHaveLength(150);
    expect(more.hidden).toBe(true);
    teardown();
  });

  it("renders the unknown-company empty state", async () => {
    loadFixture();
    const teardown = await mount(fakeData({ company: async () => null }));

    const empty = document.querySelector<HTMLElement>(".lce-company__empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.firstChild?.textContent).toBe(
      "No community data for this company yet."
    );
    expect(document.body.textContent).toContain("Not tracked");
    teardown();
  });

  it("no-ops when the wall is absent (premium/native list)", async () => {
    loadFixture();
    document.querySelector(COMPANY_WALL)!.remove();
    const teardown = mountCompanyPage({
      url: new URL("https://leetcode.com/company/google/"),
      data: fakeData(),
      timeoutMs: 50,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-company")).toBeNull();
    teardown();
  });

  it("waits for the company page itself to switch before taking over", async () => {
    loadFixture();
    const discuss = document.querySelector<HTMLAnchorElement>(
      '.company-container a[href^="/discuss/topic/"]'
    )!;
    expect(discuss).not.toBeNull();
    // Simulate the previous company still rendered while the next one loads.
    discuss.setAttribute("href", "/discuss/topic/meta/");
    const wall = document.querySelector<HTMLElement>(COMPANY_WALL)!;

    let resolveIndex!: (value: Index) => void;
    let resolveShard!: (value: CompanyShard | null) => void;
    let resolveMeta!: (value: Meta) => void;
    const teardown = mountCompanyPage({
      url: new URL("https://leetcode.com/company/google/"),
      data: fakeData({
        index: () => new Promise((resolve) => (resolveIndex = resolve)),
        company: () => new Promise((resolve) => (resolveShard = resolve)),
        meta: () => new Promise((resolve) => (resolveMeta = resolve)),
      }),
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    resolveIndex(index);
    resolveShard(shard);
    resolveMeta(meta);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(document.querySelector(".lce-company")).toBeNull();
    expect(wall.style.display).toBe("");

    discuss.setAttribute("href", "/discuss/topic/google/");
    await vi.waitFor(() =>
      expect(document.querySelector(".lce-company")).not.toBeNull()
    );
    expect(wall.style.display).toBe("none");

    teardown();
    expect(wall.style.display).toBe("");
  });

  it("re-finds the takeover after data resolves (wall replaced mid-flight)", async () => {
    loadFixture();
    let resolveIndex!: (value: Index) => void;
    let resolveShard!: (value: CompanyShard) => void;
    let resolveMeta!: (value: Meta) => void;
    const data = fakeData({
      index: () => new Promise((resolve) => (resolveIndex = resolve)),
      company: () => new Promise((resolve) => (resolveShard = resolve)),
      meta: () => new Promise((resolve) => (resolveMeta = resolve)),
    });
    const teardown = mountCompanyPage({
      url: new URL("https://leetcode.com/company/google/"),
      data,
      timeoutMs: 1000,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const target = document.querySelector(".company-container")!.children[1]!;
    const staleWrapper = target.children[1]!;
    const freshWrapper = staleWrapper.cloneNode(true) as HTMLElement;
    target.replaceChild(freshWrapper, staleWrapper);

    resolveIndex(index);
    resolveShard(shard);
    resolveMeta(meta);
    await vi.waitFor(() =>
      expect(document.querySelector(".lce-company")).not.toBeNull()
    );

    const liveWall = freshWrapper.querySelector<HTMLElement>(COMPANY_WALL)!;
    expect(liveWall.style.display).toBe("none");
    expect(freshWrapper.style.display).toBe("");
    const toolbar = target.children[0] as HTMLElement;
    expect(toolbar.style.display).toBe("none");

    teardown();
    expect(liveWall.style.display).toBe("");
    expect(toolbar.style.display).toBe("");
    expect(document.querySelector(".lce-company")).toBeNull();
  });

  it("restores the native wall on teardown", async () => {
    loadFixture();
    const wall = document.querySelector<HTMLElement>(COMPANY_WALL)!;
    const teardown = await mount();

    expect(wall.style.display).toBe("none");
    teardown();

    expect(wall.style.display).toBe("");
    expect(document.querySelector(".lce-company")).toBeNull();
  });

  it("cancels an in-flight enhance pass on immediate teardown", async () => {
    loadFixture();
    const wall = document.querySelector<HTMLElement>(COMPANY_WALL)!;
    const teardown = mountCompanyPage({
      url: new URL("https://leetcode.com/company/google/"),
      data: fakeData(),
      timeoutMs: 50,
    });
    teardown();
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-company")).toBeNull();
    expect(wall.style.display).toBe("");
  });
});
