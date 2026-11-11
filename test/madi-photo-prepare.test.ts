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
  assert.equal(screen.control("이야기 덧붙이기선택")["aria-expanded"], false);
  screen.click("사진으로 마디 남기기");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved?.image, "data:image/jpeg;base64,synthetic"); assert.equal(saved?.content, "");
});
test("사진의 선택 입력을 접어도 이야기·제목은 보존하고 사진을 빼면 글 입력이 다시 보인다", async () => {
  const screen = madiCreateHarness(props, "photo");
  await choose(screen);
  screen.click("이야기 덧붙이기선택");
  assert.equal(screen.control("이야기 접기선택")["aria-expanded"], true);
  screen.change("마디 제목 (선택)", "오래 남길 제목");
  screen.change("기억하고 싶은 이야기", "접어도 남길 이야기");
  screen.click("이야기 접기선택");
  assert.equal(screen.control("기억하고 싶은 이야기").value, "접어도 남길 이야기");
  assert.equal(findMadiControl(screen.render(), p => p.id === "madi-story-fields")?.hidden, true);
  screen.click("사진 빼기");
  assert.equal(findMadiControl(screen.render(), p => p.id === "madi-story-fields")?.hidden, false);
  assert.equal(screen.control("마디 제목 (선택)").value, "오래 남길 제목");
  assert.equal(screen.control("기억하고 싶은 이야기").value, "접어도 남길 이야기");
});
test("늦은 촬영일은 직접 고친 날짜·저장 시작 이후의 날짜를 변경하지 않는다", async () => {
  let metadata!: (value: { captureDate: string }) => void;
  const screen = madiCreateHarness(props, "photo", {
    "@/features/tuti/lib/readImageMetadata": { readImageMetadata: () => new Promise(resolve => { metadata = resolve; }) },
  });
  await choose(screen);
  screen.change("마디 날짜", "2026-01-02");
  metadata({ captureDate: "2025-01-01" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(screen.control("마디 날짜").value, "2026-01-02");
  let late!: (value: { captureDate: string }) => void;
  const saving = madiCreateHarness({ ...props, onSave: async () => { throw Error("저장 실패"); } }, "photo", {
    "@/features/tuti/lib/readImageMetadata": { readImageMetadata: () => new Promise(resolve => { late = resolve; }) },
  });
  await choose(saving);
  const date = saving.control("마디 날짜").value;
  saving.click("사진으로 마디 남기기"); await new Promise(resolve => setImmediate(resolve));
  late({ captureDate: "2025-01-01" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(saving.control("마디 날짜").value, date);
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
test("사진 처리 시작 직전의 저장 콜백도 저장을 막고 뒤로가기 이후 사진 응답은 버린다", async () => {
  let resolve!: (photo: string) => void, saved = 0;
  const screen = madiCreateHarness({ ...props, onSave: async () => { saved++; return harumadiContent().entries[0]; } }, "write", {
    "@/features/tuti/lib/prepareMadiPhoto": { prepareMadiPhoto: () => new Promise<string>(done => { resolve = done; }) },
  });
  screen.change("기억하고 싶은 이야기", "남겨둘 글");
  const staleSave = screen.control("새로운 마디 남기기").onClick as () => void;
  const pending = choose(screen);
  staleSave(); assert.equal(saved, 0);
  screen.click("이전으로");
  resolve("data:image/jpeg;base64,late"); await pending;
  assert.equal(findMadiControl(screen.render(), p => p.src === "data:image/jpeg;base64,late"), undefined);
});
