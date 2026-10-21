import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { verifyIsolatedRestore } from "../src/server/legal/isolatedRestoreVerification";

async function main() {
  if (process.argv.length !== 2 || process.env.TUTI_ISOLATED_RESTORE !== "true") throw new Error("SANDBOX_REQUIRED");
  const client = new S3Client({ endpoint: "http://127.0.0.1:3900", region: "privacy-ci", forcePathStyle: true,
    credentials: { accessKeyId: "GK0123456789abcdef01234567", secretAccessKey: "2".repeat(64) } });
  const Bucket = "tuti-restore-test";
  try {
    const initial = await client.send(new ListObjectsV2Command({ Bucket, MaxKeys: 1 }));
    if (initial.Contents?.length) throw new Error("EMPTY_SANDBOX_REQUIRED");
    const manifest = JSON.parse(await readFile("/backup/objects.manifest.json", "utf8"));
    const refs = JSON.parse(await readFile("/evidence/references.json", "utf8"));
    const result = await verifyIsolatedRestore(manifest, refs, {
      read: file => readFile(`/backup/objects/${file}`),
      put: async (item, bytes) => { await client.send(new PutObjectCommand({ Bucket, Key: item.key, Body: bytes,
        ContentType: item.contentType ?? "application/octet-stream", CacheControl: item.cacheControl ?? undefined })); },
      get: async key => {
        const response = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!response.Body) throw new Error("BODY_MISSING");
        return Buffer.from(await response.Body.transformToByteArray());
      },
      image: async bytes => { const info = await sharp(bytes, { limitInputPixels: 16_000_000 }).stats(); if (!info.channels.length) throw new Error("IMAGE_DECODE_FAILED"); },
      pdf: async bytes => (await PDFDocument.load(bytes)).getPageCount(),
    });
    console.log(JSON.stringify(result));
    if (process.env.TUTI_CORE_RESTORE_TEST === "true") {
      const pdf = await PDFDocument.create();
      pdf.addPage([420, 595]); pdf.addPage([420, 595]);
      const bytes = Buffer.from(await pdf.save());
      const Key = "__isolated-restore-fixture__/synthetic-two-page.pdf";
      await client.send(new PutObjectCommand({ Bucket, Key, Body: bytes, ContentType: "application/pdf" }));
      const response = await client.send(new GetObjectCommand({ Bucket, Key }));
      if (!response.Body) throw new Error("SYNTHETIC_PDF_BODY_MISSING");
      const returned = Buffer.from(await response.Body.transformToByteArray());
      const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
      if (hash(bytes) !== hash(returned) || (await PDFDocument.load(returned)).getPageCount() !== 2) throw new Error("SYNTHETIC_PDF_ROUND_TRIP_FAILED");
      console.log(JSON.stringify({ scope: "synthetic-pdf-storage-round-trip", pagesVerified: 2, sha256Matched: true,
        actualUserPdfVerified: false, databaseBookBindingTested: false, artifactPolicy: "removed-with-isolated-garage" }));
    }
  } finally { client.destroy(); }
}
main().catch(() => { console.error('{"stage":"isolated-object-restore-and-content-check","status":"failed","privateDetailsSuppressed":true}'); process.exitCode = 1; });
