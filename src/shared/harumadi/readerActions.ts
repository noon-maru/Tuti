import type { Harumadi } from "@/shared/api/harumadi";

export type HarumadiManagementAction = "settings" | "selection" | "order" | "pdf";

export function readerManagementActions(role: Harumadi["role"], entryCount: number): { action: HarumadiManagementAction; label: string }[] {
  return [
    ...(role !== "contributor" ? [{ action: "settings" as const, label: "이름과 표지" }] : []),
    { action: "selection", label: "마디 골라 담기" },
    ...(role !== "contributor" && entryCount >= 2 ? [{ action: "order" as const, label: "마디 순서 바꾸기" }] : []),
    ...(entryCount > 0 ? [{ action: "pdf" as const, label: "PDF로 저장하기" }] : []),
  ];
}
