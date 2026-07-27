import { prisma } from "@/server/db/prisma";
import { verifyJournalShareTraceSignature } from "@/server/journal/shareTrace";

const input = process.argv[2]?.trim();

if (!input) {
  console.error(
    "사용법: pnpm journal:trace -- <Tuti 추적 ID 또는 짧은 코드>",
  );
  process.exitCode = 1;
} else {
  try {
    const shortCode = normalizeShortCode(input);
    const trace = await prisma.journalShareTrace.findFirst({
      where: shortCode
        ? { shortCode }
        : { traceId: input },
    });

    if (!trace) {
      console.error("일치하는 공유 이미지 감사 기록이 없어요.");
      process.exitCode = 1;
    } else {
      const signatureValid =
        trace.imageSha256 &&
        trace.signature &&
        trace.finalizedAt
          ? verifyJournalShareTraceSignature({
              traceId: trace.traceId,
              originUserId: trace.originUserId,
              entryId: trace.entryId,
              imageSha256: trace.imageSha256,
              issuedAt: trace.issuedAt,
              signature: trace.signature,
            })
          : null;

      console.info(
        JSON.stringify(
          {
            traceId: trace.traceId,
            shortCode: trace.shortCode,
            originUserId: trace.originUserId,
            resolvedUserId: trace.resolvedUserId,
            entryId: trace.entryId,
            imageSha256: trace.imageSha256,
            signature: trace.signature,
            signatureValid,
            issuedAt: trace.issuedAt.toISOString(),
            finalizedAt: trace.finalizedAt?.toISOString() ?? null,
            status: trace.finalizedAt ? "finalized" : "issued",
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

function normalizeShortCode(value: string) {
  const normalized = value.replaceAll("-", "").toUpperCase();

  if (!/^[A-F0-9]{12}$/.test(normalized)) return null;
  return normalized.match(/.{4}/g)?.join("-") ?? null;
}
