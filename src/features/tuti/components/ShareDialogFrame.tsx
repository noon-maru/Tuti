"use client";

import styled from "@emotion/styled";
import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";

export function ShareDialogFrame({ children, dismissEnabled = true, onClose, title }: {
  children: ReactNode; dismissEnabled?: boolean; onClose: () => void; title: string;
}) {
  const id = useId(), close = useRef<HTMLButtonElement>(null);
  return <AppDialogFrame role="dialog" titleId={id} initialFocus={close} onCancel={onClose} dismissEnabled={dismissEnabled}>
    <DialogHeader><HeaderSpacer /><h2 id={id}>{title}</h2>
      <CloseButton ref={close} type="button" aria-label={`${title} 닫기`} disabled={!dismissEnabled} onClick={onClose}><X size={20} aria-hidden="true" /></CloseButton>
    </DialogHeader>
    {children}
  </AppDialogFrame>;
}

const DialogHeader = styled.header`display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; h2 { text-align: center; }`;
const HeaderSpacer = styled.span`width: 44px; height: 44px;`;
const CloseButton = styled(BaseButton)`width: 44px; height: 44px; padding: 0; border-radius: 999px; background: transparent; color: var(--color-text-muted); display: grid; place-items: center; &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }`;
