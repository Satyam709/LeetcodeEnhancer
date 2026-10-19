/**
 * Runtime mirrors of the Plan 1 data schema. These types describe what the
 * bundled artifacts contain — keep them in sync with tools/sync-data/schema.ts.
 */

export const SCHEMA_VERSION = 1;

export type WindowKey = "d30" | "d3m" | "d6m" | "g6m" | "all";

/** Canonical window order — also the mask bit order (d30=1 … all=16). */
export const WINDOW_KEYS: readonly WindowKey[] = [
  "d30",
  "d3m",
  "d6m",
  "g6m",
  "all",
];

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface SourceInfo {
  repo: string;
  commitSha: string;
  commitDate: string;
}

export interface Meta {
  schemaVersion: 1;
  source: SourceInfo;
  generatedAt: string;
  enriched: boolean;
  counts: {
    companies: number;
    problems: number;
    entries: number;
    rejectedRows: number;
  };
  /** Every written file except meta.json itself. */
  files: Record<string, { sha256: string; bytes: number }>;
}

export interface IndexCompany {
  slug: string;
  name: string;
  /** Per-window entry counts, in WINDOW_KEYS order. */
  counts: number[];
}

export interface IndexProblem {
  id: number | null;
  title: string;
  difficulty: Difficulty;
  /** Raw acceptance × 10000 (one decimal of percent). */
  acceptance: number;
  /** Topic ids into topics.json order. */
  topics: number[];
  /** 0–100 derived frequency score. */
  freqScore: number;
}

export interface Index {
  companies: IndexCompany[];
  problems: Record<string, IndexProblem>;
}

/** Company slug → per-window [problemSlug, frequency] lists (sorted desc). */
export type CompanyShard = Record<WindowKey, [string, number][]>;

/** Problem slug → [companyIdx, windowMask]; mask bits d30=1 … all=16. */
export type ProblemShard = Record<string, [number, number][]>;
