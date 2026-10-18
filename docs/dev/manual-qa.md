# Manual QA — extension spine

Run after changes to the router, registry, styles, or build. Everything here is
list-ordered; steps 2–7 all happen in one browser session per browser.

1. `pnpm data:sync && pnpm build`
2. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`
3. Visit `https://leetcode.com/problemset/` → with `localStorage["lce:debug"]="1"` set (run it once in the DevTools console), the console shows `[lce] lce:problemset mounted` and **no errors**
4. Click into a problem → soft navigation → `lce:problem mounted` after `lce:problemset unmounted`, exactly once per navigation
5. Visit `https://leetcode.com/company/google/` → `lce:company mounted`; hard-reload → still a single mount, no duplicates
6. Rapidly click through 5 problems → exactly one `mounted` per page, no stacked teardowns, no errors
7. Toggle the theme (light / dark / system) → pages look identical to native LeetCode (stub views render nothing; verifies the injected CSS leaks nothing)
8. Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `dist/manifest.json` → repeat checks 2–5 (the router watches raw `location` + popstate and never calls `chrome.*` APIs, so the same logs must appear)

## Notes

- `pnpm build:firefox` overwrites `dist/` with the Firefox manifest — re-run `pnpm build` afterwards for Chrome.
- The debug flag is per-origin: `localStorage.removeItem("lce:debug")` silences the logs again.
- Stub views intentionally touch nothing in the DOM; until Plan 3 lands, "mounted" is observable through the debug log only.

## Covered by automation (no manual step needed)

- Mount → soft navigation → teardown-before-mount, exactly-once semantics (checks 3–5):
  `tests/integration/content-boot.test.ts` builds the real bundle and runs it in jsdom.
- CSS scoping and the token contract (check 7):
  `tests/unit/build/css-scope.test.ts`.
- Manifest correctness for both browsers (check 8's manifest half):
  `tests/unit/build/manifest.test.ts`, `tests/unit/build/build.test.ts`.
