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
  journalBookDate,
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

export type JournalBookEntryLayout = "photo" | "short-text" | "long-text";

export function getJournalBookEntryLayout(
  entry: Pick<PreparedBookEntry, "image" | "content">,
): JournalBookEntryLayout {
  if (entry.image) return "photo";
  return entry.content.trim().length <= 240 ? "short-text" : "long-text";
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
  cover: { backgroundColor: "#F1F7FD", justifyContent: "center" },
  caption: { fontSize: 9, color: "#606060", marginBottom: 14 },
  title: { fontWeight: 500, fontSize: 24, lineHeight: 1.45, marginBottom: 24 },
  image: { width: "100%", height: 220, objectFit: "contain", marginBottom: 22 },
  entryTitle: { fontWeight: 500, fontSize: 17, marginBottom: 12 },
  paragraph: { marginBottom: 10 },
  coverCount: {
    width: 94,
    marginTop: 12,
    marginBottom: 28,
    paddingTop: 14,
    borderTopWidth: 2,
    borderTopColor: "#ADD1F4",
  },
  coverCountNumber: {
    color: "#386A93",
    fontSize: 30,
    fontWeight: 500,
    lineHeight: 1.2,
  },
  coverCountLabel: { color: "#606060", fontSize: 9 },
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
    fontSize: 20,
    fontWeight: 500,
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
  longTextTitle: { fontSize: 19, fontWeight: 500, lineHeight: 1.5 },
  longTextParagraph: { fontSize: 12, lineHeight: 1.95, marginBottom: 10 },
  shortLetterPage: {
    justifyContent: "center",
    paddingTop: 72,
    paddingBottom: 72,
    backgroundColor: "#FBFCFE",
  },
  shortLetterFrame: {
    paddingTop: 18,
    borderTopWidth: 2,
    borderTopColor: "#ADD1F4",
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
  const letter = printable(input.letter);
  const shortLetter = Boolean(letter.trim()) && letter.trim().length <= 240;
  const rendered = await renderToBuffer(
    <Document title={printable(input.title)} author="Tuti" language="ko-KR">
      <Page size="A5" style={[styles.page, styles.cover]}>
        <Text style={styles.caption}>작은 바깥에서 남긴 시간</Text>
        <Text style={styles.title}>{printable(input.title)}</Text>
        {cover?.image && (
          <PdfImage
            src={{ data: cover.image, format: "jpg" }}
            style={styles.image}
          />
        )}
        {!cover?.image && (
          <View style={styles.coverCount}>
            <Text style={styles.coverCountNumber}>{entries.length}</Text>
            <Text style={styles.coverCountLabel}>개의 기록</Text>
          </View>
        )}
        <Text style={styles.caption}>
          {journalBookDate(entries[0].visitedAt)} —{" "}
          {journalBookDate(entries[entries.length - 1].visitedAt)}
        </Text>
      </Page>
      {letter.trim() && (
        <Page
          size="A5"
          style={shortLetter ? [styles.page, styles.shortLetterPage] : styles.page}
        >
          <ContinuationLabel label="이 시간에 남기는 말" />
          <View style={shortLetter ? styles.shortLetterFrame : undefined}>
            <Text style={styles.caption}>이 시간에 남기는 말</Text>
            <Text orphans={4} widows={4}>
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
        if (layout === "short-text") {
          return (
            <Page
              key={entry.id}
              size="A5"
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
            <Page key={entry.id} size="A5" style={styles.page} wrap>
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
        return (
          <Page key={entry.id} size="A5" style={styles.page} wrap>
            <ContinuationLabel label={title} />
            <View wrap={false}>
              <Text style={styles.caption}>{meta}</Text>
              <Text style={styles.entryTitle}>{title}</Text>
              <PdfImage
                src={{ data: entry.image!, format: "jpg" }}
                style={styles.image}
              />
            </View>
            <Text style={styles.paragraph} orphans={4} widows={4}>
              {content}
            </Text>
          </Page>
        );
      })}
    </Document>,
  );
  return addPageFolios(rendered);
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
  const total = Math.max(0, pages.length - 1);
  pages.slice(1).forEach((page, index) => {
    const label = `${index + 1} / ${total}`;
    const size = 8;
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (page.getWidth() - width) / 2,
      y: 20,
      size,
      font,
      color: rgb(0.52, 0.52, 0.52),
    });
  });
  return document.save({ useObjectStreams: false });
}
