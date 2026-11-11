import { createBrowserDataLayer } from "../lib/data/browser";
import { formatCount, formatUpdated } from "../views/company-page/model";
import {
  getSettings,
  initSettings,
  setSettings,
  subscribeSettings,
} from "../lib/settings";

function render(highlight: boolean): void {
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
}

function renderVersion(): void {
  const globals = globalThis as Record<string, unknown>;
  for (const name of ["browser", "chrome"]) {
    const runtime = (globals[name] as { runtime?: ManifestRuntime } | undefined)
      ?.runtime;
    const version = runtime?.getManifest?.().version;
    if (version !== undefined) {
      const badge = document.querySelector<HTMLElement>("#version");
      if (badge !== null) badge.textContent = `v${version}`;
      return;
    }
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
  render(getSettings().highlight);
  subscribeSettings((settings) => render(settings.highlight));

  const toggle = document.querySelector<HTMLInputElement>("#highlight");
  toggle?.addEventListener("change", () => {
    void setSettings({ highlight: toggle.checked });
  });
}

void boot();
