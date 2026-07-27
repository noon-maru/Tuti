import { randomUUID } from "node:crypto";
import type { LogLevel } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

type SystemLogInput = {
  level?: LogLevel;
  category: string;
  action: string;
  message: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, boolean | number | string | null>;
};

export async function writeSystemLog(input: SystemLogInput) {
  return prisma.systemLog.create({
    data: {
      id: randomUUID(),
      level: input.level,
      category: input.category,
      action: input.action,
      message: input.message,
      actorUserId: input.actorUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    },
  });
}

export async function writeSystemLogSafely(input: SystemLogInput) {
  try {
    await writeSystemLog(input);
  } catch (error) {
    console.error("시스템 로그를 저장하지 못했습니다.", error);
  }
}
