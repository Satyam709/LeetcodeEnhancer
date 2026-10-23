import { afterEach, describe, expect, it } from "vitest";
import { el } from "../../../src/lib/dom/html";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("el", () => {
  it("creates an element with class, text, attributes and children", () => {
    const node = el("a", {
      className: "lce-chip",
      text: "Google",
      attrs: { href: "/company/google/", role: "link" },
      children: [el("span", { text: "+" })],
    });

    expect(node.tagName).toBe("A");
    expect(node.className).toBe("lce-chip");
    expect(node.getAttribute("href")).toBe("/company/google/");
    expect(node.getAttribute("role")).toBe("link");
    expect(node.textContent).toBe("Google+");
    expect(node.querySelector("span")?.textContent).toBe("+");
  });

  it("creates an empty element when no props are supplied", () => {
    const node = el("div");
    expect(node.outerHTML).toBe("<div></div>");
  });
});
