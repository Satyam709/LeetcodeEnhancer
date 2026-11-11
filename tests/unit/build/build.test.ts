// @vitest-environment node
// (esbuild's JS API breaks under jsdom: cross-realm TextEncoder output.)
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { build } from "../../../scripts/build";

async function makeWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "lce-build-"));
  const dataDir = path.join(root, "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "meta.json"),
    JSON.stringify({ schemaVersion: 1 })
  );
  await writeFile(path.join(dataDir, "index.json"), "{}");
  return { root, dataDir, outdir: path.join(root, "dist") };
}

describe("build", () => {
  it("emits content.js, content.css, popup assets, manifest.json and copies data/", async () => {
    const { root, dataDir, outdir } = await makeWorkspace();
    try {
      await build({ browser: "chrome", dataDir, outdir });

      for (const rel of [
        "content.js",
        "content.css",
        "popup.html",
        "popup.js",
        "popup.css",
        "background.js",
        "manifest.json",
        "data/meta.json",
        "data/index.json",
      ]) {
        await expect(access(path.join(outdir, rel))).resolves.toBeUndefined();
      }

      const popupHtml = await readFile(path.join(outdir, "popup.html"), "utf8");
      expect(popupHtml).toContain("popup.js");
      expect(popupHtml).toContain("popup.css");

      const popupJs = await readFile(path.join(outdir, "popup.js"), "utf8");
      expect(popupJs).toContain("highlight");

      const manifest = JSON.parse(
        await readFile(path.join(outdir, "manifest.json"), "utf8")
      );
      const pkg = JSON.parse(await readFile("package.json", "utf8"));
      expect(manifest.version).toBe(pkg.version);
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.permissions).toEqual(["storage", "alarms"]);
      expect(manifest).not.toHaveProperty("host_permissions");
      expect(manifest.action?.default_popup).toBe("popup.html");
      expect(manifest.background).toEqual({ service_worker: "background.js" });

      // Everything the manifest references must exist in the build.
      for (const relPath of Object.values<string>(manifest.icons ?? {})) {
        await expect(
          access(path.join(outdir, relPath))
        ).resolves.toBeUndefined();
      }
      await expect(
        access(path.join(outdir, manifest.action.default_popup))
      ).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects with an actionable message when data/meta.json is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lce-build-"));
    try {
      await expect(
        build({
          browser: "chrome",
          dataDir: path.join(root, "missing"),
          outdir: path.join(root, "dist"),
        })
      ).rejects.toThrow(/run pnpm data:sync/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes the gecko id for firefox builds", async () => {
    const { root, dataDir, outdir } = await makeWorkspace();
    try {
      await build({ browser: "firefox", dataDir, outdir });
      const manifest = JSON.parse(
        await readFile(path.join(outdir, "manifest.json"), "utf8")
      );
      expect(manifest.browser_specific_settings?.gecko?.id).toBeTruthy();
      expect(manifest.background).toEqual({ scripts: ["background.js"] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
