"use client";

import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaseButton, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { recordProductInteraction } from "@/lib/productInteraction";
import type { ProductInteractionSurface } from "@/shared/api/productInteraction";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";

export function HarumadiPurchaseButton({ surface }: { surface: ProductInteractionSurface }) {
  const [open, setOpen] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const latestEvent = useRef<string | null>(null);
  const track = (eventId: string) => {
    void recordProductInteraction("harumadi_purchase_clicked", surface, eventId)
      .then(() => { if (latestEvent.current === eventId) setTrackingFailed(false); })
      .catch(() => { if (latestEvent.current === eventId) setTrackingFailed(true); });
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const overflow = document.body.style.overflow;
    const closeOnAndroidBack = (event: Event) => {
      event.preventDefault();
      setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    window.addEventListener(ANDROID_BACK_EVENT, closeOnAndroidBack);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener(ANDROID_BACK_EVENT, closeOnAndroidBack);
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <PurchaseAction>
      <PurchaseButton ref={trigger} type="button" onClick={() => {
        setOpen(true);
        setTrackingFailed(false);
        const eventId = crypto.randomUUID();
        latestEvent.current = eventId;
        track(eventId);
      }}>실물 하루마디 구매하기</PurchaseButton>
      <small>실물 제작은 준비 중이에요.</small>
    </PurchaseAction>
    {open && createPortal(
      <Backdrop onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <Dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby="purchase-preparing-title" aria-describedby="purchase-preparing-description">
          <h2 id="purchase-preparing-title">실물 하루마디를 준비하고 있어요</h2>
          <p id="purchase-preparing-description">남긴 하루를 손에 쥘 수 있도록 준비하고 있어요. 아직 주문하거나 결제할 수는 없어요.</p>
          <p>그동안 마디와 디지털 하루마디는 무료로 만들어보세요.</p>
          {trackingFailed && <Notice role="status">관심 표시를 전송하지 못했어요. 연결되면 다시 전송할게요.
            <TextButton type="button" onClick={() => { if (latestEvent.current) track(latestEvent.current); }}>다시 전송</TextButton>
          </Notice>}
          <PrimaryButton ref={close} type="button" onClick={() => setOpen(false)}>알겠어요</PrimaryButton>
        </Dialog>
      </Backdrop>, document.body,
    )}
  </>;
}

const PurchaseAction = styled.div`
  display: grid;
  justify-items: center;
  gap: 4px;
  small { color: var(--color-text-muted); font-size: 11px; }
`;
const PurchaseButton = styled(BaseButton)`
  min-height: 44px;
  padding: 10px 16px;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 4px;
`;
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
  background: rgb(20 32 47 / 0.4);
  display: grid;
  place-items: center;
`;
const Dialog = styled.section`
  display: grid;
  gap: 18px;
  width: min(100%, 380px);
  max-height: 100%;
  overflow-y: auto;
  border-radius: 24px;
  padding: 28px 24px;
  background: var(--color-surface);
  h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.5; word-break: keep-all; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; }
`;
const Notice = styled.div`
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
`;
