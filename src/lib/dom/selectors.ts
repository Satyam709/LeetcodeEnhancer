/**
 * Every LeetCode selector/finder the injected views rely on — one place, each
 * with the shape it expects. Anchors are structural or artifact-based, never
 * CSS-module hashes: the wall class is matched by prefix, and premium state is
 * detected from the native lock icons.
 */

export const COMPANY_CONTAINER = ".company-container";
/**
 * The company-page premium wall. Its CSS-module class has shipped as both
 * `company_subscribeContainer__<hash>` and `<HASH>_subscribeContainer`, so only
 * the stable `subscribeContainer` part is matched.
 */
export const COMPANY_WALL = '[class*="subscribeContainer"]';
export const PREMIUM_LOCK_IMG = 'img[alt="premium lock icon"]';

export interface CompanyTakeover {
  container: Element;
  /** Direct child of the container that owns the wall (the right column). */
  target: Element;
  wall: Element;
}

/**
 * `/company/{slug}`: the premium wall card (see `COMPANY_WALL`)
 * sits in the right column, next to the native left company card. Returns the
 * column to replace and the wall that proves the list is locked.
 */
export function findCompanyTakeover(root: ParentNode): CompanyTakeover | null {
  for (const wall of root.querySelectorAll(COMPANY_WALL)) {
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
  chip: HTMLElement;
  /** The `flex gap-1` row of problem chips (Easy | Topics | Companies | …). */
  row: HTMLElement;
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
    if (chip === null || chip.querySelector(PREMIUM_LOCK_IMG) === null)
      continue;

    const row = chip.parentElement;
    if (row === null) continue;
    if (!row.classList.contains("flex") || !row.classList.contains("gap-1")) {
      continue;
    }
    return { chip: chip as HTMLElement, row: row as HTMLElement };
  }
  return null;
}

export interface LockedCompaniesAccordion {
  /** The accordion item (a sibling of the Topics/Hint items, between `<hr>`s). */
  item: HTMLElement;
  /** The clickable header row; its chevron is reused for our item. */
  header: HTMLElement;
}

/**
 * `/problems/{slug}`: below the statement, Topics / Companies / Hints / Similar
 * Questions are accordion items. On a free account the Companies item has a
 * gold `premium-text-*` label and a lock icon; premium accounts get a plain
 * label, so the gold label is the positive locked signal.
 */
export function findLockedCompaniesAccordion(
  root: ParentNode
): LockedCompaniesAccordion | null {
  for (const label of root.querySelectorAll('[class*="premium-text"]')) {
    if ((label.textContent ?? "").trim() !== "Companies") continue;
    // The chip at the top shares the label class but is not a `group` header.
    const header = label.closest<HTMLElement>(".group.cursor-pointer");
    if (header === null || header.querySelector("img") === null) continue;
    const item = header.parentElement?.parentElement;
    if (item == null || item.parentElement === null) continue;
    return { item, header };
  }
  return null;
}

/**
 * `/problemset`, `/problem-list/*`: each row is an `<a>` to the exact problem
 * pathname. Calendar/daily links carry a query string and are excluded; the
 * remaining anchors are grouped by parent, and the largest group is the list
 * (so a stray "next problem" link never moves the pagination observer).
 */
export function problemsetRows(root: ParentNode): HTMLAnchorElement[] {
  const groups = new Map<Element, HTMLAnchorElement[]>();
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/problems/"]'
  )) {
    const href = anchor.getAttribute("href");
    if (href === null || href.includes("?")) continue;
    let pathname: string;
    try {
      pathname = new URL(href, "https://leetcode.com").pathname;
    } catch {
      continue;
    }
    if (!/^\/problems\/[^/]+\/?$/.test(pathname)) continue;
    const parent = anchor.parentElement;
    if (parent === null) continue;
    const group = groups.get(parent);
    if (group === undefined) groups.set(parent, [anchor]);
    else group.push(anchor);
  }

  let largest: HTMLAnchorElement[] = [];
  for (const group of groups.values()) {
    if (group.length > largest.length) largest = group;
  }
  return largest;
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
