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
  return renderToBuffer(
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
          <Text style={styles.caption}>이 시간에 남기는 말</Text>
          <Text orphans={2} widows={2}>
            {printable(input.letter)}
          </Text>
        </Page>
      )}
      {entries.map((entry) => (
        <Page key={entry.id} size="A5" style={styles.page} wrap>
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
          <Text style={styles.paragraph} orphans={2} widows={2}>
            {printable(entry.content)}
          </Text>
        </Page>
      ))}
    </Document>,
  );
}
