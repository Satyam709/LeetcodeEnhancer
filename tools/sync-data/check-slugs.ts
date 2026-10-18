import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type SlugStatus = "ok" | "not-found" | "unknown";

export interface SlugCheck {
  slug: string;
  status: SlugStatus;
}

const COMPANY_BASE = "https://leetcode.com/company/";

/**
 * HEAD-check company slugs against leetcode.com. Never throws: a network
 * failure or a blocking response (403/429/5xx) is "unknown", not a verdict.
 */
export async function checkSlugs(
  slugs: string[],
  fetchImpl: typeof fetch = fetch
): Promise<SlugCheck[]> {
  const results: SlugCheck[] = [];
  for (const slug of slugs) {
    let status: SlugStatus = "unknown";
    try {
      const res = await fetchImpl(`${COMPANY_BASE}${encodeURIComponent(slug)}/`, {
        method: "HEAD",
        redirect: "follow",
        headers: { "user-agent": "leetcode-enhancer-slug-check" },
      });
      if (res.ok) status = "ok";
      else if (res.status === 404 || res.status === 410) status = "not-found";
    } catch {
      status = "unknown";
    }
    results.push({ slug, status });
  }
  return results;
}

/**
 * Plausible alternative slugs for a derived one: all hyphens removed
 * ("j-p-morgan" -> "jpmorgan") and the first segment ("apollo-io" -> "apollo").
 * Input itself and fragments under 3 chars are dropped.
 */
export function slugVariants(slug: string): string[] {
  const segments = slug.split("-");
  const candidates = [segments.join(""), segments[0] ?? ""];
  return [...new Set(candidates)].filter((c) => c !== slug && c.length >= 3);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CliFlags {
  limit: number;
  delayMs: number;
  out: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { limit: 60, delayMs: 500, out: "./data" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") flags.limit = Number(argv[++i]);
    else if (arg === "--delay") flags.delayMs = Number(argv[++i]);
    else if (arg === "--out") flags.out = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return flags;
}

async function main(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const index = JSON.parse(
    await readFile(path.join(flags.out, "index.json"), "utf8")
  ) as { companies: { slug: string; name: string; counts: number[] }[] };

  const top = [...index.companies]
    .sort((a, b) => b.counts[4] - a.counts[4])
    .slice(0, flags.limit);

  console.log(
    `checking ${top.length} company slugs against leetcode.com ` +
      `(${flags.delayMs}ms apart)...`
  );

  const results = await checkSlugs(
    top.map((c) => c.slug),
    async (input) => {
      await sleep(flags.delayMs);
      return fetch(input as string | URL, {
        method: "HEAD",
        redirect: "follow",
        headers: { "user-agent": "leetcode-enhancer-slug-check" },
      });
    }
  );
  const nameBySlug = new Map(top.map((c) => [c.slug, c.name]));

  const ok = results.filter((r) => r.status === "ok").length;
  const unknown = results.filter((r) => r.status === "unknown");
  const missing = results.filter((r) => r.status === "not-found");

  console.log(`ok: ${ok}  not-found: ${missing.length}  unknown: ${unknown.length}`);

  if (missing.length > 0) {
    console.log("\nnot-found slugs — probing variants:");
    for (const { slug } of missing) {
      const folder = nameBySlug.get(slug) ?? slug;
      const variants = slugVariants(slug);
      const probe = await checkSlugs(variants, async (input) => {
        await sleep(flags.delayMs);
        return fetch(input as string | URL, {
          method: "HEAD",
          redirect: "follow",
          headers: { "user-agent": "leetcode-enhancer-slug-check" },
        });
      });
      const live = probe.filter((p) => p.status === "ok").map((p) => p.slug);
      if (live.length > 0) {
        console.log(`  "${folder}" -> ${live[0]}  (derived: ${slug})`);
      } else {
        console.log(`  "${folder}" (${slug}) — no live variant found`);
      }
    }
  }

  if (unknown.length > 0) {
    console.log("\nunknown (could not verify):");
    for (const { slug } of unknown) {
      console.log(`  "${nameBySlug.get(slug) ?? slug}" (${slug})`);
    }
  }

  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
