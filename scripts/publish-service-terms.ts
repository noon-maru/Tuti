import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import { prepareServiceTermsRelease } from "../src/server/legal/releaseApproval";
import { serviceTermsWorkflowEnabled } from "../src/server/legal/serviceTerms";
import { assertServiceTermsOperationalReadiness } from "../src/server/legal/runtimeReadiness";

async function main() {
  const arguments_ = process.argv.slice(2);
  const fileIndex = arguments_.indexOf("--file");
  if (fileIndex < 0 || !arguments_[fileIndex + 1]) throw new Error("--file 승인된문서.json [--apply] 형식으로 실행해주세요.");
  const noticeIndex = arguments_.indexOf("--notice-version");
  let notice;
  if (noticeIndex >= 0) {
    const version = arguments_[noticeIndex + 1];
    if (!version || version.startsWith("--")) throw new Error("--notice-version 공고버전 값이 필요합니다.");
    notice = await prisma.legalDocumentNotice.findUnique({ where: { documentType_version: { documentType: "service-terms", version } } });
    if (!notice) throw new Error("해당 버전의 공고 원문이 없습니다.");
  }
  const release = prepareServiceTermsRelease(JSON.parse(await readFile(resolve(arguments_[fileIndex + 1]), "utf8")), new Date(), notice ?? undefined);
  let readiness: Awaited<ReturnType<typeof assertServiceTermsOperationalReadiness>> | null = null;
  if (arguments_.includes("--apply")) {
    if (!serviceTermsWorkflowEnabled()) throw new Error("공개 조회 기능이 꺼져 있습니다. 마이그레이션과 클라이언트 배포 후 공개 기능을 먼저 활성화해주세요.");
    const readinessIndex = arguments_.indexOf("--readiness-file");
    if (readinessIndex < 0 || !arguments_[readinessIndex + 1]) throw new Error("--readiness-file 운영확인.json 파일이 필요합니다. 문서 승인·운영 시험을 임의로 완료 처리하지 않습니다.");
    readiness = await assertServiceTermsOperationalReadiness(JSON.parse(await readFile(resolve(arguments_[readinessIndex + 1]), "utf8")), release.documentHash, release.approvalReference);
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)::text AS lock_result`;
      const upcoming = await transaction.serviceTermsRelease.findFirst({ where: { effectiveAt: { gt: new Date() } } });
      if (upcoming) throw new Error("시행 예정 문서가 이미 있습니다. 기존 공고를 덮어쓰지 않습니다.");
      await transaction.serviceTermsRelease.create({ data: release });
    });
  }
  console.log(JSON.stringify({ mode: arguments_.includes("--apply") ? "published" : "dry-run", version: release.version, documentHash: release.documentHash, publishedAt: release.publishedAt, effectiveAt: release.effectiveAt, noticeDays: release.noticeDays, publicationMode: release.publicationMode, initialContractReference: release.initialContractReference, initialEligibilityVerified: arguments_.includes("--apply") && release.publicationMode === "initial", readinessScope: "service-terms", readiness }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "약관 공고에 실패했습니다."); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
