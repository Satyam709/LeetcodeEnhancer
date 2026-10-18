// @vitest-environment node
// The build runs esbuild in Node; the bundle is then evaluated inside a
// manually created jsdom window — the closest headless analog of the page.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { build } from "../../scripts/build";

describe("built content script boot", () => {
  it("mounts, navigates, and tears down exactly once per route (debug logs)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lce-boot-"));
    const dataDir = path.join(root, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "meta.json"), "{}");

    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://leetcode.com/problemset/",
      runScripts: "outside-only",
    });
    const logs: string[] = [];
    const errors: unknown[][] = [];
    dom.window.localStorage.setItem("lce:debug", "1");
    dom.window.console.debug = (...args: unknown[]) => {
      logs.push(String(args[1]));
    };
    dom.window.console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      await build({
        browser: "chrome",
        dataDir,
        outdir: path.join(root, "dist"),
      });
      const code = await readFile(path.join(root, "dist/content.js"), "utf8");

      // Boot on the problemset — this is the real build output.
      dom.window.eval(code);
      await vi.waitFor(() => {
        expect(logs).toContain("lce:problemset mounted");
      });

      // Soft-navigate into a problem page.
      dom.window.history.pushState({}, "", "/problems/two-sum/");
      dom.window.dispatchEvent(new dom.window.Event("popstate"));
      await vi.waitFor(() => {
        expect(logs).toContain("lce:problem mounted");
      });

      expect(logs.indexOf("lce:problemset unmounted")).toBeGreaterThanOrEqual(0);
      expect(logs.indexOf("lce:problemset unmounted")).toBeLessThan(
        logs.indexOf("lce:problem mounted")
      );
      expect(logs.filter((l) => l === "lce:problemset mounted")).toHaveLength(1);
      expect(logs.filter((l) => l === "lce:problem mounted")).toHaveLength(1);

      // Soft-navigate to a company page.
      dom.window.history.pushState({}, "", "/company/google/");
      dom.window.dispatchEvent(new dom.window.Event("popstate"));
      await vi.waitFor(() => {
        expect(logs).toContain("lce:company mounted");
      });

      expect(logs.filter((l) => l === "lce:company mounted")).toHaveLength(1);
      expect(logs.filter((l) => l === "lce:problem unmounted")).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      dom.window.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
