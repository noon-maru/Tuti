import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";

import {
  deleteObject,
  isObjectStorageEnabled,
  putObject,
} from "@/server/storage/objectStorage";

const JOURNAL_IMAGE_KEY_PREFIX = "journal-images/";
const JOURNAL_IMAGE_API_PREFIX = "/api/journal-entry-images/";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_OUTPUT_WIDTH = 1200;
const MAX_OUTPUT_HEIGHT = 900;
const WEBP_QUALITY = 82;

type JournalImageIdentity = {
  id: string;
  ownerId: string;
  image: string | null;
  updatedAt: Date;
};

type PreparedJournalImage = {
  image: string | null;
  uploadedKey: string | null;
};

export async function prepareJournalImage({
  ownerId,
  entryId,
  image,
  currentImage = null,
}: {
  ownerId: string;
  entryId: string;
  image: string | null;
  currentImage?: string | null;
}): Promise<PreparedJournalImage> {
  if (!image) return { image: null, uploadedKey: null };

  if (
    currentImage &&
    isStoredJournalImage(currentImage) &&
    isJournalImageApiUrl(image, entryId)
  ) {
    return { image: currentImage, uploadedKey: null };
  }

  const parsedImage = parseImageDataUrl(image);

  if (image.startsWith("data:") && !parsedImage) {
    throw new JournalImageError(
      "JPEG, PNG, WebP 이미지 파일만 사용할 수 있어요.",
      "unsupported_journal_image",
    );
  }

  if (!parsedImage) {
    return { image, uploadedKey: null };
  }

  if (!isObjectStorageEnabled()) {
    throw new JournalImageError(
      "이미지 저장소가 아직 준비되지 않았어요.",
      "journal_image_storage_disabled",
    );
  }

  const webpImage = await convertToWebp(parsedImage.bytes);
  const key = [
    JOURNAL_IMAGE_KEY_PREFIX.replace(/\/$/, ""),
    ownerId,
    entryId,
    `${crypto.randomUUID()}.webp`,
  ].join("/");

  await putObject({
    key,
    body: webpImage,
    contentType: "image/webp",
  });

  return { image: key, uploadedKey: key };
}

export async function deleteStoredJournalImage(image: string | null) {
  if (!image || !isStoredJournalImage(image)) return;
  await deleteObject(image);
}

export function isStoredJournalImage(
  image: string,
): image is `${typeof JOURNAL_IMAGE_KEY_PREFIX}${string}` {
  return image.startsWith(JOURNAL_IMAGE_KEY_PREFIX);
}

export function serializeJournalImage(entry: JournalImageIdentity) {
  if (!entry.image || !isStoredJournalImage(entry.image)) {
    return entry.image;
  }

  const signature = signJournalImage(entry);
  return `${JOURNAL_IMAGE_API_PREFIX}${encodeURIComponent(entry.id)}?signature=${signature}`;
}

export function verifyJournalImageSignature(
  entry: JournalImageIdentity,
  signature: string,
) {
  if (!entry.image || !isStoredJournalImage(entry.image)) return false;

  const expected = Buffer.from(signJournalImage(entry), "hex");
  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

function signJournalImage(entry: JournalImageIdentity) {
  return createHmac("sha256", getJournalImageSigningSecret())
    .update(
      [
        "tuti-journal-image-v1",
        entry.id,
        entry.ownerId,
        entry.image,
        entry.updatedAt.toISOString(),
      ].join("\n"),
    )
    .digest("hex");
}

function getJournalImageSigningSecret() {
  const secret = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();

  if (!secret) {
    throw new Error(
      "저널 이미지 URL 서명에 필요한 스토리지 비밀키가 없어요.",
    );
  }

  return secret;
}

function isJournalImageApiUrl(value: string, entryId: string) {
  try {
    const url = new URL(value, "https://tuti.local");
    const expectedPath = `${JOURNAL_IMAGE_API_PREFIX}${encodeURIComponent(entryId)}`;
    return url.pathname.endsWith(expectedPath);
  } catch {
    return false;
  }
}

function parseImageDataUrl(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=\s]+)$/.exec(
    value,
  );

  if (!match) return null;

  const contentType = match[1] as SupportedImageContentType;
  const encoded = match[2].replace(/\s/g, "");
  const bytes = Buffer.from(encoded, "base64");

  if (
    bytes.length === 0 ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64").replace(/=+$/, "") !==
      encoded.replace(/=+$/, "") ||
    !hasExpectedImageSignature(bytes, contentType)
  ) {
    throw new JournalImageError(
      "이미지는 5MB 이하의 올바른 파일이어야 해요.",
      "invalid_journal_image",
    );
  }

  return { contentType, bytes };
}

async function convertToWebp(bytes: Buffer) {
  try {
    return await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
    })
      .rotate()
      .resize({
        width: MAX_OUTPUT_WIDTH,
        height: MAX_OUTPUT_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: WEBP_QUALITY,
        alphaQuality: 90,
        effort: 4,
        smartSubsample: true,
      })
      .toBuffer();
  } catch {
    throw new JournalImageError(
      "이미지를 WebP로 변환하지 못했어요.",
      "journal_image_conversion_failed",
    );
  }
}

function hasExpectedImageSignature(
  bytes: Buffer,
  contentType: SupportedImageContentType,
) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }

  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

type SupportedImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export class JournalImageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "JournalImageError";
  }
}
