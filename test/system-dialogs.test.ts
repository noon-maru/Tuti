import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("사용자·관리자 코드에 시스템 alert·confirm·prompt가 다시 들어오지 않는다", () => {
  // 배포 작업 이미지는 Git 실행 파일·메타데이터 없이도 같은 검사를 수행한다.
  const paths = sourceFiles("src");
  const native: string[] = [], unawaited: string[] = [];
  let confirmations = 0;
  for (const path of paths) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        let name: string | undefined, global = false;
        if (ts.isIdentifier(expression)) { name = expression.text; global = true; }
        else if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
          const owner = expression.expression.getText(source);
          global = owner === "window" || owner === "globalThis";
          name = ts.isPropertyAccessExpression(expression) ? expression.name.text : expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression) ? expression.argumentExpression.text : undefined;
        }
        if (global && name && ["alert", "confirm", "prompt"].includes(name)) native.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        if (ts.isIdentifier(expression) && expression.text === "confirmAction") {
          confirmations++;
          if (!ts.isAwaitExpression(node.parent)) unawaited.push(path);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  assert.deepEqual(native, []);
  assert.deepEqual(unawaited, [], "Promise 자체를 참으로 취급해 취소를 우회하면 안 된다");
  assert(confirmations >= 23, "이번 라운드의 사용자·관리자 확인 지점이 누락되면 안 된다");
});

test("브라우저 이탈 경고는 유지하고 공유 결과는 토스트·파기는 모달로 연결한다", () => {
  const draft = readFileSync("src/features/tuti/hooks/useMadiDraft.ts", "utf8");
  assert.match(draft, /window.addEventListener\("beforeunload", beforeUnload\)/);
  assert.match(draft, /event.returnValue = ""/);
  assert.match(draft, /await confirmAction\("초안을 저장하지 못했어요/);
  const share = readFileSync("src/features/tuti/hooks/useJournalShareActions.ts", "utf8");
  assert.match(share, /showToast\("공유 링크를 복사했어요/);
  assert.match(share, /showErrorToast\("공유 링크를 복사하지 못했어요/);
  const admin = readFileSync("src/features/admin/AdminScreen.tsx", "utf8");
  assert.equal((admin.match(/await confirmAction\(/g) ?? []).length, 7);
  assert.match(admin, /if \(!confirmed\) return/);
});
