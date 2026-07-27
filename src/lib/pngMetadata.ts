import type {
  JournalShareTraceFinalization,
  TutiJournalEntry,
} from "@/shared/api/journal";

const PNG_SIGNATURE = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
]);
const IEND = "IEND";
const ITXT = "iTXt";
const MAX_METADATA_VALUE_BYTES = 4096;
const textEncoder = new TextEncoder();
const crcTable = createCrcTable();

export async function embedJournalShareMetadata({
  entry,
  png,
  publicUrl,
  trace,
}: {
  entry: TutiJournalEntry;
  png: Blob;
  publicUrl?: string;
  trace: JournalShareTraceFinalization;
}) {
  const source = publicUrl ?? "https://tuti.today";
  const metadata = [
    ["Title", entry.title || "Tuti 기록"],
    ["Publisher", "Tuti"],
    ["Software", "Tuti"],
    ["Description", "Tuti에서 생성된 기록 공유 이미지"],
    ["Source", source],
    ["Tuti Trace ID", trace.traceId],
    ["Tuti Short Code", trace.shortCode],
    ["Tuti Signature", trace.signature],
    ["Tuti Image SHA256", trace.imageSha256],
    ["Tuti Generated At", trace.finalizedAt],
  ] as const;
  const bytes = new Uint8Array(await png.arrayBuffer());

  assertPng(bytes);

  const chunks = metadata.map(([keyword, value]) =>
    createInternationalTextChunk(keyword, value),
  );
  const iendOffset = findIendOffset(bytes);
  const outputLength =
    bytes.byteLength +
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(outputLength);
  let outputOffset = 0;

  output.set(bytes.subarray(0, iendOffset), outputOffset);
  outputOffset += iendOffset;

  for (const chunk of chunks) {
    output.set(chunk, outputOffset);
    outputOffset += chunk.byteLength;
  }

  output.set(bytes.subarray(iendOffset), outputOffset);
  return new Blob([output], { type: "image/png" });
}

function createInternationalTextChunk(
  keyword: string,
  value: string,
) {
  const keywordBytes = textEncoder.encode(keyword);
  const valueBytes = textEncoder.encode(value);

  if (
    keywordBytes.byteLength === 0 ||
    keywordBytes.byteLength > 79 ||
    [...keywordBytes].some((byte) => byte > 127 || byte === 0)
  ) {
    throw new Error("PNG 메타데이터 항목 이름이 올바르지 않아요.");
  }

  if (valueBytes.byteLength > MAX_METADATA_VALUE_BYTES) {
    throw new Error("PNG 메타데이터 내용이 너무 길어요.");
  }

  const data = new Uint8Array(
    keywordBytes.byteLength + 5 + valueBytes.byteLength,
  );
  data.set(keywordBytes);
  data.set(valueBytes, keywordBytes.byteLength + 5);

  return createPngChunk(ITXT, data);
}

function createPngChunk(type: string, data: Uint8Array) {
  const typeBytes = textEncoder.encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.byteLength);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    crc32(chunk.subarray(4, 8 + data.byteLength)),
  );
  return chunk;
}

function findIendOffset(bytes: Uint8Array) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  let offset = PNG_SIGNATURE.byteLength;

  while (offset + 12 <= bytes.byteLength) {
    const dataLength = view.getUint32(offset);
    const chunkEnd = offset + 12 + dataLength;

    if (chunkEnd > bytes.byteLength) break;

    const type = String.fromCharCode(
      ...bytes.subarray(offset + 4, offset + 8),
    );

    if (type === IEND) return offset;
    offset = chunkEnd;
  }

  throw new Error("PNG 이미지의 끝을 확인하지 못했어요.");
}

function assertPng(bytes: Uint8Array) {
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    throw new Error("공유 이미지가 올바른 PNG 형식이 아니에요.");
  }
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value =
        value & 1
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}
