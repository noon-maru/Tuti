import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { cropOutputSize } from "../src/shared/harumadi/imageGeometry";
import { madiCreateHarness, findMadiControl } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import type { JournalEntryInput } from "../src/shared/api/journal";

test("사진 전체 비율을 유지해 1200px 이내로 재인코딩하고 임시 파일 URL은 성공·실패 모두 해제한다", async () => {
  for (const [width, height, fail] of [[900, 1600, false], [300, 200, false], [0, 0, true]] as const) {
    let revoked = 0, drawn: unknown[] = [];
    const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (...args: unknown[]) => { drawn = args; } }), toDataURL: (type: string, quality: number) => { assert.equal(type, "image/jpeg"); assert.equal(quality, .9); return "data:image/jpeg;base64,normalized"; } };
    class Image { naturalWidth = width; naturalHeight = height; onload?: () => void; onerror?: () => void; set src(_: string) { queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); } }
    const exports: { prepareMadiPhoto?: (file: unknown) => Promise<string> } = {};
    vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/lib/prepareMadiPhoto.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, require: () => ({ cropOutputSize }), Image, URL: { createObjectURL: () => "blob:selected", revokeObjectURL: () => { revoked++; } }, document: { createElement: () => canvas }, setTimeout, clearTimeout });
    if (fail) await assert.rejects(exports.prepareMadiPhoto!({}));
    else {
      assert.equal(await exports.prepareMadiPhoto!({}), "data:image/jpeg;base64,normalized");
      const size = cropOutputSize(width, height);
      assert.equal(canvas.width, size.width); assert.equal(canvas.height, size.height);
      assert.equal(drawn.length, 5); assert.deepEqual(drawn.slice(1), [0, 0, size.width, size.height]);
    }
    assert.equal(revoked, 1);
  }
});

const props = { onBack() {}, onCollection() {} };
async function choose(screen: ReturnType<typeof madiCreateHarness>, file = {} as File) {
  const input = screen.control("앨범 사진 선택");
  await (input.onChange as (event: unknown) => Promise<void>)({ target: { files: [file], value: "selected" } });
}
test("사진 선택은 맞추기를 열지 않고 글 없는 마디를 저장하며 사용자가 맞추기를 누를 때만 편집한다", async () => {
  let saved: JournalEntryInput | undefined;
  const screen = madiCreateHarness({ ...props, onSave: async input => { saved = input; return harumadiContent().entries[0]; } }, "photo");
  await choose(screen);
  assert.equal(findMadiControl(screen.render(), p => Boolean(p.source && p.onConfirm)), undefined);
  screen.click("사진 맞추기");
  const crop = findMadiControl(screen.render(), p => Boolean(p.source && p.onConfirm))!;
  assert.equal(crop.source, "data:image/jpeg;base64,synthetic");
  (crop.onCancel as () => void)();
  screen.click("새로운 마디 남기기");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved?.image, "data:image/jpeg;base64,synthetic"); assert.equal(saved?.content, "");
});
test("사진 준비 실패·이전 선택의 늦은 응답은 사진과 글을 덮어쓰지 않는다", async () => {
  const pending: Array<{ resolve: (image: string) => void; reject: () => void }> = [];
  const screen = madiCreateHarness(props, "write", {
    "@/features/tuti/lib/prepareMadiPhoto": { prepareMadiPhoto: () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject: () => reject(Error("decode")) })) },
  });
  screen.change("기억하고 싶은 이야기", "보존할 글");
  const first = choose(screen); const second = choose(screen);
  pending[1].resolve("data:image/jpeg;base64,current"); await second;
  pending[0].resolve("data:image/jpeg;base64,old"); await first;
  assert.ok(findMadiControl(screen.render(), p => p.src === "data:image/jpeg;base64,current"));
  const third = choose(screen); pending[2].reject(); await third;
  assert.ok(findMadiControl(screen.render(), p => p.src === "data:image/jpeg;base64,current"));
  assert.equal(screen.control("기억하고 싶은 이야기").value, "보존할 글");
  assert.ok(findMadiControl(screen.render(), p => p.role === "alert"));
});
