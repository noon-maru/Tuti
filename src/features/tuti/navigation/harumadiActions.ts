import type { Harumadi } from "@/shared/api/harumadi";

export type HarumadiOpeningMode = "pages" | "settings" | "together";

export function harumadiActions(book: Harumadi): { label: string; mode: HarumadiOpeningMode }[] {
  return [
    ...(book.togetherEnabled ? [{ label: book.shared ? "함께 채우기 관리" : "함께 채우기 시작", mode: "together" as const }] : []),
    ...(book.role !== "contributor" ? [{ label: "하루마디 설정", mode: "settings" as const }] : []),
  ];
}

export function initialHarumadiMode(book: Harumadi, mode: HarumadiOpeningMode = "pages"): HarumadiOpeningMode {
  if (mode === "together" || (mode === "settings" && book.role === "contributor")) return book.togetherEnabled ? "together" : "pages";
  return mode;
}
