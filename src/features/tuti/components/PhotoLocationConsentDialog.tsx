"use client";

import styled from "@emotion/styled";
import { MapPin, ShieldCheck } from "lucide-react";
import { useId, useRef } from "react";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { bodyCopyStyles, captionStyles } from "@/shared/ui/typography";
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
  const id = useId(), decline = useRef<HTMLButtonElement>(null);
  return (
      <AppDialogFrame role="dialog" titleId={`${id}-title`} descriptionId={`${id}-description`} initialFocus={decline} onCancel={onDecline}>
        <Icon aria-hidden="true">
          <MapPin />
        </Icon>
        <Copy>
          <h2 id={`${id}-title`}>
            사진을 찍은 곳도 살펴볼까요?
          </h2>
          <p id={`${id}-description`}>
            이 사진에 저장된 촬영 위치를 읽어 가까운 장소를 찾아요.
          </p>
        </Copy>
        <PrivacyNote>
          <ShieldCheck aria-hidden="true" />
          <span>촬영 위치는 장소를 찾은 뒤 저장하지 않아요.</span>
        </PrivacyNote>
        <Actions>
          <AcceptButton type="button" onClick={onAccept}>
            촬영 위치 사용하기
          </AcceptButton>
          <DeclineButton ref={decline} type="button" onClick={onDecline}>
            위치 없이 계속하기
          </DeclineButton>
        </Actions>
      </AppDialogFrame>
  );
}

const Icon = styled.div`
  justify-self: center;
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

  p {
    ${bodyCopyStyles}
    color: var(--color-text-muted);
  }
`;

const PrivacyNote = styled.div`
  ${captionStyles}
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
