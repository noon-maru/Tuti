import { randomUUID } from "node:crypto";
import type { LogLevel } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { diagnosticLogData, type DiagnosticInput } from "./diagnosticLog";
import { GENERAL_ERROR_CATEGORY } from "@/server/legal/retentionPolicy";

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

export async function writeSystemLog(
  input: SystemLogInput,
  client: Pick<typeof prisma, "systemLog"> = prisma,
) {
  // 전용 일반 오류는 기존 자유 입력 경로로 쓰더라도 원문·계정·대상 식별값을 저장하지 않는다.
  const data = input.category === GENERAL_ERROR_CATEGORY
    ? diagnosticLogData({ code: input.metadata?.code, component: input.metadata?.component,
      durationMs: input.metadata?.durationMs } as DiagnosticInput)
    : { level: input.level, category: input.category, action: input.action, message: input.message,
      actorUserId: input.actorUserId, targetType: input.targetType, targetId: input.targetId, metadata: input.metadata };
  return client.systemLog.create({
    data: {
      id: randomUUID(),
      ...data,
    },
  });
}

export async function writeDiagnosticLog(input: DiagnosticInput) {
  return writeSystemLog(diagnosticLogData(input));
}

export async function writeDiagnosticLogSafely(input: DiagnosticInput) {
  // 정책 적용 전에 새로운 1년 보관 범주의 수집을 자동으로 시작하지 않는다.
  if (process.env.PRIVACY_EXTENDED_RETENTION_ENABLED !== "true") return;
  try { await writeDiagnosticLog(input); }
  catch { console.error("최소 진단 로그를 저장하지 못했습니다."); }
}

export async function writeSystemLogSafely(input: SystemLogInput) {
  try {
    await writeSystemLog(input);
  } catch (error) {
    console.error("시스템 로그를 저장하지 못했습니다.", error);
  }
}
