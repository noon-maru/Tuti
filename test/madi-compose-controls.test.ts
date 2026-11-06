import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JournalPlacePicker } from "@/features/tuti/components/JournalPlacePicker";
import { JournalEditorScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";
import { harumadiContent } from "./fixtures/harumadiContent";

test("장소는 검색과 별개로 직접 입력·지우기가 가능하고 길이 제한을 공유한다", () => {
  const html = renderToStaticMarkup(createElement(JournalPlacePicker, {
    value: "우리 집 앞 벤치", placeId: null, onTextChange() {}, onChange() {},
  }));
  assert.match(html, /aria-label="장소 \(선택\)"/);
  assert.match(html, /value="우리 집 앞 벤치"/);
  assert.match(html, /maxLength="120"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /장소 빼기/);
  for (const name of ["MadiCreateScreen", "JournalEditorScreen"]) {
    const source = readFileSync(`src/features/tuti/screens/journal/${name}.tsx`, "utf8");
    assert.match(source, /<JournalPlacePicker/);
    assert.match(source, /onTextChange=\{value => \{/);
    const edit = source.slice(source.indexOf("onTextChange={value => {"), source.indexOf("onTextChange={value => {") + 220);
    assert.match(edit, /setPlaceId\(null\)/, "직접 수정하면 검색된 장소 ID를 함께 지운다");
  }
});

test("사진 빼기는 글·제목·날짜·장소를 지우지 않고 늦게 도착한 사진 메타데이터를 무효화한다", () => {
  for (const name of ["MadiCreateScreen", "JournalEditorScreen"]) {
    const source = readFileSync(`src/features/tuti/screens/journal/${name}.tsx`, "utf8");
    const action = source.slice(source.indexOf("const removePhoto ="), source.indexOf("const removePhoto =") + 300).split("};")[0];
    assert.match(action, /current \+= 1/);
    assert.match(action, /setImage(?:Url)?\(null\)/);
    assert.doesNotMatch(action, /setTitle|setContent|setBody|setDate|setVisitDate|setPlaceName|setPlaceId/);
    assert.match(source, /사진 바꾸기/);
    assert.match(source, /사진 빼기/);
  }
  const html = renderToStaticMarkup(createElement(JournalEditorScreen, {
    entry: { ...harumadiContent().entries[0], image: "data:image/jpeg;base64,YQ==" }, onBack() {}, onSubmit() {},
  }));
  assert.match(html, /사진 바꾸기/);
  assert.match(html, /사진 빼기/);
});
