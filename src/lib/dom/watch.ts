export interface WatchOptions {
  /** Where to observe. Defaults to `document.body`. */
  root?: Node;
  /** Stop watching when aborted. */
  signal?: AbortSignal;
  /**
   * Synchronous passes allowed per animation frame before the watcher backs off
   * to one pass per frame. Guards against a feedback loop with the page.
   */
  maxPassesPerFrame?: number;
}

/**
 * Re-run `apply` whenever the page's DOM changes.
 *
 * `apply` runs synchronously inside the MutationObserver callback. Observer
 * callbacks are microtasks, so they run before the browser paints: when React
 * re-renders a node we enhanced, the enhancement is restored in the same frame
 * and the native (locked) UI never flashes on screen.
 *
 * Mutations that only touch our own `.lce-root` subtrees are ignored, so
 * `apply` changing the DOM does not re-trigger itself. `apply` must be
 * idempotent and cheap when there is nothing to do.
 */
export function watchDom(
  apply: () => void,
  opts: WatchOptions = {}
): () => void {
  const { root = document.body, signal, maxPassesPerFrame = 20 } = opts;

  let passes = 0;
  let deferred = false;
  let frame: number | null = null;
  let stopped = false;

  const run = (): void => {
    if (stopped || signal?.aborted) return;
    apply();
  };

  // Once per painted frame: reset the budget and run any pass that was
  // deferred because the budget ran out.
  const onFrame = (): void => {
    frame = null;
    passes = 0;
    if (deferred) {
      deferred = false;
      run();
    }
  };

  const observer = new MutationObserver((records) => {
    if (records.every(isOwnMutation)) return;
    if (frame === null) frame = requestAnimationFrame(onFrame);
    if (passes >= maxPassesPerFrame) {
      deferred = true;
      return;
    }
    passes += 1;
    run();
  });
  observer.observe(root, { childList: true, subtree: true });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    signal?.removeEventListener("abort", stop);
  };
  signal?.addEventListener("abort", stop);
  return stop;
}

function isOwnMutation(record: MutationRecord): boolean {
  if (isOwn(record.target)) return true;
  if (record.type !== "childList") return false;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return nodes.length > 0 && nodes.every(isOwn);
}

function isOwn(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(".lce-root") != null;
}
