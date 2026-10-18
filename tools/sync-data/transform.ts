export interface ProblemRow {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  acceptance: number;
  frequency: number;
  topics: string[];
}

export type TransformResult =
  | { ok: true; value: ProblemRow }
  | { ok: false; reason: string };

const DIFFICULTIES: Record<string, ProblemRow["difficulty"]> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const round1 = (n: number) => Math.round(n * 10) / 10;

const SLUG_RE = /\/problems\/([a-z0-9-]+)/i;

/**
 * Transform one CSV data row (`Difficulty,Title,Frequency,Acceptance Rate,
 * Link,Topics`) into a `ProblemRow`, or reject it with a reason.
 * Acceptance arrives as a fraction and is displayed as a percent
 * (raw × 10000, e.g. 0.0058… → 58.0).
 */
export function transformRow(row: string[]): TransformResult {
  if (row.length < 6) return { ok: false, reason: "short row" };

  const [difficultyRaw, titleRaw, frequencyRaw, acceptanceRaw, link, topicsRaw] =
    row;

  const difficulty = DIFFICULTIES[(difficultyRaw ?? "").trim().toUpperCase()];
  if (!difficulty) return { ok: false, reason: "bad difficulty" };

  const title = (titleRaw ?? "").trim();
  if (!title) return { ok: false, reason: "empty title" };

  const slug = SLUG_RE.exec(link ?? "")?.[1];
  if (!slug) return { ok: false, reason: "bad link" };

  const acceptance = Number.parseFloat(acceptanceRaw ?? "");
  if (Number.isNaN(acceptance)) return { ok: false, reason: "bad acceptance" };

  const frequency = Number.parseFloat(frequencyRaw ?? "");
  if (Number.isNaN(frequency)) return { ok: false, reason: "bad frequency" };

  const topics = (topicsRaw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    ok: true,
    value: {
      slug: slug.toLowerCase(),
      title,
      difficulty,
      acceptance: round1(clamp(acceptance * 10000, 0, 100)),
      frequency: round1(clamp(frequency, 0, 100)),
      topics,
    },
  };
}
