// 실제 PDF(pt)와 HTML 예시가 함께 사용하는 A5 레이아웃. 예시 전용 근삿값을 두지 않는다.
export const HARUMADI_PDF_LAYOUT = {
  page: { width: 419.53, height: 595.28, padding: 34, paddingBottom: 48, fontSize: 11, lineHeight: 1.8 },
  cover: { paddingTop: 34, paddingBottom: 28, dateWidth: "42%", titleWidth: "48%", fontSize: 8, lineHeight: 1.55,
    bodyHeight: 260, imageWidth: 210, imageHeight: 170, wordmarkSize: 10 },
  photo: { padding: 42, paddingBottom: 48, fontSize: 9, headerHeight: 14, headerLineHeight: 1.4,
    imageHeight: 250, imageRadius: 5, lead: 32, shortGap: 66, longGap: 30,
    placeMarkSize: 7, placeMarkGap: 3, titleWidth: "42%", textWidth: "52%", titlePaddingRight: 14,
    titleSize: 10, titleWeight: 600, titleLineHeight: 1.8, textLineHeight: 1.9 },
  shortText: { paddingVertical: 72, frameLeft: 22, frameRight: 12, borderWidth: 2, background: "#FBFCFE",
    borderColor: "#ADD1F4", captionSize: 9, captionGap: 14, titleSize: 10, titleWeight: 600,
    titleLineHeight: 1.5, titleGap: 20, bodySize: 13, bodyLineHeight: 2 },
  folio: { right: 34, bottom: 20, fontSize: 9, gray: 0.52 },
} as const;

/** PDF의 pt를 예시 페이지 너비에 비례하는 CSS 길이로 변환한다. */
export function harumadiPdfCssLength(pt: number) {
  return `${pt / HARUMADI_PDF_LAYOUT.page.width * 100}cqw`;
}
