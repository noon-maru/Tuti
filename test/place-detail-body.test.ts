import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaceDetailBody } from "@/features/tuti/screens/detail/PlaceDetailBody";
import { tourApiDogAccess } from "@/shared/pets/tourApiDogAccess";
import type { TutiPlace } from "@/lib/recommendations";
import type { PlaceDetailResponse, TourismPlaceDetail } from "@/shared/api/placeDetails";

const place: TutiPlace = { id: "park", name: "테스트 공원", phrase: "함께 걷는 하루", note: "기본 소개", image: "", crowd: "정보 없음", travelTime: "도보 약 10분", today: "", fatigue: 0, movementLevel: "near", moodTags: [], latitude: 37.5, longitude: 127 };
const detail: TourismPlaceDetail = { contentId: "park", contentTypeId: "12", overview: "<script>실행되면 안 되는 긴 원문</script>", overviewSummary: "공원의 짧은 소개", homepage: null, phone: "02-000-0000", openingHours: "09:00~18:00", restDate: "월요일", admissionFee: "무료", parking: "주차 안내", reservation: null, usageDuration: "약 1시간", experienceGuide: "안내된 산책길 둘러보기", sections: [], images: [], syncedAt: "2026-11-17T00:00:00Z", isStale: false };
const response: PlaceDetailResponse = { place: { id: "park", name: "테스트 공원", address: "서울 테스트 주소", region: "서울", latitude: 37.5, longitude: 127 }, detail, suggestedPlan: [] };
const props = { place, response, pending: false, failed: false, onRetry() {}, onCreateMadi() {} };
const render = (overrides: Partial<Parameters<typeof PlaceDetailBody>[0]> = {}) => renderToStaticMarkup(createElement(PlaceDetailBody, { ...props, ...overrides }));

test("상세는 소개·동반 조건·활동·방문 정보·다음 행동·원문 순으로 이어진다", () => {
  const dogAccess = tourApiDogAccess({ acmpyTypeCd: "일부구역 동반가능", acmpyPsblCpam: "10kg 이하", acmpyNeedMtr: "목줄 착용" }, new Date(Date.now() - 1000))!;
  const html = render({ place: { ...place, dogAccess } });
  const markers = ["공원의 짧은 소개", "반려견과 함께 가기", "함께 보낼 시간", "가기 전에", "마음에 남는 곳이라면", "원문·정보 출처"];
  const indices = markers.map(marker => html.indexOf(marker));
  assert.ok(indices.every(index => index >= 0));
  assert.deepEqual([...indices].sort((a, b) => a - b), indices);
  assert.match(html, /방문 전 조건을 확인해주세요/);
  assert.match(html, /서울 테스트 주소/); assert.match(html, /02-000-0000/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /ⓒ한국관광공사/);
  assert.doesNotMatch(html, /오늘 이곳을 고른 이유|이 정도만 알고 가세요/);
});
test("저장된 활동이 없으면 제안으로 채우지 않고 긴 운영 정보는 자르지 않는다", () => {
  const text = "매월 둘째 주 월요일에는 방문 전 별도 문의가 필요한 운영 안내입니다. ".repeat(20);
  const html = render({ response: { ...response, detail: { ...detail, experienceGuide: null, openingHours: text } } });
  assert.doesNotMatch(html, /함께 보낼 시간|여기서 보낼 시간/);
  assert.ok(html.includes(text.trim()));
  const source = readFileSync("src/features/tuti/screens/detail/PlaceDetailBody.tsx", "utf8");
  assert.doesNotMatch(source, /line-clamp|overflow-y|dangerouslySetInnerHTML/);
});
test("실패·미기재·오래된 정보와 유효하지 않은 좌표를 사실대로 표시한다", () => {
  const html = render({ response: undefined, failed: true, place: { ...place, latitude: NaN, longitude: undefined } });
  assert.match(html, /방문 정보를 불러오지 못했어요/); assert.match(html, /다시 불러오기/);
  assert.match(html, /주소 정보 확인 필요|운영 시간 정보 없음/);
  assert.doesNotMatch(html, /map\.kakao\.com/); assert.match(html, /마디 남기기/);
  assert.match(render({ response: { ...response, detail: { ...detail, isStale: true } } }), /지금과 다를 수/);
  assert.match(render({ response: undefined, pending: true }), /방문 정보를 확인하고 있어요/);
});
function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
test("마디 작성·재시도는 기존 콜백만 호출하고 길찾기는 목적지만 전송한다", () => {
  let saved = 0, retried = 0;
  const tree = PlaceDetailBody({ ...props, failed: true, onCreateMadi: () => saved++, onRetry: () => retried++ });
  const all = nodes(tree);
  (all.find(node => Children.toArray(node.props.children as ReactNode).includes("마디 남기기"))!.props.onClick as () => void)();
  (all.find(node => node.props.children === "다시 불러오기")!.props.onClick as () => void)();
  assert.equal(saved, 1); assert.equal(retried, 1);
  const destination = all.find(node => typeof node.props.href === "string")!;
  assert.equal(destination.props.href, `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},37.5,127`);
  assert.equal(destination.props.rel, "noopener noreferrer");
});
test("사진·갤러리·시트 제스처와 히스토리 코드는 레이아웃 변경 전과 동일하다", () => {
  const path = "src/features/tuti/screens/detail/DetailScreen.tsx";
  const after = readFileSync(path, "utf8");
  // Frozen source contracts avoid depending on old git commits in shallow CI checkouts.
  for (const [start, end, expected] of [
    ["const HeroImage =", "const Content =", "d7a7ea3ecf51d42346377b63e1a3d71037bf21badcdc3d419acfb7c95ac5f16f"],
    ["function PhotoPreviewStrip", "function createPlaceSubtitle", "954bbfe8da758394d27d4c69ed037d53b7cd980a91e3866a24d46d87098c850e"],
    ["  const [readingProgress,", "  const closeFromBackdrop", "9c01de17d6e05b3503e4fa1038c54173663ad8ab38f077214025054273146eb1"],
  ]) {
    const content = after.slice(after.indexOf(start), after.indexOf(end, after.indexOf(start))).trim();
    assert.equal(createHash("sha256").update(content).digest("hex"), expected, start);
  }
});
test("원문·동반 안내의 summary와 자식 요소는 시트 드래그에서 제외한다", () => {
  const source = readFileSync("src/features/tuti/screens/detail/DetailScreen.tsx", "utf8");
  const helper = source.slice(source.indexOf("function isDetailInteractiveTarget"), source.indexOf("function getHistoryState"));
  class TestElement {
    constructor(private tag: string, private ancestor?: string) {}
    closest(selector: string) {
      const tags = selector.split(",").map(value => value.trim());
      return tags.includes(this.tag) || Boolean(this.ancestor && tags.includes(this.ancestor)) ? this : null;
    }
  }
  const javascript = helper.replace("target: EventTarget | null", "target");
  const interactive = runInNewContext(`${javascript}; isDetailInteractiveTarget`, { Element: TestElement }) as (target: unknown) => boolean;
  assert.equal(interactive(new TestElement("summary")), true);
  assert.equal(interactive(new TestElement("svg", "summary")), true);
  assert.equal(interactive(new TestElement("button")), true);
  assert.equal(interactive(new TestElement("div")), false);
  assert.equal(interactive(null), false);
});
