import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const nativeScreens = [
  "src/features/tuti/screens/onboarding/WelcomeScreen.tsx",
  "src/features/legal/InitialServiceTermsGate.tsx",
  "src/features/tuti/components/NativeAppUpdateNotice.tsx",
];

test("앱 진입·약관·업데이트의 내부 링크는 Next 라우터를 사용한다", () => {
  for (const file of nativeScreens) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /import Link from "next\/link"/);
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let internalLinks = 0;
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const href = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "href");
        if (href && ts.isJsxAttribute(href) && href.initializer && ts.isStringLiteral(href.initializer) && href.initializer.text.startsWith("/")) {
          internalLinks++;
          const tag = node.tagName.getText(tree);
          assert.notEqual(tag, "a", `${file}: 일반 내부 링크 금지`);
          if (tag === "ButtonLink") assert.match(node.getText(tree), /as=\{Link\}/);
          else assert.equal(tag, "Link");
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.ok(internalLinks > 0);
  }
});

test("이메일 링크는 외부 처리로 유지한다", () => {
  for (const file of nativeScreens.slice(1))
    assert.match(readFileSync(file, "utf8"), /<a href="mailto:admin@tuti.today">/);
});

test("앱 오류 재시도는 전체 문서를 새로고침하지 않는다", () => {
  const update = readFileSync("src/features/tuti/components/NativeAppUpdateNotice.tsx", "utf8");
  const book = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const pdf = readFileSync("src/features/tuti/flows/HarumadiPdfFlow.tsx", "utf8");
  for (const source of [update, book, pdf]) assert.doesNotMatch(source, /window\.location\.reload/);
  assert.match(update, /onClick=\{retryVersionCheck\}/);
  assert.match(update, /setAttempt\(value => value \+ 1\)/);
  assert.match(book, /if \(id\) void query.refetch\(\)/);
  assert.match(book, /disabled=\{busy \|\| refreshing\}/);
  assert.match(book, /if \(!dirty\) onRefresh\(\)/);
  assert.match(pdf, /try \{ await ensureSession\(\); \}/);
  assert.match(pdf, /setLoadAttempt\(value => value \+ 1\)/);
  assert.match(pdf, /\[ownerId, loadAttempt\]/);
  assert.match(pdf, /if \(active\) setDraft/);
});
