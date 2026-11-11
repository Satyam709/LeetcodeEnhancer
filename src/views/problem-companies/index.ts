import type { DataLayer, ProblemCompanyEntry } from "../../lib/data/loader";
import { DataUnavailable } from "../../lib/data/loader";
import type {
  Index,
  IndexCompany,
  Meta,
  WindowKey,
} from "../../lib/data/types";
import { debugLog } from "../../lib/debug";
import { el, svg } from "../../lib/dom/html";
import { waitUntil } from "../../lib/dom/readiness";
import {
  findLockedCompaniesAccordion,
  findLockedCompaniesChip,
} from "../../lib/dom/selectors";
import { watchDom } from "../../lib/dom/watch";
import { formatUpdated } from "../company-page/model";

export interface ProblemCompaniesDeps {
  url: URL;
  data: DataLayer;
  /** Anchor readiness budget; tests shorten it. Defaults to 10 s. */
  timeoutMs?: number;
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

/** Tags shown per group before a "Show all" toggle… */
const COLLAPSED_TAGS = 24;
/** …which only appears when it hides a meaningful number of tags. */
const COLLAPSE_AFTER = 36;

/** Copied from the native problem chip row so our chip matches exactly. */
const NATIVE_CHIP_CLASS =
  "relative inline-flex items-center justify-center text-caption px-2 py-1 gap-1 rounded-full bg-fill-secondary cursor-pointer transition-colors hover:bg-fill-primary hover:text-text-primary text-sd-secondary-foreground hover:opacity-80";

/** Copied from the native topic tags under the statement. */
const NATIVE_TAG_CLASS =
  "no-underline hover:text-current relative inline-flex items-center justify-center text-caption px-2 py-1 gap-1 rounded-full bg-fill-secondary text-text-secondary";

/** Copied from the native accordion items (Topics, Hint 1, …). */
const NATIVE_ACC_HEADER_CLASS =
  "group flex cursor-pointer items-center transition-colors text-label-2 dark:text-dark-label-2 hover:text-label-1 dark:hover:text-dark-label-1";
const NATIVE_ACC_LABEL_CLASS =
  "text-body text-text-primary dark:text-text-primary";
const NATIVE_ACC_CHEVRON_CLASS =
  "text-[24px] transition-colors text-gray-4 dark:text-dark-gray-4 group-hover:text-gray-5 dark:group-hover:text-dark-gray-5";

const WINDOW_LABEL: Record<WindowKey, string> = {
  d30: "last 30 days",
  d3m: "last 3 months",
  d6m: "last 6 months",
  g6m: "more than 6 months ago",
  all: "at some point",
};

/**
 * LeetCode's company pages carry a `favoriteSlug` param in their canonical URL
 * (see the sign-in `next=` links). Linking straight to it avoids the app pushing
 * a second history entry.
 */
function companyHref(slug: string): string {
  const encoded = encodeURIComponent(slug);
  return `/company/${encoded}/?favoriteSlug=${encoded}-thirty-days`;
}

/**
 * `/problems/{slug}` — unlock the two premium Companies entry points the way
 * LeetCode itself renders them for premium users:
 *
 * - the accordion item under the statement (next to Topics / Hints) becomes a
 *   working item listing companies by recency;
 * - the chip at the top becomes a working chip that, like the native Topics
 *   chip, opens that item and scrolls it into view.
 *
 * Only positively locked UI is touched, and each piece is kept in place while
 * React re-renders the page (see `watchDom`). Premium accounts have no locks,
 * so their native UI is left alone.
 */
export function mountProblemCompanies(deps: ProblemCompaniesDeps): () => void {
  const controller = new AbortController();
  let restore: (() => void) | null = null;

  void enhance(deps, controller.signal, (fn) => {
    restore = fn;
  }).catch((err: unknown) => {
    if (!controller.signal.aborted) {
      debugLog("lce:problem companies enhance failed", err);
    }
  });

  return () => {
    controller.abort();
    restore?.();
  };
}

async function enhance(
  deps: ProblemCompaniesDeps,
  signal: AbortSignal,
  setRestore: (fn: () => void) => void
): Promise<void> {
  const slug = problemSlug(deps.url.pathname);
  if (slug === null) return;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  // Load data and wait for a locked entry point in parallel.
  const dataPromise = Promise.all([
    deps.data.companiesForProblem(slug),
    deps.data.index(),
    deps.data.meta().catch(() => null),
  ]);
  dataPromise.catch(() => undefined);

  try {
    await waitUntil(
      () =>
        findLockedCompaniesChip(document) !== null ||
        findLockedCompaniesAccordion(document) !== null,
      { timeoutMs, signal }
    );
  } catch {
    // No locks: premium account or a different layout. Leave it.
    return;
  }
  if (signal.aborted) return;

  let entries: ProblemCompanyEntry[];
  let index: Index;
  let meta: Meta | null;
  try {
    [entries, index, meta] = await dataPromise;
  } catch (err) {
    if (!(err instanceof DataUnavailable)) {
      debugLog("lce:problem companies data failed", err);
    }
    return;
  }
  if (signal.aborted) return;

  const groups = groupCompanies(entries, index);
  if (groups.total === 0) return;

  // On a problem → problem SPA navigation the old statement can still be in
  // the document. Wait until the page's own title link points at our slug.
  try {
    await waitUntil(() => problemPageMatches(slug), { timeoutMs, signal });
  } catch {
    return;
  }
  if (signal.aborted) return;

  const accordion = createAccordion(groups, meta, signal);
  const chip = createChip(signal, () => {
    accordion.setOpen(true);
    accordion.root.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  const chipSlot = keepReplacing({
    find: () => findLockedCompaniesChip(document)?.chip ?? null,
    ours: chip,
    place: (native) => native.before(chip),
  });
  const accSlot = keepReplacing({
    find: () => findLockedCompaniesAccordion(document)?.item ?? null,
    ours: accordion.root,
    place: (native) => native.after(accordion.root),
  });

  // The chip only makes sense when there is an item to open.
  const apply = (): void => {
    if (!problemPageMatches(slug)) return;
    accSlot.ensure();
    if (accordion.root.isConnected) chipSlot.ensure();
    else chipSlot.release();
  };
  apply();
  const stopWatching = watchDom(apply, { signal });

  setRestore(() => {
    stopWatching();
    chipSlot.release();
    accSlot.release();
  });
}

interface Replacement {
  /** Hide the native node and put ours in its place, if not already so. */
  ensure(): void;
  /** Remove ours and show the native node again. */
  release(): void;
}

/**
 * Keep `ours` standing in for a native node that React may re-render at any
 * time. The native node is hidden in place (never detached, React owns it);
 * when React replaces or re-shows it, the next `ensure()` re-attaches.
 */
function keepReplacing(opts: {
  find: () => HTMLElement | null;
  ours: HTMLElement;
  place: (native: HTMLElement) => void;
}): Replacement {
  let native: HTMLElement | null = null;
  let previousDisplay = "";

  const release = (): void => {
    opts.ours.remove();
    if (native !== null) native.style.display = previousDisplay;
    native = null;
  };

  const ensure = (): void => {
    if (
      native !== null &&
      native.isConnected &&
      native.style.display === "none" &&
      opts.ours.isConnected &&
      opts.ours.parentElement === native.parentElement
    ) {
      return;
    }
    release();
    const found = opts.find();
    if (found === null) return;
    native = found;
    previousDisplay = found.style.display;
    opts.place(found);
    found.style.display = "none";
  };

  return { ensure, release };
}

interface CompanyGroups {
  /** Asked in the last six months, with the most recent window. */
  recent: { company: IndexCompany; window: WindowKey }[];
  /** Only asked more than six months ago (or undated). */
  earlier: { company: IndexCompany; window: WindowKey }[];
  total: number;
}

const RECENT: WindowKey[] = ["d30", "d3m", "d6m"];

export function groupCompanies(
  entries: ProblemCompanyEntry[],
  index: Index
): CompanyGroups {
  const best = new Map<string, { company: IndexCompany; window: WindowKey }>();
  for (const entry of entries) {
    const company = index.companies[entry.companyIdx];
    if (company === undefined || entry.windows.length === 0) continue;
    // WINDOW_KEYS order is most recent first, and windows arrive in that order.
    const window = entry.windows[0]!;
    const seen = best.get(company.slug);
    if (seen === undefined || rank(window) < rank(seen.window)) {
      best.set(company.slug, { company, window });
    }
  }
  const byName = (
    a: { company: IndexCompany },
    b: { company: IndexCompany }
  ): number => collator.compare(a.company.name, b.company.name);
  const all = [...best.values()];
  const recent = all.filter((e) => RECENT.includes(e.window)).sort(byName);
  const earlier = all.filter((e) => !RECENT.includes(e.window)).sort(byName);
  return { recent, earlier, total: all.length };
}

function rank(window: WindowKey): number {
  return ["d30", "d3m", "d6m", "g6m", "all"].indexOf(window);
}

function createChip(signal: AbortSignal, onClick: () => void): HTMLElement {
  const chip = el("button", {
    className: `lce-root lce-chip ${NATIVE_CHIP_CLASS}`,
    attrs: { type: "button", "aria-controls": "lce-companies" },
    children: [buildingIcon("lce-chip__icon"), "Companies"],
  });
  chip.addEventListener("click", () => {
    if (!signal.aborted) onClick();
  });
  return chip;
}

interface Accordion {
  root: HTMLElement;
  setOpen(open: boolean): void;
}

function createAccordion(
  groups: CompanyGroups,
  meta: Meta | null,
  signal: AbortSignal
): Accordion {
  const chevron = svg(
    "0 0 24 24",
    [["path", { d: "M7 10l5 5 5-5" }]],
    "lce-acc__chevron"
  );
  const header = el("button", {
    className: `lce-acc__header ${NATIVE_ACC_HEADER_CLASS}`,
    attrs: {
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "lce-companies-body",
    },
    children: [
      el("span", {
        className: "lce-acc__title flex-1 text-sm leading-[22px]",
        children: [
          buildingIcon("lce-acc__icon"),
          el("span", { className: NATIVE_ACC_LABEL_CLASS, text: "Companies" }),
          el("span", {
            className: "lce-acc__count",
            text: String(groups.total),
          }),
        ],
      }),
      el("span", { className: NATIVE_ACC_CHEVRON_CLASS, children: [chevron] }),
    ],
  });

  const content = el("div", { className: "lce-acc__content" });
  appendGroup(content, "Last 6 months", groups.recent);
  appendGroup(
    content,
    groups.recent.length > 0 ? "Earlier" : "More than 6 months ago",
    groups.earlier
  );
  if (meta !== null) {
    content.append(
      el("p", {
        className: "lce-acc__source text-xs",
        text: `Community data · updated ${formatUpdated(meta.source.commitDate)}`,
      })
    );
  }

  const body = el("div", {
    className: "lce-acc__body",
    attrs: { id: "lce-companies-body", role: "region", hidden: "" },
    children: [content],
  });

  const root = el("div", {
    className: "lce-root lce-acc",
    attrs: { id: "lce-companies" },
    children: [
      el("div", { className: "flex flex-col", children: [header, body] }),
    ],
  });

  const setOpen = (open: boolean): void => {
    body.hidden = !open;
    header.setAttribute("aria-expanded", open ? "true" : "false");
    root.classList.toggle("is-open", open);
  };
  header.addEventListener("click", () => {
    if (!signal.aborted) setOpen(body.hasAttribute("hidden"));
  });

  return { root, setOpen };
}

function appendGroup(
  parent: HTMLElement,
  label: string,
  entries: { company: IndexCompany; window: WindowKey }[]
): void {
  if (entries.length === 0) return;

  const tags = entries.map(({ company, window }) =>
    el("a", {
      className: `lce-tag ${NATIVE_TAG_CLASS}`,
      text: company.name,
      attrs: {
        href: companyHref(company.slug),
        target: "_blank",
        rel: "noopener noreferrer",
        title: `${company.name}: asked ${WINDOW_LABEL[window]}`,
      },
    })
  );
  const list = el("div", { className: "lce-acc__tags", children: tags });

  const section = el("section", {
    className: "lce-acc__group",
    children: [
      el("h4", {
        className: "lce-acc__label text-xs",
        children: [
          label,
          el("span", {
            className: "lce-acc__label-count",
            text: String(entries.length),
          }),
        ],
      }),
      list,
    ],
  });

  if (entries.length > COLLAPSE_AFTER) {
    for (const tag of tags.slice(COLLAPSED_TAGS)) tag.hidden = true;
    const more = el("button", {
      className: "lce-acc__more text-xs",
      text: `Show all ${entries.length}`,
      attrs: { type: "button" },
    });
    more.addEventListener("click", () => {
      for (const tag of tags) tag.hidden = false;
      more.remove();
    });
    section.append(more);
  }
  parent.append(section);
}

/** A simple building outline (original artwork), sized by CSS. */
function buildingIcon(className: string): SVGSVGElement {
  return svg(
    "0 0 16 16",
    [
      ["path", { d: "M3 14.5V2.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v12" }],
      ["path", { d: "M11 6.5h2a1 1 0 0 1 1 1v7" }],
      ["path", { d: "M1.5 14.5h13" }],
      ["path", { d: "M5.5 4.5h1M8 4.5h.5M5.5 7h1M8 7h.5M5.5 9.5h1M8 9.5h.5" }],
      ["path", { d: "M6.5 14.5v-2h2v2" }],
    ],
    className
  );
}

/** True when the page title link already belongs to `slug`. */
function problemPageMatches(slug: string): boolean {
  const anchor = document.querySelector(
    '[role="heading"] a[href^="/problems/"]'
  );
  if (anchor === null) return true;
  const href = anchor.getAttribute("href") ?? "";
  try {
    const pathname = new URL(href, "https://leetcode.com").pathname;
    return (
      pathname === `/problems/${slug}/` || pathname === `/problems/${slug}`
    );
  } catch {
    return true;
  }
}

function problemSlug(pathname: string): string | null {
  const match = /^\/problems\/([^/]+)\/?/.exec(pathname);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}
