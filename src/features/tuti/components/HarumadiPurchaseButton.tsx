"use client";

import styled from "@emotion/styled";
import { useEffect, useId, useRef, useState } from "react";
import { BaseButton, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { recordProductInteraction } from "@/lib/productInteraction";
import type { ProductInteractionSurface } from "@/shared/api/productInteraction";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { captionStyles } from "@/shared/ui/typography";
import { trackLifecycle } from "@/lib/lifecycle";
import { useSession } from "../hooks/useSession";

export function HarumadiPurchaseButton({ surface }: { surface: ProductInteractionSurface }) {
  const id = useId();
  const owner = useSession()?.userId;
  const observed = useRef("");
  const [open, setOpen] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const latestEvent = useRef<string | null>(null);
  const observe = () => {
    if (surface !== "completed_harumadi" || !owner || observed.current === owner) return;
    observed.current = owner;
    trackLifecycle("purchase_viewed", { source: "book" });
  };
  useEffect(() => {
    const control = trigger.current;
    if (!control || !owner || surface !== "completed_harumadi" || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(items => {
      if (items.some(item => item.isIntersecting && item.intersectionRatio >= 0.5) && document.visibilityState === "visible" && observed.current !== owner) {
        observed.current = owner; trackLifecycle("purchase_viewed", { source: "book" });
      }
    }, { threshold: 0.5 });
    observer.observe(control);
    return () => observer.disconnect();
  }, [owner, surface]);
  const track = (eventId: string) => {
    void recordProductInteraction("harumadi_purchase_clicked", surface, eventId)
      .then(() => { if (latestEvent.current === eventId) setTrackingFailed(false); })
      .catch(() => { if (latestEvent.current === eventId) setTrackingFailed(true); });
  };

  return <>
    <PurchaseAction>
      <PurchaseButton ref={trigger} type="button" onClick={() => {
        observe();
        if (surface === "completed_harumadi") trackLifecycle("purchase_clicked", { source: "book" });
        setOpen(true);
        setTrackingFailed(false);
        const eventId = crypto.randomUUID();
        latestEvent.current = eventId;
        track(eventId);
      }}>실물 하루마디 구매하기</PurchaseButton>
      <small>실물 제작은 준비 중이에요.</small>
    </PurchaseAction>
    {open && <AppDialogFrame role="dialog" titleId={`${id}-title`} descriptionId={`${id}-description`} initialFocus={close} onCancel={() => setOpen(false)}>
          <h2 id={`${id}-title`}>실물 하루마디를 준비하고 있어요</h2>
          <p id={`${id}-description`}>남긴 하루를 손에 쥘 수 있도록 준비하고 있어요. 아직 주문하거나 결제할 수는 없어요.</p>
          <p>그동안 마디와 디지털 하루마디는 무료로 만들어보세요.</p>
          {trackingFailed && <Notice role="status">관심 표시를 전송하지 못했어요. 연결되면 다시 전송할게요.
            <TextButton type="button" onClick={() => { if (latestEvent.current) track(latestEvent.current); }}>다시 전송</TextButton>
          </Notice>}
          <PrimaryButton ref={close} type="button" onClick={() => setOpen(false)}>알겠어요</PrimaryButton>
        </AppDialogFrame>}
  </>;
}

const PurchaseAction = styled.div`
  display: grid;
  justify-items: center;
  gap: 4px;
  small { ${captionStyles} }
`;
const PurchaseButton = styled(BaseButton)`
  min-height: 44px;
  padding: 10px 16px;
  background: transparent;
  color: var(--color-text);
  font-size: var(--ui-caption-size);
  text-decoration: underline;
  text-underline-offset: 4px;
`;
const Notice = styled.div`
  ${captionStyles}
`;
