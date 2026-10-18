import type { Artifacts } from "./schema";

export const BUDGETS = {
  totalBytes: 4 * 1024 * 1024,
  indexBytes: 700 * 1024,
} as const;

const SLUG_RE = /^[a-z0-9-]+$/;

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Gate the artifact set before it is written (and before it ships): schema
 * version, slug hygiene, referential integrity, and size budgets. A failed
 * run leaves no partial output because the CLI only writes on ok.
 */
export function validateArtifacts(
  artifacts: Artifacts,
  budgets: { totalBytes: number; indexBytes: number } = BUDGETS
): ValidationResult {
  const errors: string[] = [];
  const { meta, index, topics, companyShards, problemShards } = artifacts;

  if (meta.schemaVersion !== 1) {
    errors.push(
      `schemaVersion mismatch: expected 1, got ${meta.schemaVersion}`
    );
  }

  for (const company of index.companies) {
    if (!SLUG_RE.test(company.slug)) {
      errors.push(`invalid company slug: "${company.slug}"`);
    }
    if (!companyShards.has(company.slug)) {
      errors.push(`missing company shard for index entry: "${company.slug}"`);
    }
  }

  for (const slug of companyShards.keys()) {
    if (!index.companies.some((c) => c.slug === slug)) {
      errors.push(`index entry missing for company shard: "${slug}"`);
    }
  }

  for (const slug of Object.keys(index.problems)) {
    if (!SLUG_RE.test(slug)) {
      errors.push(`invalid problem slug: "${slug}"`);
    }
  }

  for (const [companySlug, shard] of companyShards) {
    for (const rows of Object.values(shard)) {
      for (const [slug] of rows) {
        if (!(slug in index.problems)) {
          errors.push(
            `dangling problem slug in company shard "${companySlug}": "${slug}"`
          );
        }
        if (!SLUG_RE.test(slug)) {
          errors.push(`invalid problem slug: "${slug}"`);
        }
      }
    }
  }

  for (const [slug, problem] of Object.entries(index.problems)) {
    for (const topic of problem.topics) {
      if (!Number.isInteger(topic) || topic < 0 || topic >= topics.length) {
        errors.push(`topic index out of range in problem "${slug}": ${topic}`);
      }
    }
  }

  let total = bytes(index) + bytes(topics);
  for (const shard of companyShards.values()) total += bytes(shard);
  for (const shard of problemShards.values()) total += bytes(shard);
  const indexBytes = bytes(index);

  if (total > budgets.totalBytes) {
    errors.push(
      `total size budget exceeded: ${total} > ${budgets.totalBytes} bytes`
    );
  }
  if (indexBytes > budgets.indexBytes) {
    errors.push(
      `index size budget exceeded: ${indexBytes} > ${budgets.indexBytes} bytes`
    );
  }

  return { ok: errors.length === 0, errors };
}
