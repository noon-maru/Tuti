import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type { JournalBookInput } from "@/shared/api/journalBook";

const APPROVAL_VERSION = 1;
const APPROVAL_LIFETIME_MS = 30 * 60 * 1000;
export const JOURNAL_BOOK_MAX_PDF_BYTES = 20 * 1024 * 1024;

type JournalBookApprovalPayload = {
  version: typeof APPROVAL_VERSION;
  bookId: string;
  ownerId: string;
  title: string;
  entryIds: string[];
  pageCount: number;
  pdfHash: string;
  expiresAt: number;
};

export type ApprovedJournalBook = Pick<
  JournalBookApprovalPayload,
  "bookId" | "title" | "entryIds" | "pageCount"
>;

export async function createJournalBookApproval(
  ownerId: string,
  input: JournalBookInput,
  pdf: Uint8Array,
) {
  assertPdf(pdf);
  const pageCount = await readPdfPageCount(pdf);
  const payload: JournalBookApprovalPayload = {
    version: APPROVAL_VERSION,
    bookId: randomUUID(),
    ownerId,
    title: input.title,
    entryIds: [...input.entryIds],
    pageCount,
    pdfHash: hashPdf(pdf),
    expiresAt: Date.now() + APPROVAL_LIFETIME_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyJournalBookApproval(
  ownerId: string,
  token: string,
  pdf: Uint8Array,
): ApprovedJournalBook {
  assertPdf(pdf);
  const [encoded, receivedSignature, ...rest] = token.split(".");
  if (!encoded || !receivedSignature || rest.length > 0) throw invalidApproval();

  const expected = Buffer.from(sign(encoded), "hex");
  const received = Buffer.from(receivedSignature, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw invalidApproval();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw invalidApproval();
  }
  if (!isApprovalPayload(payload) || payload.ownerId !== ownerId) {
    throw invalidApproval();
  }
  if (payload.expiresAt < Date.now()) {
    throw new JournalBookApprovalError(
      "미리보기 확인 시간이 지났어요. 최신 내용으로 다시 미리보기 해주세요.",
      409,
    );
  }
  if (payload.pdfHash !== hashPdf(pdf)) {
    throw new JournalBookApprovalError(
      "확인한 미리보기와 파일이 달라요. 다시 미리보기 해주세요.",
      409,
    );
  }
  return {
    bookId: payload.bookId,
    title: payload.title,
    entryIds: [...payload.entryIds],
    pageCount: payload.pageCount,
  };
}

export async function readJournalBookPdf(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new JournalBookApprovalError("기록집 파일을 확인해주세요.", 400);
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > JOURNAL_BOOK_MAX_PDF_BYTES) {
        await reader.cancel();
        throw new JournalBookApprovalError("기록집 파일이 너무 커요.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const pdf = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  assertPdf(pdf);
  return pdf;
}

async function readPdfPageCount(pdf: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: Uint8Array.from(pdf) });
  try {
    const document = await task.promise;
    if (document.numPages < 1 || document.numPages > 100) {
      throw new JournalBookApprovalError("기록집 쪽 수를 확인해주세요.", 400);
    }
    return document.numPages;
  } finally {
    await task.destroy();
  }
}

function assertPdf(pdf: Uint8Array) {
  if (
    pdf.byteLength < 5 ||
    pdf.byteLength > JOURNAL_BOOK_MAX_PDF_BYTES ||
    Buffer.from(pdf.subarray(0, 5)).toString("ascii") !== "%PDF-"
  ) {
    throw new JournalBookApprovalError("기록집 파일을 확인해주세요.", 400);
  }
}

function isApprovalPayload(value: unknown): value is JournalBookApprovalPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<JournalBookApprovalPayload>;
  return (
    payload.version === APPROVAL_VERSION &&
    typeof payload.bookId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.bookId) &&
    typeof payload.ownerId === "string" &&
    payload.ownerId.length > 0 &&
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    payload.title.length <= 80 &&
    Array.isArray(payload.entryIds) &&
    payload.entryIds.length >= 1 &&
    payload.entryIds.length <= 12 &&
    payload.entryIds.every(
      (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id),
    ) &&
    new Set(payload.entryIds).size === payload.entryIds.length &&
    Number.isInteger(payload.pageCount) &&
    Number(payload.pageCount) >= 1 &&
    Number(payload.pageCount) <= 100 &&
    typeof payload.pdfHash === "string" &&
    /^[0-9a-f]{64}$/.test(payload.pdfHash) &&
    typeof payload.expiresAt === "number" &&
    Number.isSafeInteger(payload.expiresAt)
  );
}

function hashPdf(pdf: Uint8Array) {
  return createHash("sha256").update(pdf).digest("hex");
}

function sign(encoded: string) {
  return createHmac("sha256", getApprovalSecret())
    .update("tuti-journal-book-approval-v1\n")
    .update(encoded)
    .digest("hex");
}

function getApprovalSecret() {
  const secret =
    process.env.JOURNAL_BOOK_APPROVAL_SECRET?.trim() ||
    process.env.AUTH_EMAIL_CODE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("기록집 승인 서명 비밀값은 32자 이상이어야 합니다.");
  }
  return secret;
}

function invalidApproval() {
  return new JournalBookApprovalError(
    "미리보기 승인 정보를 확인할 수 없어요. 다시 미리보기 해주세요.",
    409,
  );
}

export class JournalBookApprovalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "JournalBookApprovalError";
  }
}
