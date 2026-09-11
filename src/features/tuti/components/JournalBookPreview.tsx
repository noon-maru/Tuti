"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  FileText,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { fetchWithSession } from "@/lib/auth/session";
import { getSessionSnapshot } from "@/lib/auth/session";
import type { JournalBookInput } from "@/shared/api/journalBook";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";

type JournalBookPreviewProps = {
  ownerId: string;
  onReady?: (
    result: {
      bytes: Uint8Array;
      pageCount: number;
      approvalToken?: string;
    } | null,
  ) => void;
} & (
  | { input: JournalBookInput; bookId?: never }
  | { input?: never; bookId: string }
);

export function JournalBookPreview({
  input,
  bookId,
  ownerId,
  onReady,
}: JournalBookPreviewProps) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [showText, setShowText] = useState(false);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  // Parent keys this component by the selected input/content version.
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    let loadingTask:
      ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    onReady?.(null);
    void (async () => {
      const response = await fetchWithSession(
        bookId
          ? `journal-books/${encodeURIComponent(bookId)}/file`
          : "journal-books/preview",
        bookId
          ? { signal: abort.signal, cache: "no-store" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
              signal: abort.signal,
              cache: "no-store",
            },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "미리보기를 불러오지 못했어요.");
      }
      const buffer = await response.arrayBuffer();
      if (!active || getSessionSnapshot()?.userId !== ownerId) return;
      const approvalToken = bookId
        ? undefined
        : response.headers.get("X-Tuti-Journal-Book-Approval") || undefined;
      if (!bookId && !approvalToken) {
        throw new Error("미리보기 승인 정보를 받지 못했어요. 다시 시도해주세요.");
      }
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
      const bytes = new Uint8Array(buffer);
      loadingTask = pdfjs.getDocument({
        data: bytes.slice(),
        standardFontDataUrl: `/pdfjs/${pdfjs.version}/standard_fonts/`,
        wasmUrl: `/pdfjs/${pdfjs.version}/wasm/`,
      });
      const pdf = await loadingTask.promise;
      if (active) {
        setPdfDocument(pdf);
        onReady?.({ bytes, pageCount: pdf.numPages, approvalToken });
      }
    })().catch((cause: unknown) => {
      if (active && !abort.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "미리보기를 불러오지 못했어요.",
        );
    });
    return () => {
      active = false;
      abort.abort();
      void loadingTask?.destroy();
    };
  }, [input, bookId, ownerId, attempt, onReady]);

  useEffect(() => {
    if (!pdfDocument) return;
    let active = true;
    void Promise.all(
      Array.from({ length: pdfDocument.numPages }, async (_, index) => {
        const page = await pdfDocument.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items
          .map((item) =>
            "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "",
          )
          .join("")
          .replace(/ +\n/g, "\n")
          .replace(/ {2,}/g, " ")
          .trim();
      }),
    )
      .then((texts) => {
        if (active) setPageTexts(texts);
      })
      .catch(() => {
        if (active) setPageTexts([]);
      });
    return () => {
      active = false;
    };
  }, [pdfDocument]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = globalThis.document.documentElement.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    globalThis.document.documentElement.style.overflow = "hidden";
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => {
      globalThis.document.documentElement.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  if (error)
    return (
      <Notice role="alert">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => {
            setPdfDocument(null);
            setError("");
            setAttempt(attempt + 1);
          }}
        >
          다시 시도하기
        </button>
      </Notice>
    );
  if (!pdfDocument)
    return (
      <PreviewLoading role="status">
        <LoadingIndicator label="기록을 한 권으로 엮고 있어요." />
      </PreviewLoading>
    );
  return (
    <PreviewDesk
      $expanded={expanded}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? "true" : undefined}
      aria-label={expanded ? "기록집 전체 화면 미리보기" : undefined}
    >
      <PreviewToolbar aria-label="미리보기 보기 설정">
        <ToolGroup>
          <ToolButton
            type="button"
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
            disabled={showText || zoom <= 1}
            aria-label="미리보기 축소"
          >
            <ZoomOut size={17} aria-hidden="true" />
          </ToolButton>
          <ZoomValue aria-live="polite">{Math.round(zoom * 100)}%</ZoomValue>
          <ToolButton
            type="button"
            onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
            disabled={showText || zoom >= 2}
            aria-label="미리보기 확대"
          >
            <ZoomIn size={17} aria-hidden="true" />
          </ToolButton>
        </ToolGroup>
        <ToolGroup>
          <ToolButton
            type="button"
            onClick={() => setShowText((value) => !value)}
            aria-pressed={showText}
            aria-label={showText ? "페이지 미리보기 보기" : "텍스트로 보기"}
          >
            <FileText size={17} aria-hidden="true" />
            <ToolLabel>{showText ? "페이지" : "텍스트"}</ToolLabel>
          </ToolButton>
          <ToolButton
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-pressed={expanded}
            aria-label={expanded ? "전체 화면 닫기" : "전체 화면으로 보기"}
          >
            {expanded ? (
              <Minimize2 size={17} aria-hidden="true" />
            ) : (
              <Maximize2 size={17} aria-hidden="true" />
            )}
            <ToolLabel>{expanded ? "닫기" : "전체"}</ToolLabel>
          </ToolButton>
        </ToolGroup>
      </PreviewToolbar>
      <PreviewViewport $expanded={expanded}>
        {showText ? (
          <TextPages aria-label="기록집 페이지별 텍스트">
            {pageTexts.length === 0 ? (
              <TextStatus role="status">페이지의 글을 불러오고 있어요.</TextStatus>
            ) : (
              pageTexts.map((text, index) => (
                <TextPage key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{text || "이 페이지에는 글이 없어요."}</p>
                </TextPage>
              ))
            )}
          </TextPages>
        ) : (
          <Pages
            $zoom={zoom}
            aria-label={`기록집 전체 미리보기, ${pdfDocument.numPages}쪽`}
          >
            {Array.from({ length: pdfDocument.numPages }, (_, index) => (
              <PdfPage
                key={index}
                document={pdfDocument}
                number={index + 1}
              />
            ))}
          </Pages>
        )}
      </PreviewViewport>
    </PreviewDesk>
  );
}

function PdfPage({
  document,
  number,
}: {
  document: PDFDocumentProxy;
  number: number;
}) {
  const frame = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!frame.current) return;
    const node = frame.current;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "400px" },
    );
    const resize = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(node);
    resize.observe(node);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (!near || !width) {
      target.width = 0;
      target.height = 0;
      return;
    }
    let active = true;
    let render: RenderTask | undefined;
    void (async () => {
      const page = await document.getPage(number);
      if (!active) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({
        scale: (width * ratio) / page.getViewport({ scale: 1 }).width,
      });
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      render = page.render({ canvas: target, viewport });
      await render.promise;
    })().catch((cause: unknown) => {
      if (
        active &&
        !(
          cause instanceof Error && cause.name === "RenderingCancelledException"
        )
      )
        setError(true);
    });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [document, number, near, width]);

  return (
    <Figure ref={frame} aria-label={`${number}번째 기록집 페이지`}>
      <Sheet>
        <canvas ref={canvas} aria-hidden="true" />
        {error && (
          <p role="alert">
            이 페이지를 표시하지 못했어요. 미리보기를 다시 열어주세요.
          </p>
        )}
      </Sheet>
      <PageFolio aria-hidden="true">
        {String(number).padStart(2, "0")}
      </PageFolio>
    </Figure>
  );
}

const PreviewDesk = styled.div<{ $expanded: boolean }>`
  min-width: 0;

  ${({ $expanded }) =>
    $expanded &&
    `
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      padding: max(var(--space-3), env(safe-area-inset-top)) var(--space-3)
        max(var(--space-3), env(safe-area-inset-bottom));
      background: var(--color-surface);
    `}
`;

const PreviewToolbar = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 48px;
  margin-bottom: var(--space-4);
  padding: 4px;
  border: 1px solid var(--color-neutral-300);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.06);
  backdrop-filter: blur(12px);
`;

const ToolGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const ToolButton = styled.button`
  min-width: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 600;
  cursor: pointer;

  &[aria-pressed="true"] {
    background: var(--color-secondary-200);
    color: var(--color-secondary-900);
  }

  &:disabled {
    opacity: 0.36;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }
`;

const ToolLabel = styled.span`
  @media (max-width: 360px) {
    display: none;
  }
`;

const ZoomValue = styled.span`
  min-width: 43px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
`;

const PreviewViewport = styled.div<{ $expanded: boolean }>`
  min-width: 0;
  overflow: visible;

  ${({ $expanded }) =>
    $expanded &&
    `
      flex: 1;
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    `}
`;

const Pages = styled.div<{ $zoom: number }>`
  display: grid;
  gap: var(--space-7);
  width: ${({ $zoom }) => `${$zoom * 100}%`};
  max-width: ${({ $zoom }) => `${520 * $zoom}px`};
  margin: 0 auto;
`;

const TextPages = styled.div`
  display: grid;
  gap: var(--space-3);
  width: min(100%, 680px);
  margin: 0 auto;
`;

const TextPage = styled.section`
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
  border-top: 1px solid var(--color-neutral-300);

  > span {
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
  }

  p {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-200);
    line-height: 1.8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`;

const TextStatus = styled.p`
  margin: var(--space-6) 0;
  color: var(--color-text-muted);
  text-align: center;
`;

const Notice = styled.div`
  margin: var(--space-4) 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--color-neutral-200);
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  line-height: var(--line-height-body);

  p {
    margin: 0;
  }

  button {
    min-height: 40px;
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 0;
    border-radius: 999px;
    background: var(--color-secondary-500);
    color: var(--color-secondary-1000);
    font: inherit;
    font-weight: 600;
  }
`;

const PreviewLoading = styled.div`
  min-height: 240px;
  display: grid;
  place-items: center;
`;

const Figure = styled.figure`
  margin: 0;
  min-width: 0;
`;

const Sheet = styled.div`
  overflow: hidden;
  background: white;
  aspect-ratio: 148 / 210;
  border: 1px solid var(--color-neutral-300);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.08);

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
`;

const PageFolio = styled.span`
  display: block;
  width: fit-content;
  margin: var(--space-2) auto 0;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.12em;
  line-height: 1;
  opacity: 0.72;
`;
