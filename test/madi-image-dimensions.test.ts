import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import * as crypto from "node:crypto";

test("서버가 실제 변환 사진의 비율·크기를 확인하고 유지·삭제 시 메타데이터를 함께 처리한다", async () => {
  const objects: Buffer[] = [];
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/server/journal/imageStorage.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, Buffer, crypto, process: { env: {} }, require: (name: string) => {
    if (name === "node:crypto") return crypto;
    if (name === "sharp") return { __esModule: true, default: sharp };
    if (name === "@/server/storage/objectStorage") return { isObjectStorageEnabled: () => true, putObject: async ({ body }: { body: Buffer }) => { objects.push(body); }, deleteObject() {} };
    throw Error(name);
  } });
  type Prepared = { image: string | null; uploadedKey: string | null; imageWidth: number | null; imageHeight: number | null };
  const prepare = exports.prepareJournalImage as (input: Record<string, unknown>) => Promise<Prepared>;
  for (const [width, height] of [[1600, 1200], [1200, 1600], [900, 1600], [1000, 1000]]) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: "#5a7d64" } }).jpeg().toBuffer();
    const result = await prepare({ ownerId: "synthetic-owner", entryId: "synthetic-entry", image: `data:image/jpeg;base64,${bytes.toString("base64")}`, imageWidth: 1, imageHeight: 999999 });
    const actual = await sharp(objects.at(-1)!).metadata();
    assert.equal(result.imageWidth, actual.width); assert.equal(result.imageHeight, actual.height);
    assert.ok(Math.abs(result.imageWidth! / result.imageHeight! - width / height) < .002);
    assert.ok(Math.max(result.imageWidth!, result.imageHeight!) <= 1200);
    const count = objects.length;
    const unchanged = await prepare({ ownerId: "synthetic-owner", entryId: "synthetic-entry", image: result.image, currentImage: result.image, currentSize: result });
    assert.equal(objects.length, count); assert.equal(unchanged.imageHeight, result.imageHeight);
    assert.equal(unchanged.uploadedKey, null);
  }
  const rotatedBytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#5a7d64" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rotated = await prepare({ ownerId: "synthetic-owner", entryId: "synthetic-entry", image: `data:image/jpeg;base64,${rotatedBytes.toString("base64")}` });
  assert.equal(rotated.imageWidth, 675); assert.equal(rotated.imageHeight, 1200);
  assert.deepEqual(JSON.parse(JSON.stringify(await prepare({ image: null }))), { image: null, uploadedKey: null, imageWidth: null, imageHeight: null });
});
