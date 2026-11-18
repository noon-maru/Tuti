import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { palette } from "@/styles/tokens";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { harumadiContent } from "./fixtures/harumadiContent";

const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
const text = (root: ReactNode): string => Children.toArray(root).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function createReportScene() {
  let requests = 0, complete!: (response: Response) => void;
  const page = clientFlowHarness("src/features/tuti/screens/journal/PublicJournalScreen.tsx", "PublicJournalScreen", {
    "@emotion/styled": styled, "@/styles/tokens": { palette },
    "@/shared/harumadi/imageGeometry": { imageAspectRatio: () => "4 / 3" },
    "@/lib/feedback": { confirmAction: async () => true, showErrorToast() {} },
    "@/shared/ui/AppDialogFrame": { AppDialogFrame: "dialog-frame" },
    "@/shared/ui/typography": { inputControlStyles: "" },
    "@/features/tuti/components/JournalLocationLabel": { JournalLocationLabel: "location" },
    "@/features/tuti/components/buttons": { BaseButton: "button", BaseButtonLink: "a", Button: "button", PrimaryButton: "button", TextButton: "button" },
    "@/lib/auth/session": { fetchWithSession: async (path: string, options: RequestInit) => {
      requests++; assert.equal(path, "reports");
      assert.equal(JSON.parse(String(options.body)).publicId, "public-test");
      return new Promise<Response>(resolve => { complete = resolve; });
    } },
  }, { Response });
  const props = { entry: { ...harumadiContent().entries[0], publicId: "public-test", publishedAt: "2026-11-18T00:00:00Z" }, loading: false, async onBlockAuthor() {} };
  const render = () => nodes(page.render(props));
  const click = (label: string) => { const node = render().find(node => node.props.onClick && text(node.props.children as ReactNode) === label)!; (node.props.onClick as () => void)(); };
  const modal = () => render().find(node => node.type === "dialog-frame");
  return { page, render, click, modal, requests: () => requests, complete: (response: Response) => complete(response) };
}
test("공개 마디 신고는 공용 모달로 열고 전송 중 닫기·취소·중복 접수를 잠근다", async () => {
  const scene = createReportScene();
  scene.click("신고하기"); assert.equal(scene.modal()!.props.role, "dialog");
  scene.click("신고 접수"); scene.click("접수 중...");
  assert.equal(scene.requests(), 1);
  assert.equal(scene.modal()!.props.busy, true);
  (scene.modal()!.props.onCancel as () => void)(); assert.ok(scene.modal());
  assert.equal(scene.render().find(node => text(node.props.children as ReactNode) === "취소")!.props.disabled, true);
  scene.complete(Response.json({})); await flush();
  assert.equal(scene.modal()!.props.busy, false);
  assert.ok(scene.render().some(node => text(node.props.children as ReactNode) === "신고를 접수했어요."));
  scene.click("확인"); assert.equal(scene.modal(), undefined);
  scene.page.dispose();
});
test("신고 전송 실패 시 모달·입력은 유지하고 다시 접수할 수 있다", async () => {
  const scene = createReportScene(); scene.click("신고하기"); scene.click("신고 접수");
  scene.complete(Response.json({}, { status: 500 })); await flush();
  assert.ok(scene.modal()); assert.equal(scene.modal()!.props.busy, false);
  assert.ok(scene.render().some(node => node.props.role === "alert"));
  scene.click("신고 접수"); assert.equal(scene.requests(), 2);
  scene.complete(Response.json({})); await flush(); scene.page.dispose();
});
test("독자 키보드·배경 처리를 제거하고 초기·완료 초점과 공통 입력을 사용한다", () => {
  const source = readFileSync("src/features/tuti/screens/journal/PublicJournalScreen.tsx", "utf8");
  assert.doesNotMatch(source, /ReportBackdrop|const ReportDialog|ANDROID_BACK_EVENT|document.body.style.overflow|window.addEventListener/);
  assert.match(source, /initialFocus=\{reportStatus === "submitted" \? reportDone : reasonRef\}/);
  assert.match(source, /reportDone.current\?\.focus\(\)/);
  assert.match(source, /\$\{inputControlStyles\}/);
});
