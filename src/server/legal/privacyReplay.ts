import { prisma } from "@/server/db/prisma";
import { replayDeletedUserAccount } from "@/server/admin/users";
import { replayLocationWithdrawal, getCurrentLocationConsent, purgeWithdrawnLocationSubject } from "@/server/location/compliance";
import { privacyReplayEnabled, PrivacyReplayError, privacyReplaySubject, privacyReplayTarget, readPrivacyReplaySnapshot, verifyPrivacyReplayCoverage, commitPrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { forceDeleteJournalEntry } from "@/server/journal/service";
import { deleteJournalBook } from "@/server/journal/bookDeletion";
import { cleanupPrivacyReplayObjects } from "@/server/legal/privacyReplayObjects";

// DB 파일을 교체하기 전, 앱 중지 상태의 현재 DB로 완료 여부가 입증되는 준비 기록만 확정한다.
export async function settleCurrentPrivacyRequests() {
  if (!privacyReplayEnabled()) throw new PrivacyReplayError();
  const snapshot = await readPrivacyReplaySnapshot();
  if (!snapshot.unresolved) return { settled: 0, unresolved: 0 };
  const subjects = new Map<string, string>();
  let after: string | undefined;
  while (true) {
    const users = await prisma.user.findMany({ where: after ? { id: { gt: after } } : {}, select: { id: true }, orderBy: { id: "asc" }, take: 250 });
    if (!users.length) break;
    for (const user of users) subjects.set(privacyReplaySubject(user.id), user.id);
    after = users.at(-1)!.id;
  }
  let settled = 0;
  for (const record of snapshot.pending ?? []) {
    const userId = subjects.get(record.subject);
    let fulfilled = record.kind === "account_deleted" && !userId;
    if (record.kind === "location_withdrawn" && userId) {
      const current = await getCurrentLocationConsent(userId);
      if (current?.status === "withdrawn") {
        const residual = await purgeWithdrawnLocationSubject(userId);
        fulfilled = !residual.skipped && residual.usageLogs === 0 && residual.consentEvents === 0;
      }
    }
    if (record.kind.startsWith("journal_") && userId) {
      if (record.kind === "journal_book_deleted") {
        const books = await prisma.journalBook.findMany({ where: { ownerId: userId }, select: { id: true } });
        fulfilled = !books.some((book) => privacyReplayTarget("book", book.id) === record.target);
      } else {
        const entries = await prisma.journalEntry.findMany({ where: { ownerId: userId }, select: { id: true, publicId: true, publicationStatus: true } });
        const entry = entries.find((entry) => privacyReplayTarget("journal", entry.id) === record.target);
        fulfilled = !entry || record.kind === "journal_unpublished" && entry.publicId === null && entry.publicationStatus === "private";
      }
    }
    if (fulfilled) { await commitPrivacyReplayReceipt(record); settled++; }
  }
  return { settled, unresolved: (await readPrivacyReplaySnapshot()).unresolved };
}

export async function replayPrivacyRequests(backupAt: Date, apply = false, legacyReviewReference?: string) {
  if (!privacyReplayEnabled()) throw new PrivacyReplayError("복원 방지 원장이 활성화되어 있지 않습니다.");
  const snapshot = await readPrivacyReplaySnapshot();
  verifyPrivacyReplayCoverage(snapshot, backupAt, legacyReviewReference);
  const deleted = new Set(snapshot.committed.filter((record) => record.kind === "account_deleted").map((record) => record.subject));
  const withdrawn = new Map<string, Date>();
  for (const record of snapshot.committed) {
    if (record.kind !== "location_withdrawn" || !record.effectiveAt) continue;
    const previous = withdrawn.get(record.subject);
    const at = new Date(record.effectiveAt);
    if (!previous || previous < at) withdrawn.set(record.subject, at);
  }
  const result = { dryRun: !apply, scanned: 0, accounts: 0, withdrawals: 0, newerConsent: 0, entries: 0, books: 0, unpublished: 0, objects: 0 };
  let after: string | undefined;
  while (true) {
    const users = await prisma.user.findMany({ where: after ? { id: { gt: after } } : {}, select: { id: true }, orderBy: { id: "asc" }, take: 250 });
    if (!users.length) break;
    for (const user of users) {
      result.scanned++;
      const subject = privacyReplaySubject(user.id);
      if (deleted.has(subject)) {
        if (apply) await replayDeletedUserAccount(user.id);
        result.accounts++;
        continue;
      }
      const effectiveAt = withdrawn.get(subject);
      if (!effectiveAt) continue;
      const replayed = await replayLocationWithdrawal(user.id, effectiveAt, apply);
      if (replayed.skipped) result.newerConsent++; else result.withdrawals++;
    }
    after = users.at(-1)!.id;
  }
  const targetReceipts = snapshot.committed.filter((record) => record.kind.startsWith("journal_"));
  if (targetReceipts.some((record) => record.kind !== "journal_book_deleted")) {
    let afterEntry: string | undefined;
    while (true) {
      const entries = await prisma.journalEntry.findMany({ where: afterEntry ? { id: { gt: afterEntry } } : {}, select: { id: true, ownerId: true, publicationStatus: true, publicationStatusChangedAt: true }, orderBy: { id: "asc" }, take: 250 });
      if (!entries.length) break;
      for (const entry of entries) {
        const matches = targetReceipts.filter((record) => record.subject === privacyReplaySubject(entry.ownerId) && record.target === privacyReplayTarget("journal", entry.id));
        if (matches.some((record) => record.kind === "journal_deleted")) {
          if (apply) await forceDeleteJournalEntry(entry.id, true);
          result.entries++;
          continue;
        }
        const stoppedAt = Math.max(...matches.filter((record) => record.kind === "journal_unpublished" && record.effectiveAt).map((record) => Date.parse(record.effectiveAt!)));
        if (stoppedAt >= entry.publicationStatusChangedAt.getTime()) {
          if (apply) await prisma.journalEntry.updateMany({ where: { id: entry.id, ownerId: entry.ownerId }, data: { publicId: null, publishedAt: null, publicationStatus: entry.publicationStatus === "hidden" ? "hidden" : "private", publicationStatusChangedAt: new Date() } });
          result.unpublished++;
        }
      }
      afterEntry = entries.at(-1)!.id;
    }
  }
  if (targetReceipts.some((record) => record.kind === "journal_book_deleted")) {
    let afterBook: string | undefined;
    while (true) {
      const books = await prisma.journalBook.findMany({ where: afterBook ? { id: { gt: afterBook } } : {}, select: { id: true, ownerId: true }, orderBy: { id: "asc" }, take: 250 });
      if (!books.length) break;
      for (const book of books) if (targetReceipts.some((record) => record.kind === "journal_book_deleted" && record.subject === privacyReplaySubject(book.ownerId) && record.target === privacyReplayTarget("book", book.id))) {
        if (apply) await deleteJournalBook(book.ownerId, book.id, true);
        result.books++;
      }
      afterBook = books.at(-1)!.id;
    }
  }
  const objects = await cleanupPrivacyReplayObjects(apply, undefined, snapshot);
  result.objects = apply ? objects.deleted : objects.candidates;
  return result;
}
