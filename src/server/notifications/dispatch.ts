import { prisma } from "@/server/db/prisma";
import { sendPushToUser } from "./push";
import { notificationLocalClock } from "@/shared/notifications/preferences";
import type { NotificationSettings } from "@/shared/notifications/preferences";
import type { ServerPushMessage } from "./pushPayload";

type Job = { id: string; user_id: string; actor_id: string | null; book_id: string | null; kind: string; entity_id: string | null; created_at: Date };
export async function dispatchNotifications(apply = false, now = new Date(), send = sendPushToUser) {
  if (!apply) {
    const [summary] = await prisma.$queryRaw<{ pending: bigint }[]>`SELECT count(1) AS pending FROM notification_jobs WHERE consumed_at IS NULL AND due_at<=${now}`;
    return { mode: "dry-run", pending: Number(summary.pending), sent: 0 };
  }
  // Commit claims before contacting a provider: ambiguous timeouts never retry a
  // reminder. A process crash may lose a nudge; domain data is never rolled back.
  const jobs = await prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended('tuti-notification-dispatch',0)) AS locked`;
    if (!lock.locked) return null;
    const preferences = await tx.$queryRaw<(NotificationSettings & { userId: string })[]>`SELECT user_id AS "userId",news_enabled AS "newsEnabled",reminder_enabled AS "reminderEnabled",reminder_time AS "reminderTime",time_zone AS "timeZone" FROM notification_preferences WHERE reminder_enabled AND EXISTS(SELECT 1 FROM push_devices d WHERE d.user_id=notification_preferences.user_id AND d.enabled AND d.invalidated_at IS NULL)`;
    for (const p of preferences) {
      const clock = notificationLocalClock(now, p.timeZone);
      // No catch-up reminders after an outage, and no second reminder after a time change.
      if (clock.time !== p.reminderTime) continue;
      const key = `reminder:${p.userId}:${clock.day}`;
      await tx.$executeRaw`INSERT INTO notification_jobs(id,user_id,kind,due_at) VALUES (${key},${p.userId},'madi-reminder',${now}) ON CONFLICT(id) DO NOTHING`;
    }
    const due = await tx.$queryRaw<Job[]>`SELECT * FROM notification_jobs WHERE consumed_at IS NULL AND due_at<=${now} ORDER BY due_at,id LIMIT 40 FOR UPDATE SKIP LOCKED`;
    const claimed = new Map<string, Job>();
    for (const job of due) {
      if (claimed.has(job.id)) continue;
      const rows = job.kind === "shared-madi"
        ? await tx.$queryRaw<Job[]>`UPDATE notification_jobs SET consumed_at=${now} WHERE user_id=${job.user_id} AND book_id=${job.book_id} AND kind='shared-madi' AND consumed_at IS NULL AND created_at<=${now} RETURNING *`
        : await tx.$queryRaw<Job[]>`UPDATE notification_jobs SET consumed_at=${now} WHERE id=${job.id} AND consumed_at IS NULL RETURNING *`;
      for (const row of rows) claimed.set(row.id, row);
    }
    return [...claimed.values()];
  }, { timeout: 30_000 });
  if (!jobs) return { mode: "busy", sent: 0 };
    let sent = 0, skipped = 0, failed = 0;
    const groups = new Set<string>();
    for (const job of jobs) {
      const group = job.kind === "shared-madi" ? `${job.user_id}:${job.book_id}` : job.id;
      if (groups.has(group)) continue;
      const p = await prisma.$queryRaw<{ news_enabled: boolean; reminder_enabled: boolean; time_zone: string }[]>`SELECT * FROM notification_preferences WHERE user_id=${job.user_id}`;
      if (!p[0] || now.getTime() - job.created_at.getTime() > 86400_000 || (job.kind === "madi-reminder" ? !p[0].reminder_enabled : !p[0].news_enabled)) { skipped++; continue; }
      let message: ServerPushMessage;
      if (job.kind === "madi-reminder") {
        const day = notificationLocalClock(now, p[0].time_zone).day;
        const [check] = await prisma.$queryRaw<{ suppress: boolean }[]>`SELECT EXISTS(SELECT 1 FROM journal_entries WHERE owner_id=${job.user_id} AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${p[0].time_zone})::date=${day}::date)
          OR EXISTS(SELECT 1 FROM notification_presence WHERE user_id=${job.user_id} AND composing AND expires_at>${now}) AS suppress`;
        if (check.suppress) { skipped++; continue; }
        message = { type: job.kind, title: "오늘의 마디", body: "사진 한 장이나 짧은 한 줄로 오늘을 남겨볼까요?", path: "/madi/new?from=notification" };
      } else {
        if (process.env.HARUMADI_TOGETHER_ENABLED !== "true") { skipped++; continue; }
        const [check] = await prisma.$queryRaw<{ allowed: boolean }[]>`SELECT EXISTS(
          SELECT 1 FROM harumadis b WHERE b.id=${job.book_id} AND b.collaboration_started_at IS NOT NULL AND b.collaboration_started_at<=${job.created_at}
          AND (b.owner_id=${job.user_id} OR EXISTS(SELECT 1 FROM harumadi_members m WHERE m.harumadi_id=b.id AND m.user_id=${job.user_id} AND m.ended_at IS NULL AND m.joined_at<=${job.created_at}))
          AND (b.owner_id=${job.actor_id} OR EXISTS(SELECT 1 FROM harumadi_members m WHERE m.harumadi_id=b.id AND m.user_id=${job.actor_id} AND m.ended_at IS NULL AND m.joined_at<=${job.created_at}))
          AND NOT EXISTS(SELECT 1 FROM notification_book_settings s WHERE s.user_id=${job.user_id} AND s.book_id=b.id AND s.muted)
          AND NOT EXISTS(SELECT 1 FROM notification_presence v WHERE v.user_id=${job.user_id} AND v.book_id=b.id AND v.expires_at>${now})
          AND NOT EXISTS(SELECT 1 FROM journal_author_blocks x WHERE (x.blocker_user_id=${job.user_id} AND x.blocked_user_id=${job.actor_id}) OR (x.blocker_user_id=${job.actor_id} AND x.blocked_user_id=${job.user_id}))
          AND (${job.kind} <> 'shared-madi' OR EXISTS(SELECT 1 FROM harumadi_entry_links l JOIN journal_entries j ON j.id=l.entry_id WHERE l.id=${job.entity_id} AND l.harumadi_id=b.id AND j.owner_id=${job.actor_id} AND j.sensitive_content=false))
          AND (${job.kind} <> 'comment-reply' OR EXISTS(SELECT 1 FROM harumadi_comments c JOIN harumadi_comments parent ON parent.id=c.parent_id WHERE c.id=${job.entity_id} AND c.harumadi_id=b.id AND c.author_id=${job.actor_id} AND c.deleted_at IS NULL AND parent.author_id=${job.user_id} AND parent.deleted_at IS NULL))
        ) AS allowed`;
        if (!check.allowed) { skipped++; continue; }
        const titles: Record<string, string> = { "shared-madi": "함께 채운 마디가 있어요", "invite-accepted": "함께 채우기가 시작됐어요", "comment-reply": "내 댓글에 답글이 달렸어요" };
        message = { type: job.kind, title: titles[job.kind], body: "하루마디를 열어 확인해보세요.", path: `/harumadi?harumadiId=${encodeURIComponent(job.book_id!)}` };
      }
      groups.add(group);
      try { const result = await send(job.user_id, { ...message, notificationId: job.id }); sent += result.sent; failed += result.failed; }
      catch { failed++; }
    }
    await prisma.$executeRaw`DELETE FROM notification_jobs WHERE created_at<${new Date(now.getTime() - 30 * 86400_000)}`;
    await prisma.$executeRaw`DELETE FROM notification_presence WHERE expires_at<${now}`;
    await prisma.$executeRaw`DELETE FROM notification_events WHERE created_at<${new Date(now.getTime() - 30 * 86400_000)}`;
    await prisma.$executeRaw`INSERT INTO notification_dispatch_status(id,checked_at,processed,failed) VALUES ('latest',${now},${jobs.length},${failed}) ON CONFLICT(id) DO UPDATE SET checked_at=EXCLUDED.checked_at,processed=EXCLUDED.processed,failed=EXCLUDED.failed`;
    return { mode: "applied", processed: jobs.length, sent, skipped, failed };
}
