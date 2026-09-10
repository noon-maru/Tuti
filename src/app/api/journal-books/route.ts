import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
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
  readJournalBookPdf,
  verifyJournalBookApproval,
} from "@/server/journal/bookApproval";

export const runtime = "nodejs";

let creating = false;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return forbidden();
  try {
    const user = await authenticateUser(request);
    if (!user) return withCors(request, unauthorized());
    const books = await prisma.journalBook.findMany({
      where: { ownerId: user.id },
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
  } catch (error) {
    console.error("완성한 기록집 목록을 불러오지 못했습니다.", error);
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
    const approvalToken = request.headers.get(
      "X-Tuti-Journal-Book-Approval",
    );
    if (
      !approvalToken ||
      !request.headers.get("Content-Type")?.startsWith("application/pdf")
    ) {
      return withCors(
        request,
        Response.json({ error: "미리보기 승인 정보를 확인해주세요." }, { status: 400 }),
      );
    }
    const pdf = await readJournalBookPdf(request);
    const approved = verifyJournalBookApproval(user.id, approvalToken, pdf);
    const existing = await prisma.journalBook.findUnique({
      where: { id: approved.bookId },
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
      const id = approved.bookId;
      objectKey = await storeJournalBookPdf(user.id, id, pdf);
      const created = await prisma.journalBook.create({
        data: {
          id,
          ownerId: user.id,
          title: approved.title,
          entryIds: approved.entryIds,
          objectKey,
          pageCount: approved.pageCount,
        },
        select: {
          id: true,
          title: true,
          entryIds: true,
          pageCount: true,
          createdAt: true,
        },
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
      } catch (cleanupError) {
        console.error("DB 저장에 실패한 기록집 PDF를 정리하지 못했습니다.", cleanupError);
      }
    }
    const approvalError = error instanceof JournalBookApprovalError;
    if (!approvalError)
      console.error("기록집을 완성하지 못했습니다.", error);
    return withCors(
      request,
      Response.json(
        {
          error: approvalError
            ? error.message
            : "기록집을 완성하지 못했어요. 잠시 후 다시 시도해주세요.",
        },
        { status: approvalError ? error.status : 500 },
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
