import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "./build";
import { zipDirectory } from "./zip";

/**
 * Release packaging: a minified build per browser in dist/<browser>/, zipped
 * to releases/leetcode-enhancer-<browser>-v<version>.zip. Requires the data
 * artifacts (`pnpm data:sync`).
 */
async function main(): Promise<void> {
  const root = process.cwd();
  const { version } = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8")
  ) as { version: string };
  const releases = path.join(root, "releases");
  await mkdir(releases, { recursive: true });

  for (const browser of ["chrome", "firefox"] as const) {
    const outdir = path.join("dist", browser);
    await rm(path.resolve(root, outdir), { recursive: true, force: true });
    await build({ browser, outdir, minify: true });

    const zip = await zipDirectory(path.resolve(root, outdir));
    const file = path.join(
      releases,
      `leetcode-enhancer-${browser}-v${version}.zip`
    );
    await writeFile(file, zip);
    console.log(
      `packaged ${path.relative(root, file)} (${(zip.length / 1024 / 1024).toFixed(2)} MB)`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
