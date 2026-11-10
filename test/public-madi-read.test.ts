import assert from "node:assert/strict";
import test from "node:test";
import { PublicMadiUnavailable, readPublicMadi } from "@/lib/publicMadiRead";

test("공유 마디의 삭제와 일시적인 연결·권한·서버 오류를 구분한다", async () => {
  for (const status of [404, 410]) await assert.rejects(readPublicMadi("id", async () => new Response(null, { status }), new AbortController().signal), PublicMadiUnavailable);
  for (const status of [401, 403, 429, 500, 503]) await assert.rejects(readPublicMadi("id", async () => new Response(null, { status }), new AbortController().signal), error => error instanceof Error && !(error instanceof PublicMadiUnavailable));
  await assert.rejects(readPublicMadi("id", async () => { throw new TypeError("offline"); }, new AbortController().signal), TypeError);
});

test("사진만 실패하면 본문을 유지하고 같은 주소의 재시도는 사진도 복원한다", async () => {
  let broken = true;
  const request = async (path: string) => path.startsWith("public/journal-entries/")
    ? Response.json({ entry: { publicId: "id", content: "남긴 이야기", image: "/api/public/photo" } })
    : broken ? new Response(null, { status: 503 }) : new Response("image");
  const first = await readPublicMadi("id", request, new AbortController().signal);
  assert.equal(first.entry.content, "남긴 이야기"); assert.equal(first.imageFailed, true); assert.equal(first.image, null);
  broken = false;
  const retry = await readPublicMadi("id", request, new AbortController().signal);
  assert.equal(retry.imageFailed, false); assert.equal(await retry.image!.text(), "image");
});

test("중단된 사진 요청을 정상적인 본문 로드로 오인하지 않는다", async () => {
  const controller = new AbortController();
  await assert.rejects(readPublicMadi("id", async path => {
    if (path.startsWith("public/journal")) return Response.json({ entry: { image: "/api/photo" } });
    controller.abort(); throw new Error("aborted");
  }, controller.signal), /aborted/);
});
