# DOM fixtures — local only

Real LeetCode page snapshots used to develop and test the injected surfaces.
The `*.html` files here are **gitignored on purpose**: a saved page contains
your account chrome (username, avatar URL), so it stays on your machine.

Fixtures are captured by hand:

1. Open the page on leetcode.com and let it finish loading.
2. DevTools → **Elements** → right-click the top `<html>` node →
   **Copy** → **Copy outer HTML**.
3. Paste into a new file here with the exact name below.

| File | Page |
| --- | --- |
| `company-google.html` | `https://leetcode.com/company/google/` |
| `problem-two-sum.html` | `https://leetcode.com/problems/two-sum/` |
| `problemset.html` | `https://leetcode.com/problemset/` |

Tests that need a fixture are skipped when its file is missing
(`describe.skipIf`), so `pnpm test` stays green on machines without snapshots.
