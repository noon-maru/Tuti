import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groupContextMenuItems } from "@/features/tuti/components/ContextMenu";

test("메뉴 묶음은 액션 순서와 콜백을 보존하고 일반 메뉴에는 제목을 추가하지 않는다", () => {
  const action = () => {};
  const items = [
    { group: "작은 여행", label: "다시 고르기", onSelect: action },
    { group: "작은 여행", label: "보관", onSelect: action },
    { group: "도움말 · 설정", label: "설정", onSelect: action },
  ];
  const result = groupContextMenuItems(items);
  assert.deepEqual(result.map(group => [group.label, group.items.length]), [["작은 여행", 2], ["도움말 · 설정", 1]]);
  assert.deepEqual(result.flatMap(group => group.items), items);
  assert.equal(result[0].items[0].onSelect, action);
  assert.deepEqual(groupContextMenuItems([{ label: "동작", onSelect: action }]).map(group => group.label), [undefined]);
  assert.deepEqual(groupContextMenuItems([]), []);
});

test("그룹 머리글은 초점 순서에서 제외하고 메뉴 높이에 포함한다", () => {
  const source = readFileSync("src/features/tuti/components/ContextMenu.tsx", "utf8");
  assert.match(source, /groupHeadingCount \* MENU_GROUP_HEADING_HEIGHT/);
  assert.match(source, /role=\{group.label \? "group" : undefined\} aria-label=\{group.label\}/);
  assert.match(source, /GroupHeading aria-hidden="true"/);
  assert.match(source, /ref=\{item === firstEnabledItem \? firstItemRef : undefined\}/);
  assert.match(source, /disabled=\{item.disabled\}/);
  assert.match(source, /menuitem.*:not\(:disabled\)/);
  const travel = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  assert.match(travel, /group: "작은 여행"/);
  assert.match(travel, /group: "도움말 · 설정"/);
  assert.match(travel, /accountConnected && adminAccess/);
});
