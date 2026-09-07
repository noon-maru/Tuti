"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { fetchWithSession } from "@/lib/auth/session";
import { getSessionSnapshot } from "@/lib/auth/session";
import type { JournalBookInput } from "@/shared/api/journalBook";

export function JournalBookPreview({
  input,
  ownerId,
}: {
  input: JournalBookInput;
  ownerId: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Parent keys this component by the selected input/content version.
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    let loadingTask:
      ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void (async () => {
      const response = await fetchWithSession("journal-books/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: abort.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "미리보기를 불러오지 못했어요.");
      }
      const buffer = await response.arrayBuffer();
      if (!active || getSessionSnapshot()?.userId !== ownerId) return;
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        standardFontDataUrl: `/pdfjs/${pdfjs.version}/standard_fonts/`,
        wasmUrl: `/pdfjs/${pdfjs.version}/wasm/`,
      });
      const pdf = await loadingTask.promise;
      if (active) setDocument(pdf);
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
  }, [input, ownerId, attempt]);

  if (error)
    return (
      <Notice role="alert">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => {
            setDocument(null);
            setError("");
            setAttempt(attempt + 1);
          }}
        >
          다시 시도하기
        </button>
      </Notice>
    );
  if (!document)
    return (
      <Notice role="status">
        기록을 한 권으로 엮고 있어요.
        <br />
        잠시만 기다려주세요.
      </Notice>
    );
  return (
    <div>
      <Notice role="status">
        표지 포함 {document.numPages}쪽 · 디지털 PDF 미리보기
      </Notice>
      <Pages aria-label="기록집 전체 미리보기">
        {Array.from({ length: document.numPages }, (_, index) => (
          <PdfPage key={index} document={document} number={index + 1} />
        ))}
      </Pages>
    </div>
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
  const [text, setText] = useState("");
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
      const contents = await page.getTextContent();
      if (active)
        setText(
          contents.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
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
    <Figure ref={frame}>
      <Sheet>
        <canvas ref={canvas} aria-hidden="true" />
        {error && (
          <p role="alert">
            이 페이지를 표시하지 못했어요. 미리보기를 다시 열어주세요.
          </p>
        )}
      </Sheet>
      <figcaption>{number}쪽</figcaption>
      {text && (
        <details>
          <summary>이 페이지 글로 읽기</summary>
          <p>{text}</p>
        </details>
      )}
    </Figure>
  );
}

const Pages = styled.div`
  display: grid;
  gap: 28px;
`;
const Notice = styled.div`
  padding: 18px 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.7;
  button {
    margin-top: 12px;
    padding: 10px 16px;
    border: 1px solid var(--color-border);
    border-radius: 20px;
    background: var(--color-surface);
    color: var(--color-text);
  }
`;
const Figure = styled.figure`
  margin: 0;
  min-width: 0;
  figcaption,
  summary {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: 8px;
  }
  details p {
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.8;
  }
`;
const Sheet = styled.div`
  background: white;
  aspect-ratio: 148 / 210;
  box-shadow: 0 3px 18px #18181812;
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
`;
