"use client";

import styled from "@emotion/styled";
import { ChevronLeft, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BaseButton,
  PrimaryButton,
  TextButton,
} from "@/features/tuti/components/buttons";
import { intakeSteps } from "@/features/tuti/data/intakeSteps";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import type { IntakeAnswers } from "@/shared/tuti/types";

type CheckInMode = "summary" | "questions";
const SHEET_TRANSITION_DURATION = 360;
const SHEET_DISMISS_THRESHOLD = 72;

export function DailyCheckInScreen({
  previousAnswers,
  initialMode = "summary",
  dismissible,
  onReuse,
  onSkip,
  onSnooze,
  onSubmit,
  onDismiss,
}: {
  previousAnswers: IntakeAnswers;
  initialMode?: CheckInMode;
  dismissible: boolean;
  onReuse: () => void;
  onSkip: () => void;
  onSnooze: () => void;
  onSubmit: (answers: IntakeAnswers) => void;
  onDismiss: () => void;
}) {
  const [mode, setMode] = useState<CheckInMode>(initialMode);
  const [step, setStep] = useState(0);
  const [draftAnswers, setDraftAnswers] =
    useState<IntakeAnswers>(previousAnswers);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const animationReady = useDeferredAnimationStart();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const finishTimer = useRef<number | null>(null);
  const closingRef = useRef(false);
  const activeStep = intakeSteps[step];
  const selectedValue = draftAnswers[activeStep.key];
  const previousLabels = useMemo(
    () =>
      intakeSteps.flatMap((intakeStep) => {
        const value = previousAnswers[intakeStep.key];
        const option = intakeStep.options.find(
          (candidate) => candidate.value === value,
        );
        return option ? [option.label] : [];
      }),
    [previousAnswers],
  );
  const canReuse = previousLabels.length === intakeSteps.length;

  const closeWith = useCallback((complete: () => void) => {
    if (closingRef.current) return;

    closingRef.current = true;
    setDragging(false);
    setClosing(true);
    finishTimer.current = window.setTimeout(
      complete,
      SHEET_TRANSITION_DURATION,
    );
  }, []);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [mode, step]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const updateHeight = () => {
      setContentHeight(Math.ceil(content.getBoundingClientRect().height));
    };
    const observer = new ResizeObserver(updateHeight);

    updateHeight();
    observer.observe(content);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (mode === "questions") {
        setMode("summary");
        setStep(0);
        return;
      }

      if (dismissible) closeWith(onDismiss);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeWith, dismissible, mode, onDismiss]);

  useEffect(
    () => () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
    },
    [],
  );

  const chooseAnswer = (value: string) => {
    setDraftAnswers(
      (current) =>
        ({
          ...current,
          [activeStep.key]: value,
        }) as IntakeAnswers,
    );
  };

  const goBack = () => {
    if (step > 0) {
      setStep((current) => current - 1);
      return;
    }

    setMode("summary");
  };

  const goNext = () => {
    if (!selectedValue) return;

    if (step < intakeSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    closeWith(() => onSubmit(draftAnswers));
  };

  const startSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (closing || !event.isPrimary || event.button !== 0) return;

    dragStartY.current = event.clientY;
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const updateSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }

    const distance = event.clientY - dragStartY.current;
    setDragY(distance >= 0 ? distance : distance * 0.16);
  };

  const finishSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }

    const finalDragY = Math.max(0, event.clientY - dragStartY.current);
    const shouldDismiss =
      dismissible && finalDragY >= SHEET_DISMISS_THRESHOLD;
    dragStartY.current = null;
    activePointerId.current = null;
    setDragging(false);

    if (shouldDismiss) {
      closeWith(onDismiss);
      return;
    }

    setDragY(0);
  };

  return (
    <Overlay
      role="presentation"
      $visible={animationReady && !closing}
      onPointerDown={(event) => {
        if (dismissible && event.target === event.currentTarget) {
          closeWith(onDismiss);
        }
      }}
    >
      <Sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-check-in-title"
        $visible={animationReady}
        $closing={closing}
        $dragging={dragging}
        $dragY={dragY}
        $contentHeight={contentHeight}
      >
        <SheetContent ref={contentRef}>
          <DragHandle
            type="button"
            aria-label="오늘 상태 바텀시트 움직이기"
            onPointerDown={startSheetDrag}
            onPointerMove={updateSheetDrag}
            onPointerUp={finishSheetDrag}
            onPointerCancel={finishSheetDrag}
          >
            <i aria-hidden="true" />
          </DragHandle>
          {mode === "summary" ? (
            <>
              <SheetHeader>
                <div>
                  <Eyebrow>오늘의 상태</Eyebrow>
                  <h2
                    id="daily-check-in-title"
                    ref={headingRef}
                    tabIndex={-1}
                  >
                    오늘도 이 정도가 괜찮을까요?
                  </h2>
                </div>
                {dismissible && (
                  <IconButton
                    type="button"
                    aria-label="오늘 상태 확인 닫기"
                    onClick={() => closeWith(onDismiss)}
                  >
                    <X aria-hidden="true" />
                  </IconButton>
                )}
              </SheetHeader>
              <SummaryCopy>
                이전 선택을 그대로 쓰거나, 지금의 상태만 가볍게 바꿀 수
                있어요.
              </SummaryCopy>
              {previousLabels.length > 0 && (
                <AnswerSummary aria-label="이전 상태 답변">
                  {previousLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </AnswerSummary>
              )}
              <Actions>
                {canReuse && (
                  <ConfirmButton
                    type="button"
                    onClick={() => closeWith(onReuse)}
                  >
                    이대로 볼게요
                  </ConfirmButton>
                )}
                <ReviseButton
                  type="button"
                  onClick={() => {
                    setDraftAnswers(previousAnswers);
                    setStep(0);
                    setMode("questions");
                  }}
                >
                  오늘 상태 다시 고르기
                </ReviseButton>
                <SkipAction type="button" onClick={() => closeWith(onSkip)}>
                  질문 없이 둘러보기
                </SkipAction>
                <SnoozeAction
                  type="button"
                  onClick={() => closeWith(onSnooze)}
                >
                  일주일간 보지 않기
                </SnoozeAction>
              </Actions>
            </>
          ) : (
            <>
              <QuestionHeader>
                <IconButton
                  type="button"
                  aria-label={
                    step === 0 ? "상태 요약으로 돌아가기" : "이전 질문"
                  }
                  onClick={goBack}
                >
                  <ChevronLeft aria-hidden="true" />
                </IconButton>
                <StepCount>{step + 1} / {intakeSteps.length}</StepCount>
              </QuestionHeader>
              <QuestionCopy>
                <h2 id="daily-check-in-title" ref={headingRef} tabIndex={-1}>
                  {activeStep.question}
                </h2>
                <p>{activeStep.subtitle}</p>
              </QuestionCopy>
              <Options>
                {activeStep.options.map((option) => (
                  <Option
                    key={option.value}
                    type="button"
                    $active={selectedValue === option.value}
                    aria-pressed={selectedValue === option.value}
                    onClick={() => chooseAnswer(option.value)}
                  >
                    <span>{option.label}</span>
                    <small>{option.hint}</small>
                  </Option>
                ))}
              </Options>
              <QuestionAction
                type="button"
                disabled={!selectedValue}
                onClick={goNext}
              >
                {step === intakeSteps.length - 1
                  ? "오늘 상태로 보기"
                  : "다음"}
              </QuestionAction>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Overlay>
  );
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(var(--color-black-rgb) / 0.24);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity ${SHEET_TRANSITION_DURATION}ms ease;
`;

const Sheet = styled.section<{
  $visible: boolean;
  $closing: boolean;
  $dragging: boolean;
  $dragY: number;
  $contentHeight: number | null;
}>`
  width: 100%;
  height: ${({ $contentHeight }) =>
    $contentHeight === null
      ? "auto"
      : `min(${$contentHeight}px, calc(100% - var(--app-safe-area-top, 0px) - var(--space-5)))`};
  max-height: calc(100% - var(--app-safe-area-top, 0px) - var(--space-5));
  overflow-y: auto;
  overscroll-behavior-y: contain;
  border-radius: 30px 30px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -16px 52px rgb(var(--color-black-rgb) / 0.18);
  opacity: ${({ $visible }) => ($visible ? 1 : 0.98)};
  transform: translateY(
    ${({ $visible, $closing, $dragY }) =>
      !$visible || $closing ? "calc(100% + 32px)" : `${$dragY}px`}
  );
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : `height ${SHEET_TRANSITION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${SHEET_TRANSITION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease`};

  @supports (corner-shape: squircle) {
    border-radius: 42px 42px 0 0;
    corner-shape: squircle;
  }
`;

const SheetContent = styled.div`
  display: grid;
  gap: var(--space-5);
  padding: 0 var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
`;

const DragHandle = styled(BaseButton)`
  position: sticky;
  z-index: 1;
  top: 0;
  width: 80px;
  height: 28px;
  display: grid;
  place-items: center;
  justify-self: center;
  margin-bottom: calc(var(--space-2) * -1);
  background: var(--color-surface);
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

const SheetHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-500);
  }
`;

const Eyebrow = styled.p`
  color: var(--color-brand-800);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const IconButton = styled(BaseButton)`
  width: var(--space-11);
  height: var(--space-11);
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);

  svg {
    width: 24px;
    height: 24px;
  }
`;

const SummaryCopy = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

const AnswerSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  span {
    padding: var(--space-2) var(--space-3);
    border-radius: 999px;
    background: var(--color-secondary-200);
    font-size: var(--font-size-100);
    font-weight: 600;
  }
`;

const Actions = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const ConfirmButton = styled(PrimaryButton)`
  width: 100%;
  background: var(--color-brand-700);

  &:hover {
    background: var(--color-brand-800);
  }
`;

const ReviseButton = styled(BaseButton)`
  min-height: var(--space-14);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  font-weight: 700;
`;

const SkipAction = styled(TextButton)`
  font-size: var(--font-size-100);
`;

const SnoozeAction = styled(TextButton)`
  margin-top: calc(var(--space-2) * -1);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const QuestionHeader = styled.header`
  min-height: var(--space-11);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const StepCount = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const QuestionCopy = styled.div`
  display: grid;
  gap: var(--space-2);

  h2 {
    max-width: 310px;
    font-size: var(--font-size-500);
    white-space: pre-line;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const Options = styled.div`
  display: grid;
  gap: var(--space-2);
`;

const Option = styled(BaseButton)<{ $active: boolean }>`
  min-height: 60px;
  display: grid;
  justify-items: start;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--color-secondary-600)" : "transparent"};
  border-radius: 14px;
  background: ${({ $active }) =>
    $active ? "var(--color-secondary-500)" : "var(--color-secondary-200)"};
  text-align: left;

  span {
    font-size: var(--font-size-300);
    font-weight: 700;
  }

  small {
    color: var(--color-text-muted);
  }
`;

const QuestionAction = styled(PrimaryButton)`
  width: 100%;
  background: var(--color-brand-700);

  &:not(:disabled):hover {
    background: var(--color-brand-800);
  }
`;
