export interface WaitForOptions {
  /** Where to look. Defaults to `document`. */
  root?: ParentNode;
  /** How long to wait before rejecting, in ms. Defaults to 15 s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Resolve the first element matching `selector` — immediately when it already
 * exists, otherwise via a single MutationObserver. Rejects with
 * `waitFor timeout: <selector>` after `timeoutMs`. The observer is always
 * disconnected before settling.
 */
export function waitFor(
  selector: string,
  opts: WaitForOptions = {}
): Promise<Element> {
  const { root = document, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

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
    }

    observer.observe(root, { childList: true, subtree: true });
  });
}
