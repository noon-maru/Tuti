/** 표지·책등·읽기·PDF가 공유하는 종이 색상. 임의 CSS 값은 저장하지 않는다. */
export const HARUMADI_COVER_COLORS = [
  { id: "white", label: "흰색", background: "#FFFFFF", foreground: "#202020", placeholder: "#EBF5D5" },
  { id: "green", label: "연두", background: "#EBF5D5", foreground: "#36553A", placeholder: "#D6E5BD" },
  { id: "blue", label: "하늘", background: "#E4EFF9", foreground: "#284C68", placeholder: "#CADDEA" },
  { id: "peach", label: "살구", background: "#F7E6DA", foreground: "#70452F", placeholder: "#ECD3BF" },
  { id: "pink", label: "분홍", background: "#F5E3EB", foreground: "#704253", placeholder: "#E8CCD8" },
  { id: "lavender", label: "보라", background: "#EAE5F5", foreground: "#51436D", placeholder: "#D9D0E9" },
] as const;
export type HarumadiCoverColor = typeof HARUMADI_COVER_COLORS[number]["id"];

export const HARUMADI_PAPER_COLORS = [
  { id: "white", label: "흰색", background: "#FFFFFF" },
  { id: "ivory", label: "크림", background: "#FFFCF4" },
  { id: "green", label: "연두", background: "#F5F8EE" },
  { id: "blue", label: "하늘", background: "#F1F7FC" },
  { id: "pink", label: "분홍", background: "#FCF3F5" },
  { id: "lavender", label: "보라", background: "#F7F4FC" },
] as const;
export type HarumadiPaperColor = typeof HARUMADI_PAPER_COLORS[number]["id"];
export function isHarumadiPaperColor(value: unknown): value is HarumadiPaperColor {
  return HARUMADI_PAPER_COLORS.some(color => color.id === value);
}
export function getHarumadiPaperPalette(value: HarumadiPaperColor = "white") {
  const color = HARUMADI_PAPER_COLORS.find(color => color.id === value) ?? HARUMADI_PAPER_COLORS[0];
  return { ...color, foreground: "#303030", muted: "#56606B" };
}
export function getHarumadiCoverColor(style: string): HarumadiCoverColor {
  return HARUMADI_COVER_COLORS.find(color => style.startsWith(`${color.id}-`))?.id ?? "white";
}
export function harumadiCoverPalette(style: string) {
  return HARUMADI_COVER_COLORS.find(color => color.id === getHarumadiCoverColor(style)) ?? HARUMADI_COVER_COLORS[0];
}
