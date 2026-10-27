import {
  Document,
  Font,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  PDFDocument as EditablePdfDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { PDF_FONT_FAMILY, registerPdfFonts } from "./fonts";
import { HARUMADI_PDF_LAYOUT } from "../../shared/harumadi/pdfLayout";
import {
  estimateHarumadiPdfPhotoTextLines,
  getHarumadiPdfCoverPalette,
  harumadiPdfCoverUsesImage,
  harumadiPdfDate,
  HARUMADI_PDF_PHOTO_SHORT_LINE_LIMIT,
  type HarumadiPdfInput,
} from "../../shared/api/harumadiPdf";

export type HarumadiPdfEntry = {
  id: string;
  title: string;
  content: string;
  placeName: string;
  visitedAt: Date;
  image: string | null;
};

export type PreparedHarumadiPdfEntry = Omit<HarumadiPdfEntry, "image"> & {
  image: Buffer | null;
};

export type HarumadiPdfEntryLayout =
  | "photo-only"
  | "photo-text"
  | "photo-long-text"
  | "short-text"
  | "long-text";

const HARUMADI_PDF_PAGE_SIZE = "A5" as const;

export function getHarumadiPdfEntryLayout(
  entry: Pick<PreparedHarumadiPdfEntry, "image" | "content">,
): HarumadiPdfEntryLayout {
  const contentLength = entry.content.trim().length;
  if (entry.image) {
    if (contentLength === 0) return "photo-only";
    return estimateHarumadiPdfPhotoTextLines(entry.content) <=
      HARUMADI_PDF_PHOTO_SHORT_LINE_LIMIT
      ? "photo-text"
      : "photo-long-text";
  }
  return contentLength <= 240 ? "short-text" : "long-text";
}

const layout = HARUMADI_PDF_LAYOUT;
const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    backgroundColor: "#FFFFFF",
    padding: layout.page.padding,
    paddingBottom: layout.page.paddingBottom,
    color: "#303030",
    fontSize: layout.page.fontSize,
    lineHeight: layout.page.lineHeight,
  },
  cover: {
    justifyContent: "space-between",
    paddingTop: layout.cover.paddingTop,
    paddingBottom: layout.cover.paddingBottom,
  },
  coverHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  coverDate: { width: layout.cover.dateWidth, fontSize: layout.cover.fontSize, lineHeight: layout.cover.lineHeight },
  coverTitle: {
    width: layout.cover.titleWidth,
    fontSize: layout.cover.fontSize,
    lineHeight: layout.cover.lineHeight,
    textAlign: "right",
  },
  coverBody: {
    height: layout.cover.bodyHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: {
    width: layout.cover.imageWidth,
    height: layout.cover.imageHeight,
    borderRadius: layout.photo.imageRadius,
    objectFit: "cover",
  },
  coverPlaceholder: { width: layout.cover.imageWidth, height: layout.cover.imageHeight, borderRadius: layout.photo.imageRadius },
  coverWordmark: { fontSize: layout.cover.wordmarkSize, textAlign: "right" },
  backCover: {
    paddingTop: 42,
    paddingLeft: 42,
    paddingRight: 42,
    paddingBottom: 42,
  },
  backCoverMessage: { fontSize: 9, lineHeight: 1.5 },
  photoPage: {
    paddingTop: layout.photo.padding,
    paddingLeft: layout.photo.padding,
    paddingRight: layout.photo.padding,
    paddingBottom: layout.photo.paddingBottom,
    fontSize: layout.photo.fontSize,
    lineHeight: 1.8,
  },
  photoHeader: {
    height: layout.photo.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoDate: { fontSize: layout.photo.fontSize, lineHeight: layout.photo.headerLineHeight },
  photoPlace: {
    flexDirection: "row",
    alignItems: "center",
    fontSize: layout.photo.fontSize,
    lineHeight: layout.photo.headerLineHeight,
  },
  photoPlaceMark: {
    width: layout.photo.placeMarkSize,
    height: layout.photo.placeMarkSize,
    overflow: "hidden",
    marginRight: layout.photo.placeMarkGap,
    borderRadius: 4,
  },
  photoPlaceMarkTop: { height: 3.5, backgroundColor: "#C7E887" },
  photoPlaceMarkBottom: { height: 3.5, backgroundColor: "#8CBDEF" },
  photoOnlyBody: {
    flexGrow: 1,
    justifyContent: "center",
  },
  photoOnlyImage: {
    width: "100%",
    height: layout.photo.imageHeight,
    borderRadius: layout.photo.imageRadius,
    objectFit: "cover",
  },
  photoStoryLead: { marginTop: layout.photo.lead },
  photoStoryImage: {
    width: "100%",
    height: layout.photo.imageHeight,
    borderRadius: layout.photo.imageRadius,
    objectFit: "cover",
  },
  photoStoryCopy: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  photoStoryTitle: {
    width: layout.photo.titleWidth,
    paddingRight: layout.photo.titlePaddingRight,
    fontSize: layout.photo.titleSize,
    fontWeight: layout.photo.titleWeight,
    lineHeight: layout.photo.titleLineHeight,
  },
  photoStoryText: {
    width: layout.photo.textWidth,
    fontSize: layout.photo.fontSize,
    lineHeight: layout.photo.textLineHeight,
    textAlign: "left",
  },
  caption: { fontSize: layout.shortText.captionSize, color: "#606060", marginBottom: layout.shortText.captionGap },
  shortTextPage: {
    justifyContent: "center",
    paddingTop: layout.shortText.paddingVertical,
    paddingBottom: layout.shortText.paddingVertical,
    backgroundColor: layout.shortText.background,
  },
  shortTextFrame: {
    paddingLeft: layout.shortText.frameLeft,
    paddingRight: layout.shortText.frameRight,
    borderLeftWidth: layout.shortText.borderWidth,
    borderLeftColor: layout.shortText.borderColor,
  },
  shortTextTitle: {
    fontSize: layout.shortText.titleSize,
    fontWeight: layout.shortText.titleWeight,
    lineHeight: layout.shortText.titleLineHeight,
    marginBottom: layout.shortText.titleGap,
  },
  shortTextParagraph: { fontSize: layout.shortText.bodySize, lineHeight: layout.shortText.bodyLineHeight },
  longTextLead: {
    marginBottom: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#DCE7F1",
  },
  longTextTitle: { fontSize: 10, fontWeight: 600, lineHeight: 1.5 },
  longTextParagraph: { fontSize: 12, lineHeight: 1.95, marginBottom: 10 },
  letterPage: {
    backgroundColor: "#FFFFFF",
  },
  shortLetterPage: {
    justifyContent: "center",
  },
  letterHeading: {
    position: "absolute",
    top: 34,
    left: 34,
    right: 34,
    color: "#202020",
    fontSize: 10,
    lineHeight: 1.5,
  },
  shortLetterFrame: {
    width: "72%",
    alignSelf: "flex-end",
  },
  longLetterFrame: {
    width: "72%",
    alignSelf: "flex-end",
    marginTop: 72,
  },
  letterText: {
    fontSize: 9,
    lineHeight: 2.1,
    textAlign: "right",
  },
  continuation: {
    position: "absolute",
    top: 16,
    left: 34,
    right: 34,
    color: "#777777",
    fontSize: 8,
    letterSpacing: 0.2,
  },
});

export async function renderHarumadiPdf(
  input: HarumadiPdfInput,
  entries: PreparedHarumadiPdfEntry[],
) {
  registerPdfFonts();
  await Font.load({ fontFamily: PDF_FONT_FAMILY, fontWeight: 400 });
  const font = Font.getFont({ fontFamily: PDF_FONT_FAMILY, fontWeight: 400 });
  const printable = (text: string) =>
    Array.from(text.normalize("NFC"))
      .map((character) =>
        character === "\n" || character === "\r"
          ? character
          : character === "\t"
            ? " "
            : font.data?.hasGlyphForCodePoint(character.codePointAt(0)!)
              ? character
              : "□",
      )
      .join("");
  const cover = entries.find((entry) => entry.id === input.coverEntryId);
  const coverPalette = getHarumadiPdfCoverPalette(input.coverStyle);
  const imageCover = harumadiPdfCoverUsesImage(input.coverStyle);
  const firstDate = harumadiPdfDate(entries[0].visitedAt).replaceAll("-", ".");
  const lastDate = harumadiPdfDate(
    entries[entries.length - 1].visitedAt,
  ).replaceAll("-", ".");
  const letter = printable(input.letter);
  const shortLetter = Boolean(letter.trim()) && letter.trim().length <= 240;
  const rendered = await renderToBuffer(
    <Document title={printable(input.title)} author="Tuti" language="ko-KR">
      <Page
        size={HARUMADI_PDF_PAGE_SIZE}
        style={[
          styles.page,
          styles.cover,
          { backgroundColor: coverPalette.background },
        ]}
      >
        <View style={styles.coverHeader}>
          <Text style={[styles.coverDate, { color: coverPalette.foreground }]}>
            {firstDate}{"\n"}- {lastDate}
          </Text>
          <Text style={[styles.coverTitle, { color: coverPalette.foreground }]}>
            {printable(input.title)}
          </Text>
        </View>
        <View style={styles.coverBody}>
          {imageCover && cover?.image && (
            <PdfImage
              src={{ data: cover.image, format: "jpg" }}
              style={styles.coverImage}
            />
          )}
          {imageCover && !cover?.image && (
            <View
              style={[
                styles.coverPlaceholder,
                { backgroundColor: coverPalette.placeholder },
              ]}
            />
          )}
        </View>
        <Text
          style={[styles.coverWordmark, { color: coverPalette.foreground }]}
        >
          Tuti
        </Text>
      </Page>
      {letter.trim() && (
        <Page
          size={HARUMADI_PDF_PAGE_SIZE}
          style={[
            styles.page,
            styles.letterPage,
            ...(shortLetter ? [styles.shortLetterPage] : []),
          ]}
          wrap
        >
          <Text
            fixed
            style={styles.letterHeading}
            render={({ subPageNumber }) =>
              subPageNumber > 1
                ? "이 공간에 남기는 말 · 계속"
                : "이 공간에 남기는 말"
            }
          />
          <View
            style={
              shortLetter ? styles.shortLetterFrame : styles.longLetterFrame
            }
          >
            <Text style={styles.letterText} orphans={4} widows={4}>
              {letter}
            </Text>
          </View>
        </Page>
      )}
      {entries.map((sourceEntry) => {
        const entry = input.innerStyle === "text" ? { ...sourceEntry, image: null } : sourceEntry;
        const layout = getHarumadiPdfEntryLayout(entry);
        const title = printable(entry.title);
        const content = printable(entry.content);
        const meta = `${harumadiPdfDate(entry.visitedAt)} · ${printable(entry.placeName)}`;
        const photoDate = harumadiPdfDate(entry.visitedAt).replaceAll("-", ".");
        const placeName = printable(entry.placeName);
        if (layout === "photo-only") {
          return (
            <Page
              key={entry.id}
              size={HARUMADI_PDF_PAGE_SIZE}
              style={[styles.page, styles.photoPage]}
            >
              <PhotoEntryHeader date={photoDate} placeName={placeName} />
              <View style={styles.photoOnlyBody}>
                <PdfImage
                  src={{ data: entry.image!, format: "jpg" }}
                  style={styles.photoOnlyImage}
                />
              </View>
            </Page>
          );
        }
        if (layout === "photo-text" || layout === "photo-long-text") {
          return (
            <Page
              key={entry.id}
              size={HARUMADI_PDF_PAGE_SIZE}
              style={[styles.page, styles.photoPage]}
              wrap
            >
              <ContinuationLabel label={title} />
              <View wrap={false}>
                <PhotoEntryHeader date={photoDate} placeName={placeName} />
                <View style={styles.photoStoryLead}>
                  <PdfImage
                    src={{ data: entry.image!, format: "jpg" }}
                    style={styles.photoStoryImage}
                  />
                </View>
              </View>
              <View
                style={[
                  styles.photoStoryCopy,
                  { marginTop: layout === "photo-text" ? HARUMADI_PDF_LAYOUT.photo.shortGap : HARUMADI_PDF_LAYOUT.photo.longGap },
                ]}
              >
                <Text style={styles.photoStoryTitle}>{title}</Text>
                <Text
                  style={styles.photoStoryText}
                  orphans={4}
                  widows={4}
                >
                  {content}
                </Text>
              </View>
            </Page>
          );
        }
        if (layout === "short-text") {
          return (
            <Page
              key={entry.id}
              size={HARUMADI_PDF_PAGE_SIZE}
              style={[styles.page, styles.shortTextPage]}
            >
              <View style={styles.shortTextFrame} wrap={false}>
                <Text style={styles.caption}>{meta}</Text>
                <Text style={styles.shortTextTitle}>{title}</Text>
                <Text style={styles.shortTextParagraph}>{content}</Text>
              </View>
            </Page>
          );
        }
        if (layout === "long-text") {
          return (
            <Page
              key={entry.id}
              size={HARUMADI_PDF_PAGE_SIZE}
              style={styles.page}
              wrap
            >
              <ContinuationLabel label={title} />
              <View style={styles.longTextLead} wrap={false}>
                <Text style={styles.caption}>{meta}</Text>
                <Text style={styles.longTextTitle}>{title}</Text>
              </View>
              <Text style={styles.longTextParagraph} orphans={4} widows={4}>
                {content}
              </Text>
            </Page>
          );
        }
        return null;
      })}
      <Page
        size={HARUMADI_PDF_PAGE_SIZE}
        style={[
          styles.page,
          styles.backCover,
          { backgroundColor: coverPalette.background },
        ]}
      >
        <Text
          style={[
            styles.backCoverMessage,
            { color: coverPalette.foreground },
          ]}
        >
          오늘 가능한 만큼만,
        </Text>
      </Page>
    </Document>,
  );
  return addPageFolios(rendered);
}

function PhotoEntryHeader({
  date,
  placeName,
}: {
  date: string;
  placeName: string;
}) {
  return (
    <View style={styles.photoHeader}>
      <Text style={styles.photoDate}>{date}</Text>
      <View style={styles.photoPlace}>
        <View style={styles.photoPlaceMark}>
          <View style={styles.photoPlaceMarkTop} />
          <View style={styles.photoPlaceMarkBottom} />
        </View>
        <Text>{placeName}</Text>
      </View>
    </View>
  );
}

function ContinuationLabel({ label }: { label: string }) {
  return (
    <Text
      fixed
      style={styles.continuation}
      render={({ subPageNumber }) =>
        subPageNumber > 1 ? `${label} · 계속` : ""
      }
    />
  );
}

async function addPageFolios(pdf: Uint8Array) {
  const document = await EditablePdfDocument.load(pdf);
  const pages = document.getPages();
  const font = await document.embedFont(StandardFonts.Helvetica);
  pages.slice(1, -1).forEach((page, index) => {
    const label = `${index + 1}`;
    const size = layout.folio.fontSize;
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: page.getWidth() - layout.folio.right - width,
      y: layout.folio.bottom,
      size,
      font,
      color: rgb(layout.folio.gray, layout.folio.gray, layout.folio.gray),
    });
  });
  return document.save({ useObjectStreams: false });
}
