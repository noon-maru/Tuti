import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

let role = "admin";
let exists = true;
let fails = false;
let next = 0n;
const rows: Array<{ number: bigint; purpose: string; createdAt: Date; subjectUserId: string }> = [];
const subject = "179d8c32-485b-4236-8a58-9807c692dff5";
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async ({ where }: { where: { tokenHash?: string } }) => where.tokenHash ? {
    id: "operator", role, lastAccessedAt: new Date(), authIdentities: [{ id: "identity", provider: "email", email: "operator@example.test" }],
  } : exists ? { id: subject } : null },
  $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
    if (fails) throw new Error("database unavailable");
    if (sql.join("").includes("INSERT")) {
      const row = { number: ++next, purpose: values[2] as string, createdAt: new Date(), subjectUserId: values[0] as string };
      rows.push(row);
      return [row];
    }
    if (sql.join("").includes("WHERE number")) {
      return rows.filter((row) => row.number === values[0] && row.subjectUserId === values[1]);
    }
    return rows.filter((row) => row.subjectUserId === values[0]).slice().reverse();
  },
};
const { GET, POST } = await import("@/app/api/admin/processing-cases/route");
const { resolveProcessingCase } = await import("@/server/admin/processingCases");
function request(method: "GET" | "POST", body: unknown = { purpose: "support" }, authenticated = true, origin = "https://tuti.today") {
  return new Request(`https://tuti.today/api/admin/processing-cases?userId=${subject}`, {
    method, headers: { Origin: origin, ...(authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

test("처리 요청 자동 채번·재사용·서버 접근 제어", async () => {
  assert.equal((await POST(request("POST", undefined, false))).status, 401);
  role = "user";
  assert.equal((await GET(request("GET"))).status, 403);
  assert.equal((await POST(request("POST"))).status, 403);
  role = "admin";
  assert.equal((await POST(request("POST", {}, true, "https://other.example"))).status, 403);
  assert.equal((await POST(request("POST", { purpose: "curiosity" }))).status, 400);
  exists = false;
  assert.equal((await POST(request("POST"))).status, 404);
  exists = true;
  const responses = await Promise.all(Array.from({ length: 10 }, () => POST(request("POST"))));
  assert.ok(responses.every((response) => response.status === 201));
  const references = await Promise.all(responses.map(async (response) => (await response.json()).processingCase.reference));
  assert.equal(new Set(references).size, 10);
  assert.equal(references[0], "CASE-000001");
  const listed = await GET(request("GET"));
  assert.match(listed.headers.get("cache-control") ?? "", /no-store/);
  const body = await listed.json();
  assert.equal(body.cases.length, 10);
  assert.doesNotMatch(JSON.stringify(body), /operator|subjectUserId|actorUserId|email/);
  assert.equal((await resolveProcessingCase(subject, references[0]))?.purpose, "support");
  assert.equal((await resolveProcessingCase(subject, references[0]))?.reference, references[0]);
  assert.equal(next, 10n, "후속 조회는 새 번호를 발급하지 않는다");
  assert.equal(await resolveProcessingCase("another-user", references[0]), null);
  assert.equal(await resolveProcessingCase(subject, "CASE-0000001"), null);
  assert.equal(await resolveProcessingCase(subject, "CASE-9999999999999999999"), null);
  fails = true;
  assert.equal((await POST(request("POST"))).status, 500);
  assert.equal((await GET(request("GET"))).status, 500);
});

test("수동 입력을 없애고 선택한 요청을 페이지 이동에도 재사용한다", () => {
  const source = readFileSync("src/features/admin/AdminUserJournalsPanel.tsx", "utf8");
  assert.doesNotMatch(source, /<input id="journal-access-reference"/);
  assert.match(source, /<select id="journal-access-reference"/);
  assert.match(source, /새 요청 등록·번호 자동 발급/);
  assert.match(source, /authorization.userId !== user.id/);
  assert.match(source, /creatingRef.current/);
});
