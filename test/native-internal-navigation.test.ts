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
