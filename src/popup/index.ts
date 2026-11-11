import { createBrowserDataLayer } from "../lib/data/browser";
import type { CheckStatus, DataRequest } from "../lib/data/protocol";
import { formatCount, formatUpdated } from "../views/company-page/model";
import {
  getSettings,
  initSettings,
  setSettings,
  subscribeSettings,
  type Settings,
} from "../lib/settings";

function render(settings: Settings): void {
  const { highlight } = settings;
  const autoUpdate = document.querySelector<HTMLInputElement>("#auto-update");
  if (autoUpdate !== null) autoUpdate.checked = settings.autoUpdate;
  const toggle = document.querySelector<HTMLInputElement>("#highlight");
  const status = document.querySelector<HTMLElement>("#status");
  if (toggle !== null) toggle.checked = highlight;
  if (status !== null) {
    status.textContent = highlight
      ? "Green outlines are on."
      : "Normal extension look.";
    status.classList.toggle("is-on", highlight);
  }
}

interface ManifestRuntime {
  getManifest?: () => { version?: string };
  sendMessage?: (message: DataRequest) => Promise<unknown>;
}

function runtime(): ManifestRuntime | undefined {
  const globals = globalThis as Record<string, unknown>;
  for (const name of ["browser", "chrome"]) {
    const found = (globals[name] as { runtime?: ManifestRuntime } | undefined)
      ?.runtime;
    if (found !== undefined) return found;
  }
  return undefined;
}

function renderVersion(): void {
  const version = runtime()?.getManifest?.().version;
  const badge = document.querySelector<HTMLElement>("#version");
  if (version !== undefined && badge !== null)
    badge.textContent = `v${version}`;
}

const OUTCOME_TEXT: Record<CheckStatus["outcome"], string> = {
  updated: "Downloaded newer company data.",
  current: "Company data is up to date.",
  disabled: "Auto-update is off; using the bundled data.",
  failed: "Update check failed; keeping the current data.",
};

/** Ask the background worker to check for new data now. */
async function checkNow(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#check");
  const line = document.querySelector<HTMLElement>("#update-status");
  const rt = runtime();
  if (rt?.sendMessage === undefined || line === null) return;
  if (button !== null) button.disabled = true;
  line.classList.remove("is-error");
  line.textContent = "Checking…";
  try {
    const status = (await rt.sendMessage({
      type: "lce:data:check",
    })) as CheckStatus | null;
    if (status === null || status === undefined) throw new Error("no response");
    line.textContent = OUTCOME_TEXT[status.outcome];
    line.title = status.lastError ?? "";
    line.classList.toggle("is-error", status.outcome === "failed");
    if (status.outcome === "updated") void renderData();
  } catch {
    line.textContent = OUTCOME_TEXT.failed;
    line.classList.add("is-error");
  } finally {
    if (button !== null) button.disabled = false;
  }
}

/** "1,234 companies · 3,456 problems · updated Aug 16, 2026" from meta.json. */
async function renderData(): Promise<void> {
  const line = document.querySelector<HTMLElement>("#data");
  if (line === null) return;
  try {
    const meta = await createBrowserDataLayer().meta();
    const { companies, problems } = meta.counts;
    line.textContent =
      `${formatCount(companies)} companies · ${formatCount(problems)} problems · ` +
      `updated ${formatUpdated(meta.source.commitDate)}`;
  } catch {
    // Keep the static fallback text.
  }
}

async function boot(): Promise<void> {
  renderVersion();
  void renderData();
  await initSettings();
  render(getSettings());
  subscribeSettings(render);

  const toggle = document.querySelector<HTMLInputElement>("#highlight");
  toggle?.addEventListener("change", () => {
    void setSettings({ highlight: toggle.checked });
  });

  const autoUpdate = document.querySelector<HTMLInputElement>("#auto-update");
  autoUpdate?.addEventListener("change", () => {
    void setSettings({ autoUpdate: autoUpdate.checked }).then(renderData);
  });
  document
    .querySelector<HTMLButtonElement>("#check")
    ?.addEventListener("click", () => void checkNow());
}

void boot();
