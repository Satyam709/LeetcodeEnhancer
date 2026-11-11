import type { DataLayer } from "../../lib/data/loader";
import { DataUnavailable } from "../../lib/data/loader";
import type { Index } from "../../lib/data/types";
import { debugLog } from "../../lib/debug";
import { el } from "../../lib/dom/html";
import { waitFor } from "../../lib/dom/readiness";
import { watchDom } from "../../lib/dom/watch";
import {
  findLockedFrequencySlot,
  problemsetRows,
} from "../../lib/dom/selectors";

export interface ProblemsetDeps {
  data: DataLayer;
  /** Anchor readiness budget; tests shorten it. Defaults to 10 s. */
  timeoutMs?: number;
}

interface CellState {
  cell: HTMLElement;
  /** The row's href when enhanced; a recycled row points somewhere else. */
  href: string | null;
  /** Native children hidden for this cell, restored if the row is re-rendered. */
  hidden: HTMLElement[];
}

/**
 * `/problemset` and `/problem-list/*` — fill the premium-locked frequency cell
 * with our derived score. Rows without data keep LeetCode's native widget.
 *
 * LeetCode's list is React-managed and re-renders every row when a new page of
 * results loads. `watchDom` re-applies before the next paint, so the locked
 * native widget never flashes. Each pass re-checks every row: a row that lost
 * our cell, re-showed a native child, or was recycled for another problem is
 * enhanced again.
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

  if (problemsetRows(document).length === 0) return;

  // React owns the native slot children, so we hide them in place instead of
  // replacing them. The weak map remembers the pre-hide value: a later
  // re-render must not make "hidden" look like the original display.
  const originalDisplay = new WeakMap<HTMLElement, string>();
  const hiddenNodes = new Set<HTMLElement>();
  const states = new WeakMap<Element, CellState>();
  const cells = new Set<HTMLElement>();

  const hide = (node: HTMLElement): void => {
    if (!originalDisplay.has(node)) {
      originalDisplay.set(node, node.style.display);
    }
    hiddenNodes.add(node);
    node.style.display = "none";
  };

  const clearRow = (row: Element): void => {
    const state = states.get(row);
    if (state === undefined) return;
    state.cell.remove();
    cells.delete(state.cell);
    for (const node of state.hidden) {
      const display = originalDisplay.get(node);
      if (display !== undefined) node.style.display = display;
    }
    states.delete(row);
  };

  /** Still enhanced exactly as recorded: same problem, our cell is the only visible child. */
  const intact = (row: Element, state: CellState): boolean => {
    if (state.href !== row.getAttribute("href")) return false;
    const slot = state.cell.parentElement;
    if (slot === null || !row.contains(slot)) return false;
    for (const child of slot.children) {
      if (child === state.cell) continue;
      if ((child as HTMLElement).style.display !== "none") return false;
    }
    return true;
  };

  const ensureRow = (row: Element): void => {
    const state = states.get(row);
    if (state !== undefined && intact(row, state)) return;

    clearRow(row);
    const slug = rowSlug(row);
    if (slug === null) return;
    const score = index.problems[slug]?.freqScore;
    if (typeof score !== "number" || !Number.isFinite(score)) return;

    const found = findLockedFrequencySlot(row);
    if (found === null) return;

    const hidden: HTMLElement[] = [];
    for (const child of Array.from(found.slot.children)) {
      const node = child as HTMLElement;
      hide(node);
      hidden.push(node);
    }

    const cell = frequencyCell(score);
    found.slot.append(cell);
    cells.add(cell);
    states.set(row, { cell, href: row.getAttribute("href"), hidden });
  };

  const apply = (): void => {
    if (signal.aborted) return;
    for (const row of problemsetRows(document)) ensureRow(row);
  };

  apply();
  const stopWatching = watchDom(apply, { signal });

  setDispose(() => {
    stopWatching();
    for (const cell of cells) cell.remove();
    cells.clear();
    for (const node of hiddenNodes) {
      node.style.display = originalDisplay.get(node) ?? "";
    }
    hiddenNodes.clear();
  });
}

function rowSlug(row: Element): string | null {
  const href = row.getAttribute("href");
  if (href === null) return null;
  let pathname: string;
  try {
    pathname = new URL(href, "https://leetcode.com").pathname;
  } catch {
    return null;
  }
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
    className: "lce-root lce-freqcell",
    attrs: {
      title: `Derived frequency ${score}/100 — community company data`,
    },
  });
  cell.append(
    el("span", {
      className: "lce-sr-only",
      text: `Derived frequency ${score} out of 100`,
    }),
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
