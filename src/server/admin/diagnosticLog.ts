import { GENERAL_ERROR_ACTION, GENERAL_ERROR_CATEGORY } from "@/server/legal/retentionPolicy";

const ERROR_CODES = ["UNEXPECTED_FAILURE", "DATABASE_UNAVAILABLE", "UPSTREAM_TIMEOUT", "UPSTREAM_FAILURE", "STORAGE_UNAVAILABLE", "RENDER_FAILED"] as const;
const COMPONENTS = ["recommendation", "journal", "harumadiPdf", "maps", "authentication", "notification", "unknown"] as const;
export type DiagnosticInput = {
  code: typeof ERROR_CODES[number]; component: typeof COMPONENTS[number]; durationMs?: number;
};

// 자유 문구·stack·URL·원문 오류를 받지 않는다. 동적 식별값을 코드에 섞지 않도록 유한 목록만 허용한다.
export function diagnosticLogData(input: DiagnosticInput) {
  if (!ERROR_CODES.includes(input.code) || !COMPONENTS.includes(input.component) ||
    (input.durationMs !== undefined && (!Number.isInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 86_400_000))) throw new Error("DIAGNOSTIC_INPUT_INVALID");
  const release = process.env.TUTI_RELEASE ?? "unknown";
  return {
    category: GENERAL_ERROR_CATEGORY, action: GENERAL_ERROR_ACTION, level: "error" as const,
    message: "일반 기능 오류",
    metadata: { code: input.code, component: input.component,
      release: /^[a-f0-9]{7,40}$/.test(release) ? release : "unknown",
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }) },
  };
}
