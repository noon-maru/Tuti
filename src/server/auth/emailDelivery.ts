import { getRequiredAuthEnv } from "@/server/auth/config";
import { AccountAuthError } from "@/server/auth/session";

export async function sendEmailVerificationCode(
  email: string,
  code: string,
) {
  const provider = getRequiredAuthEnv("AUTH_EMAIL_PROVIDER");

  if (provider !== "resend") {
    throw new AccountAuthError(
      "지원하지 않는 이메일 발송 설정이에요.",
      "unsupported_email_provider",
      503,
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRequiredAuthEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getRequiredAuthEnv("AUTH_EMAIL_FROM"),
      to: [email],
      subject: "[Tuti] 로그인 인증코드",
      text: [
        `Tuti 로그인 인증코드는 ${code}입니다.`,
        "",
        "인증코드는 10분 동안 한 번만 사용할 수 있어요.",
        "직접 요청하지 않았다면 이 메일을 무시해주세요.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new AccountAuthError(
      "인증 메일을 보내지 못했어요.",
      "email_delivery_failed",
      502,
    );
  }
}
