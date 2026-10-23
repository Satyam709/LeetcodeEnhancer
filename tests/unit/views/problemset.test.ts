import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataLayer } from "../../../src/lib/data/loader";
import type { Index } from "../../../src/lib/data/types";
import { mountProblemsetFrequency } from "../../../src/views/problemset";
import { fixtureDocument, hasFixture } from "../../helpers/dom-fixtures";

const hasProblemset = hasFixture("problemset");
const PROBLEMSET_BODY = hasProblemset
  ? fixtureDocument("problemset").body.innerHTML
  : "";

const index: Index = {
  companies: [],
  problems: {
    "two-sum": {
      id: 1,
      title: "Two Sum",
      difficulty: "Easy",
      acceptance: 58,
      topics: [],
      freqScore: 100,
    },
    "add-two-numbers": {
      id: 2,
      title: "Add Two Numbers",
      difficulty: "Medium",
      acceptance: 49.5,
      topics: [],
      freqScore: 42,
    },
    "new-problem": {
      id: 999,
      title: "New Problem",
      difficulty: "Hard",
      acceptance: 20,
      topics: [],
      freqScore: 77,
    },
  },
};

function fakeData(overrides: Partial<DataLayer> = {}): DataLayer {
  return {
    meta: async () => {
      throw new Error("unused");
    },
    index: async () => index,
    company: async () => null,
    companiesForProblem: async () => [],
    derivedFrequency: async () => undefined,
    ...overrides,
  };
}

function loadFixture(): void {
  document.body.innerHTML = PROBLEMSET_BODY;
}

function row(href: string): HTMLAnchorElement {
  return document.querySelector<HTMLAnchorElement>(
    `a[href="${href}"]`
  )!;
}

async function mount(timeoutMs = 1000): Promise<() => void> {
  const teardown = mountProblemsetFrequency({ data: fakeData(), timeoutMs });
  await vi.waitFor(() =>
    expect(document.querySelector(".lce-freqcell")).not.toBeNull()
  );
  return teardown;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe.skipIf(!hasProblemset)("mountProblemsetFrequency", () => {
  it("renders a token bar only for rows with derived frequency", async () => {
    loadFixture();
    const teardown = await mount();

    const twoSum = row("/problems/two-sum");
    const cell = twoSum.querySelector(".lce-freqcell")!;
    expect(cell).not.toBeNull();
    expect(cell.getAttribute("title")).toBe(
      "Derived frequency 100/100 — community company data"
    );
    expect(
      cell.querySelector<HTMLElement>(".lce-freqcell__fill")?.style.width
    ).toBe("100%");
    expect(cell.querySelector(".lce-sr-only")?.textContent).toBe(
      "Derived frequency 100 out of 100"
    );

    const addTwo = row("/problems/add-two-numbers");
    const addCell = addTwo.querySelector(".lce-freqcell")!;
    expect(addCell.getAttribute("title")).toContain("42/100");
    expect(
      addCell.querySelector<HTMLElement>(".lce-freqcell__fill")?.style.width
    ).toBe("42%");
    teardown();
  });

  it("leaves rows without data exactly native", async () => {
    loadFixture();
    const median = row("/problems/median-of-two-sorted-arrays");
    const nativeBars = median.querySelectorAll(
      ".relative.flex.gap-0\\.5 .h-2.w-0\\.5"
    ).length;
    expect(nativeBars).toBeGreaterThan(0);

    const teardown = await mount();

    expect(median.querySelector(".lce-freqcell")).toBeNull();
    expect(
      median.querySelectorAll(".relative.flex.gap-0\\.5 .h-2.w-0\\.5")
    ).toHaveLength(nativeBars);
    teardown();
  });

  it("enhances rows appended after mount (pagination)", async () => {
    loadFixture();
    const teardown = await mount();
    const median = row("/problems/median-of-two-sorted-arrays");
    const container = median.parentElement!;
    const clone = median.cloneNode(true) as HTMLAnchorElement;
    clone.setAttribute("href", "/problems/new-problem");
    clone.id = "999";
    container.append(clone);

    await vi.waitFor(() =>
      expect(clone.querySelector(".lce-freqcell")).not.toBeNull()
    );
    expect(
      clone.querySelector(".lce-freqcell")?.getAttribute("title")
    ).toContain("77/100");
    teardown();
  });

  it("restores every slot on teardown without detaching React's children", async () => {
    loadFixture();
    const slot = row("/problems/two-sum").querySelector(
      ".relative.flex.gap-0\\.5"
    )!;
    const native = [...slot.children] as HTMLElement[];
    const originalChildren = slot.childNodes.length;

    const teardown = await mount();
    const cell = slot.querySelector(".lce-freqcell")!;
    expect(cell).not.toBeNull();
    expect(cell.classList.contains("lce-root")).toBe(true);
    expect(native.every((node) => node.style.display === "none")).toBe(true);
    expect(slot.childNodes).toHaveLength(originalChildren + 1);

    teardown();
    expect(slot.querySelector(".lce-freqcell")).toBeNull();
    expect(native.every((node) => node.style.display === "")).toBe(true);
    expect(slot.childNodes).toHaveLength(originalChildren);
  });

  it("no-ops when the frequency widget is not locked (premium)", async () => {
    loadFixture();
    document
      .querySelectorAll("svg.fa-lock-keyhole")
      .forEach((lock) => lock.remove());
    const teardown = mountProblemsetFrequency({
      data: fakeData(),
      timeoutMs: 50,
    });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(document.querySelector(".lce-freqcell")).toBeNull();
    teardown();
  });

  it("teardown disconnects the pagination observer", async () => {
    loadFixture();
    const teardown = await mount();
    teardown();

    const median = row("/problems/median-of-two-sorted-arrays");
    const clone = median.cloneNode(true) as HTMLAnchorElement;
    clone.setAttribute("href", "/problems/new-problem");
    median.parentElement!.append(clone);
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(clone.querySelector(".lce-freqcell")).toBeNull();
  });
});
