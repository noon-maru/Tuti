import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";

const scopes: symbol[] = [];
const inertLocks = new WeakMap<HTMLElement, { count: number; previous: boolean }>();
let scrollLocks = 0;
let previousOverflow = "";

export function dialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button, input:not([type="hidden"]), textarea, select, a[href], area[href], summary, [tabindex], [contenteditable="true"]',
  )).filter(node => node.tabIndex >= 0 && !node.matches(":disabled") &&
    !node.closest('[hidden], [inert], [aria-hidden="true"]') && node.getClientRects().length > 0);
}

/** Each layer owns its locks; only the top dialog handles focus and dismissal. */
export function installDialogScope({ dialog, initialFocus, onCancel, canDismiss }: {
  dialog: HTMLElement;
  initialFocus: () => HTMLElement | null;
  onCancel: () => void;
  canDismiss: () => boolean;
}) {
  const id = Symbol("dialog");
  const previous = document.activeElement;
  const backdrop = dialog.parentElement;
  const siblings = Array.from(backdrop?.parentElement?.children ?? [])
    .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
  for (const node of siblings) {
    const lock = inertLocks.get(node) ?? { count: 0, previous: node.inert };
    lock.count += 1;
    inertLocks.set(node, lock);
    node.inert = true;
  }
  if (scrollLocks++ === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scopes.push(id);
  const isTop = () => scopes.at(-1) === id;
  const focusInside = () => {
    const preferred = initialFocus();
    const controls = dialogFocusableElements(dialog);
    const target = preferred && controls.includes(preferred) ? preferred : controls[0] ?? dialog;
    target.focus({ preventScroll: true });
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!isTop()) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation();
      if (canDismiss()) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    event.stopImmediatePropagation();
    const controls = dialogFocusableElements(dialog);
    const first = controls[0], last = controls.at(-1);
    const outside = !dialog.contains(document.activeElement) || document.activeElement === dialog;
    if (!first || !last) { event.preventDefault(); dialog.focus({ preventScroll: true }); return; }
    if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
  };
  const back = (event: Event) => {
    if (!isTop()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (canDismiss()) onCancel();
  };
  const focus = () => { if (isTop() && !dialog.contains(document.activeElement)) focusInside(); };
  window.addEventListener("keydown", keyDown, true);
  window.addEventListener(ANDROID_BACK_EVENT, back, true);
  document.addEventListener("focusin", focus);
  focusInside();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    window.removeEventListener("keydown", keyDown, true);
    window.removeEventListener(ANDROID_BACK_EVENT, back, true);
    document.removeEventListener("focusin", focus);
    const index = scopes.indexOf(id);
    if (index >= 0) scopes.splice(index, 1);
    for (const node of siblings) {
      const lock = inertLocks.get(node);
      if (!lock || --lock.count > 0) continue;
      node.inert = lock.previous;
      inertLocks.delete(node);
    }
    if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
    if (previous instanceof HTMLElement && previous.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
  };
}
