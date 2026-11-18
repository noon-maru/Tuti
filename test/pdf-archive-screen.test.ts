import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, createElement, type ComponentProps, type ReactNode, type ReactElement } from "react";
import styled from "@emotion/styled";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HarumadiPdfArchiveScreen } from "@/features/tuti/screens/library/HarumadiPdfArchiveScreen";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const defaults: ComponentProps<typeof HarumadiPdfArchiveScreen> = { ownerId: "owner", files: [], pending: false, error: false, busy: false, hasNextPage: false, onBack() {}, onOpen() {}, onRetry() {}, onLoadMore() {} };
const file = { id: "pdf-one", title: "우리의 작은 하루", entryCount: 3, pageCount: 6, createdAt: "2026-11-18T01:00:00Z", coverStyle: "green-plain" as const };
function render(props: Partial<typeof defaults> = {}) {
  const client = new QueryClient();
  try { return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HarumadiPdfArchiveScreen, { ...defaults, ...props }))); }
  finally { client.clear(); }
}

test("빈 PDF 보관함은 중앙 안내·책장 행동을 제공하고 보관 설명은 접어 둔다", () => {
  const html = render();
  assert.match(html, /저장한 PDF/);
  assert.match(html, /간직하고 싶은 하루를/);
  assert.match(html, /책장으로 가기/);
  assert.match(html, /justify-content:center/);
  assert.match(html, /aria-expanded="false" aria-controls="pdf-archive-help"/);
  assert.match(html, /id="pdf-archive-help" aria-hidden="true"/);
  assert.match(html, /visibility:hidden/);
  assert.doesNotMatch(html, /#F8FAFC|font-size:10px/);
});

test("보관 설명은 같은 자리에서 열고 닫으며 본문 높이를 바꾸는 조건부 요소를 만들지 않는다", () => {
  const page = clientFlowHarness("src/features/tuti/screens/library/HarumadiPdfArchiveScreen.tsx", "HarumadiPdfArchiveScreen", {
    "@emotion/styled": styled,
    "lucide-react": { FileText: "icon", ChevronRight: "icon" },
    "../../components/ScreenFrame": { ScreenFrame: "section" },
    "../../components/buttons": { BackButton: "button", BaseButton: "button", Button: "button", TextButton: "button" },
    "../../components/HarumadiCover": { HarumadiCover: "cover" },
    "../../components/LoadingIndicator": { LoadingIndicator: "loading" },
    "@/shared/ui/typography": { screenTitleStyles: "", bodyCopyStyles: "", captionStyles: "" },
  });
  const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
  const render = () => nodes(page.render(defaults));
  const initial = render(), toggle = initial.find(node => node.props["aria-controls"] === "pdf-archive-help")!;
  const help = (tree: typeof initial) => tree.find(node => node.props.id === "pdf-archive-help")!;
  const body = (tree: typeof initial) => Children.toArray(tree[0].props.children as ReactNode)[1] as ReactElement;
  assert.equal(toggle.props["aria-expanded"], false);
  assert.equal(help(initial).props.$visible, false);
  (toggle.props.onClick as () => void)();
  const opened = render();
  assert.equal(opened.find(node => node.props["aria-controls"] === "pdf-archive-help")!.props["aria-expanded"], true);
  assert.equal(help(opened).props.$visible, true);
  assert.equal(help(opened).props["aria-hidden"], false);
  assert.equal(help(opened).type, help(initial).type);
  assert.equal(opened.length, initial.length, "안내 문구는 숨겼을 때도 공간을 유지한다");
  assert.equal(renderToStaticMarkup(body(opened)), renderToStaticMarkup(body(initial)), "안내를 열어도 본문 구성과 스타일은 그대로다");
  (toggle.props.onClick as () => void)();
  assert.equal(help(render()).props.$visible, false);
  page.dispose();
});

test("저장 목록은 실제 표지·제목·날짜·쪽수로 표시하며 기존 파일은 조회 오류에도 유지한다", () => {
  const html = render({ files: [file], error: true, hasNextPage: true });
  assert.match(html, /저장한 PDF 목록/);
  assert.match(html, /우리의 작은 하루, 6쪽 PDF 열기/);
  assert.match(html, /2026\.11\.18/);
  assert.match(html, /PDF 목록을 모두 불러오지 못했어요/);
  assert.match(html, /다시 시도/);
  assert.doesNotMatch(html, /책장으로 가기|PDF 더 보기/);
  assert.match(render({ files: [file], hasNextPage: true }), /PDF 더 보기/);
});

test("초기 불러오기·초기 실패를 빈 상태로 오인하지 않고 중복 재시도를 막는다", () => {
  const loading = render({ pending: true });
  assert.match(loading, /role="status"/);
  assert.doesNotMatch(loading, /간직하고 싶은 하루를/);
  const error = render({ error: true, busy: true });
  assert.match(error, /PDF를 불러오지 못했어요/);
  assert.match(error, /disabled=""/);
  assert.doesNotMatch(error, /간직하고 싶은 하루를/);
});

test("실제 보관함 흐름은 소유 계정 조회·파일 열기·책장 복귀·다음 페이지 실패 재시도를 유지한다", () => {
  const paths: string[] = [], retries: string[] = [];
  const query = { data: { pages: [{ harumadiPdfs: [file] }] }, isPending: false, isError: false, isFetching: false, hasNextPage: true, isFetchNextPageError: false, refetch() { retries.push("refresh"); }, fetchNextPage() { retries.push("next"); } };
  let owner = "";
  const flow = clientFlowHarness("src/features/tuti/flows/HarumadiPdfArchiveFlow.tsx", "HarumadiPdfArchiveFlow", {
    "next/navigation": { useRouter: () => ({ push: (path: string) => paths.push(path), replace: (path: string) => paths.push(path) }) },
    "@tanstack/react-query": { useInfiniteQuery: (options: { queryKey: string[] }) => { owner = options.queryKey[1]; return query; } },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "@/features/tuti/components/LoadingIndicator": { AppLoadingScreen: "loading" },
    "@/lib/harumadiPdfLibrary": { fetchLibraryHarumadis() {}, libraryHarumadiPath: (id: string) => `/harumadi/pdf/view?harumadiPdfId=${id}` },
    "../screens/library/HarumadiPdfArchiveScreen": { HarumadiPdfArchiveScreen: "screen" },
  });
  const parent = flow.render();
  const screen = () => flow.render(parent.props, parent.type as never).props as unknown as typeof defaults;
  const props = screen();
  assert.equal(owner, "owner"); assert.equal(props.files[0].id, file.id);
  props.onOpen(file.id); props.onBack(); props.onLoadMore(); props.onRetry();
  assert.deepEqual(paths, ["/harumadi/pdf/view?harumadiPdfId=pdf-one&from=pdfs", "/"]);
  query.isFetchNextPageError = true; screen().onRetry();
  assert.deepEqual(retries, ["next", "refresh", "next"]);
  flow.dispose();
});
