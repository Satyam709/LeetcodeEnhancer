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
