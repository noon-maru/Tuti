"use client";

import styled from "@emotion/styled";
import { useState } from "react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { ShareDialogFrame } from "@/features/tuti/components/ShareDialogFrame";
import { getPlaceDisplayPhrase } from "@/features/tuti/lib/placeDisplayCopy";
import { getPublicPlaceUrl } from "@/features/tuti/lib/placeShare";
import type { TutiPlace } from "@/lib/recommendations";
import { shareContent } from "@/lib/shareContent";

export function PlaceShareDialog({
  onClose,
  place,
}: {
  onClose: () => void;
  place: TutiPlace;
}) {
  const [message, setMessage] = useState(
    "링크를 받은 사람이 이 공간을 Tuti에서 볼 수 있어요.",
  );
  const [sharing, setSharing] = useState(false);
  const url = getPublicPlaceUrl(place.id);
  const phrase = getPlaceDisplayPhrase(place);

  const sharePlace = async () => {
    if (sharing) return;

    setSharing(true);
    try {
      const result = await shareContent({
        title: place.name,
        text: phrase,
        url,
      });
      setMessage(
        result === "copied"
          ? "공유를 지원하지 않아 링크를 복사했어요."
          : result === "cancelled"
            ? "공유를 취소했어요."
            : "공유 화면을 열었어요.",
      );
    } catch {
      setMessage("공유 화면을 열지 못했어요. 다시 시도해주세요.");
    } finally {
      setSharing(false);
    }
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.append(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setMessage("장소 링크를 복사했어요.");
    } catch {
      setMessage("장소 링크를 복사하지 못했어요. 다시 시도해주세요.");
    }
  };

  return (
    <ShareDialogFrame title="장소 공유하기" onClose={onClose}>
      <PlacePreview $image={place.image}>
        <PreviewShade />
        <PreviewCopy>
          <h3>{place.name}</h3>
          <p>{phrase}</p>
        </PreviewCopy>
        <BrandLogo src="/brand/tuti-symbol.svg" alt="Tuti" />
      </PlacePreview>
      <ShareStatus role="status">{message}</ShareStatus>
      <Actions>
        <ShareButton
          type="button"
          disabled={sharing}
          onClick={() => void sharePlace()}
        >
          {sharing ? "공유하는 중" : "링크 공유하기"}
        </ShareButton>
        <CopyButton type="button" onClick={() => void copyLink()}>
          링크 복사
        </CopyButton>
      </Actions>
    </ShareDialogFrame>
  );
}

const PlacePreview = styled.div<{ $image: string }>`
  position: relative;
  width: min(100%, 320px);
  min-height: 300px;
  align-self: center;
  overflow: hidden;
  border-radius: 24px;
  background-color: var(--color-brand-300);
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  box-shadow: 0 12px 32px rgb(var(--color-black-rgb) / 0.16);
`;

const PreviewShade = styled.span`
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgb(var(--color-black-rgb) / 0.02) 24%,
    rgb(var(--color-black-rgb) / 0.72) 100%
  );
`;

const PreviewCopy = styled.div`
  position: absolute;
  right: var(--space-5);
  bottom: var(--space-5);
  left: var(--space-5);
  display: grid;
  gap: var(--space-2);
  padding-right: var(--space-11);
  color: var(--color-white);

  h3 {
    font-size: var(--font-size-500);
    line-height: var(--line-height-heading);
  }

  p {
    font-size: var(--font-size-200);
    line-height: var(--line-height-body);
  }
`;

const BrandLogo = styled.img`
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  width: var(--space-9);
  height: var(--space-9);
  display: block;
`;

const ShareStatus = styled.p`
  min-height: 21px;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  text-align: center;
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
`;

const ShareButton = styled(PrimaryButton)`
  min-height: var(--space-12);
  background: var(--color-brand-700);
`;

const CopyButton = styled(BaseButton)`
  min-height: var(--space-12);
  padding-inline: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 600;
`;
