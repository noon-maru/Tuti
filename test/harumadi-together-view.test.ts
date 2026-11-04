import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HarumadiTogetherView } from "@/features/tuti/components/HarumadiTogetherView";
import { HarumadiNotificationToggle } from "@/features/tuti/components/HarumadiNotificationToggle";
import { harumadiTogetherPhase } from "@/shared/harumadi/togetherPresentation";
import { makeHarumadiParticipant } from "@/shared/harumadi/participant";
import type { HarumadiTogether } from "@/shared/api/harumadiTogether";

const initial: HarumadiTogether = { owner: true, shared: false, participants: [makeHarumadiParticipant("owner", "정연한", true)], invites: [] };
const waiting: HarumadiTogether = { ...initial, shared: true, invites: [{ id: "invite-a", expiresAt: "2026-12-01T03:00:00Z", acceptedAt: null, revokedAt: null }] };
const joined: HarumadiTogether = { ...waiting, participants: [...initial.participants, makeHarumadiParticipant("member", "함께한 사람", false)] };
const props = { viewerId: "owner", bookTitle: "우리의 작은 하루", loading: false, busy: false, notice: "", reuseInvite: false,
  onInvite() { throw new Error("render must not invite"); }, onRevoke() {}, onConfirm() {}, onRetry() {}, onAccount() {},
};
const render = (data: HarumadiTogether, overrides: Partial<Parameters<typeof HarumadiTogetherView>[0]> = {}) => renderToStaticMarkup(createElement(HarumadiTogetherView, { ...props, data, ...overrides }));

test("참여 관계·초대 대기를 구분하고 함께 채우기 플래그만으로 참여자가 생겼다고 표시하지 않는다", () => {
  assert.equal(harumadiTogetherPhase(initial), "invite");
  assert.equal(harumadiTogetherPhase({ ...initial, shared: true }), "invite");
  assert.equal(harumadiTogetherPhase(waiting), "waiting");
  assert.equal(harumadiTogetherPhase(joined), "together");
  assert.equal(harumadiTogetherPhase({ ...joined, owner: false }), "together");
});

test("초대 전은 초대 행동·실제 책·만든 사람과 공유 범위를 먼저 제공한다", () => {
  const html = render(initial);
  assert.match(html, /우리의 작은 하루/);
  assert.match(html, /함께 남길 사람을/);
  assert.match(html, /초대해보세요/);
  assert.match(html, /정연한/);
  assert.match(html, />나<\/span>/);
  assert.match(html, /초대 링크 보내기/);
  assert.match(html, /현재·앞으로 참여하는 사람/);
  assert.match(html, /PDF 사본/);
  assert.ok(html.indexOf('aria-label="공유 범위"') < html.indexOf("초대 링크 보내기"));
  assert.doesNotMatch(html, /함께 채우는 사람|함께 채우기 종료|함께 채우기 나가기/);
});

test("대기 중에는 수락 대기·보낸 초대를 표시하고 취소된 공유는 같은 링크를 다시 보낸다", () => {
  const html = render(waiting);
  assert.match(html, /초대 수락을/);
  assert.match(html, /기다리고 있어요/);
  assert.match(html, /수락 대기/);
  assert.match(html, /초대 1 취소/);
  assert.match(html, /한 명 더 초대하기/);
  assert.doesNotMatch(html, /함께 채우는 사람/);
  assert.match(render(waiting, { reuseInvite: true }), /초대 링크 다시 보내기/);
});

test("참여 후에는 실제 사람을 먼저 보여주고 초대는 보조 행동으로 낮춘다", () => {
  const html = render(joined, { management: createElement("p", null, "관리 내용"), notification: createElement("p", null, "알림 설정") });
  assert.match(html, /함께 채우는 사람/);
  assert.match(html, /함께한 사람/);
  assert.match(html, /함께할 사람 추가/);
  assert.ok(html.indexOf('aria-label="함께 채우는 사람"') < html.indexOf("함께할 사람 추가"));
  assert.ok(html.indexOf('aria-label="공유 범위"') < html.indexOf("함께할 사람 추가"));
  assert.match(html, /함께한 사람 참여자 관리/);
  assert.match(html, /마디·신고 관리/);
  assert.match(html, /함께 채우기 종료/);
  assert.doesNotMatch(html, /초대해보세요|함께 채우기 나가기/);
});

test("참여자는 초대·내보내기·전체 종료 없이 본인 나가기만 이용한다", () => {
  const html = render({ ...joined, owner: false, invites: [] }, { viewerId: "member" });
  assert.match(html, /함께 채우기 나가기/);
  assert.doesNotMatch(html, /함께할 사람 추가|참여자 관리|함께 채우기 종료|보낸 초대/);
});

test("긴 제목·이름은 원문을 보존하고 조회 실패·로딩에는 캐시의 관리 행동을 노출하지 않는다", () => {
  const longTitle = "오래 기억하고 싶은 우리의 하루 🌿 ".repeat(20);
  const html = render(joined, { bookTitle: longTitle, busy: true });
  assert.ok(html.includes(longTitle));
  assert.match(html, /disabled=""/);
  for (const state of [{ loading: true }, { error: "연결을 확인해주세요." }]) {
    const status = render(joined, state);
    assert.doesNotMatch(status, /함께할 사람 추가|함께 채우기 종료|참여자 관리/);
  }
  const failure = render(joined, { error: "연결을 확인해주세요." });
  assert.match(failure, /role="alert"/);
  assert.match(failure, /다시 불러오기/);
});

test("책별 알림은 기존 저장 값을 따르고 부모 요청 중에는 44px 스위치를 잠근다", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["harumadi-notification", "owner", "book"], { muted: false });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiNotificationToggle, { owner: "owner", bookId: "book", disabled: true })));
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-label="이 하루마디 알림 받기"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /checked=""/);
  client.clear();
});
