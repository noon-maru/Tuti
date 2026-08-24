import { writeSystemLogSafely } from "@/server/admin/log";

export type EmailAuthAuditOperation = "request" | "verify";
export type EmailAuthDeliveryMode =
  | "app_review_fixed_code"
  | "smtp"
  | "unresolved";

export async function writeEmailAuthAudit(input: {
  operation: EmailAuthAuditOperation;
  outcome: "succeeded" | "failed";
  deliveryMode: EmailAuthDeliveryMode;
  appReviewAccount: boolean;
  durationMs: number;
  errorCode?: string;
  result?: string;
}) {
  const succeeded = input.outcome === "succeeded";

  await writeSystemLogSafely({
    level: succeeded ? "info" : "warning",
    category: "auth",
    action: `email_code.${input.operation}.${input.outcome}`,
    message: succeeded
      ? input.operation === "request"
        ? "이메일 인증코드 요청을 처리했습니다."
        : "이메일 인증코드 검증을 처리했습니다."
      : input.operation === "request"
        ? "이메일 인증코드 요청을 처리하지 못했습니다."
        : "이메일 인증코드 검증을 처리하지 못했습니다.",
    targetType: "email_auth",
    metadata: {
      appReviewAccount: input.appReviewAccount,
      deliveryMode: input.deliveryMode,
      durationMs: normalizeDuration(input.durationMs),
      errorCode: input.errorCode ?? null,
      result: input.result ?? null,
    },
  });
}

function normalizeDuration(durationMs: number) {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.max(0, Math.round(durationMs));
}
