import { describe, expect, it } from "vitest";
import {
  findCompanyTakeover,
  findLockedCompaniesChip,
  findLockedFrequencySlot,
  problemsetRows,
} from "../../../src/lib/dom/selectors";
import { fixtureDocument, hasFixture } from "../../helpers/dom-fixtures";

const hasCompany = hasFixture("company-google");
const hasProblem = hasFixture("problem-two-sum");
const hasProblemset = hasFixture("problemset");

describe.skipIf(!hasCompany)("company selectors", () => {
  const doc = hasCompany ? fixtureDocument("company-google") : null;

  it("finds the locked wall and the right column that owns it", () => {
    const takeover = findCompanyTakeover(doc!);
    expect(takeover).not.toBeNull();
    const { container, target, wall } = takeover!;

    expect(container.matches(".company-container")).toBe(true);
    expect(wall.className).toContain("company_subscribeContainer");
    expect(target.parentElement).toBe(container);
    expect(target.contains(wall)).toBe(true);
    expect(target.textContent).toContain("Unlock more popular");
    // The native left company card must not be the takeover target.
    expect(target.textContent).not.toContain("Saved");
  });

  it("returns null when the wall is absent (premium/native list case)", () => {
    const copy = doc!.cloneNode(true) as Document;
    copy
      .querySelector('[class*="company_subscribeContainer"]')
      ?.remove();
    expect(findCompanyTakeover(copy)).toBeNull();
  });
});

describe.skipIf(!hasProblem)("problem selectors", () => {
  const doc = hasProblem ? fixtureDocument("problem-two-sum") : null;

  it("finds the premium-locked Companies chip inside the chips row", () => {
    const found = findLockedCompaniesChip(doc!);
    expect(found).not.toBeNull();
    const { chip, row } = found!;

    expect(chip.textContent).toContain("Companies");
    expect(chip.querySelector('img[alt="premium lock icon"]')).not.toBeNull();
    expect(row.classList.contains("flex")).toBe(true);
    expect(row.classList.contains("gap-1")).toBe(true);
    expect(row.textContent).toContain("Topics");
  });

  it("returns null when the chip is not premium-locked", () => {
    const copy = doc!.cloneNode(true) as Document;
    copy
      .querySelectorAll('img[alt="premium lock icon"]')
      .forEach((img) => img.remove());
    expect(findLockedCompaniesChip(copy)).toBeNull();
  });
});

describe.skipIf(!hasProblemset)("problemset selectors", () => {
  const doc = hasProblemset ? fixtureDocument("problemset") : null;

  it("collects problem row anchors with clean pathnames", () => {
    const rows = problemsetRows(doc!);
    expect(rows.length).toBeGreaterThan(50);
    const first = rows[0]!;
    expect(first.pathname).toMatch(/^\/problems\/[^/]+\/?$/);
    expect(rows.some((row) => row.pathname.startsWith("/problems/two-sum"))).toBe(
      true
    );
  });

  it("finds the locked frequency slot for a row", () => {
    const row = problemsetRows(doc!).find(
      (candidate) => candidate.pathname === "/problems/two-sum"
    )!;
    const found = findLockedFrequencySlot(row);
    expect(found).not.toBeNull();
    expect(found!.slot.querySelector('svg.fa-lock-keyhole')).not.toBeNull();
    expect(found!.slot.classList.contains("relative")).toBe(true);
    expect(found!.slot.classList.contains("flex")).toBe(true);
  });

  it("returns null when the slot is not locked (premium data)", () => {
    const row = problemsetRows(doc!).find(
      (candidate) => candidate.pathname === "/problems/two-sum"
    )!;
    const copy = row.cloneNode(true) as HTMLAnchorElement;
    copy.querySelector('svg.fa-lock-keyhole')?.remove();
    expect(findLockedFrequencySlot(copy)).toBeNull();
  });
});
