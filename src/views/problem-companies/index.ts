import type { DataLayer, ProblemCompanyEntry } from "../../lib/data/loader";
import { DataUnavailable } from "../../lib/data/loader";
import type { Index, IndexCompany } from "../../lib/data/types";
import { debugLog } from "../../lib/debug";
import { el } from "../../lib/dom/html";
import { waitFor, waitUntil } from "../../lib/dom/readiness";
import {
  PREMIUM_LOCK_IMG,
  findLockedCompaniesChip,
} from "../../lib/dom/selectors";

export interface ProblemCompaniesDeps {
  url: URL;
  data: DataLayer;
  /** Anchor readiness budget; tests shorten it. Defaults to 10 s. */
  timeoutMs?: number;
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

/**
 * `/problems/{slug}` — turn the premium-locked Companies chip into a real
 * native-style chip with an inline recency panel. Premium accounts have no
 * lock on the chip, so the native interaction is left untouched.
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

  try {
    await waitFor(PREMIUM_LOCK_IMG, {
      timeoutMs: deps.timeoutMs ?? 10_000,
      signal,
    });
  } catch {
    // No premium locks on the page: premium account or a different layout.
    return;
  }
  if (signal.aborted) return;

  let entries: ProblemCompanyEntry[];
  let index: Index;
  try {
    [entries, index] = await Promise.all([
      deps.data.companiesForProblem(slug),
      deps.data.index(),
    ]);
  } catch (err) {
    if (!(err instanceof DataUnavailable)) {
      debugLog("lce:problem companies data failed", err);
    }
    return;
  }
  if (signal.aborted) return;

  // On a problem → problem SPA navigation the old title/chip row can still be
  // in the document. Wait until the page's own title link points at our slug.
  try {
    await waitUntil(() => problemPageMatches(slug), {
      timeoutMs: deps.timeoutMs ?? 10_000,
      signal,
    });
  } catch {
    return;
  }
  if (signal.aborted) return;

  // Re-find after the await: React may have re-rendered the chip row meanwhile.
  const found = findLockedCompaniesChip(document);
  if (found === null) return;

  const companies: CompanyWithWindows[] = [];
  for (const entry of entries) {
    const company = index.companies[entry.companyIdx];
    if (company === undefined) continue;
    companies.push({ company, windows: entry.windows });
  }
  if (companies.length === 0) return;

  const lastSix = companies.filter(
    (entry) =>
      entry.windows.includes("d30") ||
      entry.windows.includes("d3m") ||
      entry.windows.includes("d6m")
  );
  const moreThanSix = companies.filter((entry) =>
    entry.windows.includes("g6m")
  );
  const allTime = companies.filter((entry) => entry.windows.includes("all"));
  if (lastSix.length + moreThanSix.length + allTime.length === 0) return;

  const { chip, row } = found;
  const previousDisplay = chip.style.display;
  const totalCompanies = new Set(
    companies.map((entry) => entry.company.slug)
  ).size;

  const button = el("button", {
    className: "lce-root lce-chip lce-chip--companies",
    attrs: {
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "lce-companies-panel",
    },
    children: [
      "Companies",
      el("span", {
        className: "lce-chip__count",
        text: String(totalCompanies),
      }),
    ],
  });

  const panel = el("div", {
    className: "lce-root lce-panel",
    attrs: { id: "lce-companies-panel", hidden: "" },
  });

  appendSection(panel, "Last 6 months", lastSix);
  appendSection(panel, "More than 6 months", moreThanSix);
  appendSection(panel, "All time", allTime);

  button.addEventListener("click", () => {
    if (signal.aborted) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });

  const cleanup = (): void => {
    chip.style.display = previousDisplay;
    button.remove();
    panel.remove();
  };

  try {
    row.insertBefore(button, chip);
    row.insertAdjacentElement("afterend", panel);
    chip.style.display = "none";
  } catch (err) {
    cleanup();
    throw err;
  }
  setRestore(cleanup);
}

type CompanyWithWindows = {
  company: IndexCompany;
  windows: ProblemCompanyEntry["windows"];
};

function appendSection(
  panel: HTMLElement,
  label: string,
  companies: CompanyWithWindows[]
): void {
  if (companies.length === 0) return;

  const unique = new Map<string, IndexCompany>();
  for (const entry of companies) unique.set(entry.company.slug, entry.company);
  const sorted = [...unique.values()].sort((a, b) =>
    collator.compare(a.name, b.name)
  );

  const title = el("h4", {
    className: "lce-panel__title",
    children: [
      label,
      el("span", {
        className: "lce-panel__count",
        text: String(sorted.length),
      }),
    ],
  });
  const chips = el("div", {
    className: "lce-panel__chips",
    children: sorted.map((company) =>
      el("a", {
        className: "lce-chip lce-chip--sm",
        text: company.name,
        attrs: { href: `/company/${company.slug}/` },
      })
    ),
  });
  panel.append(
    el("section", {
      className: "lce-panel__section",
      children: [title, chips],
    })
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
    return pathname === `/problems/${slug}/` || pathname === `/problems/${slug}`;
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
