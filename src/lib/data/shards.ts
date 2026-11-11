/**
 * Problem shard file name — identical rule to tools/sync-data/build-artifacts.ts.
 * The first two characters of the slug, lowercased, with non [a-z0-9] mapped to
 * "_" and short prefixes padded with "_".
 */
export function problemShardName(slug: string): string {
  let prefix = slug.slice(0, 2).toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (prefix.length < 2) prefix = `${prefix}_`.slice(0, 2);
  return `${prefix}.json`;
}
