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
