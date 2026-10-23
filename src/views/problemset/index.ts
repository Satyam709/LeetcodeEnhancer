import type { DataLayer } from "../../lib/data/loader";
import { DataUnavailable } from "../../lib/data/loader";
import type { Index } from "../../lib/data/types";
import { debugLog } from "../../lib/debug";
import { el } from "../../lib/dom/html";
import { waitFor } from "../../lib/dom/readiness";
import {
  findLockedFrequencySlot,
  problemsetRows,
} from "../../lib/dom/selectors";

export interface ProblemsetDeps {
  data: DataLayer;
  /** Anchor readiness budget; tests shorten it. Defaults to 10 s. */
  timeoutMs?: number;
}

/**
 * `/problemset` and `/problem-list/*` — fill the premium-locked frequency cell
 * with our derived score. Rows without data keep LeetCode's native widget, and
 * a row added later (pagination) is enhanced by a child-list observer.
 */
export function mountProblemsetFrequency(deps: ProblemsetDeps): () => void {
  const controller = new AbortController();
  let dispose: (() => void) | null = null;

  void enhance(deps, controller.signal, (fn) => {
    dispose = fn;
  }).catch((err: unknown) => {
    if (!controller.signal.aborted) {
      debugLog("lce:problemset enhance failed", err);
    }
  });

  return () => {
    controller.abort();
    dispose?.();
  };
}

async function enhance(
  deps: ProblemsetDeps,
  signal: AbortSignal,
  setDispose: (fn: () => void) => void
): Promise<void> {
  try {
    // Table rows carry the problem id; the daily-question banner does not.
    await waitFor('a[href^="/problems/"][id]', {
      timeoutMs: deps.timeoutMs ?? 10_000,
      signal,
    });
  } catch {
    return;
  }
  if (signal.aborted) return;

  let index: Index;
  try {
    index = await deps.data.index();
  } catch (err) {
    if (!(err instanceof DataUnavailable)) {
      debugLog("lce:problemset data failed", err);
    }
    return;
  }
  if (signal.aborted) return;

  const rows = problemsetRows(document);
  const container = rows[0]?.parentElement ?? null;
  if (container === null) return;

  const processed = new WeakSet<Element>();
  const restores: (() => void)[] = [];

  const enhanceRow = (row: Element): void => {
    if (processed.has(row)) return;
    processed.add(row);

    const slug = rowSlug(row);
    if (slug === null) return;
    const problem = index.problems[slug];
    if (problem === undefined) return;
    const score = problem.freqScore;
    if (typeof score !== "number" || !Number.isFinite(score)) return;

    const found = findLockedFrequencySlot(row);
    if (found === null) return;

    const original = Array.from(found.slot.childNodes);
    found.slot.replaceChildren(frequencyCell(score));
    restores.push(() => {
      // React may have recycled this slot; only touch it while our cell lives.
      if (found.slot.querySelector(".lce-freqcell") !== null) {
        found.slot.replaceChildren(...original);
      }
    });
  };

  const enhanceAll = (): void => {
    for (const row of problemsetRows(document)) enhanceRow(row);
  };

  enhanceAll();

  const observer = new MutationObserver(() => {
    if (!signal.aborted) enhanceAll();
  });
  observer.observe(container, { childList: true });

  setDispose(() => {
    observer.disconnect();
    for (const restore of restores) restore();
  });
}

function rowSlug(row: Element): string | null {
  const href = row.getAttribute("href");
  if (href === null) return null;
  const pathname = new URL(href, "https://leetcode.com").pathname;
  const match = /^\/problems\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

function frequencyCell(score: number): HTMLElement {
  const percent = Math.max(0, Math.min(100, score));
  const cell = el("span", {
    className: "lce-freqcell",
    attrs: {
      title: `Derived frequency ${score}/100 — community company data`,
    },
  });
  cell.append(
    el("span", {
      className: "lce-freqcell__track",
      children: [
        el("span", {
          className: "lce-freqcell__fill",
          attrs: { style: `width:${percent}%` },
        }),
      ],
    })
  );
  return cell;
}
