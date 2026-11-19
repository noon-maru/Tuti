import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { preparePetPhoto } from "@/server/pets/photo";
import { readHarumadiBody } from "@/server/harumadi/http";

test("선택하지 않은 사진은 보존하고 명시적 삭제만 null로 처리한다", async () => {
  assert.equal(await preparePetPhoto({ name: "모모" }), undefined);
  assert.equal(await preparePetPhoto({ photo: null }), null);
  for (const photo of ["https://remote.invalid/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,YmFk", 1, "x".repeat(720_001)]) {
    await assert.rejects(preparePetPhoto({ photo }));
  }
});
test("사진은 작은 정사각 WebP로 저장하고 EXIF와 원본은 보관하지 않는다", async () => {
  const source = await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#eee" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await preparePetPhoto({ photo: `data:image/jpeg;base64,${source.toString("base64")}` });
  const bytes = Buffer.from(result!.split(",")[1], "base64");
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "webp"); assert.equal(meta.width, 384); assert.equal(meta.height, 384);
  assert.equal(meta.exif, undefined); assert.equal(meta.orientation, undefined);
  assert.ok(bytes.length <= 128 * 1024);
});
test("확대한 사진 입력 한도는 프로필 요청에서만 적용하며 일반 설정 한도는 유지한다", async () => {
  const request = () => new Request("https://tuti.invalid/api/pets", { method: "POST", body: JSON.stringify({ photo: "a".repeat(20_000) }) });
  await assert.rejects(readHarumadiBody(request()), /너무 커요/);
  const body = await readHarumadiBody(request(), 740_000) as { photo: string };
  assert.equal(body.photo.length, 20_000);
  await assert.rejects(readHarumadiBody(new Request("https://tuti.invalid/api/pets", { method: "POST", body: "x".repeat(740_001) }), 740_000), /너무 커요/);
});
