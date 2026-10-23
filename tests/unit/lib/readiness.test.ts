import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor, waitUntil } from "../../../src/lib/dom/readiness";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("waitFor", () => {
  it("resolves immediately when the element is already present", async () => {
    const el = document.createElement("div");
    el.id = "here";
    document.body.appendChild(el);
    await expect(waitFor("#here")).resolves.toBe(el);
  });

  it("resolves when the element is appended later", async () => {
    const promise = waitFor(".later", { timeoutMs: 1000 });
    const el = document.createElement("span");
    el.className = "later";
    setTimeout(() => document.body.appendChild(el), 10);
    await expect(promise).resolves.toBe(el);
  });

  it("supports a custom root", async () => {
    const root = document.createElement("section");
    document.body.appendChild(root);
    const promise = waitFor(".in-root", { root, timeoutMs: 1000 });
    const el = document.createElement("b");
    el.className = "in-root";
    root.appendChild(el);
    await expect(promise).resolves.toBe(el);
  });

  it("rejects with a timeout error and disconnects when the element never appears", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    await expect(waitFor(".never", { timeoutMs: 50 })).rejects.toThrow(
      "waitFor timeout: .never"
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("stops observing after it resolves: one settlement, observer disconnected", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    let settled = 0;
    const promise = waitFor(".once", { timeoutMs: 1000 });
    promise.then(() => {
      settled += 1;
    });

    const first = document.createElement("i");
    first.className = "once";
    document.body.appendChild(first);

    await expect(promise).resolves.toBe(first);
    expect(disconnect).toHaveBeenCalledTimes(1);

    // A later matching node must not produce a second resolution side effect.
    const second = document.createElement("i");
    second.className = "once";
    document.body.appendChild(second);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(settled).toBe(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("rejects and disconnects when the signal aborts while waiting", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const controller = new AbortController();
    const promise = waitFor(".never", {
      timeoutMs: 1000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow("waitFor aborted");
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitFor("#anything", { signal: controller.signal })
    ).rejects.toThrow("waitFor aborted");
  });

  it("does not reject when aborted after it has already resolved", async () => {
    const controller = new AbortController();
    const el = document.createElement("div");
    el.id = "settled";
    document.body.appendChild(el);

    await expect(
      waitFor("#settled", { signal: controller.signal })
    ).resolves.toBe(el);
    expect(() => controller.abort()).not.toThrow();
  });
});

describe("waitUntil", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("resolves immediately when the predicate already holds", async () => {
    document.body.innerHTML = '<a href="/company/google/">g</a>';
    await expect(
      waitUntil(() => document.querySelector('a[href="/company/google/"]') !== null)
    ).resolves.toBeUndefined();
  });

  it("resolves when the DOM later satisfies the predicate", async () => {
    const promise = waitUntil(
      () => document.querySelector(".ready") !== null,
      { timeoutMs: 1000 }
    );
    setTimeout(() => {
      const node = document.createElement("i");
      node.className = "ready";
      document.body.appendChild(node);
    }, 10);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects on abort and on timeout", async () => {
    const controller = new AbortController();
    const aborted = waitUntil(() => false, {
      timeoutMs: 1000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(aborted).rejects.toThrow("waitFor aborted");

    await expect(
      waitUntil(() => false, { timeoutMs: 20 })
    ).rejects.toThrow("waitFor timeout: predicate");
  });
});
