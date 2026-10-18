# v3 Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the build-time pipeline that turns `liquidslr/leetcode-company-wise-problems` CSVs into the validated, sharded JSON artifacts the extension ships and reads.

**Architecture:** A standalone Node/TypeScript tool (`tools/sync-data/`) run via `pnpm data:sync`. It fetches a source tarball (or a local checkout), parses 2,350 CSVs, normalizes and inverts them into sharded artifacts (`index.json`, `topics.json`, `companies/<slug>.json`, `problems/<prefix>.json`, `meta.json`) under `data/` (gitignored). Every stage is a pure module with unit tests; the CLI is thin glue.

**Tech Stack:** Node ≥ 20 (v24 on this machine), TypeScript strict, `tsx`, `vitest`, `csv-parse`, `tar`.

**Spec:** `docs/superpowers/specs/2026-10-18-v3-native-company-data-design.md` (sections §3, §9). Read it with this plan.

## Global Constraints

- TypeScript strict mode; pnpm; ESM (`"type": "module"`).
- No Google Sheets, no runtime API keys, no telemetry anywhere.
- Only derived indexes ship — never the raw CSVs. Source repo + commit recorded in `meta.json`; attribution copy lives in README/popup (later plans).
- Acceptance display value = raw CSV value × 10000, one decimal (verified: `0.005800918768980581` → `58.0`).
- Window keys, in recency order: `d30`, `d3m`, `d6m`, `g6m`, `all`; files `1. Thirty Days.csv`, `2. Three Months.csv`, `3. Six Months.csv`, `4. More Than Six Months.csv`, `5. All.csv`.
- Frequency formula (spec §3): per problem, each company contributes its **most recent** window only; weights `{d30: 1.0, d3m: 0.7, d6m: 0.55, g6m: 0.3, all: 0.15}`; contribution = weight × frequency/100; `score = clamp(round(100 × raw / p99(raw)), 0, 100)`.
- Problem shard file name: `problemShardName(slug)` = take `slug.slice(0, 2)`, lowercase, replace non `[a-z0-9]` with `_`, pad to 2 chars with `_`, append `.json` (e.g. `two-sum` → `tw.json`; `x` → `x_.json`). **This exact function is re-implemented in the runtime plan — keep it identical.**
- Budgets enforced by validation: total artifacts ≤ 4 MB; `index.json` ≤ 700 KB.
- `meta.json`: `schemaVersion: 1`; includes source `{repo, commitSha, commitDate}`, `generatedAt`, `enriched`, counts, and per-file `{sha256, bytes}`.
- `data/` is gitignored (set up in Task 1) and written atomically (temp dir → swap); a failed run must never leave partial output.

## Review Focus

- **Malformed CSV rows** (embedded commas/quotes in `Topics`, CRLF, BOM, short rows): a reasonable person expects the row either parsed correctly or skipped with a reason — never a crash, never corruption of neighboring rows. (Task 2 + Task 4 tests.)
- **Company folder names whose naive slug differs from LeetCode's real slug** (`J.P. Morgan`, `Apollo.io`, `DE Shaw`, `Analytics quotient`, `DP world`): expect the alias map to be the fix; representatives pinned in tests. (Task 3; verified live in Task 9.)
- **Empty company windows**: some companies have zero rows in a window; expect an empty array key, not a missing key and not a crash. (Task 6 fixture.)
- **Duplicate problem in a window**: expect dedupe keeping the highest frequency. (Task 6 test.)
- **Missing/partial `data/` at build time**: the extension build must fail loudly with "run pnpm data:sync" — never silently ship an empty dataset. (Plan 2 build; pipeline guarantees atomic writes here.)

---

### Task 1: Retire v2 scaffold, stand up the v3 toolchain

**Files:**
- Create: `package.json` (replaces v2), `tsconfig.json`, `vitest.config.ts`
- Modify: `.gitignore` (append `data/`, `releases/`, `coverage/`)
- Delete: `src/`, `tests/`, `scripts/`, `webpack.config.js`, `.babelrc`, `manifest.json`, `firefox-manifest.json` (recoverable from `main`)
- Keep: `assets/`, `screenshots/`, `README.md` (rewritten in a later plan), `.prettierrc`, `.prettierignore`

**Interfaces:**
- Produces: working `pnpm typecheck` / `pnpm test` / `pnpm data:sync` script slots every later task relies on.

- [ ] **Step 1: Replace `package.json`**

  `name: "leetcode-enhancer"`, `version: "3.0.0"`, `private: true`, `type: "module"`. Scripts: `typecheck: tsc --noEmit`, `test: vitest run`, `test:watch: vitest`, `data:sync: tsx tools/sync-data/index.ts`, `format: prettier --write .`. Dependencies: `csv-parse`, `tar`. DevDependencies: `typescript`, `tsx`, `vitest`, `jsdom`, `@types/node`, `prettier`.

- [ ] **Step 2: Add `tsconfig.json` and `vitest.config.ts`**

  tsconfig: `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `types: ["node"]`, `include: ["src", "tools", "tests", "scripts"]`, `noEmit: true`. vitest: `environment: "jsdom"`, `passWithNoTests: true` (temporarily).

- [ ] **Step 3: Delete v2 files, install, verify**

```bash
rm -rf src tests scripts webpack.config.js .babelrc manifest.json firefox-manifest.json
pnpm install
pnpm typecheck && pnpm test
```
  Expected: install succeeds; typecheck passes; vitest exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: stand up v3 toolchain (ts, vitest); retire v2 source"
```

---

### Task 2: CSV parsing

**Files:**
- Create: `tools/sync-data/csv.ts`
- Test: `tests/unit/pipeline/csv.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): string[][]` — header row included; BOM stripped; values trimmed; short rows pass through as short arrays (validated downstream).

- [ ] **Step 1: Write failing tests**

```ts
import { parseCsv } from "../../../tools/sync-data/csv";

it("parses quoted fields containing commas", () => {
  const rows = parseCsv('Difficulty,Title\nEASY,"Two Sum"\n');
  expect(rows[1][1]).toBe("Two Sum");
  const quoted = parseCsv('Difficulty,Title,Topics\nMEDIUM,X,"Array, Hash Table"');
  expect(quoted[1][2]).toBe("Array, Hash Table");
});
it("handles CRLF and a BOM", () => {
  const rows = parseCsv("\uFEFFA,B\r\n1,2\r\n");
  expect(rows[0][0]).toBe("A");
  expect(rows[1][1]).toBe("2");
});
it("passes short rows through as short arrays", () => {
  const rows = parseCsv("A,B,C\n1,2\n");
  expect(rows[1]).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `pnpm vitest run tests/unit/pipeline/csv.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `parseCsv`**

  Thin wrapper over `csv-parse/sync` with `{ bom: true, trim: true, relax_column_count: true, skip_empty_lines: true }`.

- [ ] **Step 4: Run tests to verify they pass** — then commit `feat: csv parsing for pipeline`.

---

### Task 3: Company slug derivation + alias map

**Files:**
- Create: `tools/sync-data/slugs.ts`, `tools/sync-data/company-aliases.json` (start `{}`)
- Test: `tests/unit/pipeline/slugs.test.ts`

**Interfaces:**
- Produces: `deriveCompanySlug(folderName: string): string`; `resolveCompanySlug(folderName: string, aliases: Record<string, string>): string` (alias lookup first, then derive).

- [ ] **Step 1: Write failing tests** (pinned against real folder names in the repo)

```ts
it.each([
  ["Amazon", "amazon"],
  ["American Express", "american-express"],
  ["AQR Capital Management", "aqr-capital-management"],
  ["ByteDance", "bytedance"],
  ["AMD", "amd"],
  ["CARS24", "cars24"],
  ["DP world", "dp-world"],
  ["Analytics quotient", "analytics-quotient"],
  ["Apollo.io", "apollo-io"],
  ["Goldman Sachs", "goldman-sachs"],
])("derives %s -> %s", (name, slug) => expect(deriveCompanySlug(name)).toBe(slug));
it("alias wins over derivation", () => {
  expect(resolveCompanySlug("J.P. Morgan", { "J.P. Morgan": "jpmorgan" })).toBe("jpmorgan");
});
```

- [ ] **Step 2: Verify they fail** (`pnpm vitest run tests/unit/pipeline/slugs.test.ts`)

- [ ] **Step 3: Implement** — lowercase; replace any run of non-`[a-z0-9]` with `-`; collapse repeats; trim `-`. Ship `company-aliases.json` as the curated exception list (empty to start; populated in Task 9).

- [ ] **Step 4: Pass + commit** `feat: company slug derivation with alias map`.

---

### Task 4: Window mapping + row transform

**Files:**
- Create: `tools/sync-data/windows.ts`, `tools/sync-data/transform.ts`
- Test: `tests/unit/pipeline/transform.test.ts`

**Interfaces:**
- Produces: `type WindowKey = "d30" | "d3m" | "d6m" | "g6m" | "all"`; `WINDOW_FILES: readonly { file: string; key: WindowKey }[]` (the five file names above, recency order); `transformRow(row: string[]): TransformResult` where `TransformResult = { ok: true; value: ProblemRow } | { ok: false; reason: string }` and `ProblemRow = { slug: string; title: string; difficulty: "Easy" | "Medium" | "Hard"; acceptance: number; frequency: number; topics: string[] }`.

- [ ] **Step 1: Write failing tests**

```ts
const header = "Difficulty,Title,Frequency,Acceptance Rate,Link,Topics";
it("transforms a valid row", () => {
  const r = transformRow(["MEDIUM","Two Sum","100.0","0.005800918768980581",
    "https://leetcode.com/problems/two-sum","Array, Hash Table"]);
  expect(r).toEqual({ ok: true, value: { slug: "two-sum", title: "Two Sum",
    difficulty: "Medium", acceptance: 58.0, frequency: 100, topics: ["Array","Hash Table"] } });
});
it.each([
  [["EASY","X","1","0.5","not-a-url",""], "bad link"],
  [["EXPERT","X","1","0.5","https://leetcode.com/problems/x",""], "bad difficulty"],
  [["EASY","X"], "short row"],
])("rejects %#: %s", (row, reason) => {
  const r = transformRow(row as string[]);
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2: Verify they fail**

- [ ] **Step 3: Implement** — validate length ≥ 6; difficulty ∈ {EASY, MEDIUM, HARD} (display-normalized); slug from `/problems/([^/]+)/` on Link; acceptance = clamp(raw × 10000, 0, 100) rounded to 1 decimal; frequency numeric clamped 0–100 (1 decimal); topics split on `,`, trimmed, empties dropped.

- [ ] **Step 4: Pass + commit** `feat: pipeline row transform`.

---

### Task 5: Frequency scoring

**Files:**
- Create: `tools/sync-data/frequency.ts`
- Test: `tests/unit/pipeline/frequency.test.ts`

**Interfaces:**
- Produces: `windowWeight(k: WindowKey): number`; `mostRecentWindow(keys: WindowKey[]): WindowKey` (recency order, first present); `rawScore(parts: { window: WindowKey; frequency: number }[]): number` (Σ weight × frequency/100); `normalizeScores(raws: number[]): number[]` (p99 = sorted[floor(0.99 × (n−1))]; empty or p99 = 0 → all zeros; clamp 0–100).

- [ ] **Step 1: Write failing tests**

```ts
it("picks the most recent window", () =>
  expect(mostRecentWindow(["all", "d6m", "d3m"])).toBe("d3m"));
it("computes a weighted raw score", () =>
  expect(rawScore([{ window: "d30", frequency: 50 }, { window: "all", frequency: 100 }]))
    .toBeCloseTo(0.65));
it("normalizes against p99 and clamps", () => {
  const scores = normalizeScores([100, 1, 1, 1, 1]);
  expect(scores[0]).toBe(100);
  expect(scores[1]).toBe(1);
});
it("returns zeros for empty input", () => expect(normalizeScores([])).toEqual([]));
```

- [ ] **Step 2: Verify they fail** → **Step 3: implement** → **Step 4: pass** → commit `feat: derived frequency scoring`.

---

### Task 6: Artifact builder

**Files:**
- Create: `tools/sync-data/schema.ts` (types), `tools/sync-data/build-artifacts.ts`, `tools/sync-data/hash.ts` (`sha256(text): string`)
- Test: `tests/unit/pipeline/build-artifacts.test.ts`

**Interfaces:**
- Produces:
  - `type RowEntry = { slug: string; frequency: number }`; `type CompanyData = { slug: string; name: string; windows: Record<WindowKey, RowEntry[]> }`.
  - `problemShardName(slug: string): string` (exact rule from Global Constraints).
  - `buildArtifacts(companies: CompanyData[], meta: { source: SourceInfo; enriched: boolean; rejectedRows: number }): Artifacts` where `Artifacts = { meta: Meta; index: Index; topics: string[]; companyShards: Map<string, CompanyShard>; problemShards: Map<string, ProblemShard> }`.
  - Shapes (schemaVersion 1):
    - `Index = { companies: { slug, name, counts: number[] }[]; problems: Record<string, { id: number | null; title; difficulty; acceptance; topics: number[]; freqScore: number }> }` — `topics` are indices into `topics.json`.
    - `CompanyShard = Record<WindowKey, [string, number][]>` — always all five keys, each sorted by frequency desc then slug asc.
    - `ProblemShard = Record<string, [companyIdx: number, windowMask: number][]>` — mask bits `d30=1, d3m=2, d6m=4, g6m=8, all=16`.
    - `Meta = { schemaVersion: 1; source: SourceInfo; generatedAt: string; enriched: boolean; counts: { companies; problems; entries; rejectedRows }; files: Record<string, { sha256: string; bytes: number }> }`.
  - `writeArtifacts(dir: string, artifacts: Artifacts): Promise<void>` — writes all files (creating `companies/`, `problems/`), computes `files` hashes for `meta.json` last, writes atomically (temp dir + rename).
- Consumes: `ProblemRow` (Task 4), frequency fns (Task 5).

- [ ] **Step 1: Write failing tests** with a 3-company fixture (one company has an empty `d30` window; one problem appears twice in a window with different frequencies).

  Assert: empty window present as `[]`; duplicate deduped to max frequency; `windowMask` bit math (e.g. problem in `d3m` + `all` → 18); company shards sorted desc; topic interning (same topic string → same index); `meta.counts` exact; `writeArtifacts` into a tmp dir produces every file and `meta.files` hashes match recomputed sha256.

- [ ] **Step 2: Verify they fail** → **Step 3: implement** → **Step 4: pass** → commit `feat: artifact builder (sharded, hashed, atomic)`.

---

### Task 7: Validation gate

**Files:**
- Create: `tools/sync-data/validate.ts`
- Test: `tests/unit/pipeline/validate.test.ts`

**Interfaces:**
- Produces: `BUDGETS = { totalBytes: 4 * 1024 * 1024, indexBytes: 700 * 1024 }`; `validateArtifacts(artifacts: Artifacts, budgets = BUDGETS): { ok: boolean; errors: string[] }` — checks: `schemaVersion === 1`; every slug matches `/^[a-z0-9-]+$/`; referential integrity (every problem slug in company shards exists in index; every company index entry has a shard; topic indices in range); sizes within budget.
- Consumes: `Artifacts` (Task 6).

- [ ] **Step 1: Write failing tests** — valid fixture passes; dangling problem slug fails; missing shard fails; oversize (inject tiny budgets) fails; bad slug (`"Two Sum"`) fails.

- [ ] **Step 2: Verify fail** → **Step 3: implement** → **Step 4: pass** → commit `feat: artifact validation gate`.

---

### Task 8: Source fetch + CLI

**Files:**
- Create: `tools/sync-data/source.ts`, `tools/sync-data/index.ts`
- Test: `tests/unit/pipeline/source.test.ts`

**Interfaces:**
- Produces: `REPO = "liquidslr/leetcode-company-wise-problems"`; `fetchSource(opts: { localPath?: string; tarballUrl?: string }): Promise<{ dir: string; commitSha: string; commitDate: string }>` — `localPath` passthrough (tests); otherwise download `codeload.github.com/<REPO>/tar.gz/refs/heads/main` to a temp dir, extract with `tar`, best-effort GitHub API lookup for the latest commit (failure → `commitSha: "unknown"`, `commitDate: today`).
- CLI `pnpm data:sync [--local <dir>] [--out <dir=./data>]`: discover company folders (directories containing all five window files), parse → transform (counting rejects) → group per company/window with dedupe → `buildArtifacts` → `validateArtifacts` → atomic write → print summary (`companies`, `problems`, `entries`, `rejectedRows`, total bytes, `commitDate`); exit 1 with actionable message on validation failure.

- [ ] **Step 1: Write failing tests** for `fetchSource({ localPath })` (fixture dir with a fake company folder returns `dir` + fallback meta), and for `discoverCompanies(dir)` (finds only folders with all five window files).

- [ ] **Step 2: Verify fail** → **Step 3: implement** → **Step 4: pass**.

- [ ] **Step 5: End-to-end local run**

```bash
pnpm data:sync --local tests/fixtures/mini-source
```
  Expected: summary prints; `data/meta.json`, `data/index.json`, `data/topics.json` exist; validation ok.

- [ ] **Step 6: First real sync** (network)

```bash
pnpm data:sync
```
  Expected: ≥ 400 companies, ≥ 3,000 problems; total ≤ 4 MB; summary shows a 2026 commit date; spot-check `data/companies/google.json` is sorted by frequency desc. If validation fails on budgets, intern/split before proceeding (spec §9.5).

- [ ] **Step 7: Commit** `feat: sync-data CLI + source fetch`.

---

### Task 9: Alias curation + slug checker (dev tool)

**Files:**
- Create: `tools/sync-data/check-slugs.ts`; modify `tools/sync-data/company-aliases.json`
- Test: `tests/unit/pipeline/check-slugs.test.ts`

**Interfaces:**
- Produces: `checkSlugs(slugs: string[], fetchImpl?: typeof fetch): Promise<{ slug: string; status: "ok" | "not-found" | "unknown" }[]>` — `HEAD https://leetcode.com/company/<slug>/`; non-2xx → `not-found`; network/Cloudflare errors → `unknown` (never throws).

- [ ] **Step 1: Failing test** with a mock fetch (200, 404, network error) → three statuses.
- [ ] **Step 2: Verify fail** → **Step 3: implement** → **Step 4: pass.**
- [ ] **Step 5: Run against the real dataset** (gentle, sequential, ~2 req/s) for the top ~60 companies by all-time count; add corrections to `company-aliases.json` (expected: `J.P. Morgan → jpmorgan`, `Apollo.io → apollo-io` or real slug, etc.); re-run `pnpm data:sync`.
- [ ] **Step 6: Commit** `feat: slug checker + alias curation`.

---

## Self-Review Notes

- Spec §9.1 steps 1–6 map to Tasks 2–8; step 7 (enrichment) is intentionally deferred: it is optional, and its only consumer (the `#` column / lock icons) degrades gracefully — a task will be added when a surface needs it (Plan 3).
- §9.2 artifact table: `topics.json` was added (topic interning keeps `index.json` under budget); `meta.files` covers it.
- §9.5 estimates become real numbers at Task 8 Step 6; budgets enforced in Task 7.
