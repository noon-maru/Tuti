import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "admin-journal-test-signing-secret";

const userId = "179d8c32-485b-4236-8a58-9807c692dff5";
let role: "admin" | "user" = "admin";
let targetExists = true;
let auditFails = false;
let reads = 0;
const audits: unknown[] = [];
const queries: Array<{ where: unknown; skip: number; take: number }> = [];
const entries = Array.from({ length: 21 }, (_, index) => ({
  id: `journal-${index}`,
  ownerId: userId,
  title: "비공개 기록 제목",
  content: "개인 기록 본문",
  image: "journal-images/private-image.webp",
  placeName: "남긴 공간",
  crowd: "미정",
  difficulty: "미정",
  theme: "미정",
  publicationStatus: index === 0 ? "private" : "hidden",
  visitedAt: new Date("2026-10-12T03:00:00Z"),
  createdAt: new Date("2026-10-12T14:21:39Z"),
  updatedAt: new Date("2026-10-12T14:21:39Z"),
}));

// 이 파일의 테스트 프로세스 안에서만 사용한다. 실제 DB에는 연결하지 않는다.
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
      if (where.tokenHash) return {
        id: "test-operator",
        role,
        displayName: "운영자",
        lastAccessedAt: new Date(),
        authIdentities: [{ id: "test-identity", email: "operator@example.test", provider: "email" }],
      };
      return targetExists ? { id: where.id } : null;
    },
  },
  journalEntry: {
    count: async () => { reads += 1; return entries.length; },
    findMany: async (query: { where: unknown; skip: number; take: number }) => {
      reads += 1;
      queries.push(query);
      return entries.slice(query.skip, query.skip + query.take);
    },
  },
  systemLog: {
    create: async (input: unknown) => {
      if (auditFails) throw new Error("test audit unavailable");
      audits.push(input);
    },
  },
};
(globalThis as { prisma?: unknown }).prisma = fakePrisma;
const { POST, GET } = await import("@/app/api/admin/user-journals/route");

function request(query = `userId=${userId}`, authenticated = true, origin?: string, body: unknown = { purpose: "support", reference: "INQUIRY-123" }) {
  return new Request(`https://tuti.today/api/admin/user-journals?${query}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      ...(authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  });
}

test("관리자 기록 조회의 접근 제어·페이지 이동·감사 기록", async (t) => {
  await t.test("비로그인·일반 사용자·다른 출처는 기록에 접근할 수 없다", async () => {
    assert.equal((await POST(request("", false))).status, 401);
    role = "user";
    assert.equal((await POST(request())).status, 403);
    role = "admin";
    assert.equal((await POST(request(undefined, true, "https://other.example"))).status, 403);
    assert.equal(reads, 0);
  });

  await t.test("잘못된 입력과 존재하지 않는 사용자는 조회하지 않는다", async () => {
    for (const query of ["", "userId=bad-id", `userId=${userId}&page=0`, `userId=${userId}&page=1.5`]) {
      assert.equal((await POST(request(query))).status, 400);
    }
    targetExists = false;
    assert.equal((await POST(request())).status, 404);
    targetExists = true;
    assert.equal(reads, 0);
  });

  await t.test("사유 없는 조회·임의 목적·개인정보가 든 처리 번호를 거절한다", async () => {
    for (const body of [{}, { purpose: "curiosity", reference: "TEST-123" }, { purpose: "support", reference: "user@example.com" }, { purpose: "support", reference: "a" }]) {
      assert.equal((await POST(request(undefined, true, undefined, body))).status, 400);
    }
    assert.equal((await GET(new Request(`https://tuti.today/api/admin/user-journals?userId=${userId}`))).status, 405);
    assert.equal(reads, 0);
  });

  await t.test("비공개·숨김 기록을 포함하고 이미지에는 서명된 URL을 사용한다", async () => {
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const body = await response.json();
    assert.equal(body.total, 21);
    assert.equal(body.entries.length, 20);
    assert.equal(body.entries[0].publicationStatus, "private");
    assert.equal(body.entries[1].publicationStatus, "hidden");
    assert.match(body.entries[0].image, /^\/api\/journal-entry-images\/journal-0\?signature=/);
    assert.equal(body.entries[0].ownerId, undefined);
    assert.equal(body.entries[0].createdAt, "2026-10-12T14:21:39.000Z");
    assert.deepEqual(queries.at(-1)?.where, { ownerId: userId });
    const audit = JSON.stringify(audits.at(-1));
    assert.match(audit, /journal.admin.viewed/);
    assert.match(audit, /test-operator/);
    assert.match(audit, /INQUIRY-123/);
    assert.match(audit, /support/);
    assert.match(audit, new RegExp(userId));
    assert.doesNotMatch(audit, /개인 기록 본문|비공개 기록 제목|signature|private-image/);
  });

  await t.test("페이지 범위를 제한해 마지막 기록까지 조회한다", async () => {
    const body = await (await POST(request(`userId=${userId}&page=999`))).json();
    assert.equal(body.page, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.entries.length, 1);
    assert.equal(queries.at(-1)?.skip, 20);
    assert.equal(queries.at(-1)?.take, 20);
  });

  await t.test("감사 로그를 저장하지 못하면 비공개 내용을 반환하지 않는다", async (t) => {
    auditFails = true;
    t.mock.method(console, "error", () => {});
    const response = await POST(request());
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.entries, undefined);
    auditFails = false;
  });
});
