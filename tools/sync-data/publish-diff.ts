import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Meta } from "./schema";

/**
 * Whether a freshly built artifact set differs from the published one.
 * Compares schemaVersion and the per-file sha256 map only — `generatedAt`
 * changes every run, so identical data must not produce a new publish.
 */
export function artifactsChanged(prev: Meta | null, next: Meta): boolean {
  if (prev === null) return true;
  if (prev.schemaVersion !== next.schemaVersion) return true;
  const prevFiles = Object.keys(prev.files);
  const nextFiles = Object.keys(next.files);
  if (prevFiles.length !== nextFiles.length) return true;
  return nextFiles.some(
    (file) => prev.files[file]?.sha256 !== next.files[file]?.sha256
  );
}

async function readMeta(file: string): Promise<Meta | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Meta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** usage: tsx tools/sync-data/publish-diff.ts --prev <meta.json> --next <meta.json> */
export async function main(argv: string[]): Promise<number> {
  let prevPath: string | undefined;
  let nextPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prev") prevPath = argv[++i];
    else if (argv[i] === "--next") nextPath = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (prevPath === undefined || nextPath === undefined) {
    throw new Error(
      "usage: publish-diff --prev <meta.json> --next <meta.json>"
    );
  }

  const next = await readMeta(nextPath);
  if (next === null) throw new Error(`missing ${nextPath}`);
  const changed = artifactsChanged(await readMeta(prevPath), next);

  const line = `changed=${changed}`;
  console.log(line);
  const output = process.env.GITHUB_OUTPUT;
  if (output) await appendFile(output, `${line}\n`);
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
