import { writeDiagnosticLogSafely } from "@/server/admin/log";

import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { assertSensitiveJournalReadable, sensitiveJournalPolicyEnabled, SensitiveJournalPolicyError } from "@/server/journal/sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  deleteStoredJournalBook,
  storeJournalBookPdf,
} from "@/server/journal/bookStorage";
import type {
  JournalBookResponse,
  JournalBooksResponse,
} from "@/shared/api/journalBook";
import {
  JournalBookApprovalError,
  readJournalBookCompletionRequest,
} from "@/server/journal/bookApproval";

export const runtime = "nodejs";

let creating = false;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return forbidden();
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, unauthorized());
    const withdrawnEntries = await prisma.journalEntry.findMany({ where: { ownerId: user.id, sensitiveWithdrawnAt: { not: null } }, select: { id: true } });
    const books = await prisma.journalBook.findMany({
      where: { ownerId: user.id, ...(withdrawnEntries.length ? { NOT: { entryIds: { hasSome: withdrawnEntries.map((entry) => entry.id) } } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        entryIds: true,
        pageCount: true,
        createdAt: true,
      },
    });
    const response: JournalBooksResponse = {
      books: books.map((book) => ({
        id: book.id,
        title: book.title,
        entryCount: book.entryIds.length,
        pageCount: book.pageCount,
        createdAt: book.createdAt.toISOString(),
      })),
    };
    return withCors(request, Response.json(response));
  } catch {
    console.error("완성한 기록집 목록을 불러오지 못했습니다.");
    await writeDiagnosticLogSafely({ code: "UNEXPECTED_FAILURE", component: "book" });
    return withCors(
      request,
      Response.json({ error: "완성한 기록집을 불러오지 못했어요." }, { status: 500 }),
    );
  }
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) return forbidden();
  let objectKey: string | null = null;
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, unauthorized());
    const completion = await readJournalBookCompletionRequest(request, user.id);
    if (completion.kind === "approved-pdf") {
      const existing = await prisma.journalBook.findUnique({
        where: { id: completion.book.bookId },
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
          throw new JournalBookApprovalError(
            "미리보기 승인 정보를 확인할 수 없어요. 다시 미리보기 해주세요.",
            409,
          );
        }
        const response: JournalBookResponse = {
          book: {
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
          { error: "다른 기록집을 만들고 있어요. 잠시 후 다시 시도해주세요." },
          { status: 429 },
        ),
      );
    }
    creating = true;
    try {
      const prepared = { ...completion.book, pdf: completion.pdf };
      const id = prepared.bookId;
      objectKey = await storeJournalBookPdf(user.id, id, prepared.pdf);
      const storedObjectKey = objectKey;
      const created = await prisma.$transaction(async (tx) => {
        if (sensitiveJournalPolicyEnabled() && prepared.sensitivePolicyVersion !== SENSITIVE_JOURNAL_CONSENT_VERSION) throw new SensitiveJournalPolicyError("기록 보호 확인 후 다시 미리보기 해주세요.");
        // 철회 표시와 직렬화한다. 렌더 중 철회·수정된 PDF의 재업로드도 거절한다.
        await tx.$queryRaw`SELECT id FROM journal_entries WHERE owner_id = ${user.id} AND id = ANY(${prepared.entryIds}::text[]) ORDER BY id FOR UPDATE`;
        const entries = await tx.journalEntry.findMany({ where: { ownerId: user.id, id: { in: prepared.entryIds } },
          select: { sensitiveContent: true, sensitiveConsentVersion: true, sensitiveWithdrawnAt: true, updatedAt: true } });
        if (entries.length !== prepared.entryIds.length || entries.some((entry) => entry.updatedAt.getTime() > prepared.issuedAt)) {
          throw new JournalBookApprovalError("기록이 바뀌었어요. 최신 내용으로 다시 미리보기 해주세요.", 409);
        }
        entries.forEach((entry) => assertSensitiveJournalReadable(entry));
        return tx.journalBook.create({
        data: {
          id,
          sensitivePolicyVersion: prepared.sensitivePolicyVersion,
          ownerId: user.id,
          title: prepared.title,
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
      const response: JournalBookResponse = {
        book: {
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
        await deleteStoredJournalBook(objectKey);
      } catch {
        console.error("DB 저장에 실패한 기록집 PDF를 정리하지 못했습니다.");
        await writeDiagnosticLogSafely({ code: "STORAGE_UNAVAILABLE", component: "book" });
      }
    }
    const knownError =
      error instanceof JournalBookApprovalError ||
      error instanceof SensitiveJournalPolicyError;
    if (!knownError) {
      console.error("기록집을 완성하지 못했습니다.");
      await writeDiagnosticLogSafely({ code: "UNEXPECTED_FAILURE", component: "book" });
    }
    return withCors(
      request,
      Response.json(
        {
          error: knownError
            ? error.message
            : "기록집을 완성하지 못했어요. 잠시 후 다시 시도해주세요.",
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
