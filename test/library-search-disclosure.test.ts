import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { filterHarumadis } from "@/features/tuti/hooks/useHarumadiSearch";
import { harumadiContent } from "./fixtures/harumadiContent";
import { palette } from "@/styles/tokens";
import { libraryViewItems } from "@/features/tuti/navigation/libraryViewItems";

function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node)
    ? [node, ...nodes(node.props.children as ReactNode)] : []);
}

test("책장 검색은 기본 접힘, 열기·입력·닫기·Escape·IME 및 포커스 복귀를 처리한다", () => {
  let term = "", focuses = 0;
  const books = [{ ...harumadiContent().harumadi, title: "우리의 하루" }];
  const page = { harumadis: books, recordCount: 0 };
  const paths: string[] = [];
  let selectedView = "carousel";
  const components = ["HarumadiShelf", "HarumadiCarousel", "HarumadiBookReader", "MainNavigation", "LibraryLoadNotice", "MadiSearchField"];
  const deps: Record<string, unknown> = {
    "@/styles/tokens": { palette },
    "@emotion/styled": styled,
    "lucide-react": Object.fromEntries(["BookOpen", "ChevronRight", "MoreHorizontal", "Plus", "PenLine", "ArrowUpRight", "Download", "Search", "X"].map(name => [name, name])),
    "next/navigation": { useRouter: () => ({ push(path: string) { paths.push(path); } }) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/components/LoadingIndicator": { AppLoadingScreen: "loading", LoadingIndicator: "indicator" },
    "@/features/tuti/hooks/useLibraryView": { useLibraryView: () => ({ view: selectedView, chooseView(value: string) { selectedView = value; } }) },
    "../navigation/libraryViewItems": { libraryViewItems },
    "@/shared/harumadi/transitionGeometry": {},
    "@/features/tuti/hooks/useHarumadiHistory": { useHarumadiHistory: () => ({ opening: null }) },
    "@/features/tuti/components/buttons": { BaseButton: "button", PrimaryButton: "button" },
    "@/features/tuti/hooks/useHarumadiLibrary": { useHarumadiLibrary: () => ({ data: { pages: [page] }, isFirstMadi: false }) },
    "@/features/tuti/hooks/useHarumadiSearch": { useHarumadiSearch: () => ({ search: term, setSearch: (next: string) => { term = next; }, books: filterHarumadis(books, term), searching: Boolean(term.trim()) }) },
    "@/lib/libraryPreferences": {}, "@/lib/harumadiPdfDraft": {}, "@/shared/tuti/welcomeHarumadi": {}, "@/lib/welcomeHarumadiNavigation": {},
    "../hooks/useLifecycleView": { useLifecycleView() {} },
    "../components/ScreenFrame": { ScreenFrame: "section" }, "../components/MainMenu": { MainMenu: "div" },
    "@/shared/ui/typography": { bodyCopyStyles: "" },
    "../components/PendingMadiNotice": { PendingMadiNotice: "PendingMadiNotice" },
    "../hooks/useMadiComposePull": { useMadiComposePull: () => ({ preview: null, layerRef: { current: null }, drag() {}, cancel() {}, open() {} }) },
    "../components/MadiComposePullPreview": { MadiComposePullPreview: "MadiComposePullPreview" },
  };
  for (const name of components) deps[`@/features/tuti/components/${name}`] = { [name]: name };
  const flow = clientFlowHarness("src/features/tuti/flows/LibraryHomeFlow.tsx", "LibraryHomeFlow", deps);
  const parent = flow.render();
  const render = () => nodes(flow.render(parent.props, parent.type as never));
  const shortcut = render().find(node => Children.toArray(node.props.children as ReactNode).includes("나의 마디"))!;
  assert.ok(shortcut, "메뉴를 열지 않아도 나의 마디로 이동할 수 있다");
  (shortcut.props.onClick as () => void)();
  assert.deepEqual(paths.splice(0), ["/madi"]);
  const menu = render().find(node => node.props.label === "책장 메뉴")!;
  const views = (menu.props.items as { label: string; onSelect(): void }[]);
  views.find(item => item.label === "책등")!.onSelect();
  assert.equal(selectedView, "spines");
  views.find(item => item.label === "한 권씩")!.onSelect();
  assert.equal(selectedView, "carousel");
  const toggle = () => render().find(node => node.props["aria-expanded"] !== undefined)!;
  const input = () => render().find(node => node.props.id === "library-name-search")?.props.inert
    ? undefined : render().find(node => node.type === "MadiSearchField");
  const click = () => {
    const button = toggle().props["aria-expanded"]
      ? render().find(node => node.props["aria-label"] === "하루마디 검색 닫기" && node.props["aria-expanded"] === undefined)!
      : toggle();
    (button.props.onClick as () => void)();
  };
  (toggle().props.ref as { current: unknown }).current = { focus() { focuses++; } };
  assert.equal(toggle().props["aria-expanded"], false);
  assert.equal(input(), undefined);
  const closedField = render().find(node => node.type === "MadiSearchField")!;
  (closedField.props.inputRef as (input: unknown) => void)({ focus() { throw new Error("Closed search must not focus"); } });
  assert.equal(render().find(node => node.props.id === "library-name-search")?.props["aria-hidden"], true);
  click();
  assert.equal(toggle().props["aria-expanded"], true);
  assert.ok(render().some(node => node.props.inert === true && node.props["aria-hidden"] === true && !node.props.id), "검색 중 원래 헤더 조작부를 키보드 탐색에서 제외한다");
  assert.equal(toggle().props["aria-controls"], "library-name-search");
  let inputFocused = false;
  (input()!.props.inputRef as (input: unknown) => void)({ focus() { inputFocused = true; } });
  assert.equal(inputFocused, true);
  (input()!.props.onChange as (value: string) => void)("우리");
  assert.equal(render().find(node => node.type === "HarumadiShelf")?.props.view, "covers");
  click();
  assert.equal(term, ""); assert.equal(input(), undefined); assert.equal(focuses, 1);
  assert.ok(render().some(node => node.type === "HarumadiCarousel"));
  click();
  const escape = (composing: boolean) => {
    let prevented = false;
    const row = render().find(node => node.props.id === "library-name-search")!;
    (row.props.onKeyDown as (event: unknown) => void)({ key: "Escape", nativeEvent: { isComposing: composing }, preventDefault() { prevented = true; } });
    return prevented;
  };
  assert.equal(escape(true), false); assert.ok(input());
  assert.equal(escape(false), true); assert.equal(input(), undefined); assert.equal(focuses, 2);
  for (let i = 0; i < 4; i++) click();
  assert.equal(input(), undefined); assert.equal(term, "");
  books.length = 0; page.recordCount = 3;
  const label = (node: ReactElement<Record<string, unknown>>) => Children.toArray(node.props.children as ReactNode).filter(value => typeof value === "string" || typeof value === "number").join("");
  const reread = render().find(node => label(node) === "남긴 마디 3개 보기")!;
  assert.ok(reread, "책은 없어도 저장한 마디의 실제 수와 재열람 행동을 보여준다");
  (reread.props.onClick as () => void)();
  assert.deepEqual(paths, ["/madi"]);
  page.recordCount = 0;
  assert.equal(render().some(node => label(node).startsWith("남긴 마디 0개 보기")), false);
});

test("검색 패널은 헤더 위에 겹쳐 열리고 책을 밀지 않으며 동작 줄이기를 지원한다", () => {
  const source = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.doesNotMatch(source, /searchOpen && <SearchRow/);
  assert.match(source, /inert=\{!searchOpen\} aria-hidden=\{!searchOpen\}/);
  assert.match(source, /position: absolute; z-index: 1; top: var\(--screen-padding-top\)/);
  assert.doesNotMatch(source, /grid-template-rows|padding-block var\(--search-reveal-duration\)/);
  assert.match(source, /\$open \? "280ms" : "200ms"/);
  assert.match(source, /prefers-reduced-motion: reduce.*transition: opacity 100ms ease; > div \{ transform: none; transition: none;/);
});
