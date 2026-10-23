import type { DataLayer } from "../../lib/data/loader";
import { DataUnavailable } from "../../lib/data/loader";
import type {
  CompanyShard,
  Index,
  Meta,
  WindowKey,
} from "../../lib/data/types";
import { debugLog } from "../../lib/debug";
import { el } from "../../lib/dom/html";
import { waitFor, waitUntil } from "../../lib/dom/readiness";
import { findCompanyTakeover } from "../../lib/dom/selectors";
import {
  WINDOW_TABS,
  buildRows,
  formatAcceptance,
  formatCount,
  formatFrequency,
  formatUpdated,
  type CompanyRow,
  type DifficultyFilter,
  type SortKey,
} from "./model";

export interface CompanyViewDeps {
  url: URL;
  data: DataLayer;
  /** Anchor readiness budget; tests shorten it. Defaults to 10 s. */
  timeoutMs?: number;
}

const CHUNK = 100;
const WALL_SELECTOR = '[class*="company_subscribeContainer"]';

/**
 * `/company/{slug}` — replace only the locked right column with the community
 * list. The native left company card and the page shell stay untouched. A
 * premium page renders no wall, so the view no-ops and native behavior wins.
 */
export function mountCompanyPage(deps: CompanyViewDeps): () => void {
  const controller = new AbortController();
  let restore: (() => void) | null = null;

  void enhance(deps, controller.signal, (fn) => {
    restore = fn;
  }).catch((err: unknown) => {
    if (!controller.signal.aborted) debugLog("lce:company enhance failed", err);
  });

  return () => {
    controller.abort();
    restore?.();
  };
}

async function enhance(
  deps: CompanyViewDeps,
  signal: AbortSignal,
  setRestore: (fn: () => void) => void
): Promise<void> {
  const slug = companySlug(deps.url.pathname);
  if (slug === null) return;

  try {
    await waitFor(WALL_SELECTOR, {
      timeoutMs: deps.timeoutMs ?? 10_000,
      signal,
    });
  } catch {
    // No wall: premium native list, non-company layout, or DOM drift. Leave it.
    return;
  }
  if (signal.aborted) return;

  let index: Index;
  let shard: CompanyShard | null;
  let meta: Meta;
  try {
    [index, shard, meta] = await Promise.all([
      deps.data.index(),
      deps.data.company(slug),
      deps.data.meta(),
    ]);
  } catch (err) {
    if (!(err instanceof DataUnavailable)) {
      debugLog("lce:company data failed", err);
    }
    return;
  }
  if (signal.aborted) return;

  // On a company → company SPA navigation the old page's wall can still be in
  // the document while the new data loads. The Discuss link is slug-specific,
  // so wait until the page itself has switched before touching its DOM.
  try {
    await waitUntil(() => companyPageMatches(slug), {
      timeoutMs: deps.timeoutMs ?? 10_000,
      signal,
    });
  } catch {
    return;
  }
  if (signal.aborted) return;

  // Re-find after the await: React may have replaced the wall or the column.
  const takeover = findCompanyTakeover(document);
  if (
    takeover === null ||
    !takeover.wall.isConnected ||
    !takeover.target.isConnected
  ) {
    return;
  }

  const root = createCompanyView({ slug, index, shard, meta, signal });

  // Hide the dead toolbar + locked wall instead of detaching them: React keeps
  // its own children, so a later re-render cannot hit a missing-node error.
  // The wrapper that also holds the working free-question row stays visible.
  const hidden: { node: HTMLElement; display: string }[] = [];
  const hide = (node: HTMLElement): void => {
    hidden.push({ node, display: node.style.display });
    node.style.display = "none";
  };
  const toolbar = Array.from(takeover.target.children).find(
    (child) => child.querySelector('input[placeholder="Search questions"]') !== null
  );
  if (toolbar !== undefined) hide(toolbar as HTMLElement);
  hide(takeover.wall as HTMLElement);

  takeover.target.append(root);
  setRestore(() => {
    root.remove();
    for (const entry of hidden) entry.node.style.display = entry.display;
  });
}

/** True when the company container already belongs to `slug`. */
function companyPageMatches(slug: string): boolean {
  const container = document.querySelector(".company-container");
  if (container === null) return false;
  const links = container.querySelectorAll('a[href^="/discuss/topic/"]');
  if (links.length === 0) return true;
  return [...links].some((link) => {
    const href = link.getAttribute("href") ?? "";
    try {
      const pathname = new URL(href, "https://leetcode.com").pathname;
      return (
        pathname === `/discuss/topic/${slug}/` ||
        pathname === `/discuss/topic/${slug}`
      );
    } catch {
      return false;
    }
  });
}

function companySlug(pathname: string): string | null {
  const match = /^\/company\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

interface ViewInput {
  slug: string;
  index: Index;
  shard: CompanyShard | null;
  meta: Meta;
  signal: AbortSignal;
}

function createCompanyView(input: ViewInput): HTMLElement {
  const { slug, index, shard, meta, signal } = input;
  const company = index.companies.find((entry) => entry.slug === slug);
  const allTimeCount = company?.counts[4] ?? 0;

  let windowKey: WindowKey = "d30";
  let search = "";
  let difficulty: DifficultyFilter = "all";
  let sort: SortKey = "frequency";
  let rows: CompanyRow[] = [];
  let shown = 0;

  const root = el("section", {
    className: "lce-root lce-company",
    attrs: { "aria-label": "Company interview questions" },
  });

  const count = el("span", { className: "lce-company__count" });
  const metaLine = el("p", {
    className: "lce-company__meta",
    text: `Updated ${formatUpdated(meta.source.commitDate)} · Data: community company-wise lists`,
  });

  root.append(
    el("div", {
      className: "lce-company__header",
      children: [
        el("div", {
          className: "lce-company__heading-wrap",
          children: [
            el("h2", {
              className: "lce-company__heading",
              text: "Interview questions",
            }),
            metaLine,
          ],
        }),
        count,
      ],
    })
  );

  const tabs = el("div", {
    className: "lce-tabs",
    attrs: { role: "tablist", "aria-label": "Time window" },
  });
  const tabButtons = new Map<WindowKey, HTMLButtonElement>();
  for (const tab of WINDOW_TABS) {
    const button = el("button", {
      className: "lce-tab",
      text: tab.label,
      attrs: {
        type: "button",
        role: "tab",
        id: `lce-tab-${tab.key}`,
        "data-window": tab.key,
        "aria-selected": "false",
        "aria-controls": "lce-company-panel",
      },
    });
    tabButtons.set(tab.key, button);
    tabs.append(button);
  }
  root.append(tabs);

  const searchInput = el("input", {
    className: "lce-search",
    attrs: {
      type: "search",
      placeholder: "Search questions",
      "aria-label": "Search questions",
      autocomplete: "off",
    },
  });
  const difficultySelect = el("select", {
    className: "lce-select",
    attrs: { "aria-label": "Difficulty" },
    children: [
      el("option", { text: "All difficulties", attrs: { value: "all" } }),
      el("option", { text: "Easy", attrs: { value: "Easy" } }),
      el("option", { text: "Medium", attrs: { value: "Medium" } }),
      el("option", { text: "Hard", attrs: { value: "Hard" } }),
    ],
  });
  const sortSelect = el("select", {
    className: "lce-select",
    attrs: { "aria-label": "Sort" },
    children: [
      el("option", { text: "Frequency", attrs: { value: "frequency" } }),
      el("option", { text: "Title", attrs: { value: "title" } }),
      el("option", { text: "Acceptance", attrs: { value: "acceptance" } }),
    ],
  });
  root.append(
    el("div", {
      className: "lce-controls",
      children: [searchInput, difficultySelect, sortSelect],
    })
  );

  const header = el("div", {
    className: "lce-company__row lce-company__head",
    children: [
      column("lce-col--num", "Rank"),
      column("lce-col--title", "Title"),
      column("lce-col--acc", "Acceptance"),
      column("lce-col--diff", "Difficulty"),
      column("lce-col--freq", "Frequency"),
    ],
  });
  const rowGroup = el("div", { className: "lce-company__rows" });
  const empty = el("p", {
    className: "lce-company__empty",
    attrs: { hidden: "" },
  });
  const more = el("button", {
    className: "lce-more",
    attrs: { type: "button" },
  });
  const table = el("div", {
    className: "lce-company__table",
    attrs: {
      id: "lce-company-panel",
      role: "tabpanel",
      "aria-label": "Company interview questions",
    },
    children: [header, rowGroup],
  });

  root.append(
    table,
    empty,
    el("div", { className: "lce-more-wrap", children: [more] })
  );

  function applyQuery(): void {
    rows =
      shard === null
        ? []
        : buildRows(shard, index, { window: windowKey, search, difficulty, sort });
    shown = Math.min(CHUNK, rows.length);
    rowGroup.replaceChildren(...rows.slice(0, shown).map(rowNode));
    updateStatus();
  }

  function appendChunk(): void {
    const next = rows.slice(shown, shown + CHUNK);
    rowGroup.append(...next.map(rowNode));
    shown += next.length;
    updateStatus();
  }

  function updateStatus(): void {
    const unknown = shard === null;
    empty.hidden = rows.length > 0;
    empty.textContent = unknown
      ? "No community data for this company yet."
      : "No questions in this window.";
    count.textContent = unknown
      ? "Not tracked"
      : `${formatCount(allTimeCount)} questions all time`;
    more.hidden = rows.length === 0 || shown >= rows.length;
    more.textContent = `Load more (${formatCount(rows.length - shown)} remaining)`;
  }

  function selectTab(key: WindowKey): void {
    windowKey = key;
    for (const [tabKey, button] of tabButtons) {
      const active = tabKey === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    }
    table.setAttribute("aria-labelledby", `lce-tab-${key}`);
  }

  for (const [key, button] of tabButtons) {
    button.addEventListener("click", () => {
      if (signal.aborted) return;
      selectTab(key);
      applyQuery();
    });
  }
  tabs.addEventListener("keydown", (event) => {
    if (signal.aborted) return;
    const keys = WINDOW_TABS.map((tab) => tab.key);
    const currentIndex = keys.indexOf(windowKey);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % keys.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + keys.length) % keys.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = keys.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextKey = keys[nextIndex]!;
    selectTab(nextKey);
    applyQuery();
    tabButtons.get(nextKey)?.focus();
  });
  searchInput.addEventListener("input", () => {
    if (signal.aborted) return;
    search = searchInput.value;
    applyQuery();
  });
  difficultySelect.addEventListener("change", () => {
    if (signal.aborted) return;
    difficulty = difficultySelect.value as DifficultyFilter;
    applyQuery();
  });
  sortSelect.addEventListener("change", () => {
    if (signal.aborted) return;
    sort = sortSelect.value as SortKey;
    applyQuery();
  });
  more.addEventListener("click", () => {
    if (signal.aborted) return;
    appendChunk();
  });

  selectTab(windowKey);
  applyQuery();
  return root;
}

function column(className: string, text: string): HTMLElement {
  return el("span", { className: `lce-col ${className}`, text });
}

function rowNode(row: CompanyRow): HTMLElement {
  const link = el("a", {
    className: "lce-row",
    attrs: {
      href: `/problems/${row.slug}/`,
      "aria-label": `${row.title}, ${row.difficulty}, acceptance ${formatAcceptance(
        row.acceptance
      )}, frequency ${formatFrequency(row.frequency)}`,
    },
  });
  link.append(
    el("span", {
      className: "lce-col lce-col--num lce-row__num",
      text: String(row.id ?? row.position),
    }),
    el("span", {
      className: "lce-col lce-col--title lce-row__title",
      text: row.title,
    }),
    el("span", {
      className: "lce-col lce-col--acc lce-row__acc",
      text: formatAcceptance(row.acceptance),
    }),
    el("span", {
      className: `lce-col lce-col--diff lce-row__diff lce-diff--${row.difficulty.toLowerCase()}`,
      text: row.difficulty,
    }),
    frequencyCell(row.frequency)
  );
  return link;
}

function frequencyCell(frequency: number): HTMLElement {
  const percent = Math.max(0, Math.min(100, frequency));
  const cell = el("span", {
    className: "lce-col lce-col--freq lce-row__freq",
    attrs: {
      title: `Frequency ${formatFrequency(frequency)} — share of interview reports for this company`,
    },
  });
  cell.append(
    el("span", {
      className: "lce-freqbar",
      children: [
        el("span", {
          className: "lce-freqbar__fill",
          attrs: { style: `width:${percent}%` },
        }),
      ],
    }),
    el("span", {
      className: "lce-freqbar__value",
      text: formatFrequency(frequency),
    })
  );
  return cell;
}
