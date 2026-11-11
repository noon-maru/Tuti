export type PdfExportResult = "downloaded" | "shared" | "cancelled";

/** An OS dialog or a browser download request cannot prove a durable device copy. */
export function pdfExportStatus(result: PdfExportResult) {
  if (result === "cancelled") return "저장·공유를 취소했어요. PDF는 Tuti에 보관돼요.";
  if (result === "downloaded") return "PDF는 Tuti에 보관돼요. 다운로드 목록에서 파일을 확인해주세요.";
  return "PDF는 Tuti에 보관돼요. 선택한 앱이나 파일에서 저장 여부를 확인해주세요.";
}

export function isPdfExportCancelled(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; message?: unknown };
  return value.name === "AbortError" || /cancel(?:led|ed)?|user abort/i.test(String(value.message ?? ""));
}
