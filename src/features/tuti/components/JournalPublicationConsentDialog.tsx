"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import { Globe2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { useLegalPolicyRelease } from "@/features/legal/useLegalPolicyRelease";
import { getJournalPublicationPolicyVersion } from "@/shared/legal/journalPublicationPolicy";

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
  useLegalPolicyRelease();
  const policyVersion = getJournalPublicationPolicyVersion();
  const [agreedVersion, setAgreedVersion] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const agreementRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (submittingRef.current || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(
      () => onCloseRef.current(),
      180,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const confirmPublication = async () => {
    if (!agreed || submitting || agreedVersion !== policyVersion) return;

    setSubmitting(true);
    submittingRef.current = true;
    setError(null);

    try {
      await onConfirm();
      setSubmitting(false);
      submittingRef.current = false;
      requestClose();
    } catch (publicationError) {
      setError(
        publicationError instanceof Error
          ? publicationError.message
          : "마디를 공개하지 못했어요.",
      );
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  return (
      <AppDialogFrame role="dialog" titleId={`${agreementId}-title`} descriptionId={`${agreementId}-description`}
        presentation="sheet" closing={closing} busy={submitting} dismissEnabled={!closing} initialFocus={agreementRef} onCancel={requestClose}>
        <Heading>
          <Icon aria-hidden="true">
            <Globe2 />
          </Icon>
          <div>
            <h2 id={`${agreementId}-title`}>이 마디를 링크로 나눌까요?</h2>
          </div>
        </Heading>

        <ScopeCard id={`${agreementId}-description`}>
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
          사람의 개인정보가 없는지 한 번 확인해주세요. 건강·정치적 견해 같은
          민감한 정보와 주민등록번호 등 고유식별정보도 공개되지 않도록 살펴주세요.
        </Notice>

        <Agreement htmlFor={agreementId}>
          <input
            id={agreementId}
            ref={agreementRef}
            type="checkbox"
            checked={agreed && agreedVersion === policyVersion}
            disabled={submitting}
            onChange={(event) => { setAgreed(event.target.checked); setAgreedVersion(event.target.checked ? policyVersion : null); }}
          />
          <span>
            공개 범위와{" "}
            <Link href="/legal/community-guidelines">기록 공개 운영정책</Link>을
            확인했고 동의해요.
          </span>
        </Agreement>

        {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

        <Actions>
          <PublishButton
            type="button"
            disabled={!agreed || agreedVersion !== policyVersion || submitting}
            onClick={() => void confirmPublication()}
          >
            {submitting ? "공개하는 중" : "인터넷에 공개하기"}
          </PublishButton>
          <CancelButton
            type="button"
            disabled={submitting}
            onClick={requestClose}
          >
            나만 볼게요
          </CancelButton>
        </Actions>
      </AppDialogFrame>
  );
}

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
  min-height: var(--space-14);
  padding: var(--space-3) var(--space-6);
  background: var(--color-secondary-500);
  color: var(--color-neutral-1300);
  font-size: var(--font-size-200);
  line-height: var(--line-height-subtitle);
`;

const CancelButton = styled(BaseButton)`
  min-height: var(--space-10);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;
