export interface ElProps {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: (Node | string)[];
}

/**
 * Small typed element factory used by the views. Creates nodes in the page's
 * own document so they behave natively (styles, events, focus).
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className !== undefined) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const child of props.children ?? []) node.append(child);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Small inline icon: stroked with `currentColor`, hidden from assistive tech,
 * sized by CSS through `className`.
 */
export function svg(
  viewBox: string,
  shapes: [string, Record<string, string>][],
  className: string
): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("viewBox", viewBox);
  root.setAttribute("fill", "none");
  root.setAttribute("stroke", "currentColor");
  root.setAttribute("stroke-width", "1.5");
  root.setAttribute("stroke-linecap", "round");
  root.setAttribute("stroke-linejoin", "round");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("class", className);
  for (const [tag, attrs] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
      shape.setAttribute(name, value);
    }
    root.append(shape);
  }
  return root;
}
