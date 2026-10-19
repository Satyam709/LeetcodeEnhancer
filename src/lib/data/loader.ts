import { problemShardName } from "./shards";
import {
  SCHEMA_VERSION,
  WINDOW_KEYS,
  type CompanyShard,
  type Index,
  type Meta,
  type ProblemShard,
  type WindowKey,
} from "./types";

/** The data could not be loaded, or does not match the schema this build expects. */
export class DataUnavailable extends Error {
  constructor(path: string) {
    super(`data unavailable: ${path}`);
    this.name = "DataUnavailable";
  }
}

export interface ProblemCompanyEntry {
  companyIdx: number;
  windows: WindowKey[];
}

export interface DataLayer {
  meta(): Promise<Meta>;
  index(): Promise<Index>;
  /** `null` when the company has no shard (not tracked). */
  company(slug: string): Promise<CompanyShard | null>;
  /** `[]` when the problem has no shard or no company appears in it. */
  companiesForProblem(slug: string): Promise<ProblemCompanyEntry[]>;
  /** The index's derived score for a problem, or `undefined`. */
  derivedFrequency(slug: string): Promise<number | undefined>;
}

function isMeta(value: unknown): value is Meta {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const source = v.source as Record<string, unknown> | null | undefined;
  const counts = v.counts as Record<string, unknown> | null | undefined;
  return (
    v.schemaVersion === SCHEMA_VERSION &&
    typeof v.generatedAt === "string" &&
    typeof v.enriched === "boolean" &&
    typeof source === "object" &&
    source !== null &&
    typeof source.commitSha === "string" &&
    typeof counts === "object" &&
    counts !== null &&
    typeof counts.companies === "number" &&
    typeof v.files === "object" &&
    v.files !== null
  );
}

function decodeMask(mask: number): WindowKey[] {
  return WINDOW_KEYS.filter((_, i) => (mask & (1 << i)) !== 0);
}

/**
 * The runtime data layer. All reads go through an injected `loadJson` so the
 * same logic serves the extension (browser.ts) and tests. Everything is
 * memoized; every accessor is gated on a valid meta.json (schema-gated), so a
 * mismatched data bundle degrades to DataUnavailable instead of nonsense.
 */
export function createDataLayer(deps: {
  loadJson: (path: string) => Promise<unknown>;
}): DataLayer {
  const { loadJson } = deps;
  const memo = new Map<string, Promise<unknown>>();

  function memoized<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = memo.get(key);
    if (hit !== undefined) return hit as Promise<T>;
    const promise = load();
    memo.set(key, promise);
    return promise;
  }

  /** Load a shard; a DataUnavailable rejection means "missing" → null. */
  function loadShard<T>(path: string): Promise<T | null> {
    return memoized(path, async () => {
      await meta();
      try {
        return (await loadJson(path)) as T;
      } catch (err) {
        if (err instanceof DataUnavailable) return null;
        throw err;
      }
    });
  }

  function meta(): Promise<Meta> {
    return memoized("data/meta.json", async () => {
      const value = await loadJson("data/meta.json");
      if (!isMeta(value)) throw new DataUnavailable("data/meta.json");
      return value;
    });
  }

  function index(): Promise<Index> {
    return memoized("data/index.json", async () => {
      await meta();
      return (await loadJson("data/index.json")) as Index;
    });
  }

  function company(slug: string): Promise<CompanyShard | null> {
    return loadShard<CompanyShard>(`data/companies/${slug}.json`);
  }

  async function companiesForProblem(
    slug: string
  ): Promise<ProblemCompanyEntry[]> {
    const shard = await loadShard<ProblemShard>(
      `data/problems/${problemShardName(slug)}`
    );
    if (shard === null) return [];
    const entries = shard[slug];
    if (entries === undefined) return [];
    return entries.map(([companyIdx, mask]) => ({
      companyIdx,
      windows: decodeMask(mask),
    }));
  }

  async function derivedFrequency(slug: string): Promise<number | undefined> {
    const idx = await index();
    return idx.problems[slug]?.freqScore;
  }

  return { meta, index, company, companiesForProblem, derivedFrequency };
}
