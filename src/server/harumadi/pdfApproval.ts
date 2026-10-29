import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { HARUMADI_PDF_COVER_STYLES, type HarumadiPdfCoverStyle, type HarumadiPdfInput } from "@/shared/api/harumadiPdf";
import { PDFDocument } from "pdf-lib";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";
import { LEGACY_HARUMADI_APPROVAL_SECRET, INTERIM_HARUMADI_APPROVAL_SECRET } from "@/shared/harumadi/legacy";

const APPROVAL_VERSION = 2;
const APPROVAL_LIFETIME_MS = 30 * 60 * 1000;
export const HARUMADI_PDF_MAX_PDF_BYTES = 20 * 1024 * 1024;

type HarumadiPdfApprovalPayload = {
  version: typeof APPROVAL_VERSION;
  harumadiPdfId: string;
  ownerId: string;
  title: string;
  entryIds: string[];
  pageCount: number;
  pdfHash: string;
  expiresAt: number;
  issuedAt: number;
  sensitivePolicyVersion: string | null;
  coverStyle?: HarumadiPdfCoverStyle;
  sourceHarumadi?: { id: string; revision: number; accessRevision: number };
};

export type ApprovedHarumadiPdf = Pick<
  HarumadiPdfApprovalPayload,
  "harumadiPdfId" | "title" | "entryIds" | "pageCount" | "issuedAt" | "sensitivePolicyVersion" | "coverStyle" | "sourceHarumadi"
>;

export type HarumadiPdfCompletionRequest = {
      kind: "approved-pdf";
      harumadiPdf: ApprovedHarumadiPdf;
      pdf: Uint8Array;
    };

export async function createHarumadiPdfApproval(
  ownerId: string,
  input: HarumadiPdfInput,
  pdf: Uint8Array,
  issuedAt = Date.now(),
) {
  assertPdf(pdf);
  const pageCount = await readHarumadiPdfPageCount(pdf);
  let sourceHarumadi: HarumadiPdfApprovalPayload["sourceHarumadi"];
  if (input.harumadiId) {
    const { prisma } = await import("@/server/db/prisma");
    const { requireTogether, requireHarumadiAccess } = await import("./access");
    requireTogether();
    sourceHarumadi = await prisma.$transaction(async tx => {
      const book = await requireHarumadiAccess(tx, ownerId, input.harumadiId!);
      if (book.revision !== input.harumadiRevision || await tx.harumadiEntryLink.count({ where: { harumadiId: book.id, entryId: { in: input.entryIds } } }) !== input.entryIds.length) throw new HarumadiPdfApprovalError("하루마디가 바뀌었어요. 다시 미리보기 해주세요.", 409);
      return { id: book.id, revision: book.revision, accessRevision: book.accessRevision };
    });
  }
  const payload: HarumadiPdfApprovalPayload = {
    version: APPROVAL_VERSION,
    harumadiPdfId: randomUUID(),
    ownerId,
    title: input.title,
    entryIds: [...input.entryIds],
    pageCount,
    pdfHash: hashPdf(pdf),
    expiresAt: Date.now() + APPROVAL_LIFETIME_MS,
    issuedAt,
    sensitivePolicyVersion: input.freeformNonSensitiveConfirmed === true ? SENSITIVE_JOURNAL_CONSENT_VERSION : null,
    coverStyle: input.coverStyle,
    ...(sourceHarumadi ? { sourceHarumadi } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyHarumadiPdfApproval(
  ownerId: string,
  token: string,
  pdf: Uint8Array,
): ApprovedHarumadiPdf {
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
    throw new HarumadiPdfApprovalError(
      "미리보기 확인 시간이 지났어요. 최신 내용으로 다시 미리보기 해주세요.",
      409,
    );
  }
  if (payload.pdfHash !== hashPdf(pdf)) {
    throw new HarumadiPdfApprovalError(
      "확인한 미리보기와 파일이 달라요. 다시 미리보기 해주세요.",
      409,
    );
  }
  return {
    harumadiPdfId: payload.harumadiPdfId,
    title: payload.title,
    entryIds: [...payload.entryIds],
    pageCount: payload.pageCount,
    issuedAt: payload.issuedAt,
    sensitivePolicyVersion: payload.sensitivePolicyVersion,
    ...(payload.coverStyle ? { coverStyle: payload.coverStyle } : {}),
    ...(payload.sourceHarumadi ? { sourceHarumadi: payload.sourceHarumadi } : {}),
  };
}

export async function readHarumadiPdf(request: Request) {
  const pdf = await readRequestBytes(
    request,
    HARUMADI_PDF_MAX_PDF_BYTES,
    "하루마디 파일이 너무 커요.",
  );
  assertPdf(pdf);
  return pdf;
}

export async function readHarumadiPdfCompletionRequest(
  request: Request,
  ownerId: string,
): Promise<HarumadiPdfCompletionRequest> {
  const contentType = request.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (contentType === "application/pdf") {
    const approvalToken = request.headers.get(
      "X-Tuti-Journal-Harumadi-Approval",
    );
    if (!approvalToken) {
      throw new HarumadiPdfApprovalError(
        "미리보기 승인 정보를 확인해주세요.",
        400,
      );
    }
    const pdf = await readHarumadiPdf(request);
    return {
      kind: "approved-pdf",
      harumadiPdf: verifyHarumadiPdfApproval(ownerId, approvalToken, pdf),
      pdf,
    };
  }

  throw new HarumadiPdfApprovalError(
    "최신 버전에서 미리보기를 확인한 뒤 다시 완성해주세요.",
    415,
  );
}

async function readRequestBytes(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string,
) {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new HarumadiPdfApprovalError("하루마디 내용을 확인해주세요.", 400);
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new HarumadiPdfApprovalError(tooLargeMessage, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readHarumadiPdfPageCount(pdf: Uint8Array) {
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const pageCount = document.getPageCount();
  if (pageCount < 1 || pageCount > 100) {
    throw new HarumadiPdfApprovalError("하루마디 쪽 수를 확인해주세요.", 400);
  }
  return pageCount;
}

function assertPdf(pdf: Uint8Array) {
  if (
    pdf.byteLength < 5 ||
    pdf.byteLength > HARUMADI_PDF_MAX_PDF_BYTES ||
    Buffer.from(pdf.subarray(0, 5)).toString("ascii") !== "%PDF-"
  ) {
    throw new HarumadiPdfApprovalError("하루마디 파일을 확인해주세요.", 400);
  }
}

function isApprovalPayload(value: unknown): value is HarumadiPdfApprovalPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<HarumadiPdfApprovalPayload>;
  return (
    payload.version === APPROVAL_VERSION &&
    (payload.sourceHarumadi === undefined || (typeof payload.sourceHarumadi === "object" && payload.sourceHarumadi !== null && typeof payload.sourceHarumadi.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.sourceHarumadi.id) && Number.isSafeInteger(payload.sourceHarumadi.revision) && payload.sourceHarumadi.revision > 0 && Number.isSafeInteger(payload.sourceHarumadi.accessRevision) && payload.sourceHarumadi.accessRevision >= 0)) &&
    (payload.coverStyle === undefined || HARUMADI_PDF_COVER_STYLES.includes(payload.coverStyle)) &&
    (payload.sensitivePolicyVersion === null || payload.sensitivePolicyVersion === SENSITIVE_JOURNAL_CONSENT_VERSION) &&
    typeof payload.harumadiPdfId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.harumadiPdfId) &&
    typeof payload.ownerId === "string" &&
    payload.ownerId.length > 0 &&
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    payload.title.length <= 80 &&
    Array.isArray(payload.entryIds) &&
    payload.entryIds.length >= 1 &&
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
    Number.isSafeInteger(payload.expiresAt) &&
    typeof payload.issuedAt === "number" && Number.isSafeInteger(payload.issuedAt) &&
    payload.issuedAt > 0 && payload.issuedAt <= payload.expiresAt &&
    payload.expiresAt - payload.issuedAt <= APPROVAL_LIFETIME_MS + 300_000
  );
}

function hashPdf(pdf: Uint8Array) {
  return createHash("sha256").update(pdf).digest("hex");
}

function sign(encoded: string) {
  return createHmac("sha256", getApprovalSecret())
    .update("tuti-harumadi-pdf-approval-v1\n")
    .update(encoded)
    .digest("hex");
}

function getApprovalSecret() {
  const secret =
    process.env.HARUMADI_PDF_APPROVAL_SECRET?.trim() ||
    process.env[INTERIM_HARUMADI_APPROVAL_SECRET]?.trim() ||
    process.env[LEGACY_HARUMADI_APPROVAL_SECRET]?.trim() ||
    process.env.AUTH_EMAIL_CODE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("하루마디 승인 서명 비밀값은 32자 이상이어야 합니다.");
  }
  return secret;
}

function invalidApproval() {
  return new HarumadiPdfApprovalError(
    "미리보기 승인 정보를 확인할 수 없어요. 다시 미리보기 해주세요.",
    409,
  );
}

export class HarumadiPdfApprovalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HarumadiPdfApprovalError";
  }
}
