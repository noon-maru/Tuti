"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import { Globe2, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";

export function JournalPublicationConsentDialog({
  placeName,
  onClose,
  onConfirm,
}: {
  placeName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const agreementId = useId();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, submitting]);

  const confirmPublication = async () => {
    if (!agreed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm();
      onClose();
    } catch (publicationError) {
      setError(
        publicationError instanceof Error
          ? publicationError.message
          : "기록을 공개하지 못했어요.",
      );
      setSubmitting(false);
    }
  };

  return createPortal(
    <Backdrop
      onPointerDown={() => {
        if (!submitting) onClose();
      }}
    >
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-publication-title"
        aria-describedby="journal-publication-description"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Handle aria-hidden="true" />
        <Heading>
          <Icon aria-hidden="true">
            <Globe2 />
          </Icon>
          <div>
            <Eyebrow>기록 인터넷 공개</Eyebrow>
            <h2 id="journal-publication-title">이 기록을 링크로 나눌까요?</h2>
          </div>
        </Heading>

        <ScopeCard id="journal-publication-description">
          <ScopePlace>{placeName}</ScopePlace>
          <strong>링크를 받은 사람이 Tuti에서 볼 수 있어요.</strong>
          <p>장소·방문일·제목·본문·사진과 태그가 공개됩니다.</p>
          <PrivateLine>
            <ShieldCheck aria-hidden="true" />
            이름·이메일·사진의 원본 위치는 공개하지 않아요.
          </PrivateLine>
        </ScopeCard>

        <Notice>
          링크는 다시 전달되거나 화면이 저장될 수 있어요. 연락처나 다른
          사람의 개인정보가 없는지 한 번 확인해주세요.
        </Notice>

        <Agreement htmlFor={agreementId}>
          <input
            id={agreementId}
            type="checkbox"
            checked={agreed}
            disabled={submitting}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            공개 범위와{" "}
            <Link href="/legal/community-guidelines">기록 공개 운영정책</Link>을
            확인했어요.
          </span>
        </Agreement>

        {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

        <Actions>
          <PublishButton
            type="button"
            disabled={!agreed || submitting}
            onClick={() => void confirmPublication()}
          >
            {submitting ? "안전 확인 중" : "인터넷에 공개하기"}
          </PublishButton>
          <CancelButton type="button" disabled={submitting} onClick={onClose}>
            나만 볼게요
          </CancelButton>
        </Actions>
      </Dialog>
    </Backdrop>,
    document.body,
  );
}

const Backdrop = styled.div`
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--app-safe-area-top, 0px) var(--app-safe-area-right, 0px)
    var(--app-safe-area-bottom, 0px) var(--app-safe-area-left, 0px);
  background: rgb(var(--color-black-rgb) / 0.38);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
`;

const Dialog = styled.section`
  width: min(100%, 430px);
  max-height: calc(100dvh - var(--app-safe-area-top, 0px) - var(--space-5));
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-6) var(--space-6);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-bottom: 0;
  border-radius: 28px 28px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -18px 52px rgb(var(--color-black-rgb) / 0.18);
  overscroll-behavior: contain;
  animation: publication-sheet-enter 280ms cubic-bezier(0.22, 1, 0.36, 1);

  @keyframes publication-sheet-enter {
    from {
      transform: translateY(36px);
      opacity: 0;
    }
  }

  @media (min-width: 600px) {
    align-self: center;
    padding: var(--space-6);
    border-bottom: 1px solid var(--color-border);
    border-radius: 28px;
    box-shadow: 0 24px 72px rgb(var(--color-black-rgb) / 0.22);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Handle = styled.span`
  width: 38px;
  height: 4px;
  align-self: center;
  border-radius: 999px;
  background: var(--color-neutral-500);

  @media (min-width: 600px) {
    display: none;
  }
`;

const Heading = styled.header`
  display: flex;
  align-items: center;
  gap: var(--space-3);

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-500);
    line-height: var(--line-height-heading);
  }
`;

const Icon = styled.span`
  width: var(--space-12);
  height: var(--space-12);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-brand-200);
  color: var(--color-brand-900);

  svg {
    width: var(--space-5);
    height: var(--space-5);
    stroke-width: 1.8;
  }
`;

const Eyebrow = styled.span`
  color: var(--color-brand-700);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const ScopeCard = styled.div`
  display: grid;
  gap: var(--space-2);
  padding: var(--space-5);
  border: 1px solid var(--color-secondary-400);
  border-radius: 20px;
  background: var(--color-secondary-100);

  strong {
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;

const ScopePlace = styled.span`
  width: fit-content;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-secondary-500);
  color: var(--color-neutral-1200);
  font-size: var(--font-size-100);
  font-weight: 600;
`;

const PrivateLine = styled.span`
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-secondary-400);
  color: var(--color-secondary-1000);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);

  svg {
    width: var(--space-4);
    height: var(--space-4);
    flex: none;
    margin-top: 2px;
  }
`;

const Notice = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const Agreement = styled.label`
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-text);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  cursor: pointer;

  input {
    width: 20px;
    height: 20px;
    flex: none;
    margin-top: 1px;
    accent-color: var(--color-brand-700);
  }

  a {
    color: var(--color-brand-800);
    font-weight: 700;
    text-underline-offset: 3px;
  }
`;

const ErrorMessage = styled.p`
  padding: var(--space-3) var(--space-4);
  border-radius: 14px;
  background: var(--color-neutral-200);
  color: var(--color-error);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const Actions = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const PublishButton = styled(PrimaryButton)`
  width: 100%;
  min-height: var(--space-13);
  background: var(--color-secondary-500);
  color: var(--color-neutral-1300);
`;

const CancelButton = styled(BaseButton)`
  min-height: var(--space-10);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;
