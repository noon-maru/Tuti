"use client";

import styled from "@emotion/styled";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { BaseButton, PrimaryButton } from "@/features/tuti/components/buttons";
import {
  createJournalShareFilename,
  downloadJournalPng,
  isNativeSharePlatform,
  shareJournalPng,
} from "@/lib/journalShare";
import { embedJournalShareMetadata } from "@/lib/pngMetadata";
import {
  finalizeJournalShareTrace,
  issueJournalShareTrace,
} from "@/lib/tutiApi";
import type {
  JournalShareTraceIssue,
  TutiJournalEntry,
} from "@/shared/api/journal";
import { palette } from "@/styles/tokens";

const SHARE_WIDTH = 1080;
const SHARE_HEIGHT = 1350;

export function JournalShareDialog({
  entry,
  onClose,
  publicUrl,
}: {
  entry: TutiJournalEntry;
  onClose: () => void;
  publicUrl?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const traceRequestRef = useRef<{
    entryId: string;
    promise: Promise<JournalShareTraceIssue>;
  } | null>(null);
  const pngRequestRef = useRef<{
    traceId: string;
    promise: Promise<Blob>;
  } | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [png, setPng] = useState<Blob | null>(null);
  const [trace, setTrace] = useState<JournalShareTraceIssue | null>(
    null,
  );
  const [status, setStatus] = useState<
    "creating" | "ready" | "sharing" | "error"
  >("creating");
  const [message, setMessage] = useState(
    "공유 이미지 추적 번호를 준비하고 있어요.",
  );
  const nativePlatform = isNativeSharePlatform();

  useLayoutEffect(() => {
    const preview = previewRef.current;

    if (!preview) return;

    const updateScale = () => {
      setPreviewScale(preview.clientWidth / SHARE_WIDTH);
    };
    const observer = new ResizeObserver(updateScale);

    updateScale();
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const request =
      traceRequestRef.current?.entryId === entry.id
        ? traceRequestRef.current.promise
        : issueJournalShareTrace(entry.id);

    traceRequestRef.current = {
      entryId: entry.id,
      promise: request,
    };

    void request
      .then((issuedTrace) => {
        if (cancelled) return;

        setTrace(issuedTrace);
        setMessage("공유 이미지를 준비하고 있어요.");
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "공유 이미지 추적 번호를 만들지 못했어요.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  useEffect(() => {
    if (!trace) return;

    let cancelled = false;

    const createPng = async (): Promise<Blob> => {
      const card = cardRef.current;

      if (!card) {
        throw new Error("공유 이미지 화면을 준비하지 못했어요.");
      }

      await document.fonts.ready;
      await waitForImages(card);
      await waitForPaint();

      const { toBlob } = await import("html-to-image");
      const image = await toBlob(card, {
        backgroundColor: palette.neutral[200],
        cacheBust: true,
        height: SHARE_HEIGHT,
        includeQueryParams: true,
        pixelRatio: 1,
        preferredFontFormat: "woff2",
        width: SHARE_WIDTH,
      });

      if (!image) {
        throw new Error("공유 이미지를 생성하지 못했어요.");
      }

      const finalizedTrace = await finalizeJournalShareTrace(
        entry.id,
        trace.traceId,
        image,
      );
      return embedJournalShareMetadata({
        entry,
        png: image,
        publicUrl,
        trace: finalizedTrace,
      });
    };
    const request =
      pngRequestRef.current?.traceId === trace.traceId
        ? pngRequestRef.current.promise
        : createPng();

    pngRequestRef.current = {
      traceId: trace.traceId,
      promise: request,
    };

    void request
      .then((tracedImage) => {
        if (cancelled) return;
        setPng(tracedImage);
        setStatus("ready");
        setMessage("공유할 PNG 이미지가 준비됐어요.");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "공유 이미지를 생성하지 못했어요.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [entry, publicUrl, trace]);

  const shareImage = async () => {
    if (!png || status === "sharing") return;

    setStatus("sharing");
    setMessage("공유 화면을 열고 있어요.");

    try {
      const result = await shareJournalPng(png, entry, publicUrl);

      if (result === "downloaded") {
        setMessage("공유를 지원하지 않아 PNG로 저장했어요.");
      } else if (result === "cancelled") {
        setMessage("공유를 취소했어요.");
      } else {
        setMessage("공유 이미지가 전달됐어요.");
      }
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "공유 화면을 열지 못했어요.",
      );
    }
  };

  return createPortal(
    <Backdrop onPointerDown={onClose}>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-share-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <HeaderSpacer />
          <h2 id="journal-share-title">기록 공유하기</h2>
          <CloseButton
            type="button"
            aria-label="공유 화면 닫기"
            onClick={onClose}
          >
            ×
          </CloseButton>
        </DialogHeader>

        <Preview ref={previewRef}>
          <PreviewScale
            style={{ transform: `scale(${previewScale})` }}
          >
            <JournalShareCard
              cardRef={cardRef}
              entry={entry}
              traceCode={trace?.shortCode}
            />
          </PreviewScale>
        </Preview>

        <ShareStatus
          role={status === "error" ? "alert" : "status"}
          $error={status === "error"}
        >
          {message}
        </ShareStatus>

        <Actions $single={nativePlatform}>
          <ShareButton
            type="button"
            disabled={!png || status === "sharing"}
            onClick={() => void shareImage()}
          >
            {status === "sharing"
              ? "공유하는 중"
              : publicUrl
                ? "이미지와 링크 공유"
                : "PNG 공유하기"}
          </ShareButton>
          {!nativePlatform && (
            <DownloadButton
              type="button"
              disabled={!png}
              onClick={() => {
                if (!png) return;
                downloadJournalPng(
                  png,
                  createJournalShareFilename(entry),
                );
                setMessage("PNG 이미지를 저장했어요.");
              }}
            >
              PNG 저장하기
            </DownloadButton>
          )}
        </Actions>
      </Dialog>
    </Backdrop>,
    document.body,
  );
}

function JournalShareCard({
  cardRef,
  entry,
  traceCode,
}: {
  cardRef: Ref<HTMLDivElement>;
  entry: TutiJournalEntry;
  traceCode?: string;
}) {
  return (
    <ShareCard ref={cardRef}>
      <ShareSurface>
        <SharePhoto>
          {entry.image && (
            <PhotoImage
              src={entry.image}
              alt=""
              crossOrigin="anonymous"
              draggable="false"
            />
          )}
          <PhotoShade />
          <PhotoCopy>
            <time>{formatShareDate(entry.visitedAt)}</time>
            <h3>{entry.title || "남겨둔 공간"}</h3>
          </PhotoCopy>
        </SharePhoto>

        <ShareBody>
          <ShareTags>
            <ShareTag $tone="brand">{entry.crowd}</ShareTag>
            <ShareTag $tone="neutral">{entry.placeName}</ShareTag>
            <ShareTag $tone="secondary">{entry.difficulty}</ShareTag>
          </ShareTags>
          <ShareDescription>
            {entry.content || "오늘의 공기를 이곳에 남겨두었어요."}
          </ShareDescription>
          <ShareFooter>
            <ShareFooterCopy>
              <span>오늘 가능한 만큼만, 잠깐 다른 공기로.</span>
              {traceCode && (
                <TraceCode>Tuti trace · {traceCode}</TraceCode>
              )}
            </ShareFooterCopy>
            <WordmarkImage
              src="/brand/tuti-wordmark.svg"
              alt="Tuti"
            />
          </ShareFooter>
        </ShareBody>
      </ShareSurface>
    </ShareCard>
  );
}

function formatShareDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;
}

function waitForImages(node: HTMLElement) {
  return Promise.all(
    [...node.querySelectorAll("img")].map(async (image) => {
      if (image.complete) return;

      try {
        await image.decode();
      } catch {
        // 이미지가 없더라도 브랜드 배경으로 공유 카드를 생성한다.
      }
    }),
  );
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

const Backdrop = styled.div`
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: grid;
  place-items: center;
  padding:
    calc(var(--space-5) + var(--app-safe-area-top, 0px))
    calc(var(--space-4) + var(--app-safe-area-right, 0px))
    calc(var(--space-5) + var(--app-safe-area-bottom, 0px))
    calc(var(--space-4) + var(--app-safe-area-left, 0px));
  background: rgb(var(--color-black-rgb) / 0.48);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

const Dialog = styled.section`
  width: min(100%, 390px);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  overflow-y: auto;
  border-radius: 32px;
  background: var(--color-surface);
  box-shadow: 0 28px 72px rgb(var(--color-black-rgb) / 0.28);
  overscroll-behavior: contain;
`;

const DialogHeader = styled.header`
  display: grid;
  grid-template-columns: var(--space-10) 1fr var(--space-10);
  align-items: center;

  h2 {
    font-size: var(--font-size-400);
    text-align: center;
  }
`;

const HeaderSpacer = styled.span`
  width: var(--space-10);
  height: var(--space-10);
`;

const CloseButton = styled(BaseButton)`
  width: var(--space-10);
  height: var(--space-10);
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-600);
  line-height: 1;
`;

const Preview = styled.div`
  position: relative;
  width: min(100%, 320px);
  align-self: center;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border-radius: 20px;
  background: var(--color-neutral-200);
  box-shadow: 0 12px 32px rgb(var(--color-black-rgb) / 0.16);
`;

const PreviewScale = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: ${SHARE_WIDTH}px;
  height: ${SHARE_HEIGHT}px;
  transform-origin: top left;
`;

const ShareStatus = styled.p<{ $error: boolean }>`
  min-height: 21px;
  color: ${({ $error }) =>
    $error ? "var(--color-error)" : "var(--color-text-muted)"};
  font-size: var(--font-size-100);
  text-align: center;
`;

const Actions = styled.div<{ $single: boolean }>`
  display: grid;
  grid-template-columns: ${({ $single }) =>
    $single ? "1fr" : "1fr 1fr"};
  gap: var(--space-2);
`;

const ShareButton = styled(PrimaryButton)`
  min-height: var(--space-12);
  background: var(--color-brand-700);
`;

const DownloadButton = styled(BaseButton)`
  min-height: var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 600;

  &:disabled {
    color: var(--color-neutral-700);
  }
`;

const ShareCard = styled.div`
  width: ${SHARE_WIDTH}px;
  height: ${SHARE_HEIGHT}px;
  padding: 64px;
  background:
    radial-gradient(
      circle at 100% 0%,
      ${palette.secondary[300]} 0,
      transparent 38%
    ),
    linear-gradient(145deg, ${palette.brand[300]}, ${palette.neutral[200]} 62%);
  color: ${palette.neutral[1300]};
  font-family: var(--font-sans);
  font-synthesis: none;
`;

const ShareSurface = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 700px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 0.06);
  border-radius: 72px;
  background: ${palette.neutral[100]};
  box-shadow: 0 36px 80px rgb(0 0 0 / 0.18);
`;

const SharePhoto = styled.div`
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 20% 18%,
      ${palette.secondary[500]},
      transparent 36%
    ),
    linear-gradient(145deg, ${palette.brand[500]}, ${palette.brand[700]});

`;

const PhotoImage = styled.img`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
`;

const PhotoShade = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 38%,
    rgb(0 0 0 / 0.16) 62%,
    rgb(0 0 0 / 0.78) 100%
  );
`;

const PhotoCopy = styled.div`
  position: absolute;
  right: 56px;
  bottom: 52px;
  left: 56px;
  display: grid;
  gap: 16px;
  color: ${palette.neutral[100]};

  time {
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.01em;
  }

  h3 {
    overflow: hidden;
    font-size: 54px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ShareBody = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 44px 52px 40px;
`;

const ShareTags = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
`;

const ShareTag = styled.span<{
  $tone: "brand" | "neutral" | "secondary";
}>`
  min-width: 0;
  height: 52px;
  display: grid;
  place-items: center;
  padding: 0 20px;
  overflow: hidden;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "brand"
      ? palette.brand[500]
      : $tone === "secondary"
        ? palette.secondary[500]
        : palette.neutral[500]};
  font-size: 23px;
  font-weight: 500;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ShareDescription = styled.p`
  display: -webkit-box;
  margin-top: 34px;
  overflow: hidden;
  color: ${palette.neutral[1000]};
  font-size: 29px;
  line-height: 1.55;
  letter-spacing: -0.015em;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
`;

const ShareFooter = styled.footer`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
  margin-top: auto;
  color: ${palette.neutral[900]};
  font-size: 20px;
  letter-spacing: -0.01em;

`;

const ShareFooterCopy = styled.div`
  display: grid;
  gap: 10px;
`;

const TraceCode = styled.span`
  color: ${palette.neutral[800]};
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.04em;
`;

const WordmarkImage = styled.img`
  width: 138px;
  height: auto;
  display: block;
`;
