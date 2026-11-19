import assert from "node:assert/strict";
import test from "node:test";
import styled from "@emotion/styled";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { petPhotoQuery } from "@/features/tuti/hooks/petPhotoQuery";
import { MainMenu } from "@/features/tuti/components/MainMenu";
import type { PetProfile } from "@/shared/pets/profile";
import { mainMenuItems } from "@/features/tuti/navigation/mainMenuItems";

test("사진이 있는 아이만 최대 셋 조회하고 대기·실패·미등록은 더보기로 표시한다", () => {
  let pets: PetProfile[] = [];
  let photos: Array<{ data?: { photo: string | null }; isError?: boolean }> = [];
  let queries: ReturnType<typeof petPhotoQuery>[] = [];
  const flow = clientFlowHarness("src/features/tuti/components/PetMenuPortraits.tsx", "PetMenuPortraits", {
    "@emotion/styled": styled, "next/image": "image", "lucide-react": { MoreVertical: "more" },
    "../hooks/usePetProfiles": { usePetProfiles: () => ({ data: { pets } }) },
    "../hooks/petPhotoQuery": { petPhotoQuery },
    "@tanstack/react-query": { useQueries: (options: { queries: typeof queries }) => { queries = options.queries; return photos; } },
  });
  const render = (ownerId = "owner") => flow.render({ ownerId });
  assert.equal(render().type, "more"); assert.equal(queries.length, 0);
  pets = Array.from({ length: 5 }, (_, i) => ({ id: `pet-${i}`, name: `아이 ${i}`, species: "dog", weightKg: null, hasPhoto: i !== 0, revision: i }));
  photos = [{}, {}, {}]; assert.equal(render().type, "more");
  assert.deepEqual(queries.map(query => [...query.queryKey]), [["pet-photo", "owner", "pet-1", 1], ["pet-photo", "owner", "pet-2", 2], ["pet-photo", "owner", "pet-3", 3]]);
  photos = [{ data: { photo: "data:image/webp;base64,YQ==" } }, { isError: true }, {}];
  const single = render(); assert.equal(single.props["data-pet-portraits"], 1);
  photos = photos.map(() => ({ data: { photo: "data:image/webp;base64,YQ==" } }));
  const group = render("other-owner");
  assert.equal(group.props["data-pet-portraits"], 3); assert.equal(group.props["aria-hidden"], "true");
  assert.equal(Children.toArray(group.props.children as ReactNode).length, 3);
  assert.ok(queries.every(query => query.queryKey[1] === "other-owner"));
  assert.ok(Children.toArray(group.props.children as ReactNode).every(child => isValidElement(child) && child.type === "span"));
  flow.dispose();
});

test("두 메인의 사진·반려동물 관리 진입은 공통 메뉴에서 만들고 나들이 전용 행동을 보존한다", () => {
  const selected: string[] = [];
  const flow = clientFlowHarness("src/features/tuti/components/MainMenu.tsx", "MainMenu", {
    "@emotion/styled": styled, "lucide-react": { MoreVertical: "more" },
    "./ContextMenu": { ContextMenu: "menu" }, "./PetMenuPortraits": { PetMenuPortraits: "pets" },
    "../navigation/mainMenuItems": { mainMenuItems }, "./buttons": { quietIconButtonStyles: "" },
  }, { process: { env: { NEXT_PUBLIC_TUTI_TARGET: "web" } } });
  for (const ownerId of ["owner-a", "owner-b"]) {
    const menu = flow.render({ ownerId, onPets: () => selected.push("pets"),
      onDownload() {}, onSettings: () => selected.push("settings"), onAdmin() {},
      items: [{ label: "외출 조건 변경", onSelect: () => selected.push("conditions") }],
      helpItems: [{ label: "튜토리얼 다시보기", onSelect: () => selected.push("help") }],
    });
    const trigger = menu.props.triggerContent;
    assert.ok(isValidElement<{ ownerId: string }>(trigger));
    assert.equal(trigger.type, "pets"); assert.equal(trigger.props.ownerId, ownerId); assert.equal(trigger.key, ownerId);
    const items = menu.props.items as Array<{ label: string; onSelect: () => void }>;
    assert.equal(items.filter(item => item.label === "함께하는 반려동물").length, 1);
    for (const label of ["함께하는 반려동물", "외출 조건 변경", "튜토리얼 다시보기", "설정"]) items.find(item => item.label === label)!.onSelect();
  }
  assert.deepEqual(selected, ["pets", "conditions", "help", "settings", "pets", "conditions", "help", "settings"]);
  const screen = readFileSync("src/features/tuti/screens/recommendations/RecommendationsScreen.tsx", "utf8");
  const travel = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  assert.match(screen, /<MainMenu\s+label="메인 메뉴"\s+ownerId=\{ownerId\}\s+onPets=\{onPets\}/);
  assert.match(travel, /ownerId=\{session\?\.userId\}\s+onPets=\{\(\) => router.push\("\/pets"\)\}/);
  flow.dispose();
});

test("사진은 기존 메뉴 버튼 안에서만 교체되고 접근성과 설정·관리자 동작은 유지한다", () => {
  const html = renderToStaticMarkup(createElement(MainMenu, { label: "책장 메뉴", onDownload() {}, onSettings() {}, onAdmin() {},
    triggerContent: createElement("span", { "data-pet-portraits": 1 }, "사진"),
  }));
  assert.match(html, /aria-label="책장 메뉴"/); assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /data-pet-portraits="1"/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.match(html, /width:44px;height:44px/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /<MainMenu[^\n]+ownerId=\{ownerId\}/);
  assert.match(home, /onPets=\{\(\) => router.push\("\/pets"\)\}/);
});
