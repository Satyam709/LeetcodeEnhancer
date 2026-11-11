export type WindowKey = "d30" | "d3m" | "d6m" | "g6m" | "all";

/** The five per-company source files, in recency order (most recent first). */
export const WINDOW_FILES: readonly { file: string; key: WindowKey }[] = [
  { file: "1. Thirty Days.csv", key: "d30" },
  { file: "2. Three Months.csv", key: "d3m" },
  { file: "3. Six Months.csv", key: "d6m" },
  { file: "4. More Than Six Months.csv", key: "g6m" },
  { file: "5. All.csv", key: "all" },
];
