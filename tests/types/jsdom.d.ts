/**
 * Minimal ambient types for jsdom's programmatic API — only what
 * tests/integration/content-boot.test.ts uses. jsdom ships no types and
 * @types/jsdom is not installable in this environment.
 */
declare module "jsdom" {
  export interface JSDOMOptions {
    url?: string;
    runScripts?: "dangerously" | "outside-only";
  }

  export class JSDOM {
    constructor(html?: string, options?: JSDOMOptions);
    readonly window: Window & typeof globalThis;
  }
}
