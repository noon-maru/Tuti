import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { parseHarumadiSettings } from "../src/shared/api/harumadi";
import { harumadiPeriodLabel, harumadiPeriodData, serializeHarumadiPeriod, HARUMADI_TITLE_IDEAS } from "../src/shared/harumadi/period";
import { harumadiEditsDirty } from "../src/shared/harumadi/editState";
import { harumadiInviteShareContent } from "../src/shared/api/harumadiTogether";
import { HarumadiPeriodFields, HarumadiTitleIdeas } from "../src/features/tuti/components/HarumadiMemoryContext";
import { harumadiContent } from "./fixtures/harumadiContent";

const base = { title: "제주에서 보낸 사흘", coverStyle: "white-plain" };
const dates = { periodStart: "2026-11-20", periodEnd: "2026-11-22" };
test("기억 기간은 선택이며 기존 요청의 생략·명시적 해제·미래 일정과 잘못된 날짜를 구분한다", () => {
  assert.deepEqual(parseHarumadiSettings(base), base);
  assert.deepEqual(harumadiPeriodData({}), {});
  assert.deepEqual(parseHarumadiSettings({ ...base, periodStart: null, periodEnd: null }), { ...base, periodStart: null, periodEnd: null });
  assert.deepEqual(parseHarumadiSettings({ ...base, ...dates }), { ...base, ...dates });
  for (const bad of [{ periodStart: dates.periodStart }, { ...dates, periodEnd: "2026-11-19" }, { ...dates, periodEnd: "2026-02-30" }, { ...dates, periodStart: "0000-01-01" }, { ...dates, periodStart: 1 }]) assert.equal(parseHarumadiSettings({ ...base, ...bad }), null);
  assert.deepEqual(serializeHarumadiPeriod(harumadiPeriodData(dates)), dates);
  assert.equal(harumadiPeriodLabel(dates), "2026.11.20 – 2026.11.22");
});
test("기간 변경도 미저장 변경이고 초대 본문은 책 맥락 뒤 URL 경계를 보존한다", () => {
  const book = harumadiContent().harumadi;
  assert.equal(harumadiEditsDirty(book, "settings", { ...book, ...dates }, [], []), true);
  assert.equal(harumadiEditsDirty({ ...book, ...dates }, "settings", { ...book, periodStart: null, periodEnd: null }, [], []), true);
  const url = `https://tuti.today/harumadi/invite#${"a".repeat(43)}`;
  const content = harumadiInviteShareContent(url, { title: base.title, ...dates });
  assert.match(content.text, /제주에서 보낸 사흘/); assert.match(content.text, /2026.11.20/);
  assert.ok(content.text.endsWith(`\n\n${url}`));
});
test("기간은 작성 제한이 아니고 이름 제안·기간 입력·PDF 완성 연결을 제공한다", () => {
  const html = renderToStaticMarkup(createElement(HarumadiPeriodFields, { value: dates, onChange() {} }));
  assert.match(html, /기간이 지나도 계속 채울 수 있어요/); assert.match(html, /기간 없이 채우기/);
  assert.match(html, /min-width:0/); assert.match(html, /type="date"/);
  const ideas = renderToStaticMarkup(createElement(HarumadiTitleIdeas, { onChoose() {} }));
  for (const title of HARUMADI_TITLE_IDEAS) assert.ok(ideas.includes(title));
  const panel = readFileSync("src/features/tuti/components/HarumadiTogetherView.tsx", "utf8");
  assert.match(panel, /한 권으로 남기기/); assert.match(panel, /원래 하루마디는 계속 채울 수 있어요/);
  for (const name of ["access", "endTogether"]) assert.doesNotMatch(readFileSync(`src/server/harumadi/${name}.ts`, "utf8"), /periodStart|periodEnd/);
});
