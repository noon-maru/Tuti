import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

type ObjectStorageConfiguration = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type StoredObject = {
  body: NonNullable<GetObjectCommandOutput["Body"]>;
  contentType?: string;
  contentLength?: number;
  cacheControl?: string;
  etag?: string;
  lastModified?: Date;
};

const globalForObjectStorage = globalThis as unknown as {
  tutiObjectStorageClient?: S3Client;
};

export function isObjectStorageEnabled() {
  return process.env.OBJECT_STORAGE_ENABLED === "true";
}

export async function verifyObjectStorageConnection() {
  const { bucket } = getObjectStorageConfiguration();

  await executeStorageRequest("스토리지 연결을 확인하지 못했어요.", () =>
    getObjectStorageClient().send(
      new HeadBucketCommand({
        Bucket: bucket,
      }),
    ),
  );
}

export async function putObject({
  key,
  body,
  contentType,
  cacheControl = "private, max-age=31536000, immutable",
}: {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType: string;
  cacheControl?: string;
}) {
  const { bucket } = getObjectStorageConfiguration();
  const normalizedKey = normalizeObjectKey(key);

  const result = await executeStorageRequest(
    "이미지를 저장하지 못했어요.",
    () =>
      getObjectStorageClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: normalizedKey,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      ),
  );

  return {
    key: normalizedKey,
    etag: result.ETag,
  };
}

export async function getObject(key: string): Promise<StoredObject> {
  const { bucket } = getObjectStorageConfiguration();
  const normalizedKey = normalizeObjectKey(key);
  const result = await executeStorageRequest(
    "이미지를 불러오지 못했어요.",
    () =>
      getObjectStorageClient().send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: normalizedKey,
        }),
      ),
  );

  if (!result.Body) {
    throw new ObjectStorageError(
      "이미지 응답에 본문이 없어요.",
      "object_body_missing",
    );
  }

  return {
    body: result.Body,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
    cacheControl: result.CacheControl,
    etag: result.ETag,
    lastModified: result.LastModified,
  };
}

export async function objectExists(key: string) {
  const { bucket } = getObjectStorageConfiguration();
  const normalizedKey = normalizeObjectKey(key);

  try {
    await getObjectStorageClient().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
      }),
    );
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;

    throw new ObjectStorageError(
      "이미지 존재 여부를 확인하지 못했어요.",
      "object_head_failed",
      error,
    );
  }
}

export async function deleteObject(key: string) {
  const { bucket } = getObjectStorageConfiguration();
  const normalizedKey = normalizeObjectKey(key);

  await executeStorageRequest("이미지를 삭제하지 못했어요.", () =>
    getObjectStorageClient().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
      }),
    ),
  );
}

export async function listObjects(continuationToken?: string) {
  const { bucket } = getObjectStorageConfiguration();
  const result = await executeStorageRequest(
    "이미지 목록을 불러오지 못했어요.",
    () =>
      getObjectStorageClient().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1_000,
        }),
      ),
  );

  return {
    objects: (result.Contents ?? []).flatMap((item) =>
      item.Key
        ? [{
            key: item.Key,
            size: item.Size ?? 0,
            etag: item.ETag,
            lastModified: item.LastModified,
          }]
        : [],
    ),
    nextContinuationToken: result.NextContinuationToken,
  };
}

export function getObjectStorageBucket() {
  return getObjectStorageConfiguration().bucket;
}

function getObjectStorageClient() {
  if (globalForObjectStorage.tutiObjectStorageClient) {
    return globalForObjectStorage.tutiObjectStorageClient;
  }

  const configuration = getObjectStorageConfiguration();
  const client = new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  if (process.env.NODE_ENV !== "production") {
    globalForObjectStorage.tutiObjectStorageClient = client;
  }

  return client;
}

function getObjectStorageConfiguration(): ObjectStorageConfiguration {
  if (!isObjectStorageEnabled()) {
    throw new ObjectStorageError(
      "오브젝트 스토리지가 비활성화되어 있어요.",
      "object_storage_disabled",
    );
  }

  const endpoint = getRequiredStorageEnv("OBJECT_STORAGE_ENDPOINT");
  let endpointUrl: URL;

  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new ObjectStorageError(
      "오브젝트 스토리지 주소가 올바르지 않아요.",
      "invalid_object_storage_endpoint",
    );
  }

  if (!["http:", "https:"].includes(endpointUrl.protocol)) {
    throw new ObjectStorageError(
      "오브젝트 스토리지 주소는 HTTP 또는 HTTPS여야 해요.",
      "invalid_object_storage_endpoint",
    );
  }

  return {
    endpoint: endpointUrl.toString().replace(/\/+$/, ""),
    region: getRequiredStorageEnv("OBJECT_STORAGE_REGION"),
    bucket: getRequiredStorageEnv("OBJECT_STORAGE_BUCKET"),
    accessKeyId: getRequiredStorageEnv("OBJECT_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredStorageEnv(
      "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ),
  };
}

function getRequiredStorageEnv(name: string) {
  const value = process.env[name]?.trim();

  if (value) return value;

  throw new ObjectStorageError(
    `오브젝트 스토리지 환경변수가 없어요: ${name}`,
    "object_storage_not_configured",
  );
}

function normalizeObjectKey(key: string) {
  const normalizedKey = key.trim().replace(/^\/+/, "");
  const segments = normalizedKey.split("/");

  if (
    !normalizedKey ||
    normalizedKey.length > 1024 ||
    normalizedKey.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(normalizedKey) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new ObjectStorageError(
      "이미지 저장 경로가 올바르지 않아요.",
      "invalid_object_key",
    );
  }

  return normalizedKey;
}

async function executeStorageRequest<T>(
  message: string,
  request: () => Promise<T>,
) {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ObjectStorageError) throw error;

    throw new ObjectStorageError(
      message,
      "object_storage_request_failed",
      error,
    );
  }
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };

  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export class ObjectStorageError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ObjectStorageError";
  }
}
