export interface Settings {
  /** Draw green outlines/accents around injected UI. Off by default. */
  highlight: boolean;
  /** Let the background worker refresh company data from the data branch. */
  autoUpdate: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  highlight: false,
  autoUpdate: true,
};
export const SETTINGS_KEY = "settings";

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface StorageNamespace {
  local?: StorageArea;
  onChanged?: {
    addListener(
      listener: (
        changes: Record<string, { newValue?: unknown }>,
        areaName: string
      ) => void
    ): void;
  };
}

type Listener = (settings: Settings) => void;

let current: Settings = { ...DEFAULT_SETTINGS };
const listeners = new Set<Listener>();
let subscribed = false;

function namespace(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/** Prefer Firefox's promise-based `browser`, then Chrome's `chrome`. */
function getStorage(): StorageNamespace | null {
  const globals = namespace();
  for (const name of ["browser", "chrome"]) {
    const api = globals[name] as { storage?: StorageNamespace } | undefined;
    if (api?.storage?.local !== undefined) return api.storage;
  }
  return null;
}

function normalize(value: unknown): Settings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const raw = value as Record<string, unknown>;
  return {
    highlight: raw.highlight === true,
    autoUpdate: raw.autoUpdate !== false,
  };
}

export function getSettings(): Settings {
  return current;
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(current);
    } catch {
      // A bad listener must never break the page or the popup.
    }
  }
}

/** Apply the visual-only settings to the document. */
export function applySettings(settings: Settings = current): void {
  try {
    document.documentElement.classList.toggle(
      "lce-highlight",
      settings.highlight
    );
  } catch {
    // No DOM (tests/worker contexts): nothing to paint.
  }
}

/**
 * Read persisted settings and keep them in sync with the popup. Safe to call
 * when no extension runtime exists (plain jsdom, Firefox without storage) —
 * it silently keeps the defaults.
 */
export async function initSettings(): Promise<void> {
  const storage = getStorage();
  if (storage?.local !== undefined) {
    try {
      const stored = await storage.local.get(SETTINGS_KEY);
      current = normalize(stored[SETTINGS_KEY]);
    } catch {
      current = { ...DEFAULT_SETTINGS };
    }
  }

  applySettings();
  emit();

  if (!subscribed && storage?.onChanged !== undefined) {
    subscribed = true;
    storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !(SETTINGS_KEY in changes)) return;
      current = normalize(changes[SETTINGS_KEY]?.newValue);
      applySettings();
      emit();
    });
  }
}

/** Persist and broadcast a change (the popup is the primary caller). */
export async function setSettings(next: Partial<Settings>): Promise<void> {
  current = { ...current, ...next };
  applySettings();
  emit();

  const storage = getStorage();
  if (storage?.local !== undefined) {
    try {
      await storage.local.set({ [SETTINGS_KEY]: current });
    } catch {
      // Keep the in-memory value; the popup will show it for this session.
    }
  }
}
