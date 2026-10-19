import { afterEach, describe, expect, it, vi } from "vitest";
import { debugLog } from "../../../src/lib/debug";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("debugLog", () => {
  it("is silent unless localStorage['lce:debug'] is set", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    debugLog("quiet");
    expect(spy).not.toHaveBeenCalled();
  });

  it("only enables on the exact value \"1\"", () => {
    localStorage.setItem("lce:debug", "true");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    debugLog("nope");
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs with the [lce] prefix when enabled", () => {
    localStorage.setItem("lce:debug", "1");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    debugLog("hello", 42);
    expect(spy).toHaveBeenCalledWith("[lce]", "hello", 42);
  });

  it("never throws when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => debugLog("hardened")).not.toThrow();
  });
});
