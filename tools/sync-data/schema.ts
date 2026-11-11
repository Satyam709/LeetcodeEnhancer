import type { ProblemRow } from "./transform";
import type { WindowKey } from "./windows";

export interface SourceInfo {
  repo: string;
  commitSha: string;
  commitDate: string;
}

export type CompanyWindows = Record<WindowKey, ProblemRow[]>;

export interface CompanyData {
  slug: string;
  name: string;
  windows: CompanyWindows;
}

export interface IndexCompany {
  slug: string;
  name: string;
  counts: number[];
}

export interface IndexProblem {
  id: number | null;
  title: string;
  difficulty: ProblemRow["difficulty"];
  acceptance: number;
  topics: number[];
  freqScore: number;
}

export interface Index {
  companies: IndexCompany[];
  problems: Record<string, IndexProblem>;
}

/** Always all five keys; entries sorted by frequency desc, then slug asc. */
export type CompanyShard = Record<WindowKey, [string, number][]>;

/** Problem slug -> [companyIdx, windowMask]; mask bits d30=1…all=16. */
export type ProblemShard = Record<string, [number, number][]>;

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

export interface Artifacts {
  meta: Meta;
  index: Index;
  topics: string[];
  companyShards: Map<string, CompanyShard>;
  problemShards: Map<string, ProblemShard>;
}
