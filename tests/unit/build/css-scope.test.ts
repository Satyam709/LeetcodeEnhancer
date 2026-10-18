// @vitest-environment node
// (esbuild's JS API breaks under jsdom: cross-realm TextEncoder output.)
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";

async function loadBuiltCss(): Promise<{ source: string; css: string }> {
  const source = await readFile("src/styles/content.css", "utf8");
  const result = await transform(source, { loader: "css", minify: false });
  return { source, css: result.code };
}

/** Every selector prelude in the stylesheet, at-rules excluded. */
function ruleSelectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  for (const match of clean.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1]!.trim();
    if (prelude.startsWith("@")) continue;
    for (const selector of prelude.split(",")) selectors.push(selector.trim());
  }
  return selectors;
}

describe("content.css leak guard", () => {
  it("compiles through esbuild and contains at least one rule", async () => {
    const { css } = await loadBuiltCss();
    expect(css.trim().length).toBeGreaterThan(0);
    expect(css).not.toContain("ERROR");
  });

  it("scopes every selector under .lce", async () => {
    const { css } = await loadBuiltCss();
    const selectors = ruleSelectors(css);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, `unscoped selector: ${selector}`).toMatch(/^\.lce/);
    }
  });

  it("never touches globals: no @import, no url(), no :root, no bare elements", async () => {
    const { source, css } = await loadBuiltCss();
    expect(source).not.toContain("@import");
    expect(source).not.toContain("url(");
    expect(css).not.toContain(":root");
    expect(ruleSelectors(css).some((s) => /^[a-z]/i.test(s))).toBe(false);
    expect(source).not.toMatch(/font-size\s*:/);
  });

  it("defines the neutral token set views consume on .lce-root", async () => {
    const { source } = await loadBuiltCss();
    expect(source).toContain(".lce-root");
    for (const token of [
      "--sd-background",
      "--sd-foreground",
      "--sd-muted",
      "--sd-muted-foreground",
      "--sd-easy",
      "--sd-medium",
      "--sd-hard",
    ]) {
      expect(source, `missing token ${token}`).toContain(`${token}:`);
    }
  });
});
