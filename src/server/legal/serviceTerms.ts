import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { lockLocationSubject } from "@/server/location/subjectLock";
import { EMPTY_SERVICE_TERMS_STATUS, parseServiceTermsDocument, type ServiceTermsOffer, type ServiceTermsStatus } from "@/shared/legal/serviceTerms";

export function serviceTermsWorkflowEnabled() {
  return process.env.SERVICE_TERMS_WORKFLOW_ENABLED === "true";
}

export function serviceTermsEnforcementEnabled() {
  return serviceTermsWorkflowEnabled() && process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED === "true";
}

export function hashServiceTerms(document: unknown) {
  return createHash("sha256").update(JSON.stringify(parseServiceTermsDocument(document))).digest("hex");
}

export class ServiceTermsError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function getServiceTermsStatus(userId?: string, now = new Date()): Promise<ServiceTermsStatus> {
  if (!serviceTermsWorkflowEnabled()) return EMPTY_SERVICE_TERMS_STATUS;
  const [current, upcoming] = await Promise.all([
    prisma.serviceTermsRelease.findFirst({ where: { publishedAt: { lte: now }, effectiveAt: { lte: now } }, orderBy: { effectiveAt: "desc" } }),
    prisma.serviceTermsRelease.findFirst({ where: { publishedAt: { lte: now }, effectiveAt: { gt: now } }, orderBy: { effectiveAt: "asc" } }),
  ]);
  const accepted = userId ? await prisma.serviceTermsAcceptance.findMany({ where: { userId, termsVersion: { in: [current?.version, upcoming?.version].filter((version): version is string => Boolean(version)) } }, select: { termsVersion: true, documentHash: true } }) : [];
  const offer = (release: NonNullable<typeof current> | null): ServiceTermsOffer | null => {
    if (!release) return null;
    const document = parseServiceTermsDocument(release.document);
    if (hashServiceTerms(document) !== release.documentHash) throw new Error("Terms document integrity check failed");
    return { version: release.version, documentHash: release.documentHash, document, publishedAt: release.publishedAt.toISOString(), effectiveAt: release.effectiveAt.toISOString(), accepted: accepted.some((receipt) => receipt.termsVersion === release.version && receipt.documentHash === release.documentHash) };
  };
  const currentOffer = offer(current);
  return { current: currentOffer, upcoming: offer(upcoming), required: Boolean(currentOffer && !currentOffer.accepted) };
}

export async function acceptServiceTerms(userId: string, input: unknown, now = new Date()) {
  if (!serviceTermsWorkflowEnabled()) throw new ServiceTermsError("일반 이용약관 전환은 아직 시작하지 않았어요.", 409);
  if (!input || typeof input !== "object") throw new ServiceTermsError("동의 내용을 확인해주세요.");
  const body = input as Record<string, unknown>;
  if (body.accepted !== true || body.ageConfirmed !== true || body.importantTermsConfirmed !== true ||
      typeof body.version !== "string" || typeof body.documentHash !== "string") throw new ServiceTermsError("약관 동의와 중요 내용·만 14세 이상 확인이 필요해요.");
  return prisma.$transaction(async (transaction) => {
    await lockLocationSubject(transaction, userId);
    const release = await transaction.serviceTermsRelease.findUnique({ where: { version: body.version as string } });
    if (!release || release.publishedAt > now || release.documentHash !== body.documentHash || hashServiceTerms(release.document) !== release.documentHash) throw new ServiceTermsError("약관 내용이 변경되었어요. 다시 확인해주세요.", 409);
    // IP·User-Agent를 추가 수집하지 않고 원문 스냅샷의 해시와 서버 시각만 기록한다.
    const receipt = await transaction.serviceTermsAcceptance.upsert({
      where: { userId_termsVersion: { userId, termsVersion: release.version } },
      create: { id: randomUUID(), userId, termsVersion: release.version, documentHash: release.documentHash, ageConfirmed: true, importantTermsConfirmed: true, acceptedAt: now },
      update: {},
      select: { termsVersion: true, documentHash: true, acceptedAt: true },
    });
    if (receipt.documentHash !== release.documentHash) throw new ServiceTermsError("기존 동의 기록을 확인하지 못했어요. 문의로 알려주세요.", 409);
    return receipt;
  });
}
