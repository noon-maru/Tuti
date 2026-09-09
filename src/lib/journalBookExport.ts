"use client";

import { Capacitor } from "@capacitor/core";
import { createJournalBookFilename } from "@/shared/api/journalBook";

export async function exportJournalBookPdf(bytes: Uint8Array, title: string) {
  const filename = createJournalBookFilename(title);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/pdf" });

  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return "downloaded" as const;
  }

  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const path = `share/${filename}`;
  const data = await blobToBase64(blob);
  const result = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({
      files: [result.uri],
      title,
      dialogTitle: "기록집 저장 또는 공유하기",
    });
  } finally {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Cache });
    } catch {
      // 운영체제가 임시 파일을 먼저 정리한 경우에는 별도 처리가 필요 없다.
    }
  }
  return "shared" as const;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("기록집 파일을 준비하지 못했어요."));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    });
    reader.addEventListener("error", () =>
      reject(new Error("기록집 파일을 준비하지 못했어요.")),
    );
    reader.readAsDataURL(blob);
  });
}
