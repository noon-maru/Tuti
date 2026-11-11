"use client";

import styled from "@emotion/styled";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BaseButton, PrimaryButton, TextButton } from "@/features/tuti/components/buttons";
import { recordProductInteraction } from "@/lib/productInteraction";
import type { ProductInteractionSurface } from "@/shared/api/productInteraction";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { captionStyles } from "@/shared/ui/typography";
import { trackLifecycle } from "@/lib/lifecycle";
import { useSession } from "../hooks/useSession";

export function HarumadiPurchaseButton({ surface, bookTitle, preview }: { surface: ProductInteractionSurface; bookTitle?: string; preview?: ReactNode }) {
  const id = useId();
  const owner = useSession()?.userId;
  const observed = useRef("");
  const [open, setOpen] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const latestEvent = useRef<string | null>(null);
  const observe = () => {
    if (surface === "welcome" || !owner || observed.current === owner) return;
    observed.current = owner;
    trackLifecycle("purchase_viewed", { source: "book" });
  };
  useEffect(() => {
    const control = trigger.current;
    if (!control || !owner || surface === "welcome" || typeof IntersectionObserver === "undefined") return;
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
        if (surface !== "welcome") trackLifecycle("purchase_clicked", { source: "book" });
        setOpen(true);
        setTrackingFailed(false);
        const eventId = crypto.randomUUID();
        latestEvent.current = eventId;
        track(eventId);
      }}>{surface === "harumadi_reader" ? "실물로 소장하기" : "실물 하루마디 구매하기"}</PurchaseButton>
      <small>실물 제작은 준비 중이에요.</small>
    </PurchaseAction>
    {open && <AppDialogFrame role="dialog" titleId={`${id}-title`} descriptionId={`${id}-description`} initialFocus={close} onCancel={() => setOpen(false)}>
          <h2 id={`${id}-title`}>실물 하루마디를 준비하고 있어요</h2>
          {preview && <BookPreview><div>{preview}</div><figcaption>{bookTitle}</figcaption></BookPreview>}
          <p id={`${id}-description`}>남긴 하루를 손에 쥘 수 있도록 준비하고 있어요. 아직 주문하거나 결제할 수는 없어요.</p>
          <p>{preview ? "위 표지는 디지털 예시예요. 실제 제작 사양과 가격·배송은 확정되면 안내할게요." : "그동안 마디와 디지털 하루마디는 무료로 만들어보세요."}</p>
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
const BookPreview = styled.figure`margin: 0; display: grid; justify-items: center; gap: 10px; > div { width: 100px; container-type: inline-size; } figcaption { ${captionStyles} max-width: 100%; overflow-wrap: anywhere; text-align: center; }`;
