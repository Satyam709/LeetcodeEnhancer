# Manual QA — company data surfaces

Run after changes to the views, selectors, router, styles, or build. Steps 3–7
happen in one browser session per browser, including at least one hard reload.

1. `pnpm build` (use `pnpm data:sync` too if the dataset changed)
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
   - header shows the all-time count + `Updated <source date>`; 5 tabs with
     **30 days** active; search, difficulty and sort controls work
   - click the **Title / Acceptance / Difficulty / Frequency** headers: the
     list re-sorts and the select stays in sync; open each select in dark mode
     and confirm the option list is readable (solid dark surface)
   - rows show position, title, acceptance, difficulty, frequency bar; clicking
     a row opens the problem
   - switch to **All** (2,344 rows for Google) → first 100 render, **Load more**
     appends the next 100; switch to a sparse window → quiet empty state
   - unknown company (`/company/not-a-real-company/`) → "No community data for
     this company yet."
5. Premium account on the same company page (or a page where LeetCode renders
   the native list): our view must not mount, the native list behaves normally
6. `/problems/two-sum/` (free account):
   - the locked Companies chip is replaced by a working chip with a count that
     visually matches the native chips; clicking it toggles a panel grouped
     **Last 6 months / More than 6 months / All time**; company tags look like
     native topic tags and navigate to
     `/company/{slug}/?favoriteSlug={slug}-thirty-days`
   - from the problem page, open a company tag then press browser Back **once**:
     it must return to the problem (no extra `?favoriteSlug` history entry)
   - premium account → native Companies chip untouched
7. `/problemset/`:
   - rows we track show a derived frequency bar (hover: "Derived frequency
     n/100 — community company data"); untracked rows keep LeetCode's locked
     bars; premium rows without a lock are untouched
   - open page 2 of the list → newly rendered rows are enhanced too
   - scroll up and down through the virtualized list; bars that React re-renders
     are re-applied on the next frame (no permanently lost cells)
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

- Real-DOM fixture tests for the three surfaces (takeover, chip panel, bars,
  premium no-ops, teardown/stale writes): `tests/unit/views/*.test.ts`
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
