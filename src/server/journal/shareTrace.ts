import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  JournalShareTraceFinalization,
  JournalShareTraceIssue,
} from "@/shared/api/journal";

const TRACE_ID_BYTES = 24;
const SHORT_CODE_BYTES = 6;
const MAX_ISSUE_ATTEMPTS = 4;
const PNG_WIDTH = 1080;
const PNG_HEIGHT = 1350;
export const MAX_JOURNAL_SHARE_PNG_BYTES = 12 * 1024 * 1024;

export async function issueJournalShareTrace(
  ownerId: string,
  entryId: string,
): Promise<JournalShareTraceIssue | null> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: entryId, ownerId },
    select: { id: true },
  });

  if (!entry) return null;

  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt += 1) {
    try {
      const trace = await prisma.journalShareTrace.create({
        data: {
          traceId: randomBytes(TRACE_ID_BYTES).toString("base64url"),
          shortCode: formatShortCode(
            randomBytes(SHORT_CODE_BYTES).toString("hex"),
          ),
          originUserId: ownerId,
          resolvedUserId: ownerId,
          entryId,
        },
      });

      return serializeIssuedTrace(trace);
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  throw new JournalShareTraceError(
    "공유 이미지 추적 번호를 만들지 못했어요.",
    "trace_id_generation_failed",
    500,
  );
}

export async function finalizeJournalShareTrace({
  ownerId,
  entryId,
  traceId,
  png,
}: {
  ownerId: string;
  entryId: string;
  traceId: string;
  png: Uint8Array;
}): Promise<JournalShareTraceFinalization | null> {
  const trace = await prisma.journalShareTrace.findFirst({
    where: {
      traceId,
      resolvedUserId: ownerId,
      entryId,
    },
  });

  if (!trace) return null;

  await validateSharePng(png);
  const imageSha256 = createHash("sha256").update(png).digest("hex");

  if (trace.finalizedAt) {
    if (
      trace.imageSha256 !== imageSha256 ||
      !trace.signature
    ) {
      throw new JournalShareTraceError(
        "이미 완료된 공유 이미지와 내용이 달라요.",
        "share_trace_already_finalized",
        409,
      );
    }

    return serializeFinalizedTrace({
      ...trace,
      imageSha256,
      signature: trace.signature,
      finalizedAt: trace.finalizedAt,
    });
  }

  const finalizedAt = new Date();
  const signature = signShareTrace({
    traceId: trace.traceId,
    originUserId: trace.originUserId,
    entryId: trace.entryId,
    imageSha256,
    issuedAt: trace.issuedAt,
  });
  const finalized = await prisma.journalShareTrace.update({
    where: { traceId: trace.traceId },
    data: {
      imageSha256,
      signature,
      finalizedAt,
    },
  });

  return serializeFinalizedTrace({
    ...finalized,
    imageSha256,
    signature,
    finalizedAt,
  });
}

export function verifyJournalShareTraceSignature(trace: {
  traceId: string;
  originUserId: string;
  entryId: string;
  imageSha256: string;
  issuedAt: Date;
  signature: string;
}) {
  const expected = Buffer.from(
    signShareTrace(trace),
    "base64url",
  );
  const received = Buffer.from(trace.signature, "base64url");

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

async function validateSharePng(png: Uint8Array) {
  if (
    png.byteLength === 0 ||
    png.byteLength > MAX_JOURNAL_SHARE_PNG_BYTES ||
    !hasPngSignature(png)
  ) {
    throw invalidPngError();
  }

  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(png, {
      failOn: "error",
      limitInputPixels: PNG_WIDTH * PNG_HEIGHT,
    }).metadata();

    if (
      metadata.format !== "png" ||
      metadata.width !== PNG_WIDTH ||
      metadata.height !== PNG_HEIGHT
    ) {
      throw invalidPngError();
    }
  } catch (error) {
    if (error instanceof JournalShareTraceError) throw error;
    throw invalidPngError();
  }
}

function signShareTrace({
  traceId,
  originUserId,
  entryId,
  imageSha256,
  issuedAt,
}: {
  traceId: string;
  originUserId: string;
  entryId: string;
  imageSha256: string;
  issuedAt: Date;
}) {
  return createHmac("sha256", getTraceSigningSecret())
    .update(
      [
        "tuti-journal-share-v1",
        traceId,
        originUserId,
        entryId,
        imageSha256,
        issuedAt.toISOString(),
      ].join("\n"),
    )
    .digest("base64url");
}

function getTraceSigningSecret() {
  const secret =
    process.env.JOURNAL_SHARE_TRACE_SECRET?.trim() ||
    process.env.AUTH_EMAIL_CODE_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new JournalShareTraceError(
      "공유 이미지 서명 비밀값이 설정되지 않았어요.",
      "share_trace_secret_missing",
      503,
    );
  }

  return secret;
}

function serializeIssuedTrace(trace: {
  traceId: string;
  shortCode: string;
  issuedAt: Date;
}): JournalShareTraceIssue {
  return {
    traceId: trace.traceId,
    shortCode: trace.shortCode,
    issuedAt: trace.issuedAt.toISOString(),
  };
}

function serializeFinalizedTrace(trace: {
  traceId: string;
  shortCode: string;
  imageSha256: string;
  signature: string;
  issuedAt: Date;
  finalizedAt: Date;
}): JournalShareTraceFinalization {
  return {
    ...serializeIssuedTrace(trace),
    imageSha256: trace.imageSha256,
    signature: trace.signature,
    finalizedAt: trace.finalizedAt.toISOString(),
  };
}

function formatShortCode(value: string) {
  const normalized = value.toUpperCase();
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

function hasPngSignature(value: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((byte, index) => value[index] === byte);
}

function invalidPngError() {
  return new JournalShareTraceError(
    "공유 이미지는 1080×1350 PNG 파일이어야 해요.",
    "invalid_share_png",
    400,
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class JournalShareTraceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "JournalShareTraceError";
  }
}
