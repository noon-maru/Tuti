"use client";

import styled from "@emotion/styled";
import { MapPin, ShieldCheck } from "lucide-react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";

export function PhotoLocationConsentDialog({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Backdrop>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-location-consent-title"
        aria-describedby="photo-location-consent-description"
      >
        <Icon aria-hidden="true">
          <MapPin />
        </Icon>
        <Copy>
          <h2 id="photo-location-consent-title">
            사진을 찍은 곳도 살펴볼까요?
          </h2>
          <p id="photo-location-consent-description">
            이 사진에 저장된 촬영 위치를 읽어 가까운 장소를 찾아요.
          </p>
        </Copy>
        <PrivacyNote>
          <ShieldCheck aria-hidden="true" />
          <span>촬영 위치는 장소를 찾은 뒤 저장하지 않아요.</span>
        </PrivacyNote>
        <Actions>
          <AcceptButton type="button" autoFocus onClick={onAccept}>
            촬영 위치 사용하기
          </AcceptButton>
          <DeclineButton type="button" onClick={onDecline}>
            위치 없이 계속하기
          </DeclineButton>
        </Actions>
      </Dialog>
    </Backdrop>
  );
}

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: color-mix(in srgb, var(--color-black) 34%, transparent);
  backdrop-filter: blur(4px);
`;

const Dialog = styled.div`
  width: min(100%, 336px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-7) var(--space-6) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--space-7);
  background: var(--color-surface);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--color-black) 18%, transparent);
  text-align: center;
`;

const Icon = styled.div`
  width: var(--space-13);
  height: var(--space-13);
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-secondary-900);

  svg {
    width: var(--space-6);
    height: var(--space-6);
    stroke-width: 1.8;
  }
`;

const Copy = styled.div`
  display: grid;
  gap: var(--space-2);

  h2 {
    font-size: var(--font-size-500);
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.005em;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-300);
    line-height: 1.5;
    letter-spacing: -0.015em;
  }
`;

const PrivacyNote = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--space-4);
  background: var(--color-accent-soft);
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: 1.4;

  svg {
    width: var(--space-4);
    height: var(--space-4);
    flex: 0 0 auto;
    color: var(--color-secondary-900);
  }
`;

const Actions = styled.div`
  width: 100%;
  display: grid;
  gap: var(--space-2);
`;

const AcceptButton = styled(PrimaryButton)`
  width: 100%;
  background: var(--color-accent-secondary);
  color: var(--color-black);
`;

const DeclineButton = styled(BaseButton)`
  min-height: var(--space-11);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;
