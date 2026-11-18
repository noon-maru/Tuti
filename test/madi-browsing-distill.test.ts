import assert from "node:assert/strict";
import test from "node:test";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { readFileSync } from "node:fs";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { findMadiControl } from "./fixtures/madiCreateHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import { filterJournalEntries } from "../src/shared/tuti/journalSearch";
import { journalCardPreview } from "../src/shared/tuti/journalCard";
import { unfiledMadi } from "../src/shared/tuti/unfiledMadi";
import * as tokens from "../src/styles/tokens";

function fixture() {
  const content = harumadiContent();
  const entries = Array.from({ length: 8 }, (_, i) => ({ ...content.entries[0], id: `entry-${i}`, title: i === 1 ? "찾고싶은 순간" : `마디 ${i}`, image: i === 1 ? "/photo.webp" : null }));
  let activeId = entries[0].id, onlyUnfiled = false, view = "cards", opened = "";
  const listeners = new Map<string, (event: Event) => void>();
  const window = { requestAnimationFrame(fn: () => void) { fn(); return 1; }, cancelAnimationFrame() {}, setTimeout(fn: () => void) { fn(); return 1; },
    addEventListener(name: string, fn: (event: Event) => void) { listeners.set(name, fn); }, removeEventListener(name: string) { listeners.delete(name); } };
  const deps: Record<string, unknown> = {
    "@/shared/ui/typography": { screenTitleStyles: "" }, "@emotion/styled": styled, "@emotion/react": { css }, "lucide-react": { ChevronDown: "svg", Plus: "svg", Search: "svg", X: "svg" },
    "@/styles/tokens": tokens,
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/hooks/useHarumadiLibrary": { useHarumadiLibrary: () => ({ isSuccess: true, isFetching: false, data: { pages: [{ harumadis: [{ ...content.harumadi, entryIds: [entries[0].id] }] }] } }) },
    "@/features/tuti/hooks/useTutiJournalEntries": { useTutiJournalEntries: () => ({ entries, isPending: false, isError: false }) },
    "@/features/tuti/hooks/useJournalShareActions": { useJournalShareActions: () => ({}) },
    "@/features/tuti/components/JournalEntryTransition": { useJournalEntryTransitionTarget() {} },
    "@/features/tuti/navigation/androidBack": { ANDROID_BACK_EVENT: "android-back" },
    "@/store/tuti": { useTutiStore: (select: (state: unknown) => unknown) => select({ activeJournalEntryId: activeId, setActiveJournalEntry(id: string) { activeId = id; } }) },
    "@/shared/tuti/unfiledMadi": { unfiledMadi }, "@/shared/tuti/journalSearch": { filterJournalEntries }, "@/shared/tuti/journalCard": { journalCardPreview },
    "@/lib/feedback": { confirmAction: async () => false, showErrorToast() {} }, "@/shared/tuti/deletionCopy": { madiDeletionMessage() {} },
    "@/features/tuti/components/buttons": { BackButton: "button", BaseButton: styled.button({}), TextButton: "button" },
    "@/features/tuti/components/ScreenFrame": { ScreenFrame: styled.div({}) },
    ...Object.fromEntries(["MadiLoadNotice", "MadiSearchField", "MadiSearchResults", "MadiCollectionDialog", "ContextMenu", "LoadingIndicator", "JournalShareDialog"].map(name => [`@/features/tuti/components/${name}`, { [name]: name }])),
  };
  const harness = clientFlowHarness("src/features/tuti/screens/journal/JournalScreen.tsx", "JournalScreen", deps, { window });
  const render = () => harness.render({ onlyUnfiled, view, onBack() {}, onCreateEntry() {}, onChangeFilter(value: boolean) { onlyUnfiled = value; }, onChangeView(value: string) { view = value; }, onOpenEntry(id: string) { opened = id; } });
  const find = (match: (props: Record<string, unknown>) => boolean) => { const node = findMadiControl(render(), match); assert.ok(node); return node; };
  const click = (label: string) => (find(p => p["aria-label"] === label).onClick as () => void)();
  return { ...harness, render, find, click, listeners, active: () => activeId, opened: () => opened, view: () => view };
}
test("검색은 처음에는 공간·포커스를 차지하지 않고 열기·닫기·Escape·IME·Android 뒤로가기를 처리한다", () => {
  const f = fixture();
  assert.equal(f.find(p => p.id !== undefined && p.$open !== undefined).inert, true);
  f.click("마디 검색 열기"); f.render(); f.effects();
  assert.equal(f.find(p => p.id !== undefined && p.$open !== undefined).inert, false);
  const input = f.find(p => p.inputRef !== undefined);
  (input.onChange as (value: string) => void)("찾고싶은");
  assert.equal((f.find(p => p.label === "마디 검색 결과").entries as unknown[]).length, 1);
  const key = f.find(p => p.id !== undefined && p.$open !== undefined).onKeyDown as (event: unknown) => void;
  key({ key: "Escape", nativeEvent: { isComposing: true } });
  assert.equal(f.find(p => p.inputRef !== undefined).value, "찾고싶은");
  key({ key: "Escape", nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() {} });
  assert.equal(f.find(p => p.inputRef !== undefined).value, "");
  assert.equal(f.find(p => p.id !== undefined && p.$open !== undefined).inert, true);
  f.effects(); f.click("마디 검색 열기"); f.render(); f.effects();
  let prevented = false;
  f.listeners.get("android-back")!({ defaultPrevented: false, preventDefault() { prevented = true; } } as Event);
  assert.equal(prevented, true);
  assert.equal(f.find(p => p.id !== undefined && p.$open !== undefined).inert, true);
  f.dispose(); assert.equal(f.listeners.size, 0);
});
test("필터와 보기 선택을 펼침 메뉴로 모으되 선택한 필터와 원래 마디를 보존한다", () => {
  const f = fixture();
  const choose = (label: string) => {
    const menu = f.find(p => p.label === "마디 필터와 보기 방식");
    const item = (menu.items as { label: string; onSelect: () => void }[]).find(item => item.label === label); assert.ok(item); item.onSelect();
  };
  choose("아직 담지 않은 마디");
  assert.ok(f.find(p => p["aria-label"] === "아직 담지 않은 마디 필터 해제"));
  assert.equal(f.find(p => p.role === "region").tabIndex, 0);
  choose("목록으로 보기"); assert.equal(f.view(), "list");
  assert.equal((f.find(p => p.label === "마디 목록").entries as unknown[]).length, 7);
  choose("전체 마디");
  assert.equal((f.find(p => p.label === "마디 목록").entries as unknown[]).length, 8);
  assert.equal(f.active(), "entry-0"); f.dispose();
});
test("하단 상시 조작 없이도 휠·스와이프·방향키와 상세 열기를 유지한다", () => {
  const f = fixture();
  const region = f.find(p => p.role === "region");
  (region.onWheel as (event: unknown) => void)({ deltaX: 0, deltaY: 80, preventDefault() {} });
  assert.equal(f.active(), "entry-1");
  const start = f.find(p => p.role === "region");
  (start.onPointerDown as (event: unknown) => void)({ isPrimary: true, clientY: 100 });
  (start.onPointerUp as (event: unknown) => void)({ clientY: 150 });
  assert.equal(f.active(), "entry-2");
  const key = f.find(p => p.role === "region").onKeyDown as (event: unknown) => void;
  key({ key: "ArrowUp", currentTarget: { contains: () => true }, preventDefault() {} });
  assert.equal(f.active(), "entry-1");
  const card = f.find(p => p["aria-pressed"] === true);
  (card.onClick as (event: unknown) => void)({ currentTarget: {} });
  assert.equal(f.opened(), "entry-1");
  const source = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.match(source, /MAX_VISIBLE_MEMORY_CARDS = 3/);
  assert.doesNotMatch(source, /StackNavigation|FilterBar|TextCardPlace/);
  assert.match(source, /:focus-within/); assert.match(source, /index === selectedEntryIndex && !entry.image/);
  f.dispose();
});
test("검색 결과가 없을 때 한 번의 전체 보기로 검색과 필터를 함께 해제한다", () => {
  const f = fixture();
  const menu = f.find(p => p.label === "마디 필터와 보기 방식");
  (menu.items as { label: string; onSelect: () => void }[]).find(item => item.label === "아직 담지 않은 마디")!.onSelect();
  f.click("마디 검색 열기");
  (f.find(p => p.inputRef !== undefined).onChange as (value: string) => void)("없는검색어");
  (f.find(p => p.children === "전체 마디 보기").onClick as () => void)();
  assert.equal(f.find(p => p.inputRef !== undefined).value, "");
  assert.equal(f.find(p => p.id !== undefined && p.$open !== undefined).inert, true);
  const items = f.find(p => p.label === "마디 필터와 보기 방식").items as { label: string; selected: boolean }[];
  assert.equal(items.find(item => item.label === "전체 마디")?.selected, true);
  f.dispose();
});
