import { afterEach, describe, expect, it, vi } from "vitest";
import { watchDom } from "../../../src/lib/dom/watch";

/** Mutation observer callbacks are microtasks: one await flushes them. */
const flush = () => Promise.resolve();

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("watchDom", () => {
  it("re-applies in the observer callback, before any timer or frame", async () => {
    const apply = vi.fn();
    const stop = watchDom(apply);
    document.body.append(document.createElement("div"));
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores mutations that only touch our own .lce-root nodes", async () => {
    const ours = document.createElement("div");
    ours.className = "lce-root";
    document.body.append(ours);

    const apply = vi.fn();
    const stop = watchDom(apply);
    ours.append(document.createElement("span"));
    const another = document.createElement("div");
    another.className = "lce-root";
    document.body.append(another);
    await flush();
    expect(apply).not.toHaveBeenCalled();

    document.body.append(document.createElement("p"));
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
    stop();
  });

  it("backs off to one pass per frame when apply keeps mutating the page", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    // A misbehaving apply that always writes a foreign node.
    const apply = vi.fn(() => {
      document.body.append(document.createElement("i"));
    });
    const stop = watchDom(apply, { maxPassesPerFrame: 3 });
    document.body.append(document.createElement("div"));
    for (let i = 0; i < 10; i++) await flush();
    expect(apply).toHaveBeenCalledTimes(3);

    // The next frame resets the budget and runs one deferred pass.
    for (const cb of frames.splice(0)) cb(0);
    expect(apply).toHaveBeenCalledTimes(4);
    stop();
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    const apply = vi.fn();
    watchDom(apply, { signal: controller.signal });
    controller.abort();
    document.body.append(document.createElement("div"));
    await flush();
    expect(apply).not.toHaveBeenCalled();
  });
});
