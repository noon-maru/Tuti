import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { filterHarumadis } from "@/features/tuti/hooks/useHarumadiSearch";
import { harumadiContent } from "./fixtures/harumadiContent";

function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node)
    ? [node, ...nodes(node.props.children as ReactNode)] : []);
}

test("책장 검색은 기본 접힘, 열기·입력·닫기·Escape·IME 및 포커스 복귀를 처리한다", () => {
  let term = "", focuses = 0;
  const books = [{ ...harumadiContent().harumadi, title: "우리의 하루" }];
  const components = ["HarumadiShelf", "HarumadiCarousel", "LibraryViewSwitch", "HarumadiBookReader", "MainNavigation", "LibraryLoadNotice", "MadiSearchField"];
  const deps: Record<string, unknown> = {
    "@emotion/styled": styled,
    "lucide-react": Object.fromEntries(["BookOpen", "ChevronRight", "MoreHorizontal", "Plus", "PenLine", "ArrowUpRight", "Download", "Search", "X"].map(name => [name, name])),
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/components/LoadingIndicator": { AppLoadingScreen: "loading", LoadingIndicator: "indicator" },
    "@/features/tuti/hooks/useLibraryView": { useLibraryView: () => ({ view: "carousel", chooseView() {} }) },
    "@/shared/harumadi/transitionGeometry": {},
    "@/features/tuti/hooks/useHarumadiHistory": { useHarumadiHistory: () => ({ opening: null }) },
    "@/features/tuti/components/buttons": { BaseButton: "button", PrimaryButton: "button" },
    "@/features/tuti/hooks/useHarumadiLibrary": { useHarumadiLibrary: () => ({ data: { pages: [{ harumadis: books }] }, isFirstMadi: false }) },
    "@/features/tuti/hooks/useHarumadiSearch": { useHarumadiSearch: () => ({ search: term, setSearch: (next: string) => { term = next; }, books: filterHarumadis(books, term), searching: Boolean(term.trim()) }) },
    "@/lib/libraryPreferences": {}, "@/lib/harumadiPdfDraft": {}, "@/shared/tuti/welcomeHarumadi": {}, "@/lib/welcomeHarumadiNavigation": {},
    "../hooks/useLifecycleView": { useLifecycleView() {} },
    "../components/ScreenFrame": { ScreenFrame: "section" }, "../components/ContextMenu": { ContextMenu: "div" },
    "@/shared/ui/typography": { bodyCopyStyles: "" },
  };
  for (const name of components) deps[`@/features/tuti/components/${name}`] = { [name]: name };
  const flow = clientFlowHarness("src/features/tuti/flows/LibraryHomeFlow.tsx", "LibraryHomeFlow", deps);
  const parent = flow.render();
  const render = () => nodes(flow.render(parent.props, parent.type as never));
  const toggle = () => render().find(node => node.props["aria-expanded"] !== undefined)!;
  const input = () => render().find(node => node.type === "MadiSearchField");
  const click = () => (toggle().props.onClick as () => void)();
  (toggle().props.ref as { current: unknown }).current = { focus() { focuses++; } };
  assert.equal(toggle().props["aria-expanded"], false);
  assert.equal(input(), undefined);
  click();
  assert.equal(toggle().props["aria-expanded"], true);
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
});
