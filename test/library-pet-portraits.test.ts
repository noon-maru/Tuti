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

test("사진이 있는 아이만 최대 셋 조회하고 대기·실패·미등록은 더보기로 표시한다", () => {
  let pets: PetProfile[] = [];
  let photos: Array<{ data?: { photo: string | null }; isError?: boolean }> = [];
  let queries: ReturnType<typeof petPhotoQuery>[] = [];
  const flow = clientFlowHarness("src/features/tuti/components/LibraryPetPortraits.tsx", "LibraryPetPortraits", {
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

test("사진은 기존 메뉴 버튼 안에서만 교체되고 접근성과 설정·관리자 동작은 유지한다", () => {
  const html = renderToStaticMarkup(createElement(MainMenu, { label: "책장 메뉴", onDownload() {}, onSettings() {}, onAdmin() {},
    triggerContent: createElement("span", { "data-pet-portraits": 1 }, "사진"),
  }));
  assert.match(html, /aria-label="책장 메뉴"/); assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /data-pet-portraits="1"/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.match(html, /width:44px;height:44px/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /triggerContent=\{<LibraryPetPortraits ownerId=\{ownerId\}/);
  assert.match(home, /label: "함께하는 반려동물", onSelect: \(\) => router.push\("\/pets"\)/);
});
