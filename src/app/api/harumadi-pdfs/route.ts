import { writeDiagnosticLogSafely } from "@/server/admin/log";

import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { lockHarumadi, requireHarumadiAccess, requireTogether } from "@/server/harumadi/access";
import { assertSensitiveJournalReadable, sensitiveJournalPolicyEnabled, SensitiveJournalPolicyError } from "@/server/journal/sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  deleteStoredHarumadiPdf,
  storeHarumadiPdf,
} from "@/server/harumadi/pdfStorage";
import type {
  HarumadiPdfResponse,
  HarumadiPdfsResponse,
} from "@/shared/api/harumadiPdf";
import { HARUMADI_PDF_COVER_STYLES, type HarumadiPdfCoverStyle } from "@/shared/api/harumadiPdf";
import {
  HarumadiPdfApprovalError,
  readHarumadiPdfCompletionRequest,
} from "@/server/harumadi/pdfApproval";

export const runtime = "nodejs";

let creating = false;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return forbidden();
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, unauthorized());
    const params = new URL(request.url).searchParams;
    const limit = params.has("limit") ? Number(params.get("limit")) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 48)) return withCors(request, Response.json({ error: "목록 범위를 확인해주세요." }, { status: 400 }));
    const cursorId = params.get("cursor");
    const cursor = cursorId ? await prisma.harumadiPdf.findFirst({ where: { id: cursorId, ownerId: user.id }, select: { id: true, createdAt: true } }) : null;
    if (cursorId && !cursor) return withCors(request, Response.json({ error: "목록 위치를 확인해주세요." }, { status: 400 }));
    const withdrawnEntries = await prisma.journalEntry.findMany({ where: { ownerId: user.id, sensitiveWithdrawnAt: { not: null } }, select: { id: true } });
    const harumadiPdfs = await prisma.harumadiPdf.findMany({
      where: { ownerId: user.id, ...(withdrawnEntries.length ? { NOT: { entryIds: { hasSome: withdrawnEntries.map((entry) => entry.id) } } } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      ...(limit ? { take: limit + 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        entryIds: true,
        pageCount: true,
        createdAt: true,
        coverStyle: true,
        coverReady: true,
      },
    });
    const response: HarumadiPdfsResponse = {
      harumadiPdfs: (limit ? harumadiPdfs.slice(0, limit) : harumadiPdfs).map((harumadiPdf) => ({
        id: harumadiPdf.id,
        title: harumadiPdf.title,
        entryCount: harumadiPdf.entryIds.length,
        pageCount: harumadiPdf.pageCount,
        createdAt: harumadiPdf.createdAt.toISOString(),
        coverStyle: HARUMADI_PDF_COVER_STYLES.includes(harumadiPdf.coverStyle as HarumadiPdfCoverStyle) ? harumadiPdf.coverStyle as HarumadiPdfCoverStyle : null,
        hasCover: Boolean(harumadiPdf.coverReady),
      })),
      ...(limit ? { nextCursor: harumadiPdfs.length > limit ? harumadiPdfs[limit - 1].id : null,
        ...(!cursor ? { recordCount: await prisma.journalEntry.count({ where: { ownerId: user.id, sensitiveWithdrawnAt: null } }) } : {}) } : {}),
    };
    return withCors(request, Response.json(response, { headers: { "Cache-Control": "private, no-store" } }));
  } catch {
    console.error("완성한 하루마디 목록을 불러오지 못했습니다.");
    await writeDiagnosticLogSafely({ code: "UNEXPECTED_FAILURE", component: "harumadiPdf" });
    return withCors(
      request,
      Response.json({ error: "완성한 하루마디를 불러오지 못했어요." }, { status: 500 }),
    );
  }
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) return forbidden();
  let objectKey: string | null = null;
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, unauthorized());
    const completion = await readHarumadiPdfCompletionRequest(request, user.id);
    if (completion.kind === "approved-pdf") {
      const existing = await prisma.harumadiPdf.findUnique({
        where: { id: completion.harumadiPdf.harumadiPdfId },
        select: {
          id: true,
          ownerId: true,
          title: true,
          entryIds: true,
          pageCount: true,
          createdAt: true,
        },
      });
      if (existing) {
        if (existing.ownerId !== user.id) {
          throw new HarumadiPdfApprovalError(
            "미리보기 승인 정보를 확인할 수 없어요. 다시 미리보기 해주세요.",
            409,
          );
        }
        const response: HarumadiPdfResponse = {
          harumadiPdf: {
            id: existing.id,
            title: existing.title,
            entryCount: existing.entryIds.length,
            pageCount: existing.pageCount,
            createdAt: existing.createdAt.toISOString(),
          },
        };
        return withCors(request, Response.json(response));
      }
    }
    if (creating) {
      return withCors(
        request,
        Response.json(
          { error: "다른 하루마디를 만들고 있어요. 잠시 후 다시 시도해주세요." },
          { status: 429 },
        ),
      );
    }
    creating = true;
    try {
      const prepared = { ...completion.harumadiPdf, pdf: completion.pdf };
      const id = prepared.harumadiPdfId;
      objectKey = await storeHarumadiPdf(user.id, id, prepared.pdf);
      const storedObjectKey = objectKey;
      const created = await prisma.$transaction(async (tx) => {
        if (prepared.sourceHarumadi) {
          requireTogether();
          await lockHarumadi(tx, prepared.sourceHarumadi.id);
          const book = await requireHarumadiAccess(tx, user.id, prepared.sourceHarumadi.id);
          if (book.revision !== prepared.sourceHarumadi.revision || book.accessRevision !== prepared.sourceHarumadi.accessRevision) throw new HarumadiPdfApprovalError("참여 상태나 하루마디가 바뀌었어요. 다시 미리보기 해주세요.", 409);
        }
        if (sensitiveJournalPolicyEnabled() && prepared.sensitivePolicyVersion !== SENSITIVE_JOURNAL_CONSENT_VERSION) throw new SensitiveJournalPolicyError("기록 보호 확인 후 다시 미리보기 해주세요.");
        // 철회 표시와 직렬화한다. 렌더 중 철회·수정된 PDF의 재업로드도 거절한다.
        if (prepared.sourceHarumadi) await tx.$queryRaw`SELECT e.id FROM journal_entries e JOIN harumadi_entry_links l ON l.entry_id = e.id WHERE l.harumadi_id = ${prepared.sourceHarumadi.id} AND e.id = ANY(${prepared.entryIds}::text[]) ORDER BY e.id FOR UPDATE OF e`;
        else await tx.$queryRaw`SELECT id FROM journal_entries WHERE owner_id = ${user.id} AND id = ANY(${prepared.entryIds}::text[]) ORDER BY id FOR UPDATE`;
        const entries = await tx.journalEntry.findMany({ where: { ...(prepared.sourceHarumadi ? { sensitiveContent: false, harumadiEntries: { some: { harumadiId: prepared.sourceHarumadi.id } } } : { ownerId: user.id }), id: { in: prepared.entryIds } },
          select: { sensitiveContent: true, sensitiveConsentVersion: true, sensitiveWithdrawnAt: true, updatedAt: true } });
        if (entries.length !== prepared.entryIds.length || entries.some((entry) => entry.updatedAt.getTime() > prepared.issuedAt)) {
          throw new HarumadiPdfApprovalError("기록이 바뀌었어요. 최신 내용으로 다시 미리보기 해주세요.", 409);
        }
        entries.forEach((entry) => assertSensitiveJournalReadable(entry));
        return tx.harumadiPdf.create({
        data: {
          id,
          sensitivePolicyVersion: prepared.sensitivePolicyVersion,
          ownerId: user.id,
          title: prepared.title,
          coverStyle: prepared.coverStyle ?? null,
          entryIds: prepared.entryIds,
          objectKey: storedObjectKey,
          pageCount: prepared.pageCount,
        },
        select: {
          id: true,
          title: true,
          entryIds: true,
          pageCount: true,
          createdAt: true,
        },
        });
      });
      const response: HarumadiPdfResponse = {
        harumadiPdf: {
          id: created.id,
          title: created.title,
          entryCount: created.entryIds.length,
          pageCount: created.pageCount,
          createdAt: created.createdAt.toISOString(),
        },
      };
      return withCors(request, Response.json(response, { status: 201 }));
    } finally {
      creating = false;
    }
  } catch (error) {
    if (objectKey) {
      try {
        await deleteStoredHarumadiPdf(objectKey);
      } catch {
        console.error("DB 저장에 실패한 하루마디 PDF를 정리하지 못했습니다.");
        await writeDiagnosticLogSafely({ code: "STORAGE_UNAVAILABLE", component: "harumadiPdf" });
      }
    }
    const knownError =
      error instanceof HarumadiPdfApprovalError ||
      error instanceof SensitiveJournalPolicyError;
    if (!knownError) {
      console.error("하루마디를 완성하지 못했습니다.");
      await writeDiagnosticLogSafely({ code: "UNEXPECTED_FAILURE", component: "harumadiPdf" });
    }
    return withCors(
      request,
      Response.json(
        {
          error: knownError
            ? error.message
            : "하루마디를 완성하지 못했어요. 잠시 후 다시 시도해주세요.",
        },
        { status: knownError ? error.status : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function forbidden() {
  return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
}

function unauthorized() {
  return Response.json({ error: "사용자 인증이 필요해요." }, { status: 401 });
}
