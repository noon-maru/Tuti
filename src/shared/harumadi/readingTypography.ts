/** 화면 읽기용 px. 인쇄용 PDF의 pt와 분리한다. */
export const HARUMADI_READING_TYPE = {
  body: 16, photoBody: 14, title: 18, photoTitle: 16, meta: 11,
  bodyLineHeight: 1.8, titleLineHeight: 1.5,
} as const;

/** Fixed reading UI geometry, shared by pagination and the HTML sheet. */
export const HARUMADI_READING_LAYOUT = {
  headerHeight: 20, copyGap: 8, safety: 2,
  continuation: { photoWidth: 52, photoHeight: 39, gap: 12, metaGap: 6, bottomGap: 16, titleLines: 2, metaLineHeight: 1.6 },
} as const;
