import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactNode, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import styled from "@emotion/styled";
import { InquiryHistory } from "@/features/tuti/screens/inquiry/InquiryScreen";
import { JournalEditorStatusScreen } from "@/features/tuti/screens/journal/JournalEditorScreen";
import type { UserInquiryItem } from "@/shared/api/inquiry";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";

const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
const text = (root: ReactNode): string => Children.toArray(root).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
const inquiry: UserInquiryItem = { id: "test-inquiry", category: "service", subject: "테스트 문의", message: "남겨둔 문의 원문", status: "answered", adminResponse: "확인한 답변", handledAt: "2026-11-18T00:00:00Z", createdAt: "2026-11-18T00:00:00Z", updatedAt: "2026-11-18T00:00:00Z" };
test("문의 내역은 조회 실패와 빈 상태를 구분하고 재시도·새 문의 행동을 제공한다", () => {
  let retries = 0, writes = 0;
  const props = { inquiries: [], loading: false, error: null, onRetry() { retries++; }, onWrite() { writes++; } };
  const empty = InquiryHistory(props);
  assert.match(renderToStaticMarkup(empty), /아직 남긴 문의가 없어요/);
  (nodes(empty).find(node => text(node.props.children as ReactNode) === "문의 남기기")!.props.onClick as () => void)();
  const error = InquiryHistory({ ...props, error: "조회에 실패했어요." });
  const html = renderToStaticMarkup(error);
  assert.doesNotMatch(html, /아직 남긴 문의가 없어요/);
  assert.match(html, /role="alert"/);
  (nodes(error).find(node => text(node.props.children as ReactNode) === "다시 불러오기")!.props.onClick as () => void)();
  assert.equal(retries, 1); assert.equal(writes, 1);
  assert.match(renderToStaticMarkup(createElement(InquiryHistory, { ...props, error: "실패", refreshing: true })), /disabled=""/);
});
test("문의 갱신에 실패해도 기존 문의·답변은 남고 로딩은 빈 안내로 바뀌지 않는다", () => {
  const props = { inquiries: [inquiry], loading: false, error: "새로 불러오지 못했어요.", onRetry() {}, onWrite() {} };
  const html = renderToStaticMarkup(createElement(InquiryHistory, props));
  for (const value of [inquiry.subject, inquiry.message, inquiry.adminResponse!, "다시 불러오기"]) assert.ok(html.includes(value));
  const loading = renderToStaticMarkup(createElement(InquiryHistory, { ...props, inquiries: [], loading: true, error: null }));
  assert.match(loading, /문의 내역을 불러오고 있어요/); assert.doesNotMatch(loading, /아직 남긴 문의가 없어요/);
});
test("마디 수정의 로딩·실패·누락 상태는 정상 화면과 같은 이름을 쓴다", () => {
  for (const state of [{ loading: true }, { onRetry() {} }, {}]) {
    const html = renderToStaticMarkup(createElement(JournalEditorStatusScreen, { message: "마디 확인 중", onBack() {}, ...state }));
    assert.match(html, /마디 다듬기/); assert.match(html, /이전 화면으로 돌아가기/);
    assert.doesNotMatch(html, /고치는 공간|지난 공간으로/);
  }
});
test("PDF 실패·로딩은 공통 헤더를 유지하고 보관함에서 왔다면 보관함으로 복귀한다", () => {
  const paths: string[] = [];
  let retries = 0;
  const query = { data: null, isPending: false, isError: true, isFetching: false, refetch() { retries++; } };
  const page = clientFlowHarness("src/features/tuti/flows/HarumadiPdfReaderFlow.tsx", "HarumadiPdfReaderFlow", {
    "@emotion/styled": styled, "@/shared/ui/typography": { screenTitleStyles: "", bodyCopyStyles: "" },
    "@/features/tuti/components/ScreenFrame": { ScreenFrame: "section" },
    "@/features/tuti/components/buttons": { BackButton: "button", TextButton: "button" },
    "@/features/tuti/components/LoadingIndicator": { AppLoadingScreen: "loading", LoadingIndicator: "loading" },
    "next/navigation": { useRouter: () => ({ replace: (path: string) => paths.push(path) }), useSearchParams: () => new URLSearchParams("harumadiPdfId=pdf-one&from=pdfs") },
    "@tanstack/react-query": { useQuery: () => query, useQueryClient: () => ({}) },
    "@/features/tuti/hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "./HarumadiPdfFlow": { StoredHarumadiPdfViewer: "viewer" }, "@/lib/harumadiPdfLibrary": { fetchLibraryHarumadi() {} },
  });
  const parent = page.render(); const render = () => page.render(parent.props, parent.type as never);
  const tree = render();
  assert.match(renderToStaticMarkup(tree), /<h1>저장한 PDF<\/h1>/);
  (nodes(tree).find(node => node.props["aria-label"] === "저장한 PDF 목록으로 돌아가기")!.props.onClick as () => void)();
  (nodes(tree).find(node => text(node.props.children as ReactNode) === "다시 불러오기")!.props.onClick as () => void)();
  assert.deepEqual(paths, ["/harumadi/pdfs"]); assert.equal(retries, 1);
  query.isFetching = true;
  assert.equal(nodes(render()).find(node => text(node.props.children as ReactNode) === "불러오는 중…")!.props.disabled, true);
  query.isPending = true; query.isError = false;
  assert.match(renderToStaticMarkup(render()), /PDF를 열고 있어요/);
  page.dispose();
});
