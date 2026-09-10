import type { BookEntry } from "../pdf/journalBook";
import {
  parseJournalBookInput,
  type JournalBookInput,
} from "../../shared/api/journalBook";

type Dependencies = {
  authenticate: (request: Request) => Promise<{ id: string } | null>;
  findEntries: (ownerId: string, ids: string[]) => Promise<BookEntry[]>;
  render: (
    input: JournalBookInput,
    entries: BookEntry[],
  ) => Promise<Uint8Array>;
  approve: (
    ownerId: string,
    input: JournalBookInput,
    pdf: Uint8Array,
  ) => Promise<string>;
};

export function createBookPreviewHandler(dependencies: Dependencies) {
  // Bound expensive renders per server process. No user content is kept here.
  let rendering = false;
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "private, no-store" };
    const fail = (error: string, status: number) =>
      Response.json({ error }, { status, headers });
    try {
      const user = await dependencies.authenticate(request);
      if (!user) return fail("사용자 인증이 필요해요.", 401);
      const reader = request.body?.getReader();
      if (!reader) return fail("기록집 내용을 확인해주세요.", 400);
      let body = "";
      let size = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16_384) {
            await reader.cancel();
            return fail("기록집 입력이 너무 길어요.", 413);
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      const input = parseJournalBookInput(JSON.parse(body));
      if (!input) return fail("선택한 기록과 제목을 확인해주세요.", 400);
      if (rendering)
        return fail(
          "다른 기록집을 만들고 있어요. 잠시 후 다시 시도해주세요.",
          429,
        );
      rendering = true;
      try {
        const entries = await dependencies.findEntries(user.id, input.entryIds);
        if (
          entries.length !== input.entryIds.length ||
          !input.entryIds.every((id) =>
            entries.some((entry) => entry.id === id),
          )
        ) {
          return fail(
            "선택한 기록을 찾지 못했어요. 기록을 다시 골라주세요.",
            404,
          );
        }
        if (
          entries.reduce(
            (length, entry) =>
              length +
              entry.content.length +
              entry.title.length +
              entry.placeName.length,
            0,
          ) > 60_000
        ) {
          return fail(
            "글이 많아 한 번에 만들기 어려워요. 기록을 나누어 골라주세요.",
            413,
          );
        }
        entries.sort(
          (a, b) =>
            a.visitedAt.getTime() - b.visitedAt.getTime() ||
            a.id.localeCompare(b.id),
        );
        const pdf = await dependencies.render(input, entries);
        const approval = await dependencies.approve(user.id, input, pdf);
        return new Response(new Uint8Array(pdf).buffer, {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": "inline; filename=tuti-preview.pdf",
            "X-Tuti-Journal-Book-Approval": approval,
          },
        });
      } finally {
        rendering = false;
      }
    } catch (error) {
      return fail(
        error instanceof SyntaxError
          ? "요청 내용을 확인해주세요."
          : "미리보기를 만들지 못했어요. 잠시 후 다시 시도해주세요.",
        error instanceof SyntaxError ? 400 : 500,
      );
    }
  };
}
