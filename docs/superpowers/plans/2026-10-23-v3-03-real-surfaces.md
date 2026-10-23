# Plan 3 — Real Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LeetCode's locked company list with our community dataset on `/company/{slug}`, add a Companies chip on problem pages, and derived frequency bars on `/problemset` — all native-first, fixture-tested.

**Architecture:** Vanilla-TS views mounted by the existing router/registry. Each view logs `mounted`, starts an async enhance pass guarded by a cancellation flag, and returns a synchronous teardown that aborts readiness waits, disconnects observers, and restores the DOM. Anchors are found from captured fixture DOM; a view no-ops when its anchor is missing (premium users keep native behavior).

**Tech Stack:** TypeScript strict, esbuild, vitest + jsdom, captured fixture HTML (`tests/fixtures/dom/`, local-only).

**Spec:** `docs/superpowers/specs/2026-10-18-v3-native-company-data-design.md` (§7 surfaces, §8.2 lifecycle, §8.3 styling, §8.5 DOM strategy).

## Global Constraints

- Zero permissions; all data from bundled `data/**` via `runtime.getURL`.
- Every injected class starts with `lce-`; all CSS selectors start with `.lce`; no `font-size`, `url(`, `@import`, or `:root` in `content.css` (build-guarded).
- Never replace working native content: company takeover only when the locked wall card is present; problem chip only when the native Companies chip carries the premium lock; problemset bars only in the locked frequency slot.
- Views never throw into the page; failures log via `debugLog` only.
- Teardown restores every mutated native node and disconnects every observer.
- Fixture files are gitignored; tests skip via `describe.skipIf` when absent.

## Review Focus

- Premium user on a company page (no wall card) → view no-ops, native list untouched.
- DOM drift (wall/chip/row slot missing) → timeout + no-op, no half-rendered UI.
- Rapid SPA navigation during an in-flight enhance pass → teardown wins; no late DOM writes.
- Empty window / unknown company → quiet empty state, not a broken table.
- Huge all-time lists (2,344 rows) → first 100 rendered, load-more appends, filters stay responsive.

---

### Task 1: Abortable readiness + DOM helper

**Files:**
- Modify: `src/lib/dom/readiness.ts`
- Create: `src/lib/dom/html.ts`
- Test: `tests/unit/lib/readiness.test.ts`

**Interfaces:**
- Produces: `waitFor(selector, { root?, timeoutMs?, signal? })` — rejects `Error("waitFor aborted")` on abort and disconnects.
- Produces: `el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: { className?: string; text?: string; attrs?: Record<string, string>; children?: (Node | string)[] }): HTMLElementTagNameMap[K]`.

- [ ] **Step 1: Add failing abort tests** — abort before settle rejects and disconnects; pre-aborted signal rejects immediately.
- [ ] **Step 2: Run tests (RED).**
- [ ] **Step 3: Implement signal handling + `html.ts`.**
- [ ] **Step 4: Run tests (GREEN).**
- [ ] **Step 5: Commit.**

### Task 2: Selectors module

**Files:**
- Create: `src/lib/dom/selectors.ts`
- Test: `tests/unit/dom/selectors.test.ts` (fixture-gated)

**Interfaces:**
- Produces:
  - `COMPANY_CONTAINER = ".company-container"`
  - `PREMIUM_LOCK_IMG = 'img[alt="premium lock icon"]'`
  - `findCompanyTakeover(root: ParentNode): { target: Element; wall: Element } | null` — wall matches `[class*="company_subscribeContainer"]`; target is the direct child of the container that holds it.
  - `findLockedCompaniesChip(root: ParentNode): { chip: Element; row: Element } | null` — locked chip only (span text `Companies` + premium lock img), row is the `flex gap-1` chip row.
  - `problemsetRows(root: ParentNode): HTMLAnchorElement[]` — anchors whose `pathname` is exactly `/problems/{slug}`.
  - `findLockedFrequencySlot(row: Element): { slot: Element } | null` — lock icon inside the 8-bar slot; returned slot is `lock.parentElement` with class tokens `relative flex gap-0.5`.

- [ ] **Step 1: Write fixture-gated tests** against `company-google.html`, `problem-two-sum.html`, `problemset.html`.
- [ ] **Step 2: Run (RED).**
- [ ] **Step 3: Implement selectors with shape comments.**
- [ ] **Step 4: Run (GREEN).**
- [ ] **Step 5: Commit.**

### Task 3: Company model

**Files:**
- Create: `src/views/company-page/model.ts`
- Test: `tests/unit/views/company-model.test.ts`

**Interfaces:**
- Produces:
  - `WINDOW_TABS: { key: WindowKey; label: string }[]`
  - `type DifficultyFilter = "all" | Difficulty`
  - `type SortKey = "frequency" | "title" | "acceptance"`
  - `buildRows(shard: CompanyShard, index: Index, q: { window: WindowKey; search: string; difficulty: DifficultyFilter; sort: SortKey }): CompanyRow[]`
  - `CompanyRow = { slug; id: number | null; title; difficulty; acceptance; frequency; position }`
  - `formatAcceptance(n: number): string` (`58` → `"58.0%"`)
  - `formatCount(n: number): string` (`2344` → `"2,344"`)
  - `formatUpdated(date: string): string` (`"2026-08-16"` → `"Aug 16, 2026"`)

- [ ] **Step 1: Write failing tests** for window slice, missing problems skipped, search (title + slug), difficulty filter, all three sorts, positions, formatters.
- [ ] **Step 2: Run (RED).**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run (GREEN).**
- [ ] **Step 5: Commit.**

### Task 4: Company page view

**Files:**
- Create: `src/views/company-page/index.ts`
- Test: `tests/unit/views/company-page.test.ts` (fixture-gated)
- Modify: `src/styles/content.css`

**Interfaces:**
- Produces: `mountCompanyPage(deps: { url: URL; data: DataLayer; timeoutMs?: number }): Teardown` — synchronous return; async enhance; no-op if wall/store missing.
- Consumes: Task 2 finders, Task 3 model, `waitFor`.

Behavior pinned by tests:
- Replaces the right column holding the wall; keeps `.company-container` and left card.
- Header: `Interview questions`, all-time count, `Updated Aug 16, 2026 · Data: community company-wise lists`.
- 5 tabs (d30 default), search input, difficulty select, sort select.
- First 100 rows; load-more appends 100; row is `<a href="/problems/{slug}/">`; frequency bar `title="Frequency 100 — share of interview reports for this company"`.
- Empty window → `No questions in this window.`; unknown company → `No community data for this company yet.`
- Teardown restores original children; tab/filter/sort events removed.
- Wall absent → untouched; cancelled enhance → no DOM writes.

- [ ] **Step 1: Write failing DOM tests** with a fake `DataLayer` (150-row shard for chunking, google fixture).
- [ ] **Step 2: Run (RED).**
- [ ] **Step 3: Implement mount + render + styles.**
- [ ] **Step 4: Run (GREEN).**
- [ ] **Step 5: Commit.**

### Task 5: Problem page Companies chip

**Files:**
- Create: `src/views/problem-companies/index.ts`
- Test: `tests/unit/views/problem-companies.test.ts` (fixture-gated)
- Modify: `src/styles/content.css`

**Interfaces:**
- Produces: `mountProblemCompanies(deps: { url: URL; data: DataLayer; timeoutMs?: number }): Teardown`.

Behavior pinned by tests:
- Hides the locked native chip; inserts a `.lce-chip` button in the same chip row with total company count.
- Click toggles `.lce-panel` (aria-expanded) inserted after the chip row.
- Sections + window mapping: Last 6 months = union(d30,d3m,d6m); More than 6 months = g6m; All time = all. Company links `/company/{slug}/`.
- No shard/no entries → native chip untouched (no-op).
- Teardown unhides native chip, removes our chip/panel.

- [ ] **Step 1: Write failing DOM tests.**
- [ ] **Step 2: Run (RED).**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run (GREEN).**
- [ ] **Step 5: Commit.**

### Task 6: Problemset frequency cells

**Files:**
- Create: `src/views/problemset/index.ts`
- Test: `tests/unit/views/problemset.test.ts` (fixture-gated)
- Modify: `src/styles/content.css`

**Interfaces:**
- Produces: `mountProblemsetFrequency(deps: { data: DataLayer; timeoutMs?: number }): Teardown`.

Behavior pinned by tests:
- For locked rows with `index.problems[slug].freqScore`, replace the locked slot children with a `.lce-freqcell` (bar width = score, tooltip `Derived frequency {n}/100 — community company data`).
- Unknown rows keep native locked bars.
- A row appended after mount is enhanced (MutationObserver), and the observer disconnects on teardown.
- Teardown restores original slot children.

- [ ] **Step 1: Write failing DOM tests** (two-sum + find-target-indices rows).
- [ ] **Step 2: Run (RED).**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run (GREEN).**
- [ ] **Step 5: Commit.**

### Task 7: Registry wiring + full gate

**Files:**
- Modify: `src/content/registry.ts`
- Modify: `tests/unit/content/registry.test.ts`
- Modify: `tests/unit/content/router.test.ts` only if needed (no).
- Modify: `docs/dev/manual-qa.md` (Plan 3 checks).

**Interfaces:**
- `createViews(opts?: { data?: DataLayer; timeoutMs?: number }): View[]` — mounts the real views with the shared data layer; matchers unchanged.

- [ ] **Step 1: Update registry test** (real mount logs, teardown logs, no throw without DOM/data).
- [ ] **Step 2: Wire views.**
- [ ] **Step 3: `pnpm typecheck && pnpm test && pnpm build` green.**
- [ ] **Step 4: Rebuild `dist/` and update QA checklist.**
- [ ] **Step 5: Commit + ledger.**
