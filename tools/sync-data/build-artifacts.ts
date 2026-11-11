import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeScores, rawScore } from "./frequency";
import { sha256 } from "./hash";
import type {
  Artifacts,
  CompanyData,
  CompanyShard,
  Index,
  IndexProblem,
  Meta,
  ProblemShard,
  SourceInfo,
} from "./schema";
import type { ProblemRow } from "./transform";
import { WINDOW_FILES, type WindowKey } from "./windows";

const WINDOW_ORDER: readonly WindowKey[] = WINDOW_FILES.map((w) => w.key);

const WINDOW_BITS: Record<WindowKey, number> = {
  d30: 1,
  d3m: 2,
  d6m: 4,
  g6m: 8,
  all: 16,
};

/**
 * Shard file name for a problem slug: first two characters, lowercased,
 * non-alphanumerics as "_", padded to two chars (e.g. "two-sum" -> "tw.json",
 * "x" -> "x_.json"). Re-implemented identically in the runtime data layer.
 */
export function problemShardName(slug: string): string {
  let prefix = slug.slice(0, 2).toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (prefix.length < 2) prefix = `${prefix}_`.slice(0, 2);
  return `${prefix}.json`;
}

const byName = (a: CompanyData, b: CompanyData) =>
  a.name < b.name
    ? -1
    : a.name > b.name
      ? 1
      : a.slug < b.slug
        ? -1
        : a.slug > b.slug
          ? 1
          : 0;

/** Dedupe each window to max frequency per slug; sort desc, slug asc. */
function dedupeWindows(
  company: CompanyData
): Record<WindowKey, ProblemRow[]> {
  const out = {} as Record<WindowKey, ProblemRow[]>;
  for (const key of WINDOW_ORDER) {
    const best = new Map<string, ProblemRow>();
    for (const row of company.windows[key] ?? []) {
      const prev = best.get(row.slug);
      if (!prev || row.frequency > prev.frequency) best.set(row.slug, row);
    }
    out[key] = [...best.values()].sort(
      (a, b) =>
        b.frequency - a.frequency ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
    );
  }
  return out;
}

function mask(windows: Set<WindowKey>): number {
  let m = 0;
  for (const w of windows) m |= WINDOW_BITS[w];
  return m;
}

export function buildArtifacts(
  companiesInput: CompanyData[],
  input: { source: SourceInfo; enriched: boolean; rejectedRows: number }
): Artifacts {
  const companies = [...companiesInput]
    .sort(byName)
    .map((c) => ({ ...c, rows: dedupeWindows(c) }));

  // Company shards.
  const companyShards = new Map<string, CompanyShard>();
  for (const c of companies) {
    const shard = {} as CompanyShard;
    for (const key of WINDOW_ORDER) {
      shard[key] = c.rows[key].map((r): [string, number] => [
        r.slug,
        r.frequency,
      ]);
    }
    companyShards.set(c.slug, shard);
  }

  // Problem aggregation; first encounter wins metadata (deterministic order:
  // companies by name, windows by recency, rows by frequency/slug).
  interface Presence {
    windows: Set<WindowKey>;
    mostRecent: { window: WindowKey; frequency: number };
  }
  interface ProblemAgg {
    title: string;
    difficulty: ProblemRow["difficulty"];
    acceptance: number;
    topics: string[];
    companies: Map<number, Presence>;
  }
  const problems = new Map<string, ProblemAgg>();
  companies.forEach((c, companyIdx) => {
    for (const key of WINDOW_ORDER) {
      for (const row of c.rows[key]) {
        let agg = problems.get(row.slug);
        if (!agg) {
          agg = {
            title: row.title,
            difficulty: row.difficulty,
            acceptance: row.acceptance,
            topics: row.topics,
            companies: new Map(),
          };
          problems.set(row.slug, agg);
        }
        let presence = agg.companies.get(companyIdx);
        if (!presence) {
          // First encounter is the most recent — WINDOW_ORDER is recency order.
          presence = {
            windows: new Set(),
            mostRecent: { window: key, frequency: row.frequency },
          };
          agg.companies.set(companyIdx, presence);
        }
        presence.windows.add(key);
      }
    }
  });

  const slugs = [...problems.keys()].sort();
  const scores = normalizeScores(
    slugs.map((slug) =>
      rawScore(
        [...problems.get(slug)!.companies.values()].map((p) => ({
          window: p.mostRecent.window,
          frequency: p.mostRecent.frequency,
        }))
      )
    )
  );

  // Topic interning.
  const topicSet = new Set<string>();
  for (const agg of problems.values()) {
    for (const topic of agg.topics) topicSet.add(topic);
  }
  const topics = [...topicSet].sort();
  const topicIndex = new Map(topics.map((t, i) => [t, i]));

  // Index + problem shards.
  const indexProblems: Record<string, IndexProblem> = {};
  const problemShards = new Map<string, ProblemShard>();
  slugs.forEach((slug, i) => {
    const agg = problems.get(slug)!;
    indexProblems[slug] = {
      id: null,
      title: agg.title,
      difficulty: agg.difficulty,
      acceptance: agg.acceptance,
      topics: agg.topics.map((t) => topicIndex.get(t)!),
      freqScore: scores[i],
    };
    const name = problemShardName(slug);
    let shard = problemShards.get(name);
    if (!shard) {
      shard = {};
      problemShards.set(name, shard);
    }
    shard[slug] = [...agg.companies.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([companyIdx, p]) => [companyIdx, mask(p.windows)]);
  });

  const entries = [...problems.values()].reduce(
    (sum, p) => sum + p.companies.size,
    0
  );

  const index: Index = {
    companies: companies.map((c) => ({
      slug: c.slug,
      name: c.name,
      counts: WINDOW_ORDER.map((k) => companyShards.get(c.slug)![k].length),
    })),
    problems: indexProblems,
  };

  const meta: Meta = {
    schemaVersion: 1,
    source: input.source,
    generatedAt: new Date().toISOString(),
    enriched: input.enriched,
    counts: {
      companies: companies.length,
      problems: slugs.length,
      entries,
      rejectedRows: input.rejectedRows,
    },
    files: {},
  };

  return { meta, index, topics, companyShards, problemShards };
}

/**
 * Write all artifacts under `dir`, then swap them in atomically
 * (temp sibling directory + rename) so a failed run never leaves partial
 * output. `meta.files` is filled with hashes of every file except meta.json.
 */
export async function writeArtifacts(
  dir: string,
  artifacts: Artifacts
): Promise<void> {
  const tmp = `${dir}.tmp`;
  await rm(tmp, { recursive: true, force: true });

  const files: Meta["files"] = {};
  const write = async (rel: string, value: unknown) => {
    const text = JSON.stringify(value);
    files[rel] = { sha256: sha256(text), bytes: Buffer.byteLength(text) };
    const full = path.join(tmp, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  };

  await write("index.json", artifacts.index);
  await write("topics.json", artifacts.topics);
  for (const [slug, shard] of artifacts.companyShards) {
    await write(`companies/${slug}.json`, shard);
  }
  for (const [name, shard] of artifacts.problemShards) {
    await write(`problems/${name}`, shard);
  }

  artifacts.meta.files = files;
  await writeFile(
    path.join(tmp, "meta.json"),
    JSON.stringify(artifacts.meta),
    "utf8"
  );

  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
}
