import { createHash, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

export const RIGHTS_TEST_RECIPIENT = "admin@tuti.today";

// 합성 자료로만 전송 경로를 시험한다. 법정 서식·당사자 통지를 대체하지 않는다.
export function createRightsDeliveryTest(reference = `RIGHTS-DELIVERY-TEST-${randomUUID()}`) {
  if (!/^RIGHTS-DELIVERY-TEST-[A-Za-z0-9-]{8,80}$/.test(reference)) throw new Error("시험 번호 형식 확인 필요");
  const attachments = [
    {
      filename: "tuti-rights-test-notice.txt",
      contentType: "text/plain; charset=utf-8",
      content: `[운영 전달 시험 — 실제 신고·법정 통지 아님]\n시험 번호: ${reference}\n합성 대상: https://example.invalid/tuti-rights-test\n조치: 전달 경로 시험만 수행. 실제 게시물 변경 없음.\n이 파일은 법정 중단·재개 통보서가 아닙니다.\n`,
    },
    {
      filename: "tuti-rights-test-request.txt",
      contentType: "text/plain; charset=utf-8",
      content: `[합성 요청서 첨부 시험 — 실제 권리 주장 아님]\n시험 번호: ${reference}\n신청인·작성자: 합성 시험 역할. 실제 사용자 자료 없음.\n이 파일은 저작권법 시행규칙 별지 서식을 대체하지 않습니다.\n`,
    },
  ];
  return {
    reference,
    message: {
      to: RIGHTS_TEST_RECIPIENT,
      subject: `[Tuti 운영 시험] 권리 대응 첨부 전달 확인 · ${reference}`,
      text: [
        "권리 대응 안내와 첨부파일이 정상 전달되는지 확인하는 운영 시험이에요.",
        "실제 신고나 법적 조치가 아니며, 사용자 기록과 계정에는 변화가 없어요.",
        "첨부파일 두 개가 모두 열리고, 본문에 같은 시험 번호가 있는지 확인해주세요.",
        `시험 번호: ${reference}`,
        "SMTP 접수만으로 수신·법정 통지 완료를 기록하지 않아요.",
      ].join("\n\n"),
      attachments,
    },
    attachmentEvidence: attachments.map((item) => ({ filename: item.filename, bytes: Buffer.byteLength(item.content), sha256: createHash("sha256").update(item.content).digest("hex") })),
  };
}

type TestTransport = {
  sendMail: (message: ReturnType<typeof createRightsDeliveryTest>["message"] & { from: string }) => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
  close: () => void;
};

export async function sendRightsDeliveryTest(
  env: Readonly<Record<string, string | undefined>> = process.env,
  factory: (options: { host: string; port: number; secure: boolean; auth: { user: string; pass: string }; connectionTimeout: number; greetingTimeout: number; socketTimeout: number }) => TestTransport = nodemailer.createTransport,
) {
  if (env.AUTH_EMAIL_PROVIDER !== "daum-smartwork" || !env.DAUM_SMTP_USER?.trim() || !env.DAUM_SMTP_APP_PASSWORD || !env.AUTH_EMAIL_FROM?.trim()) throw new Error("운영 메일 설정 확인 필요");
  const test = createRightsDeliveryTest();
  const transport = factory({
    host: "smtp.daum.net", port: 465, secure: true,
    auth: { user: env.DAUM_SMTP_USER, pass: env.DAUM_SMTP_APP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  try {
    const result = await transport.sendMail({ from: env.AUTH_EMAIL_FROM, ...test.message });
    const accepted = result.accepted?.some((item) => typeof item === "string" && item.toLowerCase() === RIGHTS_TEST_RECIPIENT) === true;
    if (!accepted || result.rejected?.length) throw new Error("운영 시험 메일이 접수되지 않음");
    return { mode: "smtp-submitted", reference: test.reference, recipient: RIGHTS_TEST_RECIPIENT, attachments: test.attachmentEvidence, smtpAccepted: true, recipientReceiptVerified: false, formalNoticeDeliveryVerified: false };
  } finally { transport.close(); }
}

export async function sendRightsAlertTest(env: Readonly<Record<string, string | undefined>> = process.env, fetcher: typeof fetch = fetch) {
  const url = new URL(env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL ?? "");
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("운영 알림 설정 확인 필요");
  const response = await fetcher(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ text: "Tuti 권리 보호 알림 전송 시험입니다. 실제 신고나 처리 지연은 없으며, 사용자 기록·사건 상태는 변경하지 않았어요." }),
  });
  if (!response.ok) throw new Error("운영 알림 시험 접수 실패");
  return { mode: "operator-alert-test", providerAccepted: true, formalNoticeDeliveryVerified: false };
}
