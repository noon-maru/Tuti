import { deleteObject, isObjectStorageEnabled, listObjects } from "@/server/storage/objectStorage";
import { privacyReplaySubject, privacyReplayTarget, readPrivacyReplaySnapshot, isHarumadiDeletion, type PrivacyReplaySnapshot } from "@/server/legal/privacyReplayLedger";
import { HISTORIC_HARUMADI_PDF_PREFIXES, INTERIM_HARUMADI_TARGET_DOMAIN, LEGACY_HARUMADI_TARGET_DOMAIN } from "@/shared/harumadi/legacy";

export function privacyReplayObjectSelector(snapshot: PrivacyReplaySnapshot) {
  const deletedUsers = new Set(snapshot.committed.filter((item) => item.kind === "account_deleted").map((item) => item.subject));
  const targets = new Set(snapshot.committed.filter((item) => item.kind === "journal_deleted" || item.kind === "journal_sensitive_withdrawn" || isHarumadiDeletion(item.kind)).map((item) => `${item.subject}:${item.target}`));
  return (key: string) => {
    const image = /^journal-images\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\/[A-Za-z0-9_-]+\.webp$/.exec(key);
    const historicPrefix = HISTORIC_HARUMADI_PDF_PREFIXES.find(prefix => key.startsWith(prefix));
    const normalized = historicPrefix ? `harumadi-pdfs/${key.slice(historicPrefix.length)}` : key;
    const harumadiPdf = /^harumadi-pdfs\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})\.pdf$/.exec(normalized);
    const match = image ?? harumadiPdf;
    if (!match) return false;
    const subject = privacyReplaySubject(match[1]);
    if (deletedUsers.has(subject)) return true;
    if (image) return targets.has(`${subject}:${privacyReplayTarget("journal", match[2])}`);
    return (["harumadi", INTERIM_HARUMADI_TARGET_DOMAIN, LEGACY_HARUMADI_TARGET_DOMAIN] as const).some(domain => targets.has(`${subject}:${privacyReplayTarget(domain, match[2])}`));
  };
}
type ReplayObjectStorage = { listObjects: (continuation?: string) => Promise<{ objects: Array<{ key: string }>; nextContinuationToken?: string }>; deleteObject: (key: string) => Promise<void> };
export async function cleanupPrivacyReplayObjects(apply = false, storage: ReplayObjectStorage = { listObjects, deleteObject }, snapshot?: PrivacyReplaySnapshot) {
  const current = snapshot ?? await readPrivacyReplaySnapshot();
  if (!current.committed.some((record) => ["account_deleted", "journal_deleted", "journal_sensitive_withdrawn"].includes(record.kind) || isHarumadiDeletion(record.kind))) return { candidates: 0, deleted: 0 };
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
