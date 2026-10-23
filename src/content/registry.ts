import { createBrowserDataLayer } from "../lib/data/browser";
import type { DataLayer } from "../lib/data/loader";
import { debugLog } from "../lib/debug";
import { mountCompanyPage } from "../views/company-page";
import { mountProblemCompanies } from "../views/problem-companies";
import { mountProblemsetFrequency } from "../views/problemset";

export type Teardown = () => void | Promise<void>;

export interface View {
  name: string;
  match(pathname: string): boolean;
  /**
   * Identity of the content this view owns. When it changes, the router treats
   * the navigation as a new route and remounts (e.g. company/problem slug).
   * Defaults to the view name, preserving "same view, no remount" semantics.
   */
  key?(pathname: string): string;
  mount(ctx: { url: URL }): Promise<Teardown> | Teardown;
}

interface ViewSpec {
  name: string;
  pattern: RegExp;
}

// First match wins. The patterns are disjoint, so route order does not matter.
const SPECS: ViewSpec[] = [
  { name: "company", pattern: /^\/company\/([^/]+)\/?$/ },
  { name: "problem", pattern: /^\/problems\/([^/]+)(\/.*)?$/ },
  { name: "problemset", pattern: /^\/problemset\/?$/ },
  { name: "problem-list", pattern: /^\/problem-list\/?.*$/ },
];

export interface CreateViewsOptions {
  /** Injectable data layer (tests); defaults to the extension-runtime loader. */
  data?: DataLayer;
  /** Anchor readiness budget forwarded to the surfaces; tests shorten it. */
  timeoutMs?: number;
}

/**
 * The view registry. Each route owns one native-first surface; the mount logs
 * exactly once and returns a teardown that restores every touched node. Data is
 * shared across views through the memoizing data layer.
 */
export function createViews(opts: CreateViewsOptions = {}): View[] {
  const data = opts.data ?? createBrowserDataLayer();

  return SPECS.map(({ name, pattern }) => ({
    name,
    match: (pathname: string) => pattern.test(pathname),
    key: (pathname: string) => viewKey(name, pathname),
    mount: ({ url }) => {
      const teardown = mountFor(name, url, data, opts.timeoutMs);
      debugLog(`lce:${name} mounted`);
      return () => {
        try {
          teardown();
        } finally {
          debugLog(`lce:${name} unmounted`);
        }
      };
    },
  }));
}

function viewKey(name: string, pathname: string): string {
  switch (name) {
    case "company":
      return /^\/company\/([^/]+)/.exec(pathname)?.[1] ?? pathname;
    case "problem":
      return /^\/problems\/([^/]+)/.exec(pathname)?.[1] ?? pathname;
    case "problem-list":
      return pathname;
    default:
      return "problemset";
  }
}

function mountFor(
  name: string,
  url: URL,
  data: DataLayer,
  timeoutMs: number | undefined
): Teardown {
  switch (name) {
    case "company":
      return mountCompanyPage({ url, data, timeoutMs });
    case "problem":
      return mountProblemCompanies({ url, data, timeoutMs });
    default:
      // "problemset" and "problem-list" share the frequency enhancement.
      return mountProblemsetFrequency({ data, timeoutMs });
  }
}
