import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountScreen } from "@/features/tuti/screens/account/AccountScreen";

const props: ComponentProps<typeof AccountScreen> = {
  authEnabled: true, onBack() {}, onRestart() {},
  async onEmailCodeRequest() { throw Error("not called during rendering"); },
  async onEmailCodeVerify() { throw Error("not called during rendering"); },
  async onDeleteAccount() { throw Error("not called during rendering"); },
  async onDisplayNameUpdate(name) { return name; }, async onOAuth() {}, async onUnlinkIdentity() {}, async onUnblockJournalAuthor() {},
};
test("로그인·계정 관리 입력과 계정 연결 중 상태는 공통 제목·입력 역할을 유지한다", () => {
  const login = renderToStaticMarkup(createElement(AccountScreen, props));
  assert.match(login, /font-size:var\(--ui-input-size\)/);
  assert.match(login, /outline-offset:-2px/);
  assert.doesNotMatch(login, /box-shadow:0 0 0 3px/);
  assert.match(login, /background:var\(--color-action-primary-background\)/);
  const account = renderToStaticMarkup(createElement(AccountScreen, { ...props, providers: ["email"], displayName: "테스트 계정", email: "sample@example.test" }));
  assert.match(account, /계정 및 데이터/);
  assert.match(account, /font-size:var\(--ui-input-size\)/);
  assert.doesNotMatch(account, /box-shadow:0 0 0 3px/);
  const pending = renderToStaticMarkup(createElement(AccountScreen, { ...props, oauthCompletion: { pending: true, onCancel() {}, onJournalResolution() {} } }));
  assert.match(pending, /계정을 연결하고 있어요/);
});
test("계정 보조 조작은 최소 44px를 확보하고 인증·병합·파기 처리는 유지한다", () => {
  const source = readFileSync("src/features/tuti/screens/account/AccountScreen.tsx", "utf8");
  for (const name of ["EmailChangeButton", "UnlinkButton", "ReturnToCodeButton", "DeletionButton"]) {
    const block = source.match(new RegExp(`const ${name} = styled\\(BaseButton\\)\x60([\\s\\S]*?)\x60;`))![1];
    assert.match(block, /min-height: 44px/);
  }
  assert.doesNotMatch(source, /\$hasInput|box-shadow: 0 0 0 3px/);
  for (const action of ["onEmailCodeVerify", "onDeleteAccount", "onUnlinkIdentity", "onJournalResolution", "setDeletionReference(result.deletionReference)"]) assert.ok(source.includes(action));
});
