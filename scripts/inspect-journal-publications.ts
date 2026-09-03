import { prisma } from "../src/server/db/prisma";
import { journalPublicationEnabled } from "../src/shared/features/release";
import { JOURNAL_PUBLICATION_POLICY_VERSION } from "../src/shared/legal/journalPublicationPolicy";

const now = new Date();
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const environment = process.env.TUTI_INSPECTION_ENV?.trim() || "unknown";

try {
  const [
    publicationGroups,
    reportGroups,
    stalePublicationReviews,
    staleReports,
    restrictedOwners,
    authorBlocks,
    invalidPrivateStates,
    invalidPendingStates,
    invalidPublishedStates,
    invalidHiddenStates,
    outdatedConsentStates,
    recentActionGroups,
  ] = await Promise.all([
    prisma.journalEntry.groupBy({
      by: ["publicationStatus"],
      _count: { _all: true },
    }),
    prisma.contentReport.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.journalEntry.count({
      where: {
        publicationStatus: "pending",
        publicationStatusChangedAt: { lt: oneDayAgo },
      },
    }),
    prisma.contentReport.count({
      where: {
        status: { in: ["pending", "reviewing"] },
        createdAt: { lt: oneDayAgo },
      },
    }),
    prisma.user.count({
      where: { journalPublicationRestrictedAt: { not: null } },
    }),
    prisma.journalAuthorBlock.count(),
    prisma.journalEntry.count({
      where: {
        publicationStatus: "private",
        OR: [{ publicId: { not: null } }, { publishedAt: { not: null } }],
      },
    }),
    prisma.journalEntry.count({
      where: {
        publicationStatus: "pending",
        OR: [{ publicId: null }, { publishedAt: { not: null } }],
      },
    }),
    prisma.journalEntry.count({
      where: {
        publicationStatus: "published",
        OR: [{ publicId: null }, { publishedAt: null }],
      },
    }),
    prisma.journalEntry.count({
      where: { publicationStatus: "hidden", publicId: null },
    }),
    prisma.journalEntry.count({
      where: {
        publicationStatus: { in: ["pending", "published", "hidden"] },
        OR: [
          { publicationConsentVersion: null },
          {
            publicationConsentVersion: {
              not: JOURNAL_PUBLICATION_POLICY_VERSION,
            },
          },
          { publicationConsentedAt: null },
        ],
      },
    }),
    prisma.systemLog.groupBy({
      by: ["action"],
      where: {
        createdAt: { gte: sevenDaysAgo },
        OR: [
          { action: { startsWith: "journal." } },
          { action: { startsWith: "report." } },
        ],
      },
      _count: { _all: true },
    }),
  ]);

  const invalidStateCount =
    invalidPrivateStates +
    invalidPendingStates +
    invalidPublishedStates +
    invalidHiddenStates;
  const checks = {
    publicationStatesConsistent: invalidStateCount === 0,
    activePublicationConsentCurrent: outdatedConsentStates === 0,
  };
  const report = {
    environment,
    inspectedAt: now.toISOString(),
    passed: Object.values(checks).every(Boolean),
    configuration: {
      publicationEnabled: journalPublicationEnabled,
      audience:
        process.env.NEXT_PUBLIC_JOURNAL_PUBLICATION_AUDIENCE ?? "internal",
      currentConsentVersion: JOURNAL_PUBLICATION_POLICY_VERSION,
    },
    checks,
    counts: {
      publications: Object.fromEntries(
        publicationGroups.map((group) => [
          group.publicationStatus,
          group._count._all,
        ]),
      ),
      reports: Object.fromEntries(
        reportGroups.map((group) => [group.status, group._count._all]),
      ),
      stalePublicationReviews,
      staleReports,
      restrictedOwners,
      authorBlocks,
      invalidStateCount,
      outdatedConsentStates,
    },
    recentActions: Object.fromEntries(
      recentActionGroups
        .sort((left, right) => left.action.localeCompare(right.action))
        .map((group) => [group.action, group._count._all]),
    ),
    attention: [
      ...(stalePublicationReviews > 0
        ? [`24시간을 넘긴 공개 검토 ${stalePublicationReviews}건`]
        : []),
      ...(staleReports > 0 ? [`24시간을 넘긴 미종결 신고 ${staleReports}건`] : []),
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 2;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        environment,
        inspectedAt: now.toISOString(),
        passed: false,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
