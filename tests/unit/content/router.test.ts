import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../../../src/content/router";
import type { Teardown, View } from "../../../src/content/registry";

interface ProbeView {
  view: View;
  mountCalls: () => number;
}

function probeView(
  name: string,
  match: (pathname: string) => boolean,
  events: string[]
): ProbeView {
  let calls = 0;
  return {
    view: {
      name,
      match,
      mount: () => {
        calls += 1;
        events.push(`mount:${name}`);
        return () => {
          events.push(`teardown:${name}`);
        };
      },
    },
    mountCalls: () => calls,
  };
}

const a = (events: string[]) => probeView("a", (p) => p === "/a", events);
const b = (events: string[]) => probeView("b", (p) => p === "/b", events);
const c = (events: string[]) => probeView("c", (p) => p === "/c", events);

describe("createRouter", () => {
  it("mounts, tears down before the next mount, and unmounts on an unmatched route", async () => {
    let href = "https://leetcode.com/a";
    const events: string[] = [];
    const router = createRouter({
      views: [a(events).view, b(events).view],
      getHref: () => href,
    });

    await router.check();
    expect(events).toEqual(["mount:a"]);
    expect(router.currentViewName()).toBe("a");

    href = "https://leetcode.com/b";
    await router.check();
    expect(events).toEqual(["mount:a", "teardown:a", "mount:b"]);
    expect(router.currentViewName()).toBe("b");

    href = "https://leetcode.com/nowhere";
    await router.check();
    expect(events).toEqual(["mount:a", "teardown:a", "mount:b", "teardown:b"]);
    expect(router.currentViewName()).toBeNull();
  });

  it("does not remount when the href changes but the matched view stays the same", async () => {
    let href = "https://leetcode.com/company/google";
    const events: string[] = [];
    const company = probeView(
      "company",
      (p) => p.startsWith("/company/"),
      events
    );
    const router = createRouter({
      views: [company.view, b(events).view],
      getHref: () => href,
    });

    await router.check();
    href = "https://leetcode.com/company/google/";
    await router.check();
    href = "https://leetcode.com/company/google/submissions";
    await router.check();

    expect(company.mountCalls()).toBe(1);
    expect(events).toEqual(["mount:company"]);
    expect(router.currentViewName()).toBe("company");
  });

  it("discards a mount that a newer navigation superseded", async () => {
    let href = "https://leetcode.com/a";
    const events: string[] = [];
    const viewA = a(events);
    const viewC = c(events);

    let resolveB!: (teardown: Teardown) => void;
    let bStarted = false;
    const viewB: View = {
      name: "b",
      match: (p) => p === "/b",
      mount: () => {
        bStarted = true;
        events.push("mount:b");
        return new Promise<Teardown>((resolve) => {
          resolveB = resolve;
        });
      },
    };

    const router = createRouter({
      views: [viewA.view, viewB, viewC.view],
      getHref: () => href,
    });

    await router.check(); // mounts a
    href = "https://leetcode.com/b";
    const bCheck = router.check(); // tears down a, starts b's slow mount
    await vi.waitFor(() => expect(bStarted).toBe(true));

    href = "https://leetcode.com/c";
    await router.check(); // mounts c while b's mount is still in flight
    expect(router.currentViewName()).toBe("c");

    resolveB(() => {
      events.push("teardown:b");
    });
    await bCheck;

    expect(events).toEqual([
      "mount:a",
      "teardown:a",
      "mount:b",
      "mount:c",
      "teardown:b",
    ]);
    expect(router.currentViewName()).toBe("c"); // b was never recorded
  });

  it("does not mount a superseded target after a slow teardown, and the route stays reachable", async () => {
    let href = "https://leetcode.com/a";
    const events: string[] = [];

    let releaseTeardownA!: () => void;
    const viewA: View = {
      name: "a",
      match: (p) => p === "/a",
      mount: () => {
        events.push("mount:a");
        return () =>
          new Promise<void>((resolve) => {
            events.push("teardown:a");
            releaseTeardownA = resolve;
          });
      },
    };
    const viewB = b(events);
    const viewC = c(events);

    const router = createRouter({
      views: [viewA, viewB.view, viewC.view],
      getHref: () => href,
    });

    await router.check(); // mounts a
    href = "https://leetcode.com/b";
    const bCheck = router.check(); // blocks on a's slow teardown
    await vi.waitFor(() => expect(releaseTeardownA).toBeTypeOf("function"));

    href = "https://leetcode.com/c";
    await router.check(); // supersedes b while a's teardown is pending
    expect(router.currentViewName()).toBe("c");

    releaseTeardownA();
    await bCheck;

    expect(viewB.mountCalls()).toBe(0); // b never mounted after being superseded
    expect(events).toEqual(["mount:a", "teardown:a", "mount:c"]);
    expect(router.currentViewName()).toBe("c");

    // b must still be claimable — a stuck `pending` would block this forever.
    href = "https://leetcode.com/b";
    await router.check();
    expect(viewB.mountCalls()).toBe(1);
    expect(router.currentViewName()).toBe("b");
  });

  it("does not double-mount when a check runs during another check's teardown", async () => {
    let href = "https://leetcode.com/a";
    const events: string[] = [];

    let releaseTeardownA!: () => void;
    const viewA: View = {
      name: "a",
      match: (p) => p === "/a",
      mount: () => {
        events.push("mount:a");
        return () =>
          new Promise<void>((resolve) => {
            events.push("teardown:a");
            releaseTeardownA = resolve;
          });
      },
    };
    const viewB = b(events);

    const router = createRouter({
      views: [viewA, viewB.view],
      getHref: () => href,
    });

    await router.check(); // mounts a
    href = "https://leetcode.com/b";
    const firstCheck = router.check(); // blocks on a's slow teardown
    await vi.waitFor(() => expect(releaseTeardownA).toBeTypeOf("function"));

    await router.check(); // same target, must see the in-flight transition
    expect(viewB.mountCalls()).toBe(0);

    releaseTeardownA();
    await firstCheck;

    expect(viewB.mountCalls()).toBe(1); // exactly once
    expect(events).toEqual(["mount:a", "teardown:a", "mount:b"]);
    expect(router.currentViewName()).toBe("b");
  });

  it("swallows teardown errors", async () => {
    let href = "https://leetcode.com/bad";
    const events: string[] = [];
    const bad: View = {
      name: "bad",
      match: (p) => p === "/bad",
      mount: () => () => {
        events.push("teardown:bad");
        throw new Error("boom");
      },
    };
    const router = createRouter({ views: [bad], getHref: () => href });

    await router.check();
    href = "https://leetcode.com/nowhere";
    await expect(router.check()).resolves.toBeUndefined();

    expect(events).toEqual(["teardown:bad"]);
    expect(router.currentViewName()).toBeNull();
  });

  it("start() mounts the view for the current location", async () => {
    const href = "https://leetcode.com/a";
    const events: string[] = [];
    const viewA = a(events);
    const router = createRouter({
      views: [viewA.view],
      getHref: () => href,
      pollMs: 60_000,
    });

    router.start();
    await vi.waitFor(() => expect(router.currentViewName()).toBe("a"));
    expect(viewA.mountCalls()).toBe(1);
    router.stop();
  });

  it("reacts to popstate", async () => {
    let href = "https://leetcode.com/a";
    const events: string[] = [];
    const viewA = a(events);
    const viewB = b(events);
    const router = createRouter({
      views: [viewA.view, viewB.view],
      getHref: () => href,
      pollMs: 60_000, // too slow to matter: only popstate can react
    });

    router.start();
    await vi.waitFor(() => expect(router.currentViewName()).toBe("a"));

    href = "https://leetcode.com/b";
    window.dispatchEvent(new Event("popstate"));
    await vi.waitFor(() => expect(router.currentViewName()).toBe("b"));

    router.stop();
  });

  it("stop() halts automatic navigation handling", async () => {
    let href = "https://leetcode.com/a";
    const events: string[] = [];
    const viewA = a(events);
    const viewB = b(events);
    const router = createRouter({
      views: [viewA.view, viewB.view],
      getHref: () => href,
      pollMs: 5,
    });

    router.start();
    await vi.waitFor(() => expect(router.currentViewName()).toBe("a"));

    router.stop();
    href = "https://leetcode.com/b";
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(router.currentViewName()).toBe("a");
    expect(viewB.mountCalls()).toBe(0);
  });
});
