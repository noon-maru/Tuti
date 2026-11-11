import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isPdfExportCancelled, pdfExportStatus } from "../src/shared/harumadi/pdfExportStatus";

test("PDF 내보내기 취소와 다운로드 요청을 영구 파일 저장 성공으로 안내하지 않는다", () => {
  assert.match(pdfExportStatus("cancelled"), /취소.*Tuti에 보관/);
  assert.match(pdfExportStatus("downloaded"), /다운로드 목록.*확인/);
  assert.match(pdfExportStatus("shared"), /선택한 앱.*저장 여부.*확인/);
  assert.equal(isPdfExportCancelled({ message: "User cancelled" }), true);
  assert.equal(isPdfExportCancelled({ name: "AbortError" }), true);
  assert.equal(isPdfExportCancelled(Error("disk full")), false);
});

test("네이티브 공유 취소는 보관 실패가 아니며 임시 파일은 성공·취소·실패 모두 정리한다", async () => {
  for (const result of ["success", "cancel", "failure"]) {
    let removed = 0;
    const events: string[] = [];
    class Reader {
      result = "data:application/pdf;base64,cGRm";
      listeners: Record<string, () => void> = {};
      addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
      readAsDataURL() { queueMicrotask(() => this.listeners.load()); }
    }
    const deps: Record<string, unknown> = {
      "@capacitor/core": { Capacitor: { isNativePlatform: () => true } },
      "@/shared/api/harumadiPdf": { createHarumadiPdfFilename: () => "test.pdf" },
      "./lifecycle": { trackLifecycle: (name: string) => events.push(name) },
      "@/shared/harumadi/pdfExportStatus": { isPdfExportCancelled },
      "@capacitor/filesystem": { Directory: { Cache: "cache" }, Filesystem: { writeFile: async () => ({ uri: "file:test" }), deleteFile: async () => { removed++; } } },
      "@capacitor/share": { Share: { share: async () => { if (result === "cancel") throw { message: "User cancelled" }; if (result === "failure") throw Error("disk full"); } } },
    };
    const exports: { exportHarumadiPdf?: (bytes: Uint8Array, title: string) => Promise<string> } = {};
    vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/harumadiPdfExport.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; }, Blob, FileReader: Reader, Uint8Array, Error });
    if (result === "failure") await assert.rejects(exports.exportHarumadiPdf!(new Uint8Array([1]), "예시"));
    else assert.equal(await exports.exportHarumadiPdf!(new Uint8Array([1]), "예시"), result === "cancel" ? "cancelled" : "shared");
    assert.equal(removed, 1);
    assert.equal(events.includes("pdf_exported"), result === "success");
  }
});

test("저장과 기기 전달 실패를 구분하고 마지막 쪽에서만 실물 준비 안내로 연결한다", () => {
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  assert.ok(flow.indexOf('queryKey: ["library-exports", owner]') < flow.indexOf("const result = await exportHarumadiPdf"));
  assert.match(flow, /PDF는 Tuti에 보관됐어요.*기기로 내보내지 못했으니/);
  assert.match(flow, /keepsakeAction=\{!readOnly \?/);
  assert.match(flow, /surface="harumadi_reader"/);
  const viewer = readFileSync("src/features/tuti/components/HarumadiPageViewer.tsx", "utf8");
  assert.match(viewer, /lastPage && entries.length > 0 && !closing && !retained && keepsakeAction/);
  const purchase = readFileSync("src/features/tuti/components/HarumadiPurchaseButton.tsx", "utf8");
  assert.match(purchase, /아직 주문하거나 결제할 수는 없어요/);
  assert.match(purchase, /디지털 예시.*실제 제작 사양과 가격·배송은 확정되면/);
});
