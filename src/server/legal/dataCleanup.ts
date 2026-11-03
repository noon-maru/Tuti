import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { deleteStoredHarumadiPdf } from "@/server/harumadi/pdfStorage";
import { getRequiredAuthEnv } from "@/server/auth/config";
import { revokeAppleRefreshToken } from "@/server/auth/appleOAuth";
import { commitPrivacyReplayReceipt, type PrivacyReplayReceipt } from "./privacyReplayLedger";

export type DataCleanupPayload = {
  images: string[];
  pdfs: string[];
  // Apple 토큰은 기존 AES-GCM 암호문만 저장한다.
  appleTokens: string[];
  receipt: PrivacyReplayReceipt | null;
};

export async function enqueueDataCleanup(tx: Prisma.TransactionClient, payload: DataCleanupPayload) {
  if (!payload.images.length && !payload.pdfs.length && !payload.appleTokens.length && !payload.receipt) return null;
  const id = randomUUID();
  await tx.userDataCleanupJob.create({ data: { id, payload: payload as unknown as Prisma.InputJsonObject } });
  return id;
}

function readPayload(value: Prisma.JsonValue): DataCleanupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid cleanup payload");
  const data = value as unknown as DataCleanupPayload;
  if (![data.images, data.pdfs, data.appleTokens].every(list => Array.isArray(list) && list.every(item => typeof item === "string"))) throw new Error("invalid cleanup payload");
  if (data.receipt !== null && (!data.receipt || typeof data.receipt.kind !== "string" || typeof data.receipt.id !== "string")) throw new Error("invalid cleanup receipt");
  return structuredClone(data);
}

/** at-least-once 작업. 외부 호출 중 DB 트랜잭션을 열어 두지 않는다. */
export async function processDataCleanupJob(id: string, now = new Date()) {
  const token = randomUUID();
  const lease = await prisma.userDataCleanupJob.updateMany({
    where: { id, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 15 * 60_000), attempts: { increment: 1 } },
  });
  if (!lease.count) return false;
  try {
    const job = await prisma.userDataCleanupJob.findUniqueOrThrow({ where: { id } });
    const payload = readPayload(job.payload);
    const save = async () => {
      const saved = await prisma.userDataCleanupJob.updateMany({ where: { id, leaseToken: token }, data: {
        payload: payload as unknown as Prisma.InputJsonObject, leaseUntil: new Date(Date.now() + 15 * 60_000),
      } });
      if (!saved.count) throw new Error("cleanup lease lost");
    };
    if (payload.receipt) {
      await commitPrivacyReplayReceipt(payload.receipt, job.createdAt);
      payload.receipt = null; await save();
    }
    while (payload.images.length) {
      const key = payload.images[0];
      // 복원한 DB·계정 병합 후에도 현재 참조 중인 객체를 지우지 않는다.
      if (!await prisma.journalEntry.count({ where: { image: key } })) await deleteStoredJournalImage(key);
      payload.images.shift(); await save();
    }
    while (payload.pdfs.length) {
      const key = payload.pdfs[0];
      if (!await prisma.harumadiPdf.count({ where: { objectKey: key } })) await deleteStoredHarumadiPdf(key);
      payload.pdfs.shift(); await save();
    }
    while (payload.appleTokens.length) {
      await revokeAppleRefreshToken(payload.appleTokens[0], {
        clientId: getRequiredAuthEnv("APPLE_CLIENT_ID"), teamId: getRequiredAuthEnv("APPLE_TEAM_ID"),
        keyId: getRequiredAuthEnv("APPLE_KEY_ID"), privateKey: getRequiredAuthEnv("APPLE_PRIVATE_KEY"),
        encryptionKey: getRequiredAuthEnv("APPLE_TOKEN_ENCRYPTION_KEY"),
      });
      payload.appleTokens.shift(); await save();
    }
    await prisma.userDataCleanupJob.deleteMany({ where: { id, leaseToken: token } });
    return true;
  } catch {
    // 원문·객체 키·토큰을 로그에 남기지 않는다. 완료할 때까지 예약 작업으로 재시도한다.
    await prisma.userDataCleanupJob.updateMany({ where: { id, leaseToken: token }, data: {
      leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + 5 * 60_000),
    } });
    return false;
  }
}

export async function maintainDataCleanup(apply = false) {
  const now = new Date();
  const jobs = await prisma.userDataCleanupJob.findMany({ where: { nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 100 });
  let completed = 0, failed = 0;
  if (apply) for (const job of jobs) {
    if (await processDataCleanupJob(job.id, now)) completed++; else failed++;
  }
  return { mode: apply ? "applied" : "dry-run", inspected: jobs.length, completed, failed };
}
