import { debugLog } from "../lib/debug";
import type { Teardown, View } from "./registry";

export interface RouterOptions {
  views: View[];
  /** Defaults to `() => location.href`. Injection point for tests. */
  getHref?: () => string;
  /** Cheap URL-compare interval in ms. Defaults to 300. */
  pollMs?: number;
}

export interface Router {
  start(): void;
  stop(): void;
  check(): Promise<void>;
  currentViewName(): string | null;
}

/**
 * SPA router: watches the URL (popstate + a cheap polling compare), matches the
 * pathname against the view registry, and mounts/tears down views with async-safe
 * serialization. A generation token guarantees that a mount which resolves after
 * a newer navigation is discarded (and immediately torn down) instead of
 * clobbering the newer view.
 */
export function createRouter(opts: RouterOptions): Router {
  const { views, getHref = () => location.href, pollMs = 300 } = opts;

  let current: { view: View; teardown: Teardown | null } | null = null;
  let pending: View | null = null;
  let generation = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let started = false;

  async function check(): Promise<void> {
    // Absolute hrefs win; the base only makes relative test hrefs workable.
    const url = new URL(getHref(), "https://leetcode.com");
    const next = views.find((view) => view.match(url.pathname)) ?? null;

    // Nothing mounted, nothing to mount, nothing in flight.
    if (next === null && current === null && pending === null) return;
    // Same view, already active or already mounting — never remount.
    if (next !== null && (next === current?.view || next === pending)) return;

    const gen = ++generation;

    // Claim the target before any await: overlapping checks must see this
    // transition as in-flight, and a superseding check takes ownership of
    // `pending` — stale continuations never clear or overwrite it.
    pending = next;

    if (current !== null) {
      const { teardown } = current;
      current = null;
      if (teardown !== null) {
        try {
          await teardown();
        } catch (err) {
          debugLog("teardown failed", err);
        }
      }
    }

    // A newer check ran while we awaited the teardown — it owns the transition.
    if (gen !== generation) return;

    if (next === null) {
      pending = null;
      return;
    }

    let teardown: Teardown | null = null;
    try {
      teardown = await next.mount({ url });
    } catch (err) {
      debugLog(`lce:${next.name} mount failed`, err);
      if (gen === generation) pending = null;
      return;
    }

    if (gen !== generation) {
      // A newer navigation superseded this mount — undo it, keep it off the
      // books, and leave `pending` to the check that superseded us.
      if (teardown !== null) {
        try {
          await teardown();
        } catch (err) {
          debugLog("stale teardown failed", err);
        }
      }
      return;
    }

    pending = null;
    current = { view: next, teardown };
  }

  function start(): void {
    if (started) return;
    started = true;
    window.addEventListener("popstate", onPopState);
    interval = setInterval(() => {
      void check();
    }, pollMs);
    void check();
  }

  function stop(): void {
    if (!started) return;
    started = false;
    window.removeEventListener("popstate", onPopState);
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }

  function currentViewName(): string | null {
    return current?.view.name ?? null;
  }

  function onPopState(): void {
    void check();
  }

  return { start, stop, check, currentViewName };
}
