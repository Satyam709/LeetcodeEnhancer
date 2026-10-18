# v3 Extension Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the extension shell that boots on leetcode.com: esbuild pipeline, MV3 manifests for Chrome + Firefox, SPA-aware router with view lifecycle, DOM readiness helpers, the runtime data layer that reads the bundled artifacts, and the scoped CSS base — with stub views so the spine is fully testable before real surfaces land.

**Architecture:** A single content script (IIFE) boots a router that watches `location` (popstate + a 300 ms cheap URL compare), matches the current path to a view from a registry, and mounts/tears down views with async-safe serialization. Views (real ones in Plan 3) render Preact into `.lce-root` containers and receive data through a memoized data layer that fetch-reads `dist/data/**` via `runtime.getURL`. All injected CSS is scoped under `.lce-` classes and uses LeetCode's own CSS variables.

**Tech Stack:** TypeScript strict, esbuild, Preact (added when surfaces land), vitest + jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-18-v3-native-company-data-design.md` (§7, §8, §9.3). Plan 1 (`2026-10-18-v3-01-data-pipeline.md`) produces the `data/` artifacts this plan consumes.

## Global Constraints

- MV3 for both browsers from one `manifest.base.json`; **zero permissions** (no `storage`, no `activeTab`), no background worker, no remote code.
- Name `"LeetCode Enhancer"`; version single-sourced from `package.json` (`3.0.0`); description per spec §7.
- Content script matches `https://leetcode.com/*`, `run_at: "document_idle"`.
- The content script must never throw into the page: boot wraps everything; recoverable failures log once behind `localStorage["lce:debug"] === "1"`.
- **Native-first rule** (spec §3): views no-op unless their locked/empty anchor is positively detected; the spine's stubs only log.
- All injected CSS selectors must start with `.lce` — enforced by a build-output test.
- Problem shard naming must match Plan 1 exactly: `problemShardName(slug)` → `slug.slice(0,2)` lowercased, non `[a-z0-9]` → `_`, padded to 2 with `_`, + `.json`.
- Runtime data access is local-file only (`runtime.getURL` + `fetch`); `DataUnavailable` (missing/incompatible data) means "render nothing", never a thrown error.
- Build must fail loudly if `data/meta.json` is missing: message must say `run pnpm data:sync`.

## Review Focus

- **SPA navigation storms** (rapid clicks between problem pages): expect one mount at a time, teardown-before-mount always, and idempotent teardown — never stacked listeners or double mounts. (Task 3 tests, including a mid-mount race.)
- **URL variants** (`/company/google/`, `/company/google?x=1`, `/problems/two-sum/description/`, `/problemset/`, `/problem-list/abc`): expect correct view matching per the table test. (Task 3.)
- **Missing/partial data at build or runtime**: build fails with the actionable message; runtime degrades to no-op. (Task 1 test + Task 5 tests.)
- **CSS leakage into LeetCode pages**: every built selector must start with `.lce` (guard test, Task 6).
- **Boot on the real site** (CSP, isolated world, theme flip): manual QA checklist pins expected console output and light/dark behavior. (Task 7.)

---

### Task 1: Build system

**Files:**
- Create: `manifest.base.json`, `scripts/manifest.ts`, `scripts/build.ts`
- Modify: `package.json` (scripts)
- Test: `tests/unit/build/manifest.test.ts`, `tests/unit/build/build.test.ts`

**Interfaces:**
- Produces: `buildManifest(base: ManifestBase, opts: { version: string; browser: "chrome" | "firefox" }): Manifest` — injects `version`, `manifest_version: 3`, and for Firefox adds `browser_specific_settings.gecko.id` from base. `build(opts: { browser; outdir?: string; minify?: boolean; watch?: boolean }): Promise<void>` — esbuild bundles `src/content/index.ts` → `dist/content.js` (IIFE, bundle, target `es2022`), bundles `src/styles/content.css` → `dist/content.css`, copies `data/` → `dist/data/` (fails with `run pnpm data:sync` if `data/meta.json` missing), writes `dist/manifest.json`.
- Consumes: `data/` from Plan 1.
- Scripts: `build: tsx scripts/build.ts`, `build:firefox: tsx scripts/build.ts --browser=firefox`, `dev: tsx scripts/build.ts --watch`.

- [x] **Step 1: Write failing tests** — `buildManifest` output has `name: "LeetCode Enhancer"`, version injected, `manifest_version: 3`, `permissions` absent, `content_scripts[0]` matches `https://leetcode.com/*` with `js: ["content.js"]`, `css: ["content.css"]`; Firefox output includes `browser_specific_settings.gecko.id`; `build()` into a tmp `outdir` with a fake `data/` (containing `meta.json`) emits all four outputs; `build()` with `data/` absent rejects with a message containing `pnpm data:sync`.
- [x] **Step 2: Verify fail** (`pnpm vitest run tests/unit/build`)
- [x] **Step 3: Implement** `manifest.ts` (pure) and `build.ts` (esbuild API; `src/content/index.ts` stub that just logs; CSS file created minimally so bundling works — real content in Task 6).
- [x] **Step 4: Pass; also run** `pnpm build` → `dist/` contains `content.js`, `content.css`, `manifest.json`, `data/`. Commit `feat: esbuild pipeline + MV3 manifest generation`.

---

### Task 2: Icons

**Files:**
- Create: `tools/icons.mjs` (one-shot generator), `assets/icons/{16,32,48,96,128}.png`
- Modify: `manifest.base.json` (icons map)

**Interfaces:**
- Produces: `icons` map in the manifest; generated PNGs committed.

- [x] **Step 1:** Add `sharp` as a devDependency; write `tools/icons.mjs` that resizes `assets/logo.png` (square fit) to the five sizes into `assets/icons/`.
- [x] **Step 2:** Run it; commit PNGs + script.
- [x] **Step 3:** Add a test asserting every icon referenced in `manifest.base.json` exists on disk. Commit `chore: extension icons 16–128`.

---

### Task 3: Router + view registry + boot

**Files:**
- Create: `src/content/router.ts`, `src/content/registry.ts`, `src/content/index.ts`
- Test: `tests/unit/content/router.test.ts`, `tests/unit/content/registry.test.ts`

**Interfaces:**
- Produces:
  - `type Teardown = () => void | Promise<void>`
  - `interface View { name: string; match(pathname: string): boolean; mount(ctx: { url: URL }): Promise<Teardown> | Teardown }`
  - `createRouter(opts: { views: View[]; getHref?: () => string; pollMs?: number }): { start(): void; stop(): void; check(): Promise<void>; currentViewName(): string | null }`
  - Behavior: on change, teardown current (await, errors swallowed to debug log), then mount next; serialized by a generation token so a route change during an in-flight mount discards the stale result; `stop()` clears the interval.
  - `createViews(): View[]` — stub views (each `mount` logs `lce:<name> mounted` in debug and returns a teardown) with matchers: company `^/company/([^/]+)/?$`; problem `^/problems/([^/]+)(/.*)?$` (excluding `/problemset`); problemset `^/problemset/?$`; problem-list `^/problem-list/?.*`.
- Consumes: nothing.

- [x] **Step 1: Write failing tests** (jsdom):
  - registry matcher table (the Review Focus URL variants, plus `/company/` with no slug → no match, `/contest/...` → none).
  - teardown runs before next mount; `currentViewName()` tracks.
  - navigation to the same matched view name (href changes, view unchanged) does **not** remount.
  - route change mid-mount (mount promise resolves after next `check()`) → stale teardown never recorded as current.
  - `stop()` — after `stop()`, href changes trigger nothing.
- [x] **Step 2: Verify fail** → **Step 3: implement** → **Step 4: pass.**
- [x] **Step 5:** Wire `src/content/index.ts`: boot guarded in try/catch, `createRouter({ views: createViews() }).start()`; debug logger helper `src/lib/debug.ts` (`debugLog(...)` gated by `localStorage["lce:debug"]`).
- [x] **Step 6: Commit** `feat: SPA router + view registry + boot`.

---

### Task 4: DOM readiness helper

**Files:**
- Create: `src/lib/dom/readiness.ts`
- Test: `tests/unit/lib/readiness.test.ts`

**Interfaces:**
- Produces: `waitFor(selector: string, opts?: { root?: ParentNode; timeoutMs?: number }): Promise<Element>` — resolves immediately when present; otherwise one MutationObserver; rejects on timeout with `waitFor timeout: <selector>`; disconnects the observer in all paths.

- [x] **Step 1: Failing tests:** immediate resolve; resolves when the node is appended later; rejects after `timeoutMs: 50` when never appended; observer does not fire after resolve (append another matching node → no second resolution side effect, promise stays settled).
- [x] **Step 2: Verify fail** → **Step 3: implement** → **Step 4: pass** → commit `feat: observer-based waitFor`.

---

### Task 5: Runtime data layer

**Files:**
- Create: `src/lib/data/types.ts`, `src/lib/data/shards.ts`, `src/lib/data/loader.ts`, `src/lib/data/browser.ts`
- Test: `tests/unit/lib/data/loader.test.ts`, `tests/unit/lib/data/shards.test.ts`

**Interfaces:**
- Produces:
  - Types mirroring Plan 1's schema (`Meta`, `Index`, `CompanyShard`, `ProblemShard`, `WindowKey`) with `SCHEMA_VERSION = 1`.
  - `problemShardName(slug: string): string` — identical rule to Plan 1.
  - `class DataUnavailable extends Error {}`
  - `createDataLayer(deps: { loadJson: (path: string) => Promise<unknown> }): DataLayer` with:
    - `meta(): Promise<Meta>` — throws `DataUnavailable` if schemaVersion ≠ 1 or shape invalid.
    - `index(): Promise<Index>` (memoized)
    - `company(slug: string): Promise<CompanyShard | null>` (memoized; missing shard → null)
    - `companiesForProblem(slug: string): Promise<{ companyIdx: number; windows: WindowKey[] }[]>` (memoized per shard; mask → window keys)
    - `derivedFrequency(slug: string): Promise<number | undefined>`
  - `createBrowserDataLayer(): DataLayer` — `loadJson = (p) => fetch(runtime.getURL(p)).then(r => r.ok ? r.json() : Promise.reject(new DataUnavailable(p)))`; detects Chrome/Firefox `runtime` safely.
- Consumes: Plan 1 artifacts.

- [ ] **Step 1: Failing tests** with an in-memory fixture loader:
  - memoization: `index()` twice → one `loadJson` call; `company("google")` twice → one call.
  - schema mismatch (`schemaVersion: 2`) → `DataUnavailable` from `meta()`.
  - missing company shard → `null`; missing problem shard → `[]`.
  - mask decode: `18` → `["d3m", "all"]`; `derivedFrequency` returns the index value or `undefined`.
  - shard name table: `two-sum` → `tw.json`, `x` → `x_.json`, `3sum` → `3s.json`, `a-b` → `a_.json` (non-alnum at position 2). *(These same four cases are asserted in Plan 1 Task 6 — cross-plan consistency.)*
- [ ] **Step 2: Verify fail** → **Step 3: implement** → **Step 4: pass** → commit `feat: runtime data layer (local, memoized, schema-gated)`.

---

### Task 6: Scoped styles base + leak guard

**Files:**
- Create: `src/styles/content.css`
- Test: `tests/unit/build/css-scope.test.ts`

**Interfaces:**
- Produces: `.lce-root` scope class defining neutral fallbacks for the tokens views will consume (`--sd-background`, `--sd-foreground`, `--sd-muted`, `--sd-muted-foreground`, `--sd-easy|medium|hard`, `--fill-quaternary`, `--text-primary`, `--border-primary`) and base typography (font-family inherits; no font-size on the root). No other selectors yet.
- Guard: test builds `src/styles/content.css` through esbuild in-memory, parses selectors, asserts **every** selector starts with `.lce` (also no `:root`, no element selectors, no `@import`/url()).

- [ ] **Step 1: Failing guard test** (write it first against the eventual file; run → fails because file missing) → **Step 2: implement file** → **Step 3: pass** → commit `feat: scoped style base`.

---

### Task 7: Manual QA checklist + spine verification

**Files:**
- Create: `docs/dev/manual-qa.md`

**Content (write exactly this checklist, adjust only if reality differs):**
1. `pnpm data:sync && pnpm build`
2. `chrome://extensions` → Load unpacked → `dist/`
3. Visit `https://leetcode.com/problemset/` → console shows no errors (with `localStorage["lce:debug"]="1"`, shows `lce:problemset mounted`)
4. Click into a problem → soft navigation → `lce:problem mounted` after `lce:problemset` teardown, exactly once per navigation
5. Visit `https://leetcode.com/company/google/` → `lce:company mounted`; reload → single mount, no duplicates
6. Rapidly click through 5 problems → exactly one `mounted` per page, no stacked teardowns, no errors
7. Toggle theme (light/dark/system) → no visual difference from native pages (stub views render nothing; verifies no CSS leak)
8. Firefox: `about:debugging` → Load Temporary Add-on → same checks (raw `location` watcher works, no `chrome.*` API errors)

- [ ] **Step 1:** Write the checklist; run it manually once end-to-end.
- [ ] **Step 2:** Fix whatever the run exposes (expected candidates: mount ordering, debug logging noise); re-run.
- [ ] **Step 3: Commit** `docs: spine manual QA checklist; first pass green`.

---

## Self-Review Notes

- Spec §8.2 maps to Tasks 3–4; §8.3 to Task 6; §8.4 to Task 5; §9.3 primary serving to Tasks 1/5; §11 packaging is a later plan.
- Preact is intentionally not added yet: stub views need no framework; the dependency arrives with the first real surface (Plan 3) and is a Global Constraint there.
- The `check()` serialization token (Task 3) is the spine's answer to the Review Focus "navigation storms".
