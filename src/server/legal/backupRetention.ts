import { lstat, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const BACKUP_ID = /^\d{8}-\d{6}$/;
export type BackupRetentionPlan = { retentionDays: number; cutoff: string; candidates: Array<{ id: string; createdAt: string }>; skipped: number };
export async function planBackupRetention(root: string, retentionDays = 30, now = new Date()): Promise<BackupRetentionPlan> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error("백업 보관기간을 확인해주세요.");
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("전용 백업 디렉터리가 필요합니다.");
  const cutoff = new Date(now.getTime() - retentionDays * 86400000);
  const plan: BackupRetentionPlan = { retentionDays, cutoff: cutoff.toISOString(), candidates: [], skipped: 0 };
  for (const id of await readdir(root)) {
    if (!BACKUP_ID.test(id)) { plan.skipped++; continue; }
    try {
      const path = join(root, id);
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) { plan.skipped++; continue; }
      const manifestStat = await lstat(join(path, "manifest.txt"));
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 16384) { plan.skipped++; continue; }
      const text = await readFile(join(path, "manifest.txt"), "utf8");
      const lines = new Map(text.trim().split("\n").map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)] as const; }));
      const created = new Date(lines.get("created_at") ?? "");
      if (lines.get("backup_version") !== "1" || lines.get("restore_scope") !== "database-and-journal-objects" || !Number.isFinite(created.getTime())) { plan.skipped++; continue; }
      if (created < cutoff) plan.candidates.push({ id, createdAt: created.toISOString() });
    } catch { plan.skipped++; }
  }
  plan.candidates.sort((a, b) => a.id.localeCompare(b.id));
  return plan;
}
export async function applyBackupRetention(root: string, plan: BackupRetentionPlan) {
  let deleted = 0;
  // Recalculate to reject tampered/invented targets and backups whose metadata changed since planning.
  const current = await planBackupRetention(root, plan.retentionDays, new Date(new Date(plan.cutoff).getTime() + plan.retentionDays * 86400000));
  for (const item of plan.candidates) {
    if (!BACKUP_ID.test(item.id) || !current.candidates.some((candidate) => candidate.id === item.id && candidate.createdAt === item.createdAt)) throw new Error("파기 대상 백업이 변경되었습니다. 다시 조회해주세요.");
  }
  for (const item of plan.candidates) {
    const path = join(root, item.id);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("백업 디렉터리가 변경되었습니다.");
    await rm(path, { recursive: true });
    deleted++;
  }
  return deleted;
}
