"use client";

import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { dispatchAndroidBackEvent } from "@/features/tuti/navigation/androidBack";
import { palette } from "@/styles/tokens";

const EXIT_CONFIRMATION_WINDOW_MS = 2_000;

export function AndroidBackButtonHandler() {
  const [messageVisible, setMessageVisible] = useState(false);
  const lastBackPressedAt = useRef(0);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;

    let disposed = false;
    let listener: PluginListenerHandle | null = null;

    const hideMessage = () => {
      setMessageVisible(false);
      hideTimer.current = null;
    };

    void App.addListener("backButton", ({ canGoBack }) => {
      if (!dispatchAndroidBackEvent()) {
        lastBackPressedAt.current = 0;
        hideMessage();
        return;
      }

      if (canGoBack) {
        lastBackPressedAt.current = 0;
        hideMessage();
        window.history.back();
        return;
      }

      const now = Date.now();
      if (
        now - lastBackPressedAt.current <= EXIT_CONFIRMATION_WINDOW_MS
      ) {
        void App.exitApp();
        return;
      }

      lastBackPressedAt.current = now;
      setMessageVisible(true);

      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
      }
      hideTimer.current = window.setTimeout(
        hideMessage,
        EXIT_CONFIRMATION_WINDOW_MS,
      );
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      disposed = true;
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
      }
      void listener?.remove();
    };
  }, []);

  return (
    <ExitMessage
      $visible={messageVisible}
      role="status"
      aria-live="polite"
      aria-hidden={!messageVisible}
    >
      한 번 더 누르면 종료돼요.
    </ExitMessage>
  );
}

const ExitMessage = styled.div<{ $visible: boolean }>`
  position: fixed;
  z-index: 3000;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  max-width: calc(100% - 48px);
  padding: 10px 16px;
  border: 1px solid var(--color-secondary-500);
  border-radius: 999px;
  color: ${palette.neutral[1200]};
  background: color-mix(
    in srgb,
    var(--color-secondary-200) 94%,
    transparent
  );
  box-shadow: 0 10px 28px rgb(var(--color-black-rgb) / 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.005em;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translate(-50%, ${({ $visible }) => ($visible ? "0" : "8px")});
  transition:
    opacity 180ms ease,
    transform 180ms ease;
`;
