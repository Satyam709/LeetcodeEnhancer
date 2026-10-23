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

async function boot(): Promise<void> {
  await initSettings();
  render(getSettings().highlight);
  subscribeSettings((settings) => render(settings.highlight));

  const toggle = document.querySelector<HTMLInputElement>("#highlight");
  toggle?.addEventListener("change", () => {
    void setSettings({ highlight: toggle.checked });
  });
}

void boot();
