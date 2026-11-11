export interface Popover {
  open(): void;
  close(opts?: { focusTrigger?: boolean }): void;
  isOpen(): boolean;
}

export interface PopoverOptions {
  /** The button that toggles the panel. Gets `aria-expanded`/`aria-controls`. */
  trigger: HTMLElement;
  /** The floating panel; must already be in the DOM next to the trigger. */
  panel: HTMLElement;
  /** Removes document listeners when the view is torn down. */
  signal: AbortSignal;
  /** Called before the panel shows (e.g. to refresh counts). */
  onOpen?: () => void;
  /** Close any sibling popover so only one is open at a time. */
  onBeforeOpen?: () => void;
}

/**
 * A lightweight disclosure popover in the style of LeetCode's own menus:
 * click the trigger to toggle, click outside or press Escape to close
 * (Escape returns focus to the trigger), ArrowUp/ArrowDown move between the
 * panel's focusable items.
 */
export function createPopover(opts: PopoverOptions): Popover {
  const { trigger, panel, signal } = opts;
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  if (panel.id !== "") trigger.setAttribute("aria-controls", panel.id);

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (target === null) return;
    if (panel.contains(target) || trigger.contains(target)) return;
    close();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close({ focusTrigger: true });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const target = event.target as HTMLElement | null;
    // Let text inputs keep their caret keys… except to leave them downwards.
    if (target instanceof HTMLInputElement && target.type === "text") {
      if (event.key === "ArrowUp") return;
    }
    const items = focusables();
    if (items.length === 0) return;
    event.preventDefault();
    const index = target === null ? -1 : items.indexOf(target);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(index + step + items.length) % items.length];
    next?.focus();
  };

  function focusables(): HTMLElement[] {
    return [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
      ),
    ].filter((node) => !node.closest("[hidden]"));
  }

  function open(): void {
    if (signal.aborted || !panel.hidden) return;
    opts.onBeforeOpen?.();
    opts.onOpen?.();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onPointerDown, true);
    panel.addEventListener("keydown", onKeyDown);
  }

  function close(closeOpts: { focusTrigger?: boolean } = {}): void {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onPointerDown, true);
    panel.removeEventListener("keydown", onKeyDown);
    if (closeOpts.focusTrigger === true) trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) open();
    else close();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown" && panel.hidden) {
      event.preventDefault();
      open();
      focusables()[0]?.focus();
    }
  });
  signal.addEventListener("abort", () => close());

  return { open, close, isOpen: () => !panel.hidden };
}
