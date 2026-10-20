import { deleteObject, isObjectStorageEnabled, listObjects } from "@/server/storage/objectStorage";
import { privacyReplaySubject, privacyReplayTarget, readPrivacyReplaySnapshot, type PrivacyReplaySnapshot } from "@/server/legal/privacyReplayLedger";

export function privacyReplayObjectSelector(snapshot: PrivacyReplaySnapshot) {
  const deletedUsers = new Set(snapshot.committed.filter((item) => item.kind === "account_deleted").map((item) => item.subject));
  const targets = new Set(snapshot.committed.filter((item) => item.kind === "journal_deleted" || item.kind === "journal_sensitive_withdrawn" || item.kind === "journal_book_deleted").map((item) => `${item.subject}:${item.target}`));
  return (key: string) => {
    const image = /^journal-images\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\/[A-Za-z0-9_-]+\.webp$/.exec(key);
    const book = /^journal-books\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\.pdf$/.exec(key);
    const match = image ?? book;
    if (!match) return false;
    const subject = privacyReplaySubject(match[1]);
    return deletedUsers.has(subject) || targets.has(`${subject}:${privacyReplayTarget(image ? "journal" : "book", match[2])}`);
  };
}
type ReplayObjectStorage = { listObjects: (continuation?: string) => Promise<{ objects: Array<{ key: string }>; nextContinuationToken?: string }>; deleteObject: (key: string) => Promise<void> };
export async function cleanupPrivacyReplayObjects(apply = false, storage: ReplayObjectStorage = { listObjects, deleteObject }, snapshot?: PrivacyReplaySnapshot) {
  const current = snapshot ?? await readPrivacyReplaySnapshot();
  if (!current.committed.some((record) => ["account_deleted", "journal_deleted", "journal_sensitive_withdrawn", "journal_book_deleted"].includes(record.kind))) return { candidates: 0, deleted: 0 };
  if (!isObjectStorageEnabled()) return { candidates: 0, deleted: 0 };
  const shouldDelete = privacyReplayObjectSelector(current);
  let continuation: string | undefined;
  const result = { candidates: 0, deleted: 0 };
  do {
    const page = await storage.listObjects(continuation);
    for (const item of page.objects) {
      if (!shouldDelete(item.key)) continue;
      result.candidates++;
      if (apply) { await storage.deleteObject(item.key); result.deleted++; }
    }
    continuation = page.nextContinuationToken;
  } while (continuation);
  return result;
}
