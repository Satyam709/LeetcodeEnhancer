import type {
  CompanyShard,
  Difficulty,
  Index,
  WindowKey,
} from "../../lib/data/types";

/** Mirrors LeetCode's company-page window labels and order. */
export const WINDOW_TABS: { key: WindowKey; label: string }[] = [
  { key: "d30", label: "30 days" },
  { key: "d3m", label: "3 months" },
  { key: "d6m", label: "6 months" },
  { key: "g6m", label: "More than 6 months" },
  { key: "all", label: "All" },
];

export type SortKey = "frequency" | "difficulty" | "title" | "acceptance";
export type SortDirection = "ascending" | "descending";

export const SORT_LABELS: Record<SortKey, string> = {
  frequency: "Frequency",
  acceptance: "Acceptance",
  difficulty: "Difficulty",
  title: "Title",
};

/** The direction a column sorts in when first selected. */
export function defaultDirection(sort: SortKey): SortDirection {
  return sort === "title" || sort === "difficulty" ? "ascending" : "descending";
}

export const DIFFICULTIES: readonly Difficulty[] = ["Easy", "Medium", "Hard"];

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  Easy: 0,
  Medium: 1,
  Hard: 2,
};

export interface RowQuery {
  window: WindowKey;
  search: string;
  /** Empty means every difficulty. */
  difficulties: readonly Difficulty[];
  /** Topic indexes; a row matches when it has any of them. Empty means all. */
  topics: readonly number[];
  sort: SortKey;
  direction: SortDirection;
}

export interface CompanyRow {
  slug: string;
  id: number | null;
  title: string;
  difficulty: Difficulty;
  /** Percent with one decimal (58 → 58.0%). */
  acceptance: number;
  /** Community frequency (0–100) for the active window. */
  frequency: number;
  topics: readonly number[];
  /** 1-based position in the current filtered, sorted list. */
  position: number;
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

/** Every row of a window, unfiltered and unsorted. Unknown slugs are skipped. */
export function windowRows(
  shard: CompanyShard,
  index: Index,
  window: WindowKey
): CompanyRow[] {
  const rows: CompanyRow[] = [];
  for (const [slug, frequency] of shard[window]) {
    const problem = index.problems[slug];
    if (problem === undefined) continue;
    rows.push({
      slug,
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      acceptance: problem.acceptance,
      frequency,
      topics: problem.topics,
      position: 0,
    });
  }
  return rows;
}

/**
 * Join a company shard window with the problem index, then filter and sort.
 * Ties always fall back to title A→Z so the order is stable in both directions.
 */
export function buildRows(
  shard: CompanyShard,
  index: Index,
  query: RowQuery
): CompanyRow[] {
  const needle = query.search.trim().toLowerCase();
  const difficulties = new Set(query.difficulties);
  const topics = new Set(query.topics);

  const rows = windowRows(shard, index, query.window).filter((row) => {
    if (difficulties.size > 0 && !difficulties.has(row.difficulty))
      return false;
    if (topics.size > 0 && !row.topics.some((t) => topics.has(t))) return false;
    if (needle !== "") {
      const haystack = `${row.title} ${row.slug}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const sign = query.direction === "ascending" ? 1 : -1;
  const byTitle = (a: CompanyRow, b: CompanyRow): number =>
    collator.compare(a.title, b.title) || collator.compare(a.slug, b.slug);
  const primary: Record<SortKey, (a: CompanyRow, b: CompanyRow) => number> = {
    title: byTitle,
    acceptance: (a, b) => a.acceptance - b.acceptance,
    difficulty: (a, b) =>
      DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty],
    frequency: (a, b) => a.frequency - b.frequency,
  };
  const compare = primary[query.sort];
  rows.sort((a, b) => sign * compare(a, b) || byTitle(a, b));

  rows.forEach((row, i) => {
    row.position = i + 1;
  });
  return rows;
}

export interface Facets {
  difficulty: Record<Difficulty, number>;
  /** Topic index → row count, most common first. */
  topics: { id: number; count: number }[];
}

/** Counts for the filter menu, over a whole window (filters not applied). */
export function facets(rows: readonly CompanyRow[]): Facets {
  const difficulty: Record<Difficulty, number> = {
    Easy: 0,
    Medium: 0,
    Hard: 0,
  };
  const topicCounts = new Map<number, number>();
  for (const row of rows) {
    difficulty[row.difficulty] += 1;
    for (const t of row.topics)
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const topics = [...topicCounts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
  return { difficulty, topics };
}

export function formatAcceptance(acceptance: number): string {
  return `${acceptance.toFixed(1)}%`;
}

export function formatCount(count: number): string {
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatFrequency(frequency: number): string {
  return Number.isInteger(frequency) ? String(frequency) : frequency.toFixed(1);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatUpdated(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) return date;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthName = MONTHS[month - 1];
  if (monthName === undefined) return date;
  return `${monthName} ${day}, ${year}`;
}
