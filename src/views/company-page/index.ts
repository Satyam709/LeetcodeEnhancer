import type { DataLayer } from "../../lib/data/loader";
import { DataUnavailable } from "../../lib/data/loader";
import type { CompanyShard, Index, Meta } from "../../lib/data/types";
import { debugLog } from "../../lib/debug";
import { waitFor, waitUntil } from "../../lib/dom/readiness";
import { COMPANY_WALL, findCompanyTakeover } from "../../lib/dom/selectors";
import { watchDom } from "../../lib/dom/watch";
import { createCompanyView } from "./view";

export interface CompanyViewDeps {
  url: URL;
  data: DataLayer;
  /** Anchor readiness budget; tests shorten it. Defaults to 10 s. */
  timeoutMs?: number;
}

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
    await waitFor(COMPANY_WALL, {
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
  let topics: string[];
  try {
    [index, shard, meta, topics] = await Promise.all([
      deps.data.index(),
      deps.data.company(slug),
      deps.data.meta(),
      // Topics only power the filter menu; the list works without them.
      deps.data.topics().catch(() => []),
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

  const root = createCompanyView({ slug, index, shard, meta, topics, signal });

  // Hide the dead toolbar + locked wall instead of detaching them: React keeps
  // its own children, so a later re-render cannot hit a missing-node error.
  // The wrapper that also holds the working free-question row stays visible.
  const hidden = new Map<HTMLElement, string>();
  const hide = (node: HTMLElement): void => {
    if (!hidden.has(node)) hidden.set(node, node.style.display);
    node.style.display = "none";
  };

  // Idempotent: React may re-render the column (theme switch, sign-in state,
  // the free-question dialog) and drop our view or re-show the wall. Re-attach
  // the same root so the user's tab, search and sort survive.
  const apply = (): void => {
    if (!companyPageMatches(slug)) return;
    const current = findCompanyTakeover(document);
    if (current === null) return;
    const toolbar = Array.from(current.target.children).find(
      (child) =>
        child !== root &&
        child.querySelector('input[placeholder="Search questions"]') !== null
    );
    if (toolbar !== undefined) hide(toolbar as HTMLElement);
    hide(current.wall as HTMLElement);
    if (root.parentElement !== current.target) current.target.append(root);
  };

  apply();
  const stopWatching = watchDom(apply, { signal });
  setRestore(() => {
    stopWatching();
    root.remove();
    for (const [node, display] of hidden) node.style.display = display;
    hidden.clear();
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
