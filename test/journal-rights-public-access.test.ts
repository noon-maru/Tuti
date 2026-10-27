import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_ENABLED = "true";
process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED = "true";
let blocked = true;
let role = "admin";
let rightsReads = 0;
const publicId = "a".repeat(32);
const fake = {
  user: { findUnique: async () => ({ id: "operator", role, lastAccessedAt: new Date(), authIdentities: [{ id: "identity", email: "operator@example.test", provider: "email" }] }) },
  journalEntry: { findFirst: async () => ({ id: "entry", title: "제목", content: "내용", image: "journal-images/test.webp", ownerId: "author", publicId, publicationStatus: "published", publishedAt: new Date(), visitedAt: new Date(), placeName: "공간" }) },
  journalRightsCase: { findMany: async () => { rightsReads++; return blocked ? [{ state: "copyright_block", notices: [] }] : []; } },
};
(globalThis as { prisma?: unknown }).prisma = fake;
const publication = await import("@/server/journal/publication");
const api = await import("@/app/api/admin/journal-rights/route");
function request(auth = true, origin?: string) { return new Request("https://tuti.today/api/admin/journal-rights", { headers: { ...(auth ? { Authorization: `Bearer ${"a".repeat(40)}` } : {}), ...(origin ? { Origin: origin } : {}) } }); }
test("권리 침해 차단은 공개 HTML 진입·본문·이미지 모두에 적용된다", async () => {
  assert.equal(await publication.getPublicJournalAccessState(publicId), "rights_blocked");
  assert.equal(await publication.isPublicJournalEntryAvailable(publicId), false);
  assert.equal(await publication.getPublicJournalEntry(publicId), null);
  assert.equal(await publication.getPublicJournalImage(publicId), null);
  blocked = false;
  assert.equal(await publication.getPublicJournalAccessState(publicId), "available");
  assert.equal(await publication.isPublicJournalEntryAvailable(publicId), true);
  assert.equal((await publication.getPublicJournalEntry(publicId))?.title, "제목");
  assert.equal(await publication.getPublicJournalImage(publicId), "journal-images/test.webp");
});
test("권리 보호 관리자 API는 인증·관리자 권한·출처를 검증한다", async () => {
  const before = rightsReads;
  assert.equal((await api.GET(request(false))).status, 401);
  role = "user";
  assert.equal((await api.GET(request())).status, 403);
  role = "admin";
  assert.equal((await api.GET(request(true, "https://other.example"))).status, 403);
  assert.equal(rightsReads, before);
  delete process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED;
  const response = await api.GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal((await response.json()).enabled, false);
  assert.equal(rightsReads, before);
});
