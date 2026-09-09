import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  createJournalBookFilename,
  emptyJournalBookDraft,
  parseJournalBookDraft,
  parseJournalBookInput,
} from "../src/shared/api/journalBook";
import { createJournalBookDraftStorage } from "../src/lib/journalBookDraft";
import { createBookPreviewHandler } from "../src/server/journal/bookPreview";
import {
  renderJournalBook,
  type BookEntry,
} from "../src/server/pdf/journalBook";

const input = {
  entryIds: ["entry-1"],
  title: "함께 걸었던 봄",
  letter: "고마워요.",
  coverEntryId: null,
};
const entry: BookEntry = {
  id: "entry-1",
  title: "공원에서",
  content: "잠깐 쉬어갔어요.",
  placeName: "작은 공원",
  visitedAt: new Date("2026-03-01T00:00:00Z"),
  image: null,
};
const request = (value: unknown = input) =>
  new Request("https://tuti.test/api/journal-books/preview", {
    method: "POST",
    body: JSON.stringify(value),
  });

test("기록집 제목을 기기에서 안전한 PDF 파일명으로 바꾼다", () => {
  assert.equal(
    createJournalBookFilename('  제주 / 봄: 기록?  '),
    "Tuti_제주 봄 기록.pdf",
  );
  assert.equal(createJournalBookFilename("   "), "Tuti_작은 기록집.pdf");
});

test("기록집은 고른 기록에 속한 표지만 허용하고 입력 범위를 제한한다", () => {
  assert.deepEqual(
    parseJournalBookInput({
      ...input,
      ownerId: "someone-else",
      content: "untrusted",
    }),
    input,
  );
  assert.equal(
    parseJournalBookInput({ ...input, coverEntryId: "someone-else" }),
    null,
  );
  assert.equal(
    parseJournalBookInput({ ...input, entryIds: ["entry-1", "entry-1"] }),
    null,
  );
  assert.equal(
    parseJournalBookInput({
      ...input,
      entryIds: Array.from({ length: 13 }, (_, i) => `id-${i}`),
    }),
    null,
  );
  assert.equal(parseJournalBookInput({ ...input, title: " " }), null);
  assert.equal(
    parseJournalBookInput({ ...input, letter: "x".repeat(1201) }),
    null,
  );
  assert.deepEqual(
    parseJournalBookDraft(emptyJournalBookDraft()),
    emptyJournalBookDraft(),
  );
  assert.equal(
    parseJournalBookDraft({ ...emptyJournalBookDraft(), title: "   " })?.title,
    "   ",
  );
  assert.equal(
    parseJournalBookDraft({ ...emptyJournalBookDraft(), version: 2 }),
    null,
  );
});

test("초안 저장 순서·사용자 분리·재진입·삭제와 저장 실패 복구", async () => {
  const values = new Map<string, string>();
  let rejectNext = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (rejectNext) {
        rejectNext = false;
        throw new Error("storage unavailable");
      }
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const drafts = createJournalBookDraftStorage(storage);
  const first = {
    ...emptyJournalBookDraft(),
    ...input,
    step: "details" as const,
  };
  const final = { ...first, title: "수정한 제목" };
  const writes = [
    drafts.saveJournalBookDraft("owner-a", first),
    drafts.saveJournalBookDraft("owner-a", final),
  ];
  await Promise.all(writes);
  assert.deepEqual(
    await createJournalBookDraftStorage(storage).loadJournalBookDraft(
      "owner-a",
    ),
    final,
  );
  assert.equal(await drafts.loadJournalBookDraft("owner-b"), null);
  rejectNext = true;
  await assert.rejects(drafts.saveJournalBookDraft("owner-a", first));
  await drafts.saveJournalBookDraft("owner-a", final);
  await drafts.removeJournalBookDraft("owner-a");
  assert.equal(await drafts.loadJournalBookDraft("owner-a"), null);
});

test("인증 및 소유권 확인 전에는 PDF를 생성하지 않는다", async () => {
  let rendered = false;
  let authenticated = false;
  const handler = createBookPreviewHandler({
    authenticate: async () => (authenticated ? { id: "owner-a" } : null),
    findEntries: async (ownerId, ids) => {
      assert.equal(ownerId, "owner-a");
      return ids.includes("entry-1") ? [entry] : [];
    },
    render: async () => {
      rendered = true;
      return new Uint8Array([1]);
    },
  });
  assert.equal((await handler(request())).status, 401);
  authenticated = true;
  assert.equal(
    (await handler(request({ ...input, entryIds: ["someone-elses-entry"] })))
      .status,
    404,
  );
  assert.equal(rendered, false);
  assert.equal(
    (await handler(request({ ...input, letter: "x".repeat(17000) }))).status,
    413,
  );
  assert.equal(
    (await handler(request({ ...input, entryIds: [] }))).status,
    400,
  );
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
});

test("생성 실패 후 재시도 가능하고 동시에 여러 PDF를 만들지 않는다", async () => {
  let release!: () => void;
  let fail = true;
  const handler = createBookPreviewHandler({
    authenticate: async () => ({ id: "owner-a" }),
    findEntries: async () => [entry],
    render: async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      if (fail) throw new Error("render failed");
      return new Uint8Array([1]);
    },
  });
  const first = handler(request());
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await handler(request())).status, 429);
  release();
  assert.equal((await first).status, 500);
  fail = false;
  const retry = handler(request());
  await new Promise((resolve) => setTimeout(resolve, 5));
  release();
  assert.equal((await retry).status, 200);
});

test("한글·긴 본문·사진·편지·지원하지 않는 이모지를 실제 PDF로 만든다", async () => {
  const image = await sharp({
    create: { width: 120, height: 240, channels: 3, background: "#ADD1F4" },
  })
    .jpeg()
    .toBuffer();
  const text =
    "함께 걸었던 길에서 잠깐 쉬어갔어요.\n".repeat(120) + "마지막문장확인";
  const pdf = await renderJournalBook(
    { ...input, entryIds: [entry.id, "entry-2"], coverEntryId: entry.id },
    [
      { ...entry, content: text, image },
      {
        ...entry,
        id: "entry-2",
        title: "사진 없는 날",
        content: "이모지 🌿 기록",
        image: null,
      },
    ],
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(pdf),
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
  });
  const document = await task.promise;
  assert.ok(document.numPages >= 5, "긴 글은 추가 페이지로 이어져야 한다");
  let contents = "";
  for (let n = 1; n <= document.numPages; n++) {
    const page = await document.getPage(n);
    const text = await page.getTextContent();
    contents += text.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("");
  }
  for (const expected of [
    input.title,
    "고마워요.",
    "마지막문장확인",
    "사진 없는 날",
    "□",
  ])
    assert.ok(contents.includes(expected), expected);
  assert.ok(!contents.includes("미리보기"), "완성 PDF에는 미리보기 문구가 없어야 한다");
  await task.destroy();
});
