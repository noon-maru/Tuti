"use client";

import { useEffect, useRef, type RefObject } from "react";
import { dialogFocusableElements, installDialogScope } from "./dialogScope";

/** Share modal behavior without replacing the layer's animation or history. */
export function useLayerDialogScope(dialog: RefObject<HTMLElement | null>, {
  enabled = true, ready = true, closing = false, onCancel,
}: { enabled?: boolean; ready?: boolean; closing?: boolean; onCancel: () => void }) {
  const latest = useRef({ closing, onCancel });
  useEffect(() => { latest.current = { closing, onCancel }; });
  useEffect(() => {
    const node = dialog.current;
    if (!enabled || !node) return;
    return installDialogScope({
      dialog: node, isolationRoot: node,
      initialFocus: () => node.querySelector<HTMLElement>("[data-dialog-initial-focus]"),
      canDismiss: () => !latest.current.closing,
      onCancel: () => latest.current.onCancel(),
    });
  }, [dialog, enabled]);
  useEffect(() => {
    const node = dialog.current;
    // During entry the content is inert. Move focus only when that content is
    // ready and this layer still owns focus (not a nested dialog).
    if (enabled && ready && !closing && node && document.activeElement === node) {
      (dialogFocusableElements(node)[0] ?? node).focus({ preventScroll: true });
    }
  }, [dialog, enabled, ready, closing]);
}
