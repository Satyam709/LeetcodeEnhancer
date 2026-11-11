import { afterEach, describe, expect, it, vi } from "vitest";

type ChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: string
) => void;

function clearHighlight(): void {
  document.documentElement.classList.remove("lce-highlight");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  clearHighlight();
});

describe("settings", () => {
  it("reads storage, applies the html class, and persists changes", async () => {
    const set = vi.fn(async () => {});
    const get = vi.fn(async () => ({ settings: { highlight: true } }));
    vi.stubGlobal("chrome", {
      storage: {
        local: { get, set },
        onChanged: { addListener: vi.fn() },
      },
    });

    const settings = await import("../../../src/lib/settings");
    expect(settings.getSettings()).toEqual({
      highlight: false,
      autoUpdate: true,
    });

    await settings.initSettings();
    expect(get).toHaveBeenCalledWith("settings");
    expect(settings.getSettings()).toEqual({
      highlight: true,
      autoUpdate: true,
    });
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      true
    );

    const seen: boolean[] = [];
    settings.subscribeSettings((value) => seen.push(value.highlight));
    await settings.setSettings({ highlight: false });

    expect(seen).toEqual([false]);
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      false
    );
    expect(set).toHaveBeenCalledWith({
      settings: { highlight: false, autoUpdate: true },
    });
  });

  it("degrades to defaults without an extension runtime", async () => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);

    const settings = await import("../../../src/lib/settings");
    await expect(settings.initSettings()).resolves.toBeUndefined();
    expect(settings.getSettings()).toEqual({
      highlight: false,
      autoUpdate: true,
    });
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      false
    );

    // In-memory changes still paint even when persistence is unavailable.
    await settings.setSettings({ highlight: true });
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      true
    );
  });

  it("reacts to popup storage changes for the local area only", async () => {
    let listener: ChangeListener | undefined;
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
        },
        onChanged: {
          addListener: (fn: ChangeListener) => {
            listener = fn;
          },
        },
      },
    });

    const settings = await import("../../../src/lib/settings");
    await settings.initSettings();
    expect(listener).toBeTypeOf("function");
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      false
    );

    listener!({ settings: { newValue: { highlight: true } } }, "local");
    expect(settings.getSettings()).toEqual({
      highlight: true,
      autoUpdate: true,
    });
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      true
    );

    listener!({ settings: { newValue: { highlight: false } } }, "sync");
    expect(settings.getSettings()).toEqual({
      highlight: true,
      autoUpdate: true,
    });
    expect(document.documentElement.classList.contains("lce-highlight")).toBe(
      true
    );
  });

  it("keeps auto-update on unless it was explicitly turned off", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async () => ({ settings: { autoUpdate: false } }),
          set: async () => {},
        },
      },
    });
    const settings = await import("../../../src/lib/settings");
    await settings.initSettings();
    expect(settings.getSettings()).toEqual({
      highlight: false,
      autoUpdate: false,
    });
  });
});
