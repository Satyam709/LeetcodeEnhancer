# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LeetCode Enhancer v3: an MV3 browser extension (Chrome + Firefox) that injects community company-interview data into leetcode.com, rendered so it looks native. The data comes from the `liquidslr/leetcode-company-wise-problems` GitHub repo. There is no premium-content unlocking, no Google Sheets, and no telemetry. For the original design rationale, see `docs/superpowers/specs/2026-10-18-v3-native-company-data-design.md` and the plans in `docs/superpowers/plans/`.

## Commands (pnpm)

```bash
pnpm data:sync                 # download source repo → build + validate artifacts into ./data (gitignored)
pnpm data:sync --local <dir>   # use a local checkout instead (e.g. tests/fixtures/mini-source)
pnpm build                     # dist/ for Chrome (needs ./data/meta.json; fails loudly otherwise)
pnpm build:firefox             # dist/ for Firefox (adds browser_specific_settings.gecko)
pnpm package                   # minified dist/chrome + dist/firefox, zipped to releases/ (what ships)
pnpm dev                       # esbuild watch → dist/
pnpm typecheck                 # tsc --noEmit (src, tools, tests, scripts)
pnpm test                      # vitest run (jsdom by default)
pnpm vitest run tests/unit/content/router.test.ts   # single file
pnpm vitest run -t "pattern"                         # by test name
pnpm format                    # prettier
```

Load `dist/` as an unpacked extension (Chrome) or `dist/manifest.json` as a temporary add-on (Firefox). The manual QA checklist is `docs/dev/manual-qa.md`. To turn on debug logging on leetcode.com, run `localStorage.setItem("lce:debug","1")`. Logs are prefixed `[lce]` and include `lce:<view> mounted/unmounted`.

## Architecture

There are two halves, and they only talk to each other through the data artifacts.

**1. Data pipeline (`tools/sync-data/`, Node, run via tsx).** `source.ts` fetches the tarball (or reads `--local`). Each company folder has five window CSVs, defined in `windows.ts`: d30, d3m, d6m, g6m, all. They flow through `csv.ts`, `transform.ts` (per-row, rejected rows are counted), `slugs.ts` (company slug + `company-aliases.json`), `frequency.ts` (derived 0–100 score), and `build-artifacts.ts`. `validate.ts` checks size budgets and sanity bands, and nothing is written if validation fails. The output is `data/meta.json` (schema version, source commit, sha256 per file), `index.json`, `topics.json`, `companies/<slug>.json`, and `problems/<xx>.json`. Problems are sharded by the first two characters of the slug.

**2. Extension (`src/`, bundled by `scripts/build.ts` with esbuild as IIFE).** `manifest.base.json` plus `scripts/manifest.ts` produce the per-browser manifest. The build copies `data/` into `dist/data/` as a `web_accessible_resource`.

- `src/content/index.ts` is the boot entry. It must never throw into the page.
- `src/content/router.ts` is an SPA router: popstate plus a 300 ms URL poll. A generation token drops stale async mounts. Views remount when their `key()` changes (for example, a different company or problem slug on the same view).
- `src/content/registry.ts` maps routes to views:
  - `/company/{slug}` → `views/company-page`: replaces the locked right column.
  - `/problems/{slug}` → `views/problem-companies`: replaces the locked Companies chip and the locked Companies accordion item under the statement. The chip opens and scrolls to the item, like LeetCode's own Topics chip.
  - `/problemset` and `/problem-list/*` → `views/problemset`: derived frequency bars in locked cells.
  - Every `mount` returns a teardown that must restore every DOM node it touched.
- `src/lib/dom/watch.ts` (`watchDom`) keeps injections alive. LeetCode's React tree re-renders often, for example when it loads the next page of the problemset or re-renders the problem description, and that drops our nodes or re-shows locked ones. Each view registers an idempotent `apply()` that runs synchronously in a MutationObserver callback, before the next paint, so the native locked UI never flashes. Mutations inside `.lce-root` are ignored. Hide native nodes in place with `style.display` and never detach them, because React owns them. Re-attach the same node of ours so user state such as tabs, search and open accordions survives.
- `src/lib/data/` is the runtime data layer: memoizing `fetch` of `runtime.getURL("data/...")`. It throws `DataUnavailable` on a missing file or a schema mismatch.
- `src/lib/dom/selectors.ts` is the single home for every LeetCode selector. `readiness.ts` provides `waitFor`/`waitUntil`, which are MutationObserver-based and abortable. `html.ts` provides the `el()` and `svg()` builders. No UI framework is used.
- `src/lib/settings.ts` wraps `storage.local` settings (currently just `highlight`). The popup (`src/popup/`) edits them, and content scripts subscribe to changes.

## Invariants to preserve

- **Native-first:** only enhance where LeetCode's UI is _positively detected_ as locked or absent. Examples are the premium wall, a `img[alt="premium lock icon"]`, or a locked chip. Premium users must see untouched native UI. Rows with no data get no injected element.
- **Selectors:** anchor on structure, text, or artifacts, never on CSS-module hashes. Match only the stable part of hashed class names (`[class*="subscribeContainer"]`), because LeetCode has changed the hashing scheme before (`company_subscribeContainer__x` became `G73WBW_subscribeContainer`). Add new selectors to `selectors.ts`.
- **CSS:** every selector in `src/styles/content.css` must start with `.lce`. `tests/unit/build/css-scope.test.ts` enforces this. Use LeetCode's own tokens with fallbacks and never redefine them. There are plain colours (`--text-primary`, `--fill-*`) and HSL channels (`--sd-*`, used as `hsl(var(--sd-easy))`), and the native lists use the `--sd-*` ones. The test also bans `font-size`. Size text with LeetCode's utility classes on the node instead (`text-xs`, `text-sm`), and copy native class strings for chips and tags, as the views already do. LeetCode's CSS loads after ours and resets `[type="button"]` backgrounds, so a button rule that sets a background needs `.lce-root .lce-x` specificity.
- **Mirrored code:** keep these pairs in sync, because each pair implements the same contract on both sides.
  - `src/lib/data/types.ts` mirrors `tools/sync-data/schema.ts`.
  - `problemShardName` exists in both `src/lib/data/shards.ts` and `tools/sync-data/build-artifacts.ts`.
  - Window mask bits are d30=1, d3m=2, d6m=4, g6m=8, all=16.

## Tests

- Vitest runs with the jsdom environment by default. Tests that use esbuild's JS API need `// @vitest-environment node` at the top of the file.
- `tests/fixtures/mini-source/` is a tiny fake source repo for pipeline tests.
- `tests/fixtures/dom/*.html` are real LeetCode page snapshots. They are captured by hand, gitignored, and stay local (see the README there). Tests that use them are wrapped in `describe.skipIf(!hasFixture(...))`, so they skip silently when the files are missing. A green suite only means something if the snapshots are current. Stale snapshots once hid a broken live company page, so recapture them (logged out, extension disabled) when LeetCode markup changes.
- Views and the registry accept an injectable `DataLayer` and a `timeoutMs` so tests can run against them. View tests route mounts through a tracked wrapper that tears down in `afterEach`. Otherwise a failing test leaves a live `watchDom` behind, and it injects into the next test's fixture.
