import assert from "node:assert/strict";
import test from "node:test";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { findMadiControl } from "./fixtures/madiCreateHarness";
import { navigationGroups, tabs } from "../src/features/admin/adminNavigation";

test("운영 메뉴는 여섯 업무 영역에 기존 탭을 중복 없이 보존하고 권리 요청을 노출한다", () => {
  assert.equal(navigationGroups.length, 6);
  assert.deepEqual(navigationGroups.flatMap(g => g.items.map(t => t.id)).sort(), tabs.map(t => t.id).sort());
  assert.ok(navigationGroups.find(g => g.label === "사용자 지원")?.links.some(l => l.href === "/admin/journal-rights"));
});

test("성과 조회 오류가 업무를 가리지 않고 재시도하며 미확인을 0으로 꾸미지 않는다", async () => {
  let calls = 0;
  const navigated: string[] = [];
  const h = clientFlowHarness("src/features/admin/AdminOperationsHome.tsx", "AdminOperationsHome", {
    "@emotion/styled": { __esModule: true, default: styled }, "next/link": { __esModule: true, default: "a" },
    "@/lib/adminApi": { fetchAdminJson: async () => { calls++; throw Error("UNAVAILABLE"); } },
    "./AdminJobHealthPanel": { AdminJobHealthPanel: "aside" },
  });
  const props = { overview: null, notifications: null, onNavigate: (tab: string) => navigated.push(tab), onNavigatePendingPlaces() {} };
  h.render(props); h.effects(); await new Promise(resolve => setImmediate(resolve));
  const tree = h.render(props);
  assert.ok(findMadiControl(tree, p => p.role === "alert"));
  assert.ok(findMadiControl(tree, p => p.href === "/admin/journal-rights"));
  assert.ok(findMadiControl(tree, p => p.children === "미확인"));
  const retry = findMadiControl(tree, p => p.children === "다시 불러오기")!;
  (retry.onClick as () => void)(); h.render(props); h.effects();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
  h.dispose();
});
