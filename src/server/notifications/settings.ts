import { prisma } from "@/server/db/prisma";
import { randomUUID } from "node:crypto";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/shared/notifications/preferences";
import { requireHarumadiAccess } from "@/server/harumadi/access";

export async function readNotificationSettings(userId: string) {
  const rows = await prisma.$queryRaw<NotificationSettings[]>`SELECT news_enabled AS "newsEnabled", reminder_enabled AS "reminderEnabled", reminder_time AS "reminderTime", time_zone AS "timeZone" FROM notification_preferences WHERE user_id=${userId}`;
  return rows[0] ?? { ...DEFAULT_NOTIFICATION_SETTINGS };
}
export async function saveNotificationSettings(userId: string, input: NotificationSettings) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
    const [previous] = await tx.$queryRaw<{ news: boolean; reminder: boolean }[]>`SELECT news_enabled AS news,reminder_enabled AS reminder FROM notification_preferences WHERE user_id=${userId}`;
    await tx.$executeRaw`INSERT INTO notification_preferences (user_id,news_enabled,reminder_enabled,reminder_time,time_zone)
      VALUES (${userId},${input.newsEnabled},${input.reminderEnabled},${input.reminderTime},${input.timeZone})
      ON CONFLICT (user_id) DO UPDATE SET news_enabled=EXCLUDED.news_enabled,reminder_enabled=EXCLUDED.reminder_enabled,reminder_time=EXCLUDED.reminder_time,time_zone=EXCLUDED.time_zone,updated_at=CURRENT_TIMESTAMP`;
    // Never deliver an old queued event after switching a category off and back on.
    await tx.$executeRaw`UPDATE notification_jobs SET consumed_at=CURRENT_TIMESTAMP WHERE user_id=${userId} AND consumed_at IS NULL
      AND ((${!input.newsEnabled} AND kind<>'madi-reminder') OR (${!input.reminderEnabled} AND kind='madi-reminder'))`;
    for (const [kind, before, after] of [["news", previous?.news ?? false, input.newsEnabled], ["reminder", previous?.reminder ?? false, input.reminderEnabled]] as const) {
      if (before !== after) await tx.$executeRaw`INSERT INTO notification_events(id,user_id,kind,action) VALUES (${randomUUID()},${userId},${kind},${after ? "opt-in" : "disabled"})`;
    }
  });
  return input;
}
export async function bookNotificationSettings(userId: string, bookId: string, muted?: boolean) {
  return prisma.$transaction(async tx => {
    await requireHarumadiAccess(tx, userId, bookId);
    if (muted !== undefined) {
      await tx.$executeRaw`INSERT INTO notification_book_settings(user_id,book_id,muted) VALUES (${userId},${bookId},${muted}) ON CONFLICT(user_id,book_id) DO UPDATE SET muted=EXCLUDED.muted`;
      if (muted) await tx.$executeRaw`UPDATE notification_jobs SET consumed_at=CURRENT_TIMESTAMP WHERE user_id=${userId} AND book_id=${bookId} AND consumed_at IS NULL`;
    }
    const rows = await tx.$queryRaw<{ muted: boolean }[]>`SELECT muted FROM notification_book_settings WHERE user_id=${userId} AND book_id=${bookId}`;
    return { muted: rows[0]?.muted ?? false };
  });
}
