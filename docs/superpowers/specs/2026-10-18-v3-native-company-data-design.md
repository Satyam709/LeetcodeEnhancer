# LeetCode Enhancer v3 — Design

Date: 2026-10-18 · Status: approved in conversation, handed to builder
Repo: `Satyam709/LeetcodeEnhancer` · Branch: `v3` · Target release: `3.0.0`

---

## 1. Intent

v2 of the extension works, but every surface feels bolted on: one shared floating
modal renders company questions, top-problem lists, tags, and premium content;
theme colors are hardcoded; rows are cloned; hrefs are replaced with
`javascript:void(0)`; data comes from a Google Sheet through a hardcoded API key
and is visibly stale (“Data is accurate till 2022”).

v3's purpose: make the extension feel like a **first-class part of leetcode.com**.
When a user clicks a company, they should land on the real `/company/{slug}` page
and see a list that looks and behaves like LeetCode built it — except the data
comes from the community repo
[`liquidslr/leetcode-company-wise-problems`](https://github.com/liquidslr/leetcode-company-wise-problems).

This is a rewrite: same repository, fresh TypeScript project, new data pipeline,
no Google Sheets, no premium-content features, no analytics.

## 2. Decisions already made (user)

- **Native feel is the product.** Components must render like LeetCode's own UI
  and live where LeetCode puts such content (pages, not modals).
- **Data source**: the `liquidslr/leetcode-company-wise-problems` GitHub repo.
  Company lists, company tags, topics, frequency, acceptance all come from it.
- **Drop premium-content features “for now”**: premium problem statements,
  editorials, and anything else that only existed via the Google Sheet
  (including the top-problem foldout lists). Native lock icons stay untouched.
- **New project in the same repo, TypeScript.**
- **Release**: polished GitHub release zips (Chrome + Firefox). Store-ready
  package posture, but no Chrome Web Store / AMO submission in this pass.

## 3. Builder's calls (veto-able before implementation)

- Same repo, branch `v3`, fresh project at root, old `src/` deleted on the
  branch (recoverable from `main`). Lands as `3.0.0`.
- Stack: TypeScript + Preact for injected views; esbuild build; pnpm; vitest;
  Playwright for a late smoke test.
- Manifest V3 for both browsers, generated from one base manifest.
- Name unified as **“LeetCode Enhancer”** (repo/README/manifests/popup). The v2
  manifest name “Leetcode Premium Unlocker” no longer describes the product.
- Company page takeover at the real `/company/{slug}` URL; company chips navigate
  there. No modals anywhere.
- **Native-first rule: never replace working native content.** Every view
  enhances only where LeetCode's own UI is locked or absent: the company page
  takeover runs only when the locked/subscribe state is *positively* detected;
  the problem-page Companies chip is upgraded only when the native panel is
  locked/empty; the frequency cell is added only where no native frequency
  exists. Premium users keep fully native behavior on all surfaces. Positive
  detection means tests only need logged-out (locked) fixtures — premium DOM
  never has to be captured.
- Problemset frequency shown as a derived score, rendered in token colors;
  rows without data get **no** injected element (no misleading “No Data” bars).
- Analytics + hardcoded GA credentials deleted. No telemetry of any kind.
- Data artifacts live on an orphan `data` branch in this repo (generated, not
  hand-edited); jsDelivr serves them for future updates. v3.0 ships the bundled
  snapshot only — runtime auto-refresh is deferred to 3.1, but the loader
  abstraction and schema versioning are built in from day one.
- Since the source repo has **no license file**: ship only derived indexes, never
  the raw CSVs, and credit the source prominently (README + popup + company page
  footer line).
- Frequency formula (tunable, single module, unit-tested):
  per problem, take each company's **most recent** window containing it; weight
  w(30d)=1.0, w(3m)=0.7, w(6m)=0.55, w(>6m)=0.3, w(all)=0.15; contribution =
  w × frequency%/100; raw = Σ contributions; derived score = round(100 × raw /
  p99(raw)), clamped 0–100. The popup/README disclose that this is a derived
  community metric, not LeetCode's official frequency.

## 4. Goals

- Company questions rendered natively on real `/company/{slug}` pages: header,
  5 time-window tabs, search, difficulty filter, frequency sort, table.
- Company info on problem pages: a native-style “Companies” chip that opens an
  inline grouped panel (recency buckets), chips navigate to company pages.
- Problemset / problem-list frequency cell derived from company data.
- Data fully bundled: no runtime third-party APIs, no API keys, works offline.
- Robust under LeetCode's SPA navigation (pushState), not just cold loads.
- Minimal permissions; MV3; light/dark correct via LeetCode's own CSS variables.
- Polished release: tests, docs, packaging, consistent naming, fresh README.

## 5. Non-goals (3.0)

- Premium problem descriptions/editorials; top-problem foldouts.
- Runtime data auto-refresh (3.1); store submission; accounts; telemetry.
- Role filters (source data has no role tags); solved-status sync.
- Firefox AMO-specific packaging beyond the zip.
- Company logos (see §7.3).

## 6. Anti-goals

- A floating modal for content that has a native home.
- Hardcoded colors that break in light mode or system theme.
- Polling loops, row cloning, `javascript:void(0)`, listeners stacked on
  LeetCode's own React nodes, global CSS class leakage.
- Runtime dependency on an unofficial API or key for core features.

## 7. Product surfaces

### 7.1 Company page takeover — `/company/{slug}`

The real LeetCode page renders a locked company “favorite” for non-premium
users. We keep the page shell (top bar, sidebar) and take over the main content
region with our view. If the anchor container isn't found (DOM drift), the view
**no-ops** — never throws, never half-renders.

- **Header**: monogram avatar (rounded square, neutral tokens), company name,
  “N questions” (all-time count), “Updated ⟨source commit date⟩”, and a small
  “Data: community company-wise lists” credit.
- **Window tabs**: `30 days · 3 months · 6 months · More than 6 months · All`
  (mirrors LeetCode's own labels), styled like native pills.
- **Controls**: search input (“Search questions”), difficulty dropdown
  (All/Easy/Medium/Hard), sort (default **Frequency ↓**; additionally Title,
  Acceptance, ID when enrichment data exists).
- **Table**: `# · Title · Acceptance · Difficulty · Frequency`. Rows are real
  `<a>` links to `/problems/{slug}/` (middle-click/open-in-tab work). Premium
  problems show the native lock icon when enrichment supplies `paidOnly`; they
  remain normal links. Acceptance shown as `xx.x%`; frequency as a token-colored
  bar with a tooltip (“Frequency 87 — % of sample reports for this company”).
- **Rendering**: chunked (first 100 rows + “load more” sentinel) so 2000-row
  all-time lists stay snappy.
- **Unknown company / no data**: render a quiet native-style empty state.

### 7.2 Problem page — Companies chip

On `/problems/{slug}/`, upgrade the native chips row (`Medium | Topics |
Companies | …`). A token-styled “Companies” chip toggles an inline dropdown
panel, grouped into buckets with counts:

- **Last 6 months** = union(30d, 3m, 6m)
- **More than 6 months** = the `>6m` window
- **All time** = the `all` window

Each company renders as a native-looking chip → navigates to `/company/{slug}`.
No data → chip shows a “No company data” quiet state (or stays native if we can
avoid touching it; prefer not touching).

### 7.3 Problemset frequency cell — `/problemset`, `/problem-list/*`

For each problem row whose slug exists in the dataset, append a small
token-colored frequency bar into the native frequency slot (fallback: end of the
row container). Tooltip: “Derived frequency 87/100 — community company data”.
Rows with no data are left exactly as native. The green `#62C555` branding and
the “No Data” red bars are gone.

Company logos: not shipped. The repo has none, LeetCode asset URLs are not
stable, so the company header uses a monogram and chips are text (native pill
style). Revisit with a curated logo set in a later version if desired.

### 7.4 Popup

Small and honest: product name, version, “Data updated ⟨date⟩”, what the
extension does (one paragraph), links (repo, issues, data-source credit). No
patch-notes wall. Built with the same TS stack, light/dark aware.

## 8. Architecture

### 8.1 Repo layout (v3 at root)

```
manifest.base.json            # shared manifest fields; build emits per-browser
package.json / tsconfig.json / vitest.config.ts
scripts/build.mjs             # esbuild orchestration (content, popup, css, data copy)
tools/sync-data/              # data pipeline (runs on dev machine / CI only)
data/                         # generated artifacts (gitignored; lives on `data` branch)
src/
  content/index.ts            # boot: router + view registry
  content/router.ts           # URL matching, mount/teardown lifecycle
  views/company-page/         # the takeover view
  views/problem-companies/    # the chips + panel
  views/problemset-frequency/ # the frequency cell
  components/                 # Preact native kit: Tabs, Table, DifficultyTag, FrequencyBar, Search, Dropdown
  lib/data/                   # dataset loader (index/shard/meta), schema types, queries
  lib/dom/selectors.ts        # every LeetCode selector in one place, with shape notes
  lib/dom/readiness.ts        # waitForElement(observer-based, timeout, no polling)
  styles/                     # scoped CSS (.lce- prefix), consumed as dist/content.css
  popup/
tests/
  unit/                       # vitest: pipeline, data layer, view logic (happy-dom)
  fixtures/                   # captured LeetCode HTML pages (see 8.5)
  integration/                # playwright smoke (phase 4)
docs/
```

### 8.2 Runtime spine

- **Router**: matches `location.pathname`; a view registry maps
  `^/company/(?<slug>[^/]+)/?$`, problem page, `/problemset`, `/problem-list/*`
  to views. On change: teardown previous (unmount Preact, disconnect observers),
  mount next. Navigation detection: `popstate` listener **plus** a cheap 300 ms
  `location.href` watcher (pushState does not fire events in an isolated world;
  the Navigation API isn't cross-browser yet). Watcher cost is one string
  compare; it only triggers work on change. Upgrade path documented.
- **Readiness**: `waitFor(selector)` returns a promise resolved by a single
  `MutationObserver` with a timeout; no 100 ms retry loops. Views await their
  anchors, then render.
- **Teardown discipline**: every view returns a teardown; observers created by a
  view are disconnected by it; Preact trees unmounted. Navigation storms (rapid
  clicking) must not stack listeners.
- **God-object ban**: no singletons like v2's `modalManager`; views receive what
  they need and the data layer is a plain memoized module.

### 8.3 Styling

- All injected CSS is bundled into one `content.css`, every rule scoped under
  `.lce-` classes/root. No generic class names (`.clickable` etc.) leak into
  LeetCode pages.
- Colors/spacing come from LeetCode's own CSS variables, with safe fallbacks:
  `--sd-background`, `--sd-foreground`, `--sd-muted`, `--sd-easy|medium|hard`,
  `--fill-quaternary`, `--text-primary..`, `--border-*`. Because these flip with
  `.dark` on `<html>`, light/dark/system themes work with zero code.
- Where a variable is missing (older page builds), fall back to neutral values;
  no branded green anywhere in content views.

### 8.4 Data layer

```ts
data.index()                     // companies[] + problems{} (memoized)
data.company(slug)               // lazy shard, memoized
data.companiesForProblem(slug)   // lazy inverted-index shard, memoized
data.derivedFrequency(slug)      // number | undefined
data.meta()                      // provenance + counts + updated date
```

All reads go through `runtime.getURL('data/…')` + `fetch`, so no permissions are
required. Every artifact carries `schemaVersion`; unknown schema → feature
degrades to no-op. The loader abstraction is the seam where v3.1's
jsDelivr/IndexedDB refresh plugs in without touching views.

### 8.5 LeetCode DOM strategy

- All selectors live in `src/lib/dom/selectors.ts`, each with a comment
  describing the expected shape and which page it belongs to.
- A dev-only script (`tools/capture-fixtures.mjs`, Playwright) captures real
  page HTML (`/company/google`, a problem page, `/problemset`) into
  `tests/fixtures/`; tests run against fixtures, not the live site.
- Every view no-ops when its anchor is missing; failures are silent for users
  (console.warn once, behind a `lce:debug` flag).

## 9. Data pipeline

### 9.1 Transform (`tools/sync-data`)

Input: tarball of `liquidslr/leetcode-company-wise-problems@main` (pinned via
recorded commit SHA), or a local checkout. Steps:

1. Parse 2,350 CSVs (`<Company>/<n>. <Window>.csv`; windows: Thirty Days, Three
   Months, Six Months, More Than Six Months, All).
   Columns: `Difficulty, Title, Frequency, Acceptance Rate, Link, Topics`.
   - acceptance is stored as a fraction; display value = `value × 10000` (e.g.
     `0.0058…` → `58.0%`).
   - `Topics` is a quoted comma-separated list; intern topic strings.
2. Normalize company names → LeetCode-style slugs (lowercase, hyphenated) with a
   checked-in alias map (`tools/sync-data/company-aliases.json`) for exceptions;
   derivation is table-tested.
3. Problem identity = slug extracted from `Link`; title/difficulty/acceptance/
   topics recorded once in the problems index.
4. Invert: problem → `[companyIdx, windowMask]`.
5. Derive frequency score (formula in §3).
6. Optional enrichment pass (`--enrich`): LeetCode public GraphQL
   (`problemsetQuestionList`, paginated 100) maps slug → numeric `id`,
   `paidOnly`. Politely paced; any failure → proceed without it and mark
   `enriched: false` in meta.
7. Write artifacts + `meta.json`; validate (counts within expected bands, size
   budgets, schema) before writing.

### 9.2 Artifacts

| file | contents | loaded at runtime |
|---|---|---|
| `meta.json` | `schemaVersion`, `source {repo, commitSha, commitDate}`, `generatedAt`, `enriched`, counts, per-file SHA-256 + bytes | on demand |
| `index.json` | `companies[] {slug, name, counts[5]}`, `problems{ slug → [id?, title, difficulty, acceptance, topics[], freqScore] }` | once per page needing it |
| `companies/<slug>.json` | `{ d30, d3m, d6m, g6m, all }` → `[[problemSlug, frequency]…]` | lazy, company page |
| `problems/<prefix>.json` | problem slug prefix (2 chars) → `[[companyIdx, windowMask]…]` | lazy, problem page |

Sharding keeps every runtime read ~15–40 KB. Everything is keyed by problem
slug (always available: URL, row href). `meta.json` doubles as the integrity
manifest for CI and future delta updates.

### 9.3 Storage & serving

- **Primary (runtime)**: artifacts are copied into `dist/data/**` at build time
  and read via `runtime.getURL()` — offline, deterministic, permission-free.
- **Update channel**: the same files on the orphan `data` branch, served by
  jsDelivr (`cdn.jsdelivr.net/gh/Satyam709/LeetcodeEnhancer@data/...`). No
  backend, no keys. v3.1 will consume it (meta check → IndexedDB cache →
  schema-gated preference over the bundle).
- **Local dev**: `pnpm data:sync` writes `data/` (gitignored on `v3`); builds
  require it present.

### 9.4 Periodic updates

- GitHub Action, weekly cron: run `sync-data` → validate → if changed, push to
  the `data` branch; if the source is unreachable or validation fails, open an
  issue. Data freshness becomes a repo-automation concern, not a coding task.
- GitHub only runs `schedule` workflows from the default branch, so automation
  activates when `v3` merges to `main` at 3.0.0. During development: run
  `pnpm data:sync` locally; after merge, the cron maintains the `data` branch.
- Extension releases bake in the newest artifacts (release workflow reads the
  `data` branch).
- Freshness is surfaced in-product: company header + popup show
  “Updated ⟨commit date⟩”.

### 9.5 Estimates to verify in Phase 1

Raw CSVs ≈ 5.8 MB → artifacts ≈ 2–3 MB JSON total; store-zip impact well under
a few MB; index ≤ ~600 KB (split companies/problems if it exceeds). CI enforces
a size budget so regressions fail loudly.

## 10. Testing

- **vitest + happy-dom**
  - pipeline: CSV parsing (quoted fields, windows), slug derivation + alias map,
    acceptance/frequency transforms, inversion, formula (snapshot), artifact
    schema validation + size budget (small fixture dataset, not full data).
  - views: mount company view into fixture HTML (happy-dom), assert structure
    and behavior (tab switch, filter, sort, chunked rendering); problem-page
    panel; problemset frequency injection; router mount/teardown (no observer
    leaks — assert teardown disconnects).
  - loader: schema-version gating, memoization, graceful absence.
- **fixtures**: real captured HTML (see §8.5), refreshed by script; tests fail
  loudly if selectors stop matching, which is our early warning for DOM drift.
- **Playwright smoke (phase 4, local)**: load the built extension into Chromium
  with `--load-extension`, serve fixture pages locally, assert the company
  takeover renders and chips navigate.

## 11. Release plan (Phase 4)

- `pnpm release`: typecheck → tests → build → zip Chrome + Firefox → checksums,
  output in `releases/`.
- README rewrite: what it does, screenshots (regenerated), install, data
  pipeline explanation, attribution, dev setup, privacy note (no telemetry, no
  network calls at runtime).
- Version bump 3.0.0 everywhere (single source in package.json; manifests
  generated).
- Store-readiness checks (not submission): zero permissions, no remote code,
  privacy statement drafted in `docs/`.
- Tag + GitHub release with both zips and a 3.0.0 changelog.

## 12. Risks & mitigations

| risk | mitigation |
|---|---|
| LeetCode DOM changes break views | selectors module + fixture tests + no-op on missing anchors; capture script makes refresh cheap |
| Source repo renamed/deleted/stale | source config in one file; artifacts committed on `data` branch (extension keeps working on last snapshot); CI opens issue on failure; pipeline is source-agnostic |
| Data quality (slug mismatches, odd rows) | alias map + validation bands; bad rows skipped and counted in meta |
| Artifact size creep | budgets enforced in pipeline + CI |
| Copyright (source has no license) | ship derived indexes only, prominent attribution, no raw CSV redistribution; pipeline swap path if asked to stop |
| LeetCode changes locked company page behavior | takeover is additive and removable; view no-ops if anchors absent |

## 13. Appendix A — v2 nook inventory (what this rewrite fixes)

| # | v2 nook | v3 treatment |
|---|---|---|
| 1 | One shared floating modal for all content (`ContainerManager`) | Native pages/views per §7 |
| 2 | Hardcoded dark colors; theme guessed from `lc-theme` | LeetCode CSS variables; light/dark free |
| 3 | Company chips hijacked to `javascript:void(0)`, green count badges | Real hrefs; navigation; token colors |
| 4 | 100 ms polling loops + observer churn everywhere | `waitFor` readiness + router lifecycle |
| 5 | Progress bars injected by deleting native childNodes; red “No Data” bars; green accent | Derived frequency cell; token colors; absent when unknown |
| 6 | Premium-row click interception + row cloning to strip listeners | Removed with premium features; native behavior untouched |
| 7 | `javascript:void(0)` across modals/editorials | Gone |
| 8 | Editorial tab removed; inline SVG button with broken markup | Gone |
| 9 | `.z-overlay` takeover with hardcoded GitHub-palette buttons | Gone |
| 10 | Generic CSS classes (`.clickable`, `.green-text`) leaked page-wide | Scoped `.lce-` styles only |
| 11 | Google Sheets runtime dependency, hardcoded API key, sequential column scans | Bundled artifacts; no keys; no runtime API |
| 12 | localStorage row-offset cache; “accurate till 2022” | Committed snapshot + provenance date; schema versioning |
| 13 | Analytics with hardcoded GA secret | Deleted; no telemetry |
| 14 | One-shot boot `setTimeout(500)` + URL string includes | Router + view registry; survives SPA navigation |
| 15 | Webpack `mode: development`, source maps shipped, manual file copies | esbuild prod build; no maps in release |
| 16 | Firefox MV2 manifest | MV3 for both browsers |
| 17 | Dead code (`TagPageProblemTableUnlocker` stub, mismatched exports, commented blocks) | Gone with rewrite |
| 18 | Popup patch-notes wall | Minimal, honest popup (§7.4) |
| 19 | Three different names across repo/manifest/popup | “LeetCode Enhancer” everywhere |
| 20 | README advertises removed premium features | README rewritten for v3 |

## 14. Appendix B — native reference notes (research, 2026-10-18)

From the archived `/company/google` page (Wayback, 2025-09-11) and LeetCode's
CSS bundles:

- Company pages are generated company “favorites”: `google-thirty-days`,
  `google-three-months`, `google-six-months`,
  `google-more-than-six-months`, `google-all`. Header shows name, question
  count, saved-by count, updated date. Controls include time window, frequency
  sort (premium), role, difficulty, tags.
- Problem pages group company tags by recency: 0–6 months, 6 months–1 year,
  1–2 years (their survey buckets). Our mapping (§7.2) is the closest honest
  equivalent from the repo's windows.
- Design tokens observed: `--sd-background|foreground|muted|easy|medium|hard|
  primary|card|border`, `--fill-primary..quaternary`, `--text-primary..`, and
  `.dark` on `<html>` flipping everything. Token classes like
  `bg-fill-quaternary`, `text-sd-foreground` are what native components use.
- Source repo shape: 470 companies × 5 CSVs (2,350 files, 5.8 MB), columns as in
  §9.1; latest commits mid-2026 (actively refreshed).

## 15. Left to the builder

- Exact artifact schema details (e.g. splitting `index.json` if size demands).
- Frequency formula constants may be tuned once real distributions are seen
  (keep the module + tests authoritative).
- Chunk size for table rendering, tooltip copy, empty-state copy.
- The precise main-content anchor selectors for each page (fixtures decide).
- Alias map entries (built during Phase 1 from real folder names).
- Playwright wiring details (phase 4).
- CI workflow details (schedule, validation thresholds).
- **Open (asked of product owner)**: Firefox distribution posture — v2-style
  “load temporary add-on” instructions (unsigned zip), or set up AMO unlisted
  signing (requires their AMO account/API keys; makes installs permanent). Only
  affects Phase 4 / README.
