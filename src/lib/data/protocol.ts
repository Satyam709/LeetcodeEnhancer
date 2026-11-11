import { SCHEMA_VERSION, type Meta } from "./types";

/**
 * The update channel: the orphan `data` branch of this repo, written by
 * .github/workflows/sync-data.yml. Artifacts live under `v<schemaVersion>/`,
 * so a build only ever reads data in the schema it understands.
 */
export const DATA_REPO = "Satyam709/LeetcodeEnhancer";
export const DATA_BRANCH = "data";
export const DATA_PATH = `v${SCHEMA_VERSION}`;

/** Messages the content script and popup send to the background worker. */
export type DataRequest =
  | { type: "lce:data:meta" }
  | { type: "lce:data:file"; path: string; sha256: string }
  | { type: "lce:data:check" };

/** `cache`: a downloaded snapshot newer than the bundle is active. */
export type MetaResponse =
  { origin: "cache"; meta: Meta } | { origin: "bundle" };

export type FileResponse = { ok: true; text: string } | { ok: false };

export type CheckOutcome = "updated" | "current" | "disabled" | "failed";

export interface CheckStatus {
  outcome: CheckOutcome;
  /** ISO timestamp of the last check attempt, if any. */
  lastCheck: string | null;
  lastError: string | null;
}
