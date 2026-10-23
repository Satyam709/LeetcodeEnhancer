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

export type DifficultyFilter = "all" | Difficulty;
export type SortKey = "frequency" | "title" | "acceptance";

export interface RowQuery {
  window: WindowKey;
  search: string;
  difficulty: DifficultyFilter;
  sort: SortKey;
}

export interface CompanyRow {
  slug: string;
  id: number | null;
  title: string;
  difficulty: Difficulty;
  /** Stored tenths-of-percent value (58 → 58.0%). */
  acceptance: number;
  /** Community frequency (0–100) for the active window. */
  frequency: number;
  /** 1-based position in the current filtered, sorted list. */
  position: number;
}

const collator = new Intl.Collator("en", { sensitivity: "base" });

/**
 * Join a company shard window with the problem index, then filter and sort.
 * Unknown slugs are skipped so an inconsistent bundle never renders broken rows.
 */
export function buildRows(
  shard: CompanyShard,
  index: Index,
  query: RowQuery
): CompanyRow[] {
  const needle = query.search.trim().toLowerCase();
  const rows: CompanyRow[] = [];

  for (const [slug, frequency] of shard[query.window]) {
    const problem = index.problems[slug];
    if (problem === undefined) continue;
    if (query.difficulty !== "all" && problem.difficulty !== query.difficulty) {
      continue;
    }
    if (needle !== "") {
      const haystack = `${problem.title} ${slug}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    rows.push({
      slug,
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      acceptance: problem.acceptance,
      frequency,
      position: 0,
    });
  }

  switch (query.sort) {
    case "title":
      rows.sort(
        (a, b) => collator.compare(a.title, b.title) || collator.compare(a.slug, b.slug)
      );
      break;
    case "acceptance":
      rows.sort(
        (a, b) =>
          b.acceptance - a.acceptance || collator.compare(a.title, b.title)
      );
      break;
    default:
      rows.sort(
        (a, b) => b.frequency - a.frequency || collator.compare(a.title, b.title)
      );
  }

  rows.forEach((row, i) => {
    row.position = i + 1;
  });
  return rows;
}

export function formatAcceptance(acceptance: number): string {
  return `${acceptance.toFixed(1)}%`;
}

export function formatCount(count: number): string {
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatFrequency(frequency: number): string {
  return Number.isInteger(frequency)
    ? String(frequency)
    : frequency.toFixed(1);
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
