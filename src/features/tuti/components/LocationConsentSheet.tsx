"use client";

import styled from "@emotion/styled";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BaseButton,
  PrimaryButton,
  TextButton,
} from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { locationTerms } from "@/shared/location/terms";

const TRANSITION_DURATION = 380;
const DISMISS_THRESHOLD = 72;

export function LocationConsentSheet({
  requesting,
  onAgree,
  onDecline,
}: {
  requesting: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const [view, setView] = useState<"summary" | "terms">("summary");
  const [ageAndTermsAccepted, setAgeAndTermsAccepted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const closingRef = useRef(false);

  const closeWithoutLocation = useCallback(() => {
    if (requesting || closingRef.current) return;

    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(
      onDecline,
      TRANSITION_DURATION,
    );
  }, [onDecline, requesting]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || requesting) return;

      if (view === "terms") {
        setView("summary");
        return;
      }

      closeWithoutLocation();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeWithoutLocation, requesting, view]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (requesting || closing || !event.isPrimary || event.button !== 0) {
      return;
    }

    dragStartY.current = event.clientY;
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }

    const distance = event.clientY - dragStartY.current;
    setDragY(distance >= 0 ? distance : distance * 0.14);
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }

    const finalDragY = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;
    activePointerId.current = null;
    setDragging(false);

    if (finalDragY >= DISMISS_THRESHOLD) {
      closeWithoutLocation();
      return;
    }

    setDragY(0);
  };

  return (
    <Overlay
      $visible={animationReady && !closing}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeWithoutLocation();
      }}
    >
      <Sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-consent-title"
        $visible={animationReady}
        $closing={closing}
        $dragging={dragging}
        $dragY={dragY}
      >
        <DragHandle
          type="button"
          aria-label="위치 안내 바텀시트 움직이기"
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <i aria-hidden="true" />
        </DragHandle>

        {view === "summary" ? (
          <SummaryContent>
            <LocationMark aria-hidden="true">
              <MapPin />
            </LocationMark>
            <Heading>
              <h2 id="location-consent-title">
                지금 있는 곳 가까이에서 골라볼까요?
              </h2>
              <p>
                현재 위치로 가까운 장소와 예상 이동 시간을 계산해요.
              </p>
            </Heading>

            <Facts>
              <li>
                <LocateFixed aria-hidden="true" />
                <span>
                  <strong>필요한 순간에만</strong>
                  앱을 사용하는 동안 현재 위치를 이용해요.
                </span>
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                <span>
                  <strong>기록에는 남기지 않아요</strong>
                  계정이나 지난 공간에 좌표를 저장하지 않아요.
                </span>
              </li>
            </Facts>

            <TermsLink type="button" onClick={() => setView("terms")}>
              개인위치정보 이용약관 보기
              <ChevronRight aria-hidden="true" />
            </TermsLink>

            <AgreementToggle
              type="button"
              aria-pressed={ageAndTermsAccepted}
              $checked={ageAndTermsAccepted}
              onClick={() =>
                setAgeAndTermsAccepted((accepted) => !accepted)
              }
            >
              <AgreementCheck aria-hidden="true">
                {ageAndTermsAccepted && <Check />}
              </AgreementCheck>
              <span>
                만 14세 이상이며 위치기반서비스 이용약관에 동의해요.
              </span>
            </AgreementToggle>

            <Actions>
              <AgreeButton
                type="button"
                disabled={!ageAndTermsAccepted || requesting}
                onClick={onAgree}
              >
                {requesting
                  ? "현재 위치를 확인하고 있어요"
                  : "현재 위치로 추천받기"}
              </AgreeButton>
              <DeclineButton
                type="button"
                disabled={requesting}
                onClick={closeWithoutLocation}
              >
                위치 없이 둘러보기
              </DeclineButton>
            </Actions>
          </SummaryContent>
        ) : (
          <TermsContent>
            <TermsHeader>
              <BackButton
                type="button"
                aria-label="위치 이용 안내로 돌아가기"
                onClick={() => setView("summary")}
              >
                <ChevronLeft aria-hidden="true" />
              </BackButton>
              <div>
                <h2 id="location-consent-title">
                  개인위치정보 이용약관
                </h2>
                <p>시행 전 검토를 위한 임시 약관이에요.</p>
              </div>
            </TermsHeader>
            <TermsScroll data-scroll-region>
              <ProviderInfo>
                <strong>{locationTerms.provider.name}</strong>
                <span>{locationTerms.provider.contact}</span>
                <span>{locationTerms.provider.address}</span>
              </ProviderInfo>
              {locationTerms.sections.map((section) => (
                <TermsSection key={section.title}>
                  <h3>{section.title}</h3>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </TermsSection>
              ))}
              <DraftNotice>
                이 문안은 위치기반서비스사업 신고와 법률 검토 전에 사용하는
                임시 약관입니다. 사업자 정보, 외부 사업자와의 처리 관계 및
                확인자료 보관기간은 출시 전에 확정해야 합니다.
              </DraftNotice>
            </TermsScroll>
          </TermsContent>
        )}
      </Sheet>
    </Overlay>
  );
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  z-index: 70;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(var(--color-black-rgb) / 0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity ${TRANSITION_DURATION}ms ease;
`;

const Sheet = styled.section<{
  $visible: boolean;
  $closing: boolean;
  $dragging: boolean;
  $dragY: number;
}>`
  width: 100%;
  max-height: calc(100% - var(--app-safe-area-top, 0px) - var(--space-5));
  overflow: hidden;
  border-radius: 30px 30px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -18px 56px rgb(var(--color-black-rgb) / 0.2);
  transform: translateY(
    ${({ $visible, $closing, $dragY }) =>
      !$visible || $closing ? "calc(100% + 32px)" : `${$dragY}px`}
  );
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : `transform ${TRANSITION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};

  @supports (corner-shape: squircle) {
    border-radius: 42px 42px 0 0;
    corner-shape: squircle;
  }
`;

const DragHandle = styled(BaseButton)`
  width: 80px;
  height: 30px;
  display: grid;
  place-items: center;
  margin-inline: auto;
  background: transparent;
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }

  i {
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: var(--color-neutral-500);
  }
`;

const SummaryContent = styled.div`
  display: grid;
  gap: var(--space-5);
  padding: var(--space-1) var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
`;

const LocationMark = styled.div`
  width: var(--space-12);
  height: var(--space-12);
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--color-secondary-200);
  color: var(--color-secondary-900);

  svg {
    width: 24px;
    height: 24px;
  }
`;

const Heading = styled.div`
  display: grid;
  gap: var(--space-2);

  h2 {
    max-width: 320px;
    font-size: var(--font-size-500);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const Facts = styled.ul`
  display: grid;
  gap: var(--space-2);

  li {
    min-height: 62px;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: 16px;
    background: var(--color-neutral-200);
  }

  svg {
    width: 21px;
    height: 21px;
    flex: none;
    color: var(--color-brand-700);
  }

  span {
    display: grid;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    color: var(--color-text);
    font-size: var(--font-size-200);
  }
`;

const TermsLink = styled(BaseButton)`
  width: fit-content;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  background: transparent;
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 600;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const AgreementToggle = styled(BaseButton)<{ $checked: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid
    ${({ $checked }) =>
      $checked ? "var(--color-secondary-700)" : "var(--color-border)"};
  border-radius: 14px;
  background: ${({ $checked }) =>
    $checked ? "var(--color-secondary-100)" : "var(--color-surface)"};
  text-align: left;

  > span:last-of-type {
    padding-top: 1px;
    font-size: var(--font-size-100);
  }
`;

const AgreementCheck = styled.span`
  width: 21px;
  height: 21px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-secondary-800);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-secondary-900);

  svg {
    width: 15px;
    height: 15px;
    stroke-width: 3;
  }
`;

const Actions = styled.div`
  display: grid;
  gap: var(--space-1);
`;

const AgreeButton = styled(PrimaryButton)`
  width: 100%;
  background: var(--color-brand-700);

  &:not(:disabled):hover {
    background: var(--color-brand-800);
  }
`;

const DeclineButton = styled(TextButton)`
  font-size: var(--font-size-100);
`;

const TermsContent = styled.div`
  min-height: 0;
  max-height: calc(
    100cqh - var(--app-safe-area-top, 0px) - var(--space-8)
  );
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-1) var(--space-5)
    calc(var(--space-5) + var(--app-safe-area-bottom, 0px));
`;

const TermsHeader = styled.header`
  display: flex;
  align-items: center;
  gap: var(--space-3);

  h2 {
    font-size: var(--font-size-400);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const BackButton = styled(BaseButton)`
  width: var(--space-11);
  height: var(--space-11);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-neutral-200);

  svg {
    width: 25px;
    height: 25px;
  }
`;

const TermsScroll = styled.div`
  min-height: 0;
  display: grid;
  gap: var(--space-5);
  padding-right: var(--space-1);
  overflow-y: auto;
  overscroll-behavior: contain;
`;

const ProviderInfo = styled.div`
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--color-brand-100);
  font-size: var(--font-size-100);

  span {
    color: var(--color-text-muted);
  }
`;

const TermsSection = styled.section`
  display: grid;
  gap: var(--space-2);

  h3 {
    font-size: var(--font-size-200);
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const DraftNotice = styled.p`
  padding: var(--space-4);
  border-radius: 14px;
  background: var(--color-secondary-100);
  color: var(--color-secondary-1000);
  font-size: var(--font-size-100);
`;
