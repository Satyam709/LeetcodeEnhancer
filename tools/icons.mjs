/**
 * One-shot icon generator: assets/logo.png (square) → assets/icons/{16,32,48,96,128}.png
 * Requires ImageMagick (`magick` or `convert` on PATH). Run with
 * `node tools/icons.mjs` after changing the logo. The generated PNGs are
 * committed, so this script is not part of the build or CI.
 */
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "assets/logo.png");
const outDir = path.join(root, "assets/icons");
const sizes = [16, 32, 48, 96, 128];

async function findMagick() {
  for (const bin of ["magick", "convert"]) {
    try {
      await run(bin, ["-version"]);
      return bin;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    "ImageMagick not found — install it (or resize assets/logo.png by hand)"
  );
}

const magick = await findMagick();
await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  const out = path.join(outDir, `${size}.png`);
  // Square fit: keep aspect ratio, pad the remainder with transparency.
  await run(magick, [
    source,
    "-resize",
    `${size}x${size}`,
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    `${size}x${size}`,
    out,
  ]);
  console.log(`wrote ${path.relative(root, out)}`);
}
