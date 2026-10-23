import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const FIXTURE_DIR = "tests/fixtures/dom";

/** True when a captured live-page fixture exists on this machine. */
export function hasFixture(name: string): boolean {
  return existsSync(`${FIXTURE_DIR}/${name}.html`);
}

/**
 * Parse a captured LeetCode page (gitignored, local-only) into a Document.
 * Scripts never execute: JSDOM runs with the default (no script) mode.
 */
export function fixtureDocument(name: string): Document {
  const html = readFileSync(`${FIXTURE_DIR}/${name}.html`, "utf8");
  return new JSDOM(html, { url: "https://leetcode.com/" }).window.document;
}
