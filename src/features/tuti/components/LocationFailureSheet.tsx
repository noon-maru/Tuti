"use client";

import styled from "@emotion/styled";
import { Capacitor } from "@capacitor/core";
import { MapPinOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";

export function LocationFailureSheet({
  reason,
  requesting,
  onRetry,
  onChooseRegion,
}: {
  reason: "denied" | "unavailable" | "timeout";
  requesting: boolean;
  onRetry: () => void;
  onChooseRegion: () => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    sheetRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (!sheetRef.current?.contains(document.activeElement)) {
      sheetRef.current?.focus();
    }
  }, [requesting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requesting) onChooseRegion();
      }
      if (event.key !== "Tab") return;
      const buttons = sheetRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      if (!buttons?.length) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const atSheet = document.activeElement === sheetRef.current ||
        !sheetRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || atSheet)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || atSheet)) {
        event.preventDefault();
        first.focus();
      }
    };
    const onBack = (event: Event) => {
      event.preventDefault();
      if (!requesting) onChooseRegion();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(ANDROID_BACK_EVENT, onBack);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(ANDROID_BACK_EVENT, onBack);
    };
  }, [onChooseRegion, requesting]);

  const title = reason === "denied"
    ? "위치 권한을 확인해주세요."
    : reason === "timeout"
      ? "위치를 확인하는 데 시간이 걸려요."
      : "현재 위치를 확인하지 못했어요.";
  const description = reason === "denied"
    ? Capacitor.isNativePlatform()
      ? "기기 설정에서 Tuti의 위치 권한을 허용한 뒤 다시 시도해주세요."
      : "기기의 위치 서비스와 브라우저의 사이트 위치 권한을 허용한 뒤 다시 시도해주세요."
    : reason === "timeout"
      ? "잠시 후 다시 시도해주세요. 지금은 추천받을 지역을 직접 골라도 괜찮아요."
      : "기기의 위치 서비스와 네트워크 연결을 확인해주세요. 추천받을 지역을 직접 고를 수도 있어요.";

  return (
    <Overlay $visible={animationReady}>
      <Sheet
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-failure-title"
        aria-describedby="location-failure-description"
        aria-busy={requesting}
        $visible={animationReady}
      >
        <Handle aria-hidden="true"><i /></Handle>
        <Mark aria-hidden="true"><MapPinOff /></Mark>
        <Copy>
          <h2 id="location-failure-title">{title}</h2>
          <p id="location-failure-description">{description}</p>
        </Copy>
        <Actions>
          <PrimaryButton type="button" disabled={requesting} onClick={onRetry}>
            <span role="status">
              {requesting ? "현재 위치를 확인하고 있어요" : "다시 시도"}
            </span>
          </PrimaryButton>
          <RegionButton type="button" disabled={requesting} onClick={onChooseRegion}>
            지역 직접 선택
          </RegionButton>
        </Actions>
      </Sheet>
    </Overlay>
  );
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  z-index: 72;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(var(--color-black-rgb) / 0.28);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 380ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Sheet = styled.section<{ $visible: boolean }>`
  display: grid;
  justify-items: start;
  gap: var(--space-4);
  width: 100%;
  max-height: calc(100% - var(--app-safe-area-top, 0px) - var(--space-5));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--space-5) calc(var(--space-6) + var(--app-safe-area-bottom, 0px));
  border-radius: 30px 30px 0 0;
  background: var(--color-surface);
  transform: translateY(${({ $visible }) => ($visible ? "0" : "100%")});
  transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1);

  &:focus {
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Handle = styled.div`
  justify-self: center;
  height: 30px;
  display: grid;
  place-items: center;

  i {
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: var(--color-neutral-500);
  }
`;

const Mark = styled.div`
  display: grid;
  place-items: center;
  width: var(--space-12);
  height: var(--space-12);
  border-radius: 16px;
  background: var(--color-secondary-200);
  color: var(--color-secondary-900);
`;

const Copy = styled.div`
  display: grid;
  gap: var(--space-2);
  word-break: keep-all;
  overflow-wrap: anywhere;

  h2 {
    font-size: var(--font-size-500);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
    line-height: 1.6;
  }
`;

const Actions = styled.div`
  display: grid;
  gap: var(--space-2);
  width: 100%;

  > button {
    width: 100%;
    min-height: 52px;
  }
`;

const RegionButton = styled(BaseButton)`
  color: var(--color-text-muted);
  background: transparent;
  font-size: var(--font-size-200);
`;
