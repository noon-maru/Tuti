"use client";

import styled from "@emotion/styled";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BaseButton } from "@/features/tuti/components/buttons";

export function ShareDialogFrame({
  children,
  dismissEnabled = true,
  onClose,
  title,
}: {
  children: ReactNode;
  dismissEnabled?: boolean;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissEnabled) onClose();
    };
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [dismissEnabled, onClose]);

  return createPortal(
    <Backdrop
      onPointerDown={() => {
        if (dismissEnabled) onClose();
      }}
    >
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <HeaderSpacer />
          <h2 id="share-dialog-title">{title}</h2>
          <CloseButton
            type="button"
            aria-label={`${title} 닫기`}
            disabled={!dismissEnabled}
            onClick={onClose}
          >
            ×
          </CloseButton>
        </DialogHeader>
        {children}
      </Dialog>
    </Backdrop>,
    document.body,
  );
}

const Backdrop = styled.div`
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: grid;
  place-items: center;
  padding:
    calc(var(--space-5) + var(--app-safe-area-top, 0px))
    calc(var(--space-4) + var(--app-safe-area-right, 0px))
    calc(var(--space-5) + var(--app-safe-area-bottom, 0px))
    calc(var(--space-4) + var(--app-safe-area-left, 0px));
  background: rgb(var(--color-black-rgb) / 0.48);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

const Dialog = styled.section`
  width: min(100%, 390px);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  overflow-y: auto;
  border-radius: 32px;
  background: var(--color-surface);
  box-shadow: 0 28px 72px rgb(var(--color-black-rgb) / 0.28);
  overscroll-behavior: contain;
`;

const DialogHeader = styled.header`
  display: grid;
  grid-template-columns: var(--space-10) 1fr var(--space-10);
  align-items: center;

  h2 {
    font-size: var(--font-size-400);
    text-align: center;
  }
`;

const HeaderSpacer = styled.span`
  width: var(--space-10);
  height: var(--space-10);
`;

const CloseButton = styled(BaseButton)`
  width: var(--space-10);
  height: var(--space-10);
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-600);
  line-height: 1;
`;
