import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/server/db/prisma";
import { deleteOrdinaryTestAccount } from "../src/server/admin/users";
import { hashServiceTerms } from "../src/server/legal/serviceTerms";
import { parseServiceTermsDocument, type ServiceTermsOffer } from "../src/shared/legal/serviceTerms";
import { parseLegalPolicyRelease } from "../src/shared/legal/policyRelease";
import type { LegalDocumentNotice } from "../src/shared/legal/documentNotice";
import documents from "../src/shared/legal/finalizedDocuments.json";

class SetupError extends Error {}
function check(condition: unknown, code: string): asserts condition { if (!condition) throw new SetupError(code); }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const noticeTypes = ["privacy", "location-terms", "community-guidelines"] as const;

export function validateDevelopmentLegalSource(current: ServiceTermsOffer, notices: LegalDocumentNotice[]) {
  const expected = documents["service-terms"];
  check(current && current.version === expected.version && current.documentHash === expected.documentHash && hashServiceTerms(current.document) === expected.documentHash, "SOURCE_TERMS_MISMATCH");
  check(Number.isFinite(Date.parse(current.publishedAt)) && current.publishedAt === current.effectiveAt && Date.parse(current.effectiveAt) <= Date.now(), "SOURCE_TERMS_DATES_MISMATCH");
  check(Array.isArray(notices) && notices.length === 3 && new Set(notices.map(n => n.documentType)).size === 3, "SOURCE_NOTICES_MISMATCH");
  for (const type of noticeTypes) {
    const notice = notices.find(row => row.documentType === type);
    check(notice && notice.version === documents[type].version && notice.documentHash === documents[type].documentHash && hashServiceTerms(notice.document) === notice.documentHash, "SOURCE_NOTICE_INTEGRITY_FAILED");
    check(notice.publishedAt === notice.plannedEffectiveAt && Number.isFinite(Date.parse(notice.publishedAt)) && Date.parse(notice.plannedEffectiveAt) <= Date.now(), "SOURCE_NOTICE_DATES_MISMATCH");
    check(typeof notice.applicationPolicy === "string" && notice.applicationPolicy.length > 0, "SOURCE_NOTICE_POLICY_MISSING");
  }
}

async function publicJson(path: string) {
  const response = await fetch(`https://tuti.today/api/${path}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  check(response.ok, "PUBLIC_SOURCE_UNAVAILABLE");
  return response.json();
}
async function adminSnapshot() {
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true }, orderBy: { id: "asc" } });
  const rows = await prisma.$queryRaw<Array<{ fingerprint: string; count: number }>>`
    SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.id)::text, '[]'), 'UTF8')), 'hex') AS fingerprint,
      count(j.id)::int AS count FROM journal_entries j JOIN users u ON u.id=j.owner_id WHERE u.role='admin'`;
  return { admins, ...rows[0] };
}

async function main() {
  check(process.argv.length === 3 && process.argv[2] === "--apply", "EXPLICIT_APPLY_REQUIRED");
  check(process.env.TUTI_INSPECTION_ENV === "development" && process.env.NODE_ENV !== "production", "DEVELOPMENT_ONLY");
  const target = new URL(process.env.DATABASE_URL ?? "");
  check(target.hostname === "db" && target.port === "5432" && target.pathname === "/tuti", "UNEXPECTED_DATABASE");
  check(process.env.PRIVACY_REPLAY_LEDGER_ENABLED !== "true", "DO_NOT_USE_PRODUCTION_LEDGER");
  const [terms, noticeResult] = await Promise.all([publicJson("service-terms"), publicJson("public/legal-notices")]);
  const current = terms.current as ServiceTermsOffer;
  const notices = noticeResult.notices as LegalDocumentNotice[];
  validateDevelopmentLegalSource(current, notices);
  const policy = parseLegalPolicyRelease(terms.legalPolicyRelease);
  check(policy && process.env.TUTI_LEGAL_POLICY_RELEASE === policy.version && Date.parse(process.env.TUTI_LEGAL_POLICY_EFFECTIVE_AT ?? "") === Date.parse(policy.effectiveAt), "DEVELOPMENT_POLICY_SETTINGS_MISMATCH");
  const existing = await prisma.serviceTermsRelease.findMany();
  if (existing.length) {
    check(existing.length === 1 && existing[0].version === current.version && existing[0].documentHash === current.documentHash &&
      existing[0].approvalReference === "DEVELOPMENT-COPY-20261026" && await prisma.legalDocumentNotice.count() === 3, "EXISTING_RELEASE_REQUIRES_REVIEW");
    console.log(JSON.stringify({ scope: "development-only", alreadyInitialized: true, accountsDeleted: 0 }));
    return;
  }
  check(await prisma.legalDocumentNotice.count() === 0, "EXISTING_NOTICES_REQUIRE_REVIEW");
  const cutoff = new Date();
  const candidates = await prisma.user.findMany({ where: { role: "user", createdAt: { lte: cutoff } }, select: {
    id: true, journalEntries: { select: { image: true } }, journalBooks: { select: { objectKey: true } },
    authIdentities: { select: { providerRefreshTokenEncrypted: true } },
  }, orderBy: { id: "asc" } });
  const before = await adminSnapshot();
  const journals = candidates.reduce((sum, user) => sum + user.journalEntries.length, 0);
  const books = candidates.reduce((sum, user) => sum + user.journalBooks.length, 0);
  check(before.admins.length === 1 && before.count === 2 && [0, 61].includes(candidates.length), "APPROVED_ACCOUNT_SCOPE_CHANGED");
  check(candidates.length === 0 || digest(JSON.stringify(candidates.map(user => user.id))) === "7cf8493e6545aa195349bbea06acd8caca5c75a5c2141fe38e3b2a98b1a929e1", "APPROVED_ACCOUNT_LIST_CHANGED");
  check(candidates.length === 0 || (journals === 5 && books === 1), "APPROVED_RECORD_SCOPE_CHANGED");
  check(candidates.every(user => user.authIdentities.every(identity => !identity.providerRefreshTokenEncrypted)), "EXTERNAL_IDENTITY_REVOCATION_REQUIRES_REVIEW");
  const productionDigests: unknown = JSON.parse(await readFile("/dev-legal/production-assets.json", "utf8"));
  check(Array.isArray(productionDigests) && productionDigests.every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)), "PRODUCTION_ASSET_CHECK_MISSING");
  const protectedAssets = new Set<string>(productionDigests);
  for (const user of candidates) {
    for (const entry of user.journalEntries) {
      if (!entry.image || entry.image.startsWith("data:image/")) continue;
      check(entry.image.startsWith(`journal-images/${user.id}/`) && !protectedAssets.has(digest(entry.image)), "IMAGE_SHARED_WITH_PRODUCTION_OR_NOT_OWNED");
      check(!await prisma.journalEntry.count({ where: { ownerId: { not: user.id }, image: entry.image } }), "IMAGE_SHARED_WITH_ANOTHER_ACCOUNT");
    }
    for (const book of user.journalBooks) {
      check(book.objectKey.startsWith(`journal-books/${user.id}/`) && !protectedAssets.has(digest(book.objectKey)), "BOOK_SHARED_WITH_PRODUCTION_OR_NOT_OWNED");
    }
  }
  console.log(JSON.stringify({ scope: "development-only", mode: "approved-preflight", accounts: candidates.length, journals, books, productionAssetsProtected: true }));
  let deleted = 0;
  for (const user of candidates) {
    check(await deleteOrdinaryTestAccount(user.id, cutoff), "ACCOUNT_CHANGED_DURING_CLEANUP");
    deleted++;
    if (deleted % 25 === 0) console.log(JSON.stringify({ stage: "development-cleanup", deleted }));
  }
  check(JSON.stringify(await adminSnapshot()) === JSON.stringify(before), "ADMIN_PRESERVATION_CHECK_FAILED");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261019, 1)::text`;
    await tx.$executeRaw`LOCK TABLE users IN SHARE MODE`;
    check(await tx.user.count({ where: { role: "user" } }) === 0, "NEW_ACCOUNTS_APPEARED");
    await tx.serviceTermsRelease.create({ data: {
      version: current.version, document: parseServiceTermsDocument(current.document), documentHash: current.documentHash,
      publishedAt: new Date(current.publishedAt), effectiveAt: new Date(current.effectiveAt),
      approvalReference: "DEVELOPMENT-COPY-20261026", publicationMode: "initial", noticeDays: 0,
      initialContractReference: "DEVELOPMENT-RESET-20261026",
    } });
    for (const notice of notices) await tx.legalDocumentNotice.create({ data: {
      documentType: notice.documentType, version: notice.version, document: parseServiceTermsDocument(notice.document), documentHash: notice.documentHash,
      publishedAt: new Date(notice.publishedAt), plannedEffectiveAt: new Date(notice.plannedEffectiveAt),
      publicationMode: "initial", approvalReference: "DEVELOPMENT-COPY-20261026", applicationPolicy: notice.applicationPolicy,
    } });
  }, { timeout: 30_000 });
  check(await prisma.serviceTermsAcceptance.count() === 0, "CONSENTS_MUST_NOT_BE_CREATED");
  console.log(JSON.stringify({ scope: "development-only", deletedAccounts: deleted, deletedJournals: journals, deletedBooks: books,
    remainingAdmins: before.admins.length, preservedAdminJournals: before.count,
    version: current.version, documentHash: current.documentHash, noticesCopied: 3, consentsCreated: false, productionDatabaseChanged: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ scope: "development-only", reason: error instanceof SetupError ? error.message : "SETUP_FAILED_REQUIRES_INSPECTION", privateDetailsSuppressed: true }));
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
