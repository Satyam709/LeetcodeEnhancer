import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildArtifacts, writeArtifacts } from "./build-artifacts";
import { parseCsv } from "./csv";
import type { CompanyData, CompanyWindows } from "./schema";
import { resolveCompanySlug } from "./slugs";
import { discoverCompanies, fetchSource, REPO } from "./source";
import { transformRow, type ProblemRow } from "./transform";
import { validateArtifacts } from "./validate";
import { WINDOW_FILES } from "./windows";

const USAGE =
  "usage: pnpm data:sync [--local <dir>] [--tarball <url>] [--out <dir>]";

interface CliOptions {
  local?: string;
  tarball?: string;
  out: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { out: "./data" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = (flag: string): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      return v;
    };
    if (arg === "--local") opts.local = value(arg);
    else if (arg === "--tarball") opts.tarball = value(arg);
    else if (arg === "--out") opts.out = value(arg);
    else throw new Error(`unknown argument: ${arg}\n${USAGE}`);
  }
  return opts;
}

async function loadCompanies(
  dir: string,
  folders: string[],
  aliases: Record<string, string>
): Promise<{ companies: CompanyData[]; rejectedRows: number }> {
  const companies: CompanyData[] = [];
  let rejectedRows = 0;

  for (const folder of folders) {
    const windows = {} as CompanyWindows;
    for (const window of WINDOW_FILES) {
      const text = await readFile(path.join(dir, folder, window.file), "utf8");
      // Drop the header row before transforming data rows.
      const rows = parseCsv(text).slice(1);
      const transformed: ProblemRow[] = [];
      for (const row of rows) {
        const result = transformRow(row);
        if (result.ok) transformed.push(result.value);
        else rejectedRows++;
      }
      windows[window.key] = transformed;
    }
    companies.push({
      slug: resolveCompanySlug(folder, aliases),
      name: folder,
      windows,
    });
  }

  return { companies, rejectedRows };
}

/** Returns the process exit code (0 = written, 1 = validation failure). */
export async function main(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  const aliasesPath = fileURLToPath(
    new URL("./company-aliases.json", import.meta.url)
  );
  const aliases = JSON.parse(await readFile(aliasesPath, "utf8")) as Record<
    string,
    string
  >;

  const source = await fetchSource({
    localPath: opts.local,
    tarballUrl: opts.tarball,
  });
  const folders = await discoverCompanies(source.dir);
  const { companies, rejectedRows } = await loadCompanies(
    source.dir,
    folders,
    aliases
  );

  const artifacts = buildArtifacts(companies, {
    source: {
      repo: REPO,
      commitSha: source.commitSha,
      commitDate: source.commitDate,
    },
    enriched: false,
    rejectedRows,
  });

  const validation = validateArtifacts(artifacts);
  if (!validation.ok) {
    console.error(
      `data:sync failed validation (${validation.errors.length} error(s)):`
    );
    for (const error of validation.errors) console.error(`  - ${error}`);
    console.error("nothing was written; fix the pipeline before re-running");
    return 1;
  }

  await writeArtifacts(opts.out, artifacts);

  const { counts, files } = artifacts.meta;
  const totalBytes = Object.values(files).reduce((sum, f) => sum + f.bytes, 0);
  console.log(
    `synced ${counts.companies} companies, ${counts.problems} problems, ` +
      `${counts.entries} entries (${counts.rejectedRows} rows rejected)`
  );
  console.log(
    `source: ${REPO}@${source.commitSha.slice(0, 12)} (${source.commitDate})`
  );
  console.log(
    `artifacts: ${opts.out} (${(totalBytes / 1024 / 1024).toFixed(2)} MB ` +
      `across ${Object.keys(files).length} files)`
  );
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
