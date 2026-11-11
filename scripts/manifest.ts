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
  /** Background entry (data updater): a service worker on Chrome, an event page on Firefox. */
  background_script?: string;
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
  background?: { service_worker: string } | { scripts: string[] };
  browser_specific_settings?: { gecko: GeckoSettings };
}

export interface GeckoSettings {
  id: string;
  /** `data_collection_permissions` is honored from Firefox 140. */
  strict_min_version: string;
  /** AMO requires new extensions to declare this; we collect nothing. */
  data_collection_permissions: { required: string[] };
}

export const GECKO_MIN_VERSION = "140.0";

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

  if (base.background_script !== undefined) {
    // Firefox MV3 has no service workers; it runs background scripts as an event page.
    manifest.background =
      opts.browser === "firefox"
        ? { scripts: [base.background_script] }
        : { service_worker: base.background_script };
  }

  if (opts.browser === "firefox") {
    manifest.browser_specific_settings = {
      gecko: {
        id: base.gecko_id,
        strict_min_version: GECKO_MIN_VERSION,
        data_collection_permissions: { required: ["none"] },
      },
    };
  }

  return manifest;
}
