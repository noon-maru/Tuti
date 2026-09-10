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
        <Text style={styles.caption}>
          {journalBookDate(entries[0].visitedAt)} —{" "}
          {journalBookDate(entries[entries.length - 1].visitedAt)}
        </Text>
      </Page>
      {input.letter.trim() && (
        <Page size="A5" style={styles.page}>
          <ContinuationLabel label="이 시간에 남기는 말" />
          <Text style={styles.caption}>이 시간에 남기는 말</Text>
          <Text orphans={4} widows={4}>
            {printable(input.letter)}
          </Text>
        </Page>
      )}
      {entries.map((entry) => (
        <Page key={entry.id} size="A5" style={styles.page} wrap>
          <ContinuationLabel label={printable(entry.title)} />
          <View wrap={false}>
            <Text style={styles.caption}>
              {journalBookDate(entry.visitedAt)} · {printable(entry.placeName)}
            </Text>
            <Text style={styles.entryTitle}>{printable(entry.title)}</Text>
            {entry.image && (
              <PdfImage
                src={{ data: entry.image, format: "jpg" }}
                style={styles.image}
              />
            )}
          </View>
          <Text style={styles.paragraph} orphans={4} widows={4}>
            {printable(entry.content)}
          </Text>
        </Page>
      ))}
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
