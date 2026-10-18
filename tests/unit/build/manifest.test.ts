import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildManifest, type ManifestBase } from "../../../scripts/manifest";

const base: ManifestBase = {
  name: "LeetCode Enhancer",
  description:
    "Community-powered company interview data for leetcode.com, rendered natively.",
  content_scripts: [
    {
      matches: ["https://leetcode.com/*"],
      js: ["content.js"],
      css: ["content.css"],
      run_at: "document_idle",
    },
  ],
  gecko_id: "leetcode-enhancer@v3.local",
};

describe("buildManifest", () => {
  it("injects manifest_version 3 and the version, without permissions", () => {
    const manifest = buildManifest(base, { version: "3.0.0", browser: "chrome" });
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("LeetCode Enhancer");
    expect(manifest.version).toBe("3.0.0");
    expect(manifest).not.toHaveProperty("permissions");
    expect(manifest).not.toHaveProperty("host_permissions");
  });

  it("carries the content script declaration through", () => {
    const manifest = buildManifest(base, { version: "3.0.0", browser: "chrome" });
    expect(manifest.content_scripts).toEqual(base.content_scripts);
  });

  it("omits browser_specific_settings for chrome", () => {
    const manifest = buildManifest(base, { version: "3.0.0", browser: "chrome" });
    expect(manifest.browser_specific_settings).toBeUndefined();
  });

  it("adds the gecko id for firefox", () => {
    const manifest = buildManifest(base, {
      version: "3.0.0",
      browser: "firefox",
    });
    expect(manifest.browser_specific_settings).toEqual({
      gecko: { id: base.gecko_id },
    });
  });

  it("carries web_accessible_resources through (the data layer needs it)", () => {
    const withWar: ManifestBase = {
      ...base,
      web_accessible_resources: [
        { resources: ["data/*"], matches: ["https://leetcode.com/*"] },
      ],
    };
    const manifest = buildManifest(withWar, {
      version: "3.0.0",
      browser: "chrome",
    });
    expect(manifest.web_accessible_resources).toEqual([
      { resources: ["data/*"], matches: ["https://leetcode.com/*"] },
    ]);
  });

  it("the repo's manifest.base.json builds a clean MV3 manifest", async () => {
    const realBase = JSON.parse(
      await readFile("manifest.base.json", "utf8")
    ) as ManifestBase;
    const manifest = buildManifest(realBase, {
      version: "3.0.0",
      browser: "chrome",
    });
    expect(manifest.content_scripts?.[0]?.matches).toEqual([
      "https://leetcode.com/*",
    ]);
    expect(manifest.content_scripts?.[0]?.js).toEqual(["content.js"]);
    expect(manifest.content_scripts?.[0]?.css).toEqual(["content.css"]);
    expect(manifest.content_scripts?.[0]?.run_at).toBe("document_idle");
    expect(manifest.web_accessible_resources).toEqual([
      { resources: ["data/*"], matches: ["https://leetcode.com/*"] },
    ]);
    expect(manifest).not.toHaveProperty("permissions");
  });

  it("every icon referenced in manifest.base.json exists on disk as a PNG", async () => {
    const realBase = JSON.parse(
      await readFile("manifest.base.json", "utf8")
    ) as ManifestBase;
    const icons = realBase.icons ?? {};
    expect(Object.keys(icons).sort((a, b) => Number(a) - Number(b))).toEqual([
      "16",
      "32",
      "48",
      "96",
      "128",
    ]);
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const relPath of Object.values(icons)) {
      const bytes = await readFile(relPath);
      expect(
        [...bytes.subarray(0, 8)],
        `${relPath} is not a PNG`
      ).toEqual(pngSignature);
    }
  });
});
