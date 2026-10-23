/**
 * MV3 manifest generation: one base file, per-browser output.
 * Chrome and Firefox share everything except `browser_specific_settings`.
 */

export interface ContentScript {
  matches: string[];
  js: string[];
  css: string[];
  run_at: "document_idle" | "document_start" | "document_end";
}

export interface WebAccessibleResource {
  resources: string[];
  matches: string[];
}

export interface ManifestAction {
  default_popup?: string;
  default_title?: string;
  default_icon?: Record<string, string>;
}

export interface ManifestBase {
  name: string;
  description: string;
  content_scripts: ContentScript[];
  /** `storage` powers the popup's highlight toggle. */
  permissions?: string[];
  action?: ManifestAction;
  /** Required so the content script can fetch data/** via runtime.getURL. */
  web_accessible_resources?: WebAccessibleResource[];
  icons?: Record<string, string>;
  /** Firefox extension id — only emitted when building for firefox. */
  gecko_id: string;
}

export interface Manifest {
  manifest_version: 3;
  name: string;
  description: string;
  version: string;
  content_scripts: ContentScript[];
  permissions?: string[];
  action?: ManifestAction;
  web_accessible_resources?: WebAccessibleResource[];
  icons?: Record<string, string>;
  browser_specific_settings?: { gecko: { id: string } };
}

export function buildManifest(
  base: ManifestBase,
  opts: { version: string; browser: "chrome" | "firefox" }
): Manifest {
  const manifest: Manifest = {
    manifest_version: 3,
    name: base.name,
    description: base.description,
    version: opts.version,
    content_scripts: base.content_scripts,
    ...(base.permissions ? { permissions: base.permissions } : {}),
    ...(base.action ? { action: base.action } : {}),
    ...(base.web_accessible_resources
      ? { web_accessible_resources: base.web_accessible_resources }
      : {}),
    ...(base.icons ? { icons: base.icons } : {}),
  };

  if (opts.browser === "firefox") {
    manifest.browser_specific_settings = { gecko: { id: base.gecko_id } };
  }

  return manifest;
}
