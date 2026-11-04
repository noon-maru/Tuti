import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeHarumadiParticipant, harumadiParticipantIdentity } from "@/shared/harumadi/participant";
import { HarumadiParticipantList } from "@/features/tuti/components/HarumadiParticipantList";

test("이름 없는 계정은 역할을 이름으로 오인하지 않으며 기존 앱의 문자열 계약도 유지한다", () => {
  const missing = makeHarumadiParticipant("owner", null, true);
  assert.equal(missing.name, "만든 사람");
  assert.equal(missing.nameAvailable, false);
  assert.deepEqual(harumadiParticipantIdentity(missing, "owner"), { name: "나", showSelf: false, role: "만든 사람" });
  assert.deepEqual(harumadiParticipantIdentity(missing, "viewer"), { name: "이름 미설정", showSelf: false, role: "만든 사람" });
  assert.equal(makeHarumadiParticipant("member", "  ", false).nameAvailable, false);
  assert.equal(harumadiParticipantIdentity(makeHarumadiParticipant("member", "  ", false), "viewer").name, "이름 미설정");
  // A user may really choose the same text as a role: do not guess from words.
  assert.equal(makeHarumadiParticipant("owner", "만든 사람", true).nameAvailable, true);
  assert.equal(harumadiParticipantIdentity(makeHarumadiParticipant("owner", "만든 사람", true), "owner").showSelf, true);
  assert.equal(harumadiParticipantIdentity({ userId: "old", name: "기존 표시 이름", owner: false }, "viewer").name, "기존 표시 이름");
});

test("참여자는 표시 이름·나·역할로 구분하고 글자 아바타나 가짜 이름을 만들지 않는다", () => {
  const participants = [makeHarumadiParticipant("owner", "정연한", true), makeHarumadiParticipant("member", null, false)];
  const html = renderToStaticMarkup(createElement(HarumadiParticipantList, { participants, viewerId: "owner", canManage: true, busy: false, onRemove() {} }));
  assert.match(html, /정연한/);
  assert.match(html, />나<\/span>/);
  assert.match(html, />만든 사람<\/span>/);
  assert.match(html, /이름 미설정/);
  assert.match(html, /aria-label="이름 미설정 참여자 관리"/);
  assert.equal((html.match(/<button/g) ?? []).length, 1, "만든 사람에게는 내보내기 버튼을 표시하지 않는다");
  const ownMissing = renderToStaticMarkup(createElement(HarumadiParticipantList, { participants: [makeHarumadiParticipant("owner", null, true)], viewerId: "owner", canManage: true, busy: false, onRemove() {} }));
  assert.match(ownMissing, />나<\/strong>/);
  assert.doesNotMatch(ownMissing, />만<\//);
});

test("참여자에게 내보내기를 제공하지 않고 저장 중 및 긴 이름·이모지를 처리한다", () => {
  const name = "함께한 사람 🌿 ".repeat(20);
  const participants = [makeHarumadiParticipant("owner", "대표", true), makeHarumadiParticipant("member", name, false)];
  const props = { participants, viewerId: "member", canManage: false, busy: false, onRemove() {} };
  const html = renderToStaticMarkup(createElement(HarumadiParticipantList, props));
  assert.ok(html.includes(name.trim()));
  assert.doesNotMatch(html, /<button/);
  const busy = renderToStaticMarkup(createElement(HarumadiParticipantList, { ...props, viewerId: "owner", canManage: true, busy: true }));
  assert.match(busy, /disabled=""/);
});

test("공유 안내·초대·참여자·종료를 구분하고 관리 행동의 기존 확인 절차를 유지한다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiTogetherPanel.tsx", "utf8");
  const view = readFileSync("src/features/tuti/components/HarumadiTogetherView.tsx", "utf8");
  assert.doesNotMatch(source, /Avatar|person.name.slice/);
  assert.match(source, /onConfirm=\{requestConfirmation\}/);
  assert.match(view, /<HarumadiParticipantList participants=\{data.participants\}/);
  assert.match(view, /onRemove=\{id => onConfirm\("remove-member", id\)\}/);
  assert.match(view, /수락 대기/);
  assert.match(view, /다른 하루마디와 개인 마디 목록은 공유되지 않아요/);
  assert.match(view, /onConfirm\("end-together"\)/);
  assert.match(view, /onConfirm\("leave"\)/);
  assert.match(view, /로그인 계정 확인/);
  assert.match(view, /신고 관리/);
});
