/** Prefix for every log line the extension emits. */
const PREFIX = "[lce]";

/**
 * Debug logger — silent unless the user opts in by running
 * `localStorage.setItem("lce:debug", "1")` on leetcode.com.
 * Never throws: logging must not be able to break the page.
 */
export function debugLog(...args: unknown[]): void {
  try {
    if (localStorage.getItem("lce:debug")) {
      console.debug(PREFIX, ...args);
    }
  } catch {
    // Storage can be unavailable in exotic contexts — stay silent.
  }
}
