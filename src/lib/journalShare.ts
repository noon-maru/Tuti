"use client";

import { Capacitor } from "@capacitor/core";

import { apiUrl } from "@/lib/api/apiUrl";
import type { TutiJournalEntry } from "@/shared/api/journal";

export function isNativeSharePlatform() {
  return Capacitor.isNativePlatform();
}

export async function shareJournalPng(
  blob: Blob,
  entry: TutiJournalEntry,
) {
  const filename = createJournalShareFilename(entry);

  if (isNativeSharePlatform()) {
    await shareNativeFile(blob, filename);
    return "shared" as const;
  }

  const file = new File([blob], filename, { type: "image/png" });
  const shareData: ShareData = {
    files: [file],
  };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return "shared" as const;
    } catch (error) {
      if (isShareCancellation(error)) return "cancelled" as const;
      throw error;
    }
  }

  downloadJournalPng(blob, filename);
  return "downloaded" as const;
}

export function getPublicJournalUrl(publicId: string) {
  const encodedPublicId = encodeURIComponent(publicId);
  const apiBaseUrl = apiUrl("");

  try {
    const fallbackOrigin =
      typeof window === "undefined"
        ? "https://tuti.today"
        : window.location.origin;
    const apiOrigin = new URL(apiBaseUrl, fallbackOrigin).origin;
    return new URL(`/shared/${encodedPublicId}`, apiOrigin).toString();
  } catch {
    return `https://tuti.today/shared/${encodedPublicId}`;
  }
}

export async function copyJournalPublicUrl(publicId: string) {
  const url = getPublicJournalUrl(publicId);

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return url;
  }

  const textArea = document.createElement("textarea");
  textArea.value = url;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
  return url;
}

export function downloadJournalPng(
  blob: Blob,
  filename: string,
) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createJournalShareFilename(entry: TutiJournalEntry) {
  const date = new Date(entry.visitedAt);
  const datePart = Number.isNaN(date.getTime())
    ? "record"
    : [
        date.getFullYear(),
        `${date.getMonth() + 1}`.padStart(2, "0"),
        `${date.getDate()}`.padStart(2, "0"),
      ].join("-");

  return `tuti-${datePart}-${entry.id.slice(0, 8)}.png`;
}

async function shareNativeFile(
  blob: Blob,
  filename: string,
) {
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
      dialogTitle: "기록 PNG 공유하기",
    });
  } finally {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Cache,
      });
    } catch {
      // 운영체제가 임시 파일을 먼저 정리한 경우에는 별도 처리가 필요 없다.
    }
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("공유 이미지를 파일로 변환하지 못했어요."));
        return;
      }

      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    });
    reader.addEventListener("error", () => {
      reject(new Error("공유 이미지를 파일로 변환하지 못했어요."));
    });
    reader.readAsDataURL(blob);
  });
}

function isShareCancellation(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
