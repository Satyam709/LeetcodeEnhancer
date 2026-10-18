import { debugLog } from "../lib/debug";

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

/**
 * The view registry. Stub views for now — Plan 3 replaces each mount with the
 * real surface. Matchers are final: they define which URL each surface owns.
 */
export function createViews(): View[] {
  return SPECS.map(({ name, pattern }) => ({
    name,
    match: (pathname: string) => pattern.test(pathname),
    mount: () => {
      debugLog(`lce:${name} mounted`);
      return () => {
        debugLog(`lce:${name} unmounted`);
      };
    },
  }));
}
