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
import {
  estimateJournalBookPhotoTextLines,
  getJournalBookCoverPalette,
  journalBookCoverUsesImage,
  journalBookDate,
  JOURNAL_BOOK_PHOTO_SHORT_LINE_LIMIT,
  type JournalBookInput,
} from "../../shared/api/journalBook";

export type BookEntry = {
  id: string;
  title: string;
  content: string;
  placeName: string;
  visitedAt: Date;
  image: string | null;
};

export type PreparedBookEntry = Omit<BookEntry, "image"> & {
  image: Buffer | null;
};

export type JournalBookEntryLayout =
  | "photo-only"
  | "photo-text"
  | "photo-long-text"
  | "short-text"
  | "long-text";

const JOURNAL_BOOK_PAGE_SIZE = "A5" as const;

export function getJournalBookEntryLayout(
  entry: Pick<PreparedBookEntry, "image" | "content">,
): JournalBookEntryLayout {
  const contentLength = entry.content.trim().length;
  if (entry.image) {
    if (contentLength === 0) return "photo-only";
    return estimateJournalBookPhotoTextLines(entry.content) <=
      JOURNAL_BOOK_PHOTO_SHORT_LINE_LIMIT
      ? "photo-text"
      : "photo-long-text";
  }
  return contentLength <= 240 ? "short-text" : "long-text";
}

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    backgroundColor: "#FFFFFF",
    padding: 34,
    paddingBottom: 48,
    color: "#303030",
    fontSize: 11,
    lineHeight: 1.8,
  },
  cover: {
    justifyContent: "space-between",
    paddingTop: 34,
    paddingBottom: 28,
  },
  coverHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  coverDate: { width: "42%", fontSize: 8, lineHeight: 1.55 },
  coverTitle: {
    width: "48%",
    fontSize: 8,
    lineHeight: 1.55,
    textAlign: "right",
  },
  coverBody: {
    height: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: {
    width: 210,
    height: 170,
    borderRadius: 5,
    objectFit: "cover",
  },
  coverPlaceholder: { width: 210, height: 170, borderRadius: 5 },
  coverWordmark: { fontSize: 10, textAlign: "right" },
  backCover: {
    paddingTop: 42,
    paddingLeft: 42,
    paddingRight: 42,
    paddingBottom: 42,
  },
  backCoverMessage: { fontSize: 9, lineHeight: 1.5 },
  photoPage: {
    paddingTop: 42,
    paddingLeft: 42,
    paddingRight: 42,
    paddingBottom: 48,
    fontSize: 9,
    lineHeight: 1.8,
  },
  photoHeader: {
    height: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoDate: { fontSize: 9, lineHeight: 1.4 },
  photoPlace: {
    flexDirection: "row",
    alignItems: "center",
    fontSize: 9,
    lineHeight: 1.4,
  },
  photoPlaceMark: {
    width: 7,
    height: 7,
    overflow: "hidden",
    marginRight: 3,
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
    height: 250,
    borderRadius: 5,
    objectFit: "cover",
  },
  photoStoryLead: { marginTop: 32 },
  photoStoryImage: {
    width: "100%",
    height: 250,
    borderRadius: 5,
    objectFit: "cover",
  },
  photoStoryCopy: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  photoStoryTitle: {
    width: "42%",
    paddingRight: 14,
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.8,
  },
  photoStoryText: {
    width: "52%",
    fontSize: 9,
    lineHeight: 1.9,
    textAlign: "left",
  },
  caption: { fontSize: 9, color: "#606060", marginBottom: 14 },
  shortTextPage: {
    justifyContent: "center",
    paddingTop: 72,
    paddingBottom: 72,
    backgroundColor: "#FBFCFE",
  },
  shortTextFrame: {
    paddingLeft: 22,
    paddingRight: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#ADD1F4",
  },
  shortTextTitle: {
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.5,
    marginBottom: 20,
  },
  shortTextParagraph: { fontSize: 13, lineHeight: 2 },
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

export async function renderJournalBook(
  input: JournalBookInput,
  entries: PreparedBookEntry[],
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
  const coverPalette = getJournalBookCoverPalette(input.coverStyle);
  const imageCover = journalBookCoverUsesImage(input.coverStyle);
  const firstDate = journalBookDate(entries[0].visitedAt).replaceAll("-", ".");
  const lastDate = journalBookDate(
    entries[entries.length - 1].visitedAt,
  ).replaceAll("-", ".");
  const letter = printable(input.letter);
  const shortLetter = Boolean(letter.trim()) && letter.trim().length <= 240;
  const rendered = await renderToBuffer(
    <Document title={printable(input.title)} author="Tuti" language="ko-KR">
      <Page
        size={JOURNAL_BOOK_PAGE_SIZE}
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
          size={JOURNAL_BOOK_PAGE_SIZE}
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
      {entries.map((entry) => {
        const layout = getJournalBookEntryLayout(entry);
        const title = printable(entry.title);
        const content = printable(entry.content);
        const meta = `${journalBookDate(entry.visitedAt)} · ${printable(entry.placeName)}`;
        const photoDate = journalBookDate(entry.visitedAt).replaceAll("-", ".");
        const placeName = printable(entry.placeName);
        if (layout === "photo-only") {
          return (
            <Page
              key={entry.id}
              size={JOURNAL_BOOK_PAGE_SIZE}
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
              size={JOURNAL_BOOK_PAGE_SIZE}
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
                  { marginTop: layout === "photo-text" ? 66 : 30 },
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
              size={JOURNAL_BOOK_PAGE_SIZE}
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
              size={JOURNAL_BOOK_PAGE_SIZE}
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
        size={JOURNAL_BOOK_PAGE_SIZE}
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
    const size = 9;
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: page.getWidth() - 34 - width,
      y: 20,
      size,
      font,
      color: rgb(0.52, 0.52, 0.52),
    });
  });
  return document.save({ useObjectStreams: false });
}
