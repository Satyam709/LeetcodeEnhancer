import type {
  CompanyShard,
  Difficulty,
  Index,
  Meta,
  WindowKey,
} from "../../lib/data/types";
import { el, svg } from "../../lib/dom/html";
import { createPopover } from "../../lib/dom/popover";
import {
  DIFFICULTIES,
  SORT_LABELS,
  WINDOW_TABS,
  buildRows,
  defaultDirection,
  facets,
  formatAcceptance,
  formatCount,
  formatFrequency,
  formatUpdated,
  windowRows,
  type CompanyRow,
  type Facets,
  type SortDirection,
  type SortKey,
} from "./model";

const CHUNK = 100;
const SORT_KEYS: SortKey[] = ["frequency", "acceptance", "difficulty", "title"];

export interface ViewInput {
  slug: string;
  index: Index;
  shard: CompanyShard | null;
  meta: Meta;
  /** Topic names; problems reference them by index. */
  topics: readonly string[];
  signal: AbortSignal;
}

/**
 * The company question list: window tabs, search, a sort menu, a filter menu
 * (difficulty + topics), removable filter chips and sortable column headers.
 * All state lives in this closure, so re-attaching the same root after a
 * LeetCode re-render keeps the user's choices.
 */
export function createCompanyView(input: ViewInput): HTMLElement {
  const { slug, index, shard, meta, topics, signal } = input;
  const company = index.companies.find((entry) => entry.slug === slug);
  const allTimeCount = company?.counts[4] ?? 0;

  const state = {
    window: "d30" as WindowKey,
    search: "",
    difficulties: new Set<Difficulty>(),
    topics: new Set<number>(),
    sort: "frequency" as SortKey,
    direction: "descending" as SortDirection,
  };
  let windowAll: CompanyRow[] = [];
  let windowFacets: Facets = facets([]);
  let rows: CompanyRow[] = [];
  let shown = 0;

  const root = el("section", {
    className: "lce-root lce-company",
    attrs: { "aria-label": "Company interview questions" },
  });

  // Header ------------------------------------------------------------------
  const count = el("span", { className: "lce-company__count" });
  root.append(
    el("div", {
      className: "lce-company__header",
      children: [
        el("h2", {
          className: "lce-company__heading text-[16px] font-medium",
          text: "Interview questions",
        }),
        el("p", {
          className: "lce-company__meta text-xs",
          children: [
            count,
            ` · Community data, updated ${formatUpdated(meta.source.commitDate)}`,
          ],
        }),
      ],
    })
  );

  // Window tabs -------------------------------------------------------------
  const tabs = el("div", {
    className: "lce-tabs",
    attrs: { role: "tablist", "aria-label": "Time window" },
  });
  const tabButtons = new Map<WindowKey, HTMLButtonElement>();
  for (const [i, tab] of WINDOW_TABS.entries()) {
    const button = el("button", {
      className: "lce-tab text-sm",
      children: [
        tab.label,
        el("span", {
          className: "lce-tab__count text-xs",
          text: formatCount(company?.counts[i] ?? 0),
        }),
      ],
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

  // Toolbar: search · sort menu · filter menu --------------------------------
  const searchInput = el("input", {
    className: "lce-search text-sm",
    attrs: {
      type: "search",
      placeholder: "Search questions",
      "aria-label": "Search questions",
      autocomplete: "off",
    },
  });

  const sortLabel = el("span", { className: "lce-tool__label" });
  const sortButton = el("button", {
    className: "lce-tool text-sm",
    attrs: { type: "button", "aria-haspopup": "menu", "data-tool": "sort" },
    children: [icon("sort"), sortLabel],
  });
  const sortMenu = el("div", {
    className: "lce-menu",
    attrs: { id: "lce-sort-menu", role: "menu", "aria-label": "Sort by" },
  });
  const sortItems = new Map<SortKey, HTMLButtonElement>();
  for (const key of SORT_KEYS) {
    const item = el("button", {
      className: "lce-menu__item text-sm",
      attrs: { type: "button", role: "menuitemradio", "data-sort": key },
      children: [
        el("span", { className: "lce-menu__check", children: [icon("check")] }),
        SORT_LABELS[key],
      ],
    });
    item.addEventListener("click", () => {
      setSort(key, defaultDirection(key));
      sortPopover.close({ focusTrigger: true });
    });
    sortItems.set(key, item);
    sortMenu.append(item);
  }
  sortMenu.append(
    el("div", { className: "lce-menu__sep", attrs: { role: "separator" } })
  );
  const directionItems = new Map<SortDirection, HTMLButtonElement>();
  for (const direction of ["ascending", "descending"] as const) {
    const item = el("button", {
      className: "lce-menu__item text-sm",
      attrs: {
        type: "button",
        role: "menuitemradio",
        "data-direction": direction,
      },
      children: [
        el("span", { className: "lce-menu__check", children: [icon("check")] }),
        direction === "ascending" ? "Ascending" : "Descending",
      ],
    });
    item.addEventListener("click", () => {
      setSort(state.sort, direction);
      sortPopover.close({ focusTrigger: true });
    });
    directionItems.set(direction, item);
    sortMenu.append(item);
  }

  const filterBadge = el("span", {
    className: "lce-tool__badge text-xs",
    attrs: { hidden: "" },
  });
  const filterButton = el("button", {
    className: "lce-tool text-sm",
    attrs: { type: "button", "aria-haspopup": "dialog", "data-tool": "filter" },
    children: [
      icon("filter"),
      el("span", { className: "lce-tool__label", text: "Filter" }),
      filterBadge,
    ],
  });
  const filterMenu = el("div", {
    className: "lce-menu lce-menu--filter",
    attrs: {
      id: "lce-filter-menu",
      role: "dialog",
      "aria-label": "Filter questions",
    },
  });

  const sortPopover = createPopover({
    trigger: sortButton,
    panel: sortMenu,
    signal,
    onBeforeOpen: () => filterPopover.close(),
  });
  const filterPopover = createPopover({
    trigger: filterButton,
    panel: filterMenu,
    signal,
    onBeforeOpen: () => sortPopover.close(),
    onOpen: () => renderFilterMenu(),
  });

  root.append(
    el("div", {
      className: "lce-controls",
      children: [
        el("label", {
          className: "lce-search-wrap",
          children: [icon("search", "lce-search-wrap__icon"), searchInput],
        }),
        el("div", {
          className: "lce-tool-wrap",
          children: [sortButton, sortMenu],
        }),
        el("div", {
          className: "lce-tool-wrap",
          children: [filterButton, filterMenu],
        }),
      ],
    })
  );

  // Summary + active filter chips ---------------------------------------------
  const summary = el("span", { className: "lce-summary__count text-xs" });
  const chips = el("div", { className: "lce-summary__chips" });
  root.append(
    el("div", { className: "lce-summary", children: [summary, chips] })
  );

  // Table -------------------------------------------------------------------
  const headerCells = new Map<SortKey, HTMLElement>();
  function sortColumn(key: SortKey, className: string): HTMLElement {
    const button = el("button", {
      className: "lce-sort",
      attrs: { type: "button", "data-sort": key },
      children: [
        SORT_LABELS[key],
        el("span", {
          className: "lce-sort__arrow",
          attrs: { "aria-hidden": "true" },
        }),
      ],
    });
    button.addEventListener("click", () => {
      if (signal.aborted) return;
      if (state.sort === key) {
        setSort(
          key,
          state.direction === "ascending" ? "descending" : "ascending"
        );
      } else {
        setSort(key, defaultDirection(key));
      }
    });
    const cell = el("span", {
      className: `lce-col ${className}`,
      attrs: { role: "columnheader", "aria-sort": "none" },
      children: [button],
    });
    headerCells.set(key, cell);
    return cell;
  }

  const header = el("div", {
    className: "lce-company__row lce-company__head text-xs",
    attrs: { role: "row" },
    children: [
      el("span", {
        className: "lce-col lce-col--num",
        text: "#",
        attrs: { role: "columnheader" },
      }),
      sortColumn("title", "lce-col--title"),
      sortColumn("acceptance", "lce-col--acc"),
      sortColumn("difficulty", "lce-col--diff"),
      sortColumn("frequency", "lce-col--freq"),
    ],
  });
  const rowGroup = el("div", { className: "lce-company__rows" });
  const emptyText = el("span");
  const emptyReset = el("button", {
    className: "lce-link text-sm",
    text: "Clear filters",
    attrs: { type: "button" },
  });
  emptyReset.addEventListener("click", () => clearFilters());
  const empty = el("div", {
    className: "lce-company__empty text-sm",
    attrs: { hidden: "" },
    children: [emptyText, emptyReset],
  });
  const more = el("button", {
    className: "lce-more text-sm",
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

  // Behaviour -----------------------------------------------------------------
  function hasFilters(): boolean {
    return (
      state.search.trim() !== "" ||
      state.difficulties.size > 0 ||
      state.topics.size > 0
    );
  }

  function loadWindow(): void {
    windowAll = shard === null ? [] : windowRows(shard, index, state.window);
    windowFacets = facets(windowAll);
    if (filterPopover.isOpen()) renderFilterMenu();
  }

  function applyQuery(): void {
    rows =
      shard === null
        ? []
        : buildRows(shard, index, {
            window: state.window,
            search: state.search,
            difficulties: [...state.difficulties],
            topics: [...state.topics],
            sort: state.sort,
            direction: state.direction,
          });
    shown = Math.min(CHUNK, rows.length);
    rowGroup.replaceChildren(...rows.slice(0, shown).map(rowNode));
    updateStatus();
    updateSortIndicators();
    renderChips();
  }

  function setSort(key: SortKey, direction: SortDirection): void {
    if (signal.aborted) return;
    state.sort = key;
    state.direction = direction;
    applyQuery();
  }

  function clearFilters(): void {
    state.search = "";
    searchInput.value = "";
    state.difficulties.clear();
    state.topics.clear();
    if (filterPopover.isOpen()) renderFilterMenu();
    applyQuery();
  }

  function updateSortIndicators(): void {
    const arrow = state.direction === "ascending" ? "↑" : "↓";
    sortLabel.textContent = `${SORT_LABELS[state.sort]} ${arrow}`;
    sortButton.setAttribute(
      "aria-label",
      `Sort: ${SORT_LABELS[state.sort]}, ${state.direction}`
    );
    for (const [key, item] of sortItems) {
      item.setAttribute("aria-checked", key === state.sort ? "true" : "false");
    }
    for (const [direction, item] of directionItems) {
      item.setAttribute(
        "aria-checked",
        direction === state.direction ? "true" : "false"
      );
    }
    for (const [key, cell] of headerCells) {
      const active = key === state.sort;
      cell.setAttribute("aria-sort", active ? state.direction : "none");
      const button = cell.querySelector<HTMLElement>(".lce-sort")!;
      button.classList.toggle("is-active", active);
      button.querySelector(".lce-sort__arrow")!.textContent = active
        ? arrow
        : "↕";
    }
  }

  function appendChunk(): void {
    const next = rows.slice(shown, shown + CHUNK);
    rowGroup.append(...next.map(rowNode));
    shown += next.length;
    updateStatus();
  }

  function updateStatus(): void {
    const unknown = shard === null;
    count.textContent = unknown
      ? "Not tracked"
      : `${formatCount(allTimeCount)} questions reported`;

    const total = windowAll.length;
    summary.textContent =
      rows.length === total
        ? `${formatCount(total)} questions`
        : `${formatCount(rows.length)} of ${formatCount(total)} questions`;

    table.hidden = rows.length === 0;
    empty.hidden = rows.length > 0;
    if (unknown) {
      emptyText.textContent = "No community data for this company yet.";
      emptyReset.hidden = true;
    } else if (total === 0) {
      emptyText.textContent = "No questions in this window.";
      emptyReset.hidden = true;
    } else {
      emptyText.textContent = "No questions match your filters.";
      emptyReset.hidden = !hasFilters();
    }
    more.hidden = rows.length === 0 || shown >= rows.length;
    more.textContent = `Load more (${formatCount(rows.length - shown)} remaining)`;
  }

  function renderChips(): void {
    const items: HTMLElement[] = [];
    for (const difficulty of DIFFICULTIES) {
      if (!state.difficulties.has(difficulty)) continue;
      items.push(
        chip(difficulty, `lce-diff--${difficulty.toLowerCase()}`, () => {
          state.difficulties.delete(difficulty);
          syncFilterMenu();
          applyQuery();
        })
      );
    }
    for (const id of state.topics) {
      items.push(
        chip(topics[id] ?? `Topic ${id}`, "", () => {
          state.topics.delete(id);
          syncFilterMenu();
          applyQuery();
        })
      );
    }
    if (items.length > 0) {
      const clear = el("button", {
        className: "lce-link text-xs",
        text: "Clear all",
        attrs: { type: "button" },
      });
      clear.addEventListener("click", () => {
        state.difficulties.clear();
        state.topics.clear();
        syncFilterMenu();
        applyQuery();
      });
      items.push(clear);
    }
    chips.replaceChildren(...items);

    const active = state.difficulties.size + state.topics.size;
    filterBadge.hidden = active === 0;
    filterBadge.textContent = String(active);
    filterButton.classList.toggle("is-active", active > 0);
  }

  function chip(
    label: string,
    tone: string,
    onRemove: () => void
  ): HTMLElement {
    const button = el("button", {
      className: "lce-filter-chip text-xs",
      attrs: { type: "button", "aria-label": `Remove filter ${label}` },
      children: [
        el("span", { className: tone, text: label }),
        icon("close", "lce-filter-chip__x"),
      ],
    });
    button.addEventListener("click", () => {
      if (!signal.aborted) onRemove();
    });
    return button;
  }

  // Filter menu: built on open / window change, then updated in place so focus
  // and the topic search survive toggling.
  let topicQuery = "";
  const difficultyToggles = new Map<Difficulty, HTMLButtonElement>();
  const topicChecks = new Map<number, HTMLInputElement>();

  function renderFilterMenu(): void {
    difficultyToggles.clear();
    topicChecks.clear();

    const difficultyRow = el("div", { className: "lce-filter__pills" });
    for (const difficulty of DIFFICULTIES) {
      const toggle = el("button", {
        className: "lce-pill text-xs",
        attrs: {
          type: "button",
          "aria-pressed": "false",
          "data-difficulty": difficulty,
        },
        children: [
          el("span", {
            className: `lce-diff--${difficulty.toLowerCase()}`,
            text: difficulty,
          }),
          el("span", {
            className: "lce-pill__count",
            text: formatCount(windowFacets.difficulty[difficulty]),
          }),
        ],
      });
      toggle.addEventListener("click", () => {
        if (state.difficulties.has(difficulty))
          state.difficulties.delete(difficulty);
        else state.difficulties.add(difficulty);
        syncFilterMenu();
        applyQuery();
      });
      difficultyToggles.set(difficulty, toggle);
      difficultyRow.append(toggle);
    }

    // Topics present in this window, plus any selected ones that are not.
    const listed = [...windowFacets.topics];
    for (const id of state.topics) {
      if (!listed.some((t) => t.id === id)) listed.push({ id, count: 0 });
    }
    const topicList = el("div", {
      className: "lce-filter__topics",
      attrs: { role: "group", "aria-label": "Topics" },
    });
    for (const { id, count: n } of listed) {
      const name = topics[id];
      if (name === undefined) continue;
      const check = el("input", {
        attrs: { type: "checkbox", "data-topic": String(id) },
      });
      check.addEventListener("change", () => {
        if (check.checked) state.topics.add(id);
        else state.topics.delete(id);
        applyQuery();
      });
      topicChecks.set(id, check);
      const option = el("label", {
        className: "lce-filter__topic text-sm",
        attrs: { "data-name": name.toLowerCase() },
        children: [
          check,
          el("span", { className: "lce-filter__topic-name", text: name }),
          el("span", {
            className: "lce-filter__topic-count text-xs",
            text: formatCount(n),
          }),
        ],
      });
      topicList.append(option);
    }

    const topicSearch = el("input", {
      className: "lce-filter__search text-sm",
      attrs: {
        type: "text",
        placeholder: "Search topics",
        "aria-label": "Search topics",
        autocomplete: "off",
      },
    });
    topicSearch.value = topicQuery;
    const noTopics = el("p", {
      className: "lce-filter__none text-xs",
      text: "No matching topics.",
      attrs: { hidden: "" },
    });
    const filterTopics = (): void => {
      topicQuery = topicSearch.value;
      const needle = topicQuery.trim().toLowerCase();
      let visible = 0;
      for (const option of topicList.children) {
        const match =
          needle === "" ||
          (option as HTMLElement).dataset.name!.includes(needle);
        (option as HTMLElement).hidden = !match;
        if (match) visible += 1;
      }
      noTopics.hidden = visible > 0;
    };
    topicSearch.addEventListener("input", filterTopics);

    const reset = el("button", {
      className: "lce-link text-xs",
      text: "Reset",
      attrs: { type: "button" },
    });
    reset.addEventListener("click", () => {
      state.difficulties.clear();
      state.topics.clear();
      syncFilterMenu();
      applyQuery();
    });

    filterMenu.replaceChildren(
      el("div", {
        className: "lce-filter__section",
        children: [
          el("div", {
            className: "lce-filter__heading text-xs",
            children: ["Difficulty", reset],
          }),
          difficultyRow,
        ],
      }),
      el("div", {
        className: "lce-filter__section",
        children: [
          el("div", {
            className: "lce-filter__heading text-xs",
            text: "Topics",
          }),
          topicSearch,
          topicList,
          noTopics,
        ],
      })
    );
    syncFilterMenu();
    filterTopics();
  }

  function syncFilterMenu(): void {
    for (const [difficulty, toggle] of difficultyToggles) {
      toggle.setAttribute(
        "aria-pressed",
        state.difficulties.has(difficulty) ? "true" : "false"
      );
    }
    for (const [id, check] of topicChecks) check.checked = state.topics.has(id);
  }

  function selectTab(key: WindowKey): void {
    state.window = key;
    for (const [tabKey, button] of tabButtons) {
      const active = tabKey === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    }
    table.setAttribute("aria-labelledby", `lce-tab-${key}`);
    loadWindow();
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
    const currentIndex = keys.indexOf(state.window);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % keys.length;
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
    state.search = searchInput.value;
    applyQuery();
  });
  more.addEventListener("click", () => {
    if (signal.aborted) return;
    appendChunk();
  });

  selectTab(state.window);
  applyQuery();
  return root;
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
      text: row.difficulty === "Medium" ? "Med." : row.difficulty,
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
      className: "lce-freqbar__value text-xs",
      text: formatFrequency(frequency),
    })
  );
  return cell;
}

type IconName = "search" | "sort" | "filter" | "check" | "close";

/** Small original stroke icons, sized by CSS. */
function icon(name: IconName, className = "lce-icon"): SVGSVGElement {
  const shapes: Record<IconName, [string, Record<string, string>][]> = {
    search: [
      ["circle", { cx: "7", cy: "7", r: "4.75" }],
      ["path", { d: "M10.5 10.5l3.5 3.5" }],
    ],
    sort: [
      [
        "path",
        { d: "M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5" },
      ],
    ],
    filter: [["path", { d: "M2.5 3.5h11l-4.25 5v4l-2.5 1v-5z" }]],
    check: [["path", { d: "M3.5 8.5l3 3 6-7" }]],
    close: [["path", { d: "M4.5 4.5l7 7M11.5 4.5l-7 7" }]],
  };
  return svg("0 0 16 16", shapes[name], className);
}
