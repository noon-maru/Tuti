import { createHmac, timingSafeEqual } from "node:crypto";

import {
  deleteObject,
  isObjectStorageEnabled,
  putObject,
} from "@/server/storage/objectStorage";

const JOURNAL_IMAGE_KEY_PREFIX = "journal-images/";
const JOURNAL_IMAGE_API_PREFIX = "/api/journal-entry-images/";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

  const extension = extensionByContentType[parsedImage.contentType];
  const key = [
    JOURNAL_IMAGE_KEY_PREFIX.replace(/\/$/, ""),
    ownerId,
    entryId,
    `${crypto.randomUUID()}.${extension}`,
  ].join("/");

  await putObject({
    key,
    body: parsedImage.bytes,
    contentType: parsedImage.contentType,
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

  const contentType = match[1] as keyof typeof extensionByContentType;
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

function hasExpectedImageSignature(
  bytes: Buffer,
  contentType: keyof typeof extensionByContentType,
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

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export class JournalImageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "JournalImageError";
  }
}
