import { isMeta } from "../lib/data/loader";
import type {
  CheckStatus,
  DataRequest,
  FileResponse,
  MetaResponse,
} from "../lib/data/protocol";
import type { Meta } from "../lib/data/types";
import { getSettings, initSettings, subscribeSettings } from "../lib/settings";
import { createIdbStore } from "./store";
import { checkForUpdate, effectiveSnapshot } from "./updater";

/**
 * Background worker (Chrome service worker / Firefox event page): refreshes
 * the data snapshot daily and serves it to content scripts and the popup.
 * Listeners are registered synchronously at top level so a cold wake-up by a
 * message or alarm is never missed.
 */

const ALARM = "lce:data-check";
const PERIOD_MINUTES = 24 * 60;

interface Runtime {
  getURL(path: string): string;
  onMessage: {
    addListener(
      fn: (
        msg: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void
      ) => boolean | void
    ): void;
  };
  onInstalled: { addListener(fn: () => void): void };
}

interface Alarms {
  get(name: string): Promise<unknown>;
  create(name: string, info: { periodInMinutes: number }): void;
  onAlarm: { addListener(fn: (alarm: { name: string }) => void): void };
}

const globals = globalThis as Record<string, unknown>;
const api = (globals.browser ?? globals.chrome) as {
  runtime: Runtime;
  alarms: Alarms;
};

const store = createIdbStore();
const settingsReady = initSettings();

let bundled: Promise<Meta | null> | null = null;
function bundledMeta(): Promise<Meta | null> {
  bundled ??= fetch(api.runtime.getURL("data/meta.json"))
    .then((res) => (res.ok ? res.json() : null))
    .then((value: unknown) => (isMeta(value) ? value : null))
    .catch(() => null);
  return bundled;
}

let inFlight: Promise<CheckStatus> | null = null;
async function runCheck(): Promise<CheckStatus> {
  await settingsReady;
  if (!getSettings().autoUpdate) {
    const state = await store.getState().catch(() => null);
    return {
      outcome: "disabled",
      lastCheck: state?.lastCheck ?? null,
      lastError: null,
    };
  }
  inFlight ??= checkForUpdate({
    fetch: fetch.bind(globalThis),
    store,
    bundledMeta,
    sha256: async (bytes) => {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function metaResponse(): Promise<MetaResponse> {
  await settingsReady;
  if (!getSettings().autoUpdate) return { origin: "bundle" };
  const state = await store.getState();
  const meta = effectiveSnapshot(state.active, await bundledMeta());
  return meta === null ? { origin: "bundle" } : { origin: "cache", meta };
}

async function fileResponse(
  path: string,
  sha256: string
): Promise<FileResponse> {
  const cached = await store.getBlob(sha256);
  if (cached !== undefined) return { ok: true, text: cached };
  // Files unchanged since the bundle are never downloaded; serve the packaged copy.
  const meta = await bundledMeta();
  if (meta?.files[path]?.sha256 !== sha256) return { ok: false };
  const res = await fetch(api.runtime.getURL(`data/${path}`));
  return res.ok ? { ok: true, text: await res.text() } : { ok: false };
}

function handle(msg: DataRequest): Promise<unknown> | null {
  switch (msg.type) {
    case "lce:data:meta":
      return metaResponse();
    case "lce:data:file":
      return fileResponse(msg.path, msg.sha256);
    case "lce:data:check":
      return runCheck();
    default:
      return null;
  }
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (typeof msg !== "object" || msg === null) return;
  const pending = handle(msg as DataRequest);
  if (pending === null) return;
  pending.then(sendResponse, () => sendResponse(null));
  return true;
});

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void runCheck();
});

// Turning auto-update back on in the popup checks right away.
let autoUpdate: boolean | null = null;
subscribeSettings((settings) => {
  if (autoUpdate === false && settings.autoUpdate) void runCheck();
  autoUpdate = settings.autoUpdate;
});

api.runtime.onInstalled.addListener(() => {
  void runCheck();
});

void api.alarms.get(ALARM).then((existing) => {
  if (existing === undefined || existing === null) {
    api.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });
  }
});
