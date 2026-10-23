import { debugLog } from "../lib/debug";
import { initSettings } from "../lib/settings";
import { createViews } from "./registry";
import { createRouter } from "./router";

// The content script must never throw into the page — a boot failure leaves
// leetcode.com untouched and logs only under the debug flag.
try {
  debugLog("boot on", location.href);
  void initSettings();
  createRouter({ views: createViews() }).start();
} catch (err) {
  debugLog("boot failed", err);
}
