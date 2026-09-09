import { randomUUID } from "node:crypto";

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
import {
  JournalBookRenderError,
  renderOwnedJournalBook,
} from "@/server/journal/renderBook";
import {
  parseJournalBookInput,
  type JournalBookResponse,
  type JournalBooksResponse,
} from "@/shared/api/journalBook";

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
    const body = (await request.json()) as { input?: unknown; pageCount?: unknown };
    const input = parseJournalBookInput(body.input);
    const pageCount = Number(body.pageCount);
    if (!input || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100) {
      return withCors(
        request,
        Response.json({ error: "기록집 내용을 확인해주세요." }, { status: 400 }),
      );
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
      const id = randomUUID();
      const pdf = await renderOwnedJournalBook(user.id, input);
      objectKey = await storeJournalBookPdf(user.id, id, pdf);
      const created = await prisma.journalBook.create({
        data: {
          id,
          ownerId: user.id,
          title: input.title,
          entryIds: input.entryIds,
          objectKey,
          pageCount,
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
    const invalidJson = error instanceof SyntaxError;
    const renderError = error instanceof JournalBookRenderError;
    if (!invalidJson && !renderError)
      console.error("기록집을 완성하지 못했습니다.", error);
    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 내용을 확인해주세요."
            : renderError
              ? error.message
              : "기록집을 완성하지 못했어요. 잠시 후 다시 시도해주세요.",
        },
        { status: invalidJson ? 400 : renderError ? error.status : 500 },
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
