import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("PDF 저장은 한 줄 헤더·짧은 안내로 정리하고 다른 모드의 헤더는 유지한다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const header = source.match(/<Header\b[^\n]*\$pdf=\{mode === "pdf"\}[\s\S]*?<\/Header>/)?.[0] ?? "";
  assert.match(header, /mode === "pdf" && <PdfHeading>PDF로 저장하기/);
  assert.match(header, /<BackButton onClick=\{back\} disabled=\{busy\}/);
  assert.match(source, /<PdfNote>Tuti에 보관한 PDF는 하루마디를 수정해도 바뀌지 않아요/);
  assert.doesNotMatch(source, /<h1>PDF로 저장하기<\/h1>|지금 담긴 마디로 PDF를 만들어/);
  assert.match(source, /\$pdf && `justify-content: flex-start; gap: 4px;/);
  assert.match(source, /\$pdf && `padding-top: 12px/);
  assert.match(source, /PDF 파일 저장하기/);
  assert.match(source, /mode === "pdf" && \(!pdf\?\.approvalToken/);
  assert.match(source, /sensitivePolicy && \(!sensitivePolicy.enabled \|\| confirmed\)/);
});

test("PDF 도구의 장식만 줄이고 확대·텍스트·전체화면·재시도는 보존한다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiPdfPreview.tsx", "utf8");
  const toolbar = source.match(/const PreviewToolbar = styled.div`([^`]+)`/)![1];
  assert.doesNotMatch(toolbar, /box-shadow|border:|border-radius/);
  assert.match(toolbar, /position: sticky/);
  const button = source.match(/const ToolButton = styled\(BaseButton\)`([^`]+)`/)![1];
  assert.match(button, /min-width: 44px/); assert.match(button, /min-height: 44px/);
  for (const action of ["미리보기 축소", "미리보기 확대", "텍스트로 보기", "전체 화면으로 보기", "전체 화면 닫기", "다시 시도하기"]) assert.ok(source.includes(action), action);
  assert.match(source, /Math.max\(1, value - 0.25\)/);
  assert.match(source, /Math.min\(2, value \+ 0.25\)/);
  assert.match(source, /setShowText\(\(value\) => !value\)/);
  assert.match(source, /setExpanded\(\(value\) => !value\)/);
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /@container app-viewport \(max-width: 340px\) \{ display: none; \}/);
  assert.match(source, /const Sheet = styled.div`[^`]*border-radius: 2px/);
});
