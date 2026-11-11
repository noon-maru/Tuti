import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeHarumadiAudience, harumadiSharingLabel, harumadiSharingNotice } from "@/shared/harumadi/sharingAudience";
import { MadiCreateScreen } from "@/features/tuti/screens/journal/MadiCreateScreen";
import { MadiHarumadiSelection } from "@/features/tuti/screens/journal/MadiHarumadiSelection";
import { HarumadiCarousel } from "@/features/tuti/components/HarumadiCarousel";
import { harumadiContent } from "./fixtures/harumadiContent";

test("공유 대상은 본인을 빼고 표시 이름 하나와 나머지 인원만 전달한다", () => {
  const people = [{ userId: "me", displayName: "내 이름" }, { userId: "a", displayName: " 민지 " }, { userId: "b", displayName: null }, { userId: "c", displayName: "지수" }];
  assert.deepEqual(makeHarumadiAudience("me", people), { count: 3, names: ["민지"] });
  assert.deepEqual(makeHarumadiAudience("a", people), { count: 3, names: ["내 이름"] });
  assert.deepEqual(makeHarumadiAudience("me", people.slice(0, 1)), { count: 0, names: [] });
  const book = { shared: true, sharingAudience: makeHarumadiAudience("me", people) };
  assert.equal(harumadiSharingLabel(book), "민지님 외 2명과 함께");
  assert.equal(harumadiSharingNotice(book), "민지님 외 2명에게 보여요.");
});

test("개인 책·참여자 0명·이름 없음·미확인 캐시를 구분하며 가짜 이름을 만들지 않는다", () => {
  assert.equal(harumadiSharingLabel({ shared: false }), null);
  assert.equal(harumadiSharingNotice({ shared: false }), "나만 보는 하루마디에 담아요.");
  assert.equal(harumadiSharingLabel({ shared: true, sharingAudience: { count: 0, names: [] } }), "아직 나만 참여 중");
  assert.match(harumadiSharingNotice({ shared: true, sharingAudience: { count: 0, names: [] } }), /참여자가 생기면/);
  assert.equal(harumadiSharingNotice({ shared: true, sharingAudience: { count: 2, names: [] } }), "2명에게 보여요.");
  assert.equal(harumadiSharingLabel({ shared: true }), "함께 채우는 중");
  assert.equal(harumadiSharingNotice({ shared: true }), "함께 채우는 사람들에게 보여요.");
});

test("책장·담기 선택·작성 시작은 같은 실제 공유 대상 문구를 표시한다", () => {
  const client = new QueryClient();
  const book = { ...harumadiContent().harumadi, shared: true, sharingAudience: { count: 2, names: ["민지"] } };
  client.setQueryData(["library-harumadis", "owner", "all"], { pages: [{ harumadis: [book], nextCursor: null }], pageParams: [undefined] });
  client.setQueryData(["recent-harumadis", "owner"], { harumadis: [] });
  try {
    const render = (child: React.ReactElement) => renderToStaticMarkup(createElement(QueryClientProvider, { client }, child));
    assert.match(render(createElement(HarumadiCarousel, { books: [book], ownerId: "owner", onOpen() {} })), /민지님 외 1명과 함께/);
    assert.match(render(createElement(MadiHarumadiSelection, { ownerId: "owner", entryId: "entry", onDone() {}, onNext() {} })), /민지님 외 1명에게 보여요/);
    assert.match(render(createElement(MadiCreateScreen, { inHarumadi: true, destination: book, onBack() {}, onCollection() {} })), /민지님 외 1명에게 보여요/);
  } finally { client.clear(); }
  const server = readFileSync("src/server/harumadi/service.ts", "utf8");
  assert.match(server, /members: \{ where: \{ endedAt: null \}/);
  assert.match(server, /member.user.displayName/);
  assert.match(server, /await requireHarumadiAccess\(tx, ownerId, id\);[\s\S]*?select: togetherSelection/);
  assert.doesNotMatch(server.slice(server.indexOf("const togetherSelection"), server.indexOf("function dto")), /email|authIdentity/);
});

test("실제 책 조회는 접근권 확인 후 활성 참여자만 요약하고 접근 불가 계정에는 반환하지 않는다", async t => {
  const previousFlag = process.env.HARUMADI_TOGETHER_ENABLED;
  process.env.HARUMADI_TOGETHER_ENABLED = "true";
  const previous = (globalThis as { prisma?: unknown }).prisma;
  t.after(() => { (globalThis as { prisma?: unknown }).prisma = previous; if (previousFlag === undefined) delete process.env.HARUMADI_TOGETHER_ENABLED; else process.env.HARUMADI_TOGETHER_ENABLED = previousFlag; });
  const members = [{ userId: "me", user: { displayName: "나" }, endedAt: null }, { userId: "friend", user: { displayName: "민지" }, endedAt: null }, { userId: "left", user: { displayName: "떠난 사람" }, endedAt: new Date() }];
  let reads = 0;
  const tx = { harumadi: {
    findUnique: async ({ select }: { select: { members: { where: { userId: string } } } }) => ({ ownerId: "maker", collaborationStartedAt: new Date(), members: members.filter(member => member.userId === select.members.where.userId && !member.endedAt) }),
    findUniqueOrThrow: async ({ select }: { select: { members: { where: { endedAt: null } } } }) => {
      reads++; assert.equal(select.members.where.endedAt, null);
      return { ...harumadiContent().harumadi, ownerId: "maker", owner: { displayName: "정연한" }, collaborationStartedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), entries: [], members: members.filter(member => !member.endedAt) };
    },
  } };
  (globalThis as { prisma?: unknown }).prisma = { $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) };
  const { readHarumadi } = await import("@/server/harumadi/service");
  const book = await readHarumadi("me", "book");
  assert.deepEqual(book.sharingAudience, { count: 2, names: ["정연한"] });
  assert.equal(book.participantCount, 3);
  assert.doesNotMatch(JSON.stringify(book.sharingAudience), /떠난 사람|userId|email/);
  await assert.rejects(readHarumadi("stranger", "book"), { status: 404 });
  await assert.rejects(readHarumadi("left", "book"), { status: 404 });
  assert.equal(reads, 1, "권한이 없는 계정은 참여자 이름 조회까지 진행하지 않는다");
});
