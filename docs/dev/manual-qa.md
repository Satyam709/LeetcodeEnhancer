# Manual QA — company data surfaces

Run after changes to the views, selectors, router, styles, or build. Steps 3–7
happen in one browser session per browser, including at least one hard reload.

1. `pnpm build` (use `pnpm data:sync` too if the dataset changed). Before a
   release, run the checklist against `pnpm package` output (`dist/chrome/`,
   `dist/firefox/`) — that is what ships
2. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`
   then click ↻ on the card and reload the LeetCode tab after every rebuild
3. Set `localStorage["lce:debug"]="1"` once in the DevTools console. Console
   shows `[lce] lce:<view> mounted` / `lce:<view> unmounted` and no errors.
   Open the extension popup and toggle **Highlight injected changes**:
   our chips/panels/bars get green outlines/accents; toggling it off restores
   the normal (current) look. The choice survives a reload.
4. `/company/google/` (free account):
   - the premium wall disappears; the native left company card, Practice/Discuss
     and the "1 free interview question" row stay
   - header shows the all-time count + `Updated <source date>`; 5 pill tabs
     with per-window counts, **30 days** active
   - **Sort** button opens a menu (field + Ascending/Descending); clicking a
     column header sorts by it, clicking it again reverses it (arrow flips)
   - **Filter** button opens a panel: difficulty pills with counts, a topic
     list with counts and its own search; the badge shows how many filters are
     on; active filters appear as removable chips with **Clear all**, and the
     summary reads `N of M questions`; filters survive switching tabs
   - menus close on outside click and on Escape (focus returns to the button),
     and only one is open at a time; check both themes — tabs, tool buttons
     and pills all have a visible pill background
   - rows show position, title, acceptance, difficulty, frequency bar; clicking
     a row opens the problem
   - switch to **All** (2,344 rows for Google) → first 100 render, **Load more**
     appends the next 100; switch to a sparse window → quiet empty state
   - unknown company (`/company/not-a-real-company/`) → "No community data for
     this company yet."
5. Premium account on the same company page (or a page where LeetCode renders
   the native list): our view must not mount, the native list behaves normally
6. `/problems/two-sum/` (free account):
   - the locked Companies chip at the top is replaced by a **Companies** chip
     that looks like the Topics/Hint chips; the gold locked **Companies**
     accordion item under the statement is replaced by a working one between
     Topics and Hint 1
   - clicking the chip opens the accordion item and scrolls it into view (like
     the native Topics chip); the item lists **Last 6 months** / **Earlier**
     company tags, long groups collapse behind **Show all N**, and tags open
     `/company/{slug}/?favoriteSlug={slug}-thirty-days` in a new tab
   - switch Description → Editorial → Solutions → Description: chip and item
     are still there (and the item keeps its open state)
   - **Next problem** / **Previous problem** in the top bar: the new problem's
     companies appear, no locked Companies UI is visible at any point
   - premium account → native Companies chip and accordion untouched
7. `/problemset/`:
   - rows we track show a derived frequency bar (hover: "Derived frequency
     n/100 — community company data"); untracked rows (e.g. the daily
     question) keep LeetCode's locked bars; premium rows are untouched
   - keep scrolling so LeetCode loads pages 2–4 of the list: the bars must not
     flash back to the locked widget while a page loads, and new rows get bars
8. Theme: toggle light / dark / system → our surfaces and select option popups
   follow LeetCode tokens
9. SPA navigation: problemset → problem → company → back; then use **Next
   problem** (problem → problem) and the company header search (company →
   company). Exactly one `mounted`/`unmounted` per slug change, the visible
   surface always matches the current slug, hidden native nodes are restored,
   no errors
10. Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary
    Add-on…** → select `dist/manifest.json` → repeat 3–9 after
    `pnpm build:firefox` (re-run `pnpm build` afterwards for Chrome). The
    popup toggle uses the `storage` permission.

## Notes

- The debug flag is per-origin: `localStorage.removeItem("lce:debug")` silences
  the logs.
- If the wall/chip/slot is missing, every view no-ops by design; hidden native
  nodes are only touched when LeetCode shows the premium lock artifacts.

## Covered by automation (no manual step needed)

- Real-DOM fixture tests for the three surfaces (takeover, chip + accordion,
  bars, premium no-ops, React re-render recovery, teardown/stale writes):
  `tests/unit/views/*.test.ts`. These only prove anything against **current**
  LeetCode markup: recapture `tests/fixtures/dom/*.html` (see its README)
  before a release — stale snapshots once kept the suite green while a
  renamed CSS-module class had broken the live company page
- Selector anchors against captured live pages: `tests/unit/dom/selectors.test.ts`
- Mount → soft navigation → teardown-before-mount, exactly-once semantics:
  `tests/integration/content-boot.test.ts`
- CSS scoping / token contract: `tests/unit/build/css-scope.test.ts`
- Manifest correctness for both browsers: `tests/unit/build/manifest.test.ts`,
  `tests/unit/build/build.test.ts`
- Popup highlight preference (storage read/write/change, no-runtime fallback):
  `tests/unit/lib/settings.test.ts`
- React re-render/scroll re-enhancement for problemset bars:
  `tests/unit/views/problemset.test.ts`
