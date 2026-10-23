import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { buildManifest, type ManifestBase } from "./manifest";

export interface BuildOptions {
  browser: "chrome" | "firefox";
  /** Default "dist" (relative to the package root). */
  outdir?: string;
  /** Default "data" (the Plan 1 artifacts). */
  dataDir?: string;
  minify?: boolean;
  watch?: boolean;
}

/**
 * Build the unpacked extension into `outdir`:
 *   content.js/content.css (page surfaces), popup.html/js/css (settings),
 *   manifest.json, data/**.
 * Runs from the package root and fails loudly if the data artifacts are
 * missing (run `pnpm data:sync`).
 */
export async function build(opts: BuildOptions): Promise<void> {
  const root = process.cwd();
  const outdir = path.resolve(root, opts.outdir ?? "dist");
  const dataDir = path.resolve(root, opts.dataDir ?? "data");
  const minify = opts.minify ?? false;

  // Fail loudly before touching anything if the data artifacts are absent.
  try {
    await readFile(path.join(dataDir, "meta.json"));
  } catch {
    throw new Error(
      `missing ${path.relative(root, path.join(dataDir, "meta.json"))} — run pnpm data:sync`
    );
  }

  const pkg = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8")
  ) as { version: string };
  const base = JSON.parse(
    await readFile(path.join(root, "manifest.base.json"), "utf8")
  ) as ManifestBase;
  const manifest = buildManifest(base, {
    version: pkg.version,
    browser: opts.browser,
  });

  const jsOptions: esbuild.BuildOptions = {
    entryPoints: [path.join(root, "src/content/index.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: path.join(outdir, "content.js"),
    minify,
  };
  const cssOptions: esbuild.BuildOptions = {
    entryPoints: [path.join(root, "src/styles/content.css")],
    bundle: true,
    outfile: path.join(outdir, "content.css"),
    minify,
  };
  const popupJsOptions: esbuild.BuildOptions = {
    entryPoints: [path.join(root, "src/popup/index.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: path.join(outdir, "popup.js"),
    minify,
  };
  const popupCssOptions: esbuild.BuildOptions = {
    entryPoints: [path.join(root, "src/popup/popup.css")],
    bundle: true,
    outfile: path.join(outdir, "popup.css"),
    minify,
  };

  await mkdir(outdir, { recursive: true });
  await writeFile(
    path.join(outdir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  await copyFile(
    path.join(root, "src/popup/popup.html"),
    path.join(outdir, "popup.html")
  );

  // Fresh copy — the data directory is replaced, never merged.
  await rm(path.join(outdir, "data"), { recursive: true, force: true });
  await cp(dataDir, path.join(outdir, "data"), { recursive: true });

  // Every icon the manifest references, at its manifest-relative path.
  for (const relPath of Object.values(base.icons ?? {})) {
    const dest = path.join(outdir, relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(root, relPath), dest);
  }

  if (opts.watch) {
    const [jsCtx, cssCtx, popupJsCtx, popupCssCtx] = await Promise.all([
      esbuild.context(jsOptions),
      esbuild.context(cssOptions),
      esbuild.context(popupJsOptions),
      esbuild.context(popupCssOptions),
    ]);
    await Promise.all([
      jsCtx.watch(),
      cssCtx.watch(),
      popupJsCtx.watch(),
      popupCssCtx.watch(),
    ]);
    console.log(
      `watching src/ → ${path.relative(root, outdir)}/ (${opts.browser}, v${pkg.version})`
    );
    return;
  }

  await Promise.all([
    esbuild.build(jsOptions),
    esbuild.build(cssOptions),
    esbuild.build(popupJsOptions),
    esbuild.build(popupCssOptions),
  ]);

  console.log(
    `built ${path.relative(root, outdir)}/ (${opts.browser}, v${pkg.version})`
  );
}

interface CliFlags {
  browser: "chrome" | "firefox";
  watch: boolean;
  minify: boolean;
  outdir?: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { browser: "chrome", watch: false, minify: false };
  for (const arg of argv) {
    if (arg.startsWith("--browser=")) {
      const value = arg.slice("--browser=".length);
      if (value !== "chrome" && value !== "firefox") {
        throw new Error(`unknown browser: ${value}`);
      }
      flags.browser = value;
    } else if (arg === "--watch") {
      flags.watch = true;
    } else if (arg === "--minify") {
      flags.minify = true;
    } else if (arg.startsWith("--outdir=")) {
      flags.outdir = arg.slice("--outdir=".length);
    } else {
      throw new Error(
        `unknown argument: ${arg} (usage: tsx scripts/build.ts [--browser=chrome|firefox] [--watch] [--minify] [--outdir=dist])`
      );
    }
  }
  return flags;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  build(parseFlags(process.argv.slice(2))).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
