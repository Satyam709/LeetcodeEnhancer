/**
 * Every LeetCode selector/finder the injected views rely on — one place, each
 * with the shape it expects. Anchors are structural or artifact-based, never
 * CSS-module hashes: the wall class is matched by prefix, and premium state is
 * detected from the native lock icons.
 */

export const COMPANY_CONTAINER = ".company-container";
export const PREMIUM_LOCK_IMG = 'img[alt="premium lock icon"]';

export interface CompanyTakeover {
  container: Element;
  /** Direct child of the container that owns the wall (the right column). */
  target: Element;
  wall: Element;
}

/**
 * `/company/{slug}`: the premium wall card (`company_subscribeContainer__<hash>`)
 * sits in the right column, next to the native left company card. Returns the
 * column to replace and the wall that proves the list is locked.
 */
export function findCompanyTakeover(root: ParentNode): CompanyTakeover | null {
  for (const wall of root.querySelectorAll(
    '[class*="company_subscribeContainer"]'
  )) {
    const text = (wall.textContent ?? "").toLowerCase();
    const hasSignal =
      text.includes("unlock") ||
      text.includes("premium") ||
      wall.querySelector('a[href*="subscribe"]') !== null;
    if (!hasSignal) continue;

    const container = wall.closest(COMPANY_CONTAINER);
    if (container === null) continue;

    let target: Element | null = wall;
    while (target !== null && target.parentElement !== container) {
      target = target.parentElement;
    }
    if (target === null) continue;

    return { container, target, wall };
  }
  return null;
}

export interface LockedCompaniesChip {
  chip: Element;
  /** The `flex gap-1` row of problem chips (Easy | Topics | Companies | …). */
  row: Element;
}

/**
 * `/problems/{slug}`: the native Companies chip on a free account contains a
 * premium lock image. Premium accounts render a working chip without the lock,
 * so a missing lock means "leave the native UI alone".
 */
export function findLockedCompaniesChip(
  root: ParentNode
): LockedCompaniesChip | null {
  for (const label of root.querySelectorAll("span, div")) {
    if (label.childElementCount !== 0) continue;
    if ((label.textContent ?? "").trim() !== "Companies") continue;

    let chip: Element | null = label.parentElement;
    let depth = 0;
    while (
      chip !== null &&
      depth < 3 &&
      chip.querySelector(PREMIUM_LOCK_IMG) === null
    ) {
      chip = chip.parentElement;
      depth += 1;
    }
    if (chip === null || chip.querySelector(PREMIUM_LOCK_IMG) === null) continue;

    const row = chip.parentElement;
    if (row === null) continue;
    if (!row.classList.contains("flex") || !row.classList.contains("gap-1")) {
      continue;
    }
    return { chip, row };
  }
  return null;
}

/**
 * `/problemset`, `/problem-list/*`: each row is an `<a>` to the exact problem
 * pathname (daily-question banner links carry a query string and are excluded).
 */
export function problemsetRows(root: ParentNode): HTMLAnchorElement[] {
  const rows: HTMLAnchorElement[] = [];
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/problems/"]'
  )) {
    const href = anchor.getAttribute("href");
    if (href === null) continue;
    const url = new URL(href, "https://leetcode.com");
    if (!/^\/problems\/[^/]+\/?$/.test(url.pathname)) continue;
    rows.push(anchor);
  }
  return rows;
}

export interface LockedFrequencySlot {
  /** The 8-bar native widget that is replaced when we have data. */
  slot: Element;
}

/**
 * The problemset frequency widget is a row of 8 placeholder bars plus a lock
 * icon for free accounts. Premium accounts show real bars with no lock.
 */
export function findLockedFrequencySlot(
  row: Element
): LockedFrequencySlot | null {
  const lock = row.querySelector("svg.fa-lock-keyhole");
  if (lock === null) return null;

  let slot: Element | null = lock.parentElement;
  let depth = 0;
  while (slot !== null && depth < 3) {
    if (
      slot.classList.contains("relative") &&
      slot.classList.contains("flex") &&
      slot.classList.contains("cursor-pointer")
    ) {
      return { slot };
    }
    slot = slot.parentElement;
    depth += 1;
  }
  return null;
}
