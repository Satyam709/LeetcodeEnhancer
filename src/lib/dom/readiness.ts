export interface WaitForOptions {
  /** Where to look. Defaults to `document`. */
  root?: ParentNode;
  /** How long to wait before rejecting, in ms. Defaults to 15 s. */
  timeoutMs?: number;
  /** Abort the wait early (e.g. a view was torn down). */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Resolve the first element matching `selector` — immediately when it already
 * exists, otherwise via a single MutationObserver. Rejects with
 * `waitFor timeout: <selector>` after `timeoutMs`, or `waitFor aborted` when
 * `signal` aborts. The observer and timer are always cleaned up before settling.
 */
export function waitFor(
  selector: string,
  opts: WaitForOptions = {}
): Promise<Element> {
  const { root = document, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = opts;

  if (signal?.aborted) return Promise.reject(new Error("waitFor aborted"));

  const existing = root.querySelector(selector);
  if (existing !== null) return Promise.resolve(existing);

  return new Promise<Element>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const found = root.querySelector(selector);
      if (found !== null) {
        cleanup();
        resolve(found);
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitFor timeout: ${selector}`));
    }, timeoutMs);

    function cleanup(): void {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    function onAbort(): void {
      cleanup();
      reject(new Error("waitFor aborted"));
    }

    signal?.addEventListener("abort", onAbort);
    observer.observe(root, { childList: true, subtree: true });
  });
}

export interface WaitUntilOptions {
  /** Abort the wait early (e.g. a view was torn down). */
  signal?: AbortSignal;
  /** How long to wait before rejecting, in ms. Defaults to 15 s. */
  timeoutMs?: number;
  /** Where to observe. Defaults to `document`. */
  root?: ParentNode;
}

/**
 * Wait until `predicate` holds. Used after SPA navigations to wait for the new
 * page to replace the old one's DOM (e.g. the slug-specific Discuss link).
 * Rejects with `waitFor aborted` / `waitFor timeout: predicate`.
 */
export function waitUntil(
  predicate: () => boolean,
  opts: WaitUntilOptions = {}
): Promise<void> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, root = document } = opts;

  if (signal?.aborted) return Promise.reject(new Error("waitFor aborted"));
  if (predicate()) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (predicate()) {
        cleanup();
        resolve();
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("waitFor timeout: predicate"));
    }, timeoutMs);

    function cleanup(): void {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    function onAbort(): void {
      cleanup();
      reject(new Error("waitFor aborted"));
    }

    signal?.addEventListener("abort", onAbort);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  });
}
