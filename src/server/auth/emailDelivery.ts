import nodemailer from "nodemailer";
import { getRequiredAuthEnv } from "@/server/auth/config";
import { AccountAuthError } from "@/server/auth/session";

const DAUM_SMTP_HOST = "smtp.daum.net";
const DAUM_SMTP_PORT = 465;

export async function sendEmailVerificationCode(
  email: string,
  code: string,
) {
  const provider = getRequiredAuthEnv("AUTH_EMAIL_PROVIDER");

  if (provider !== "daum-smartwork") {
    throw new AccountAuthError(
      "지원하지 않는 이메일 발송 설정이에요.",
      "unsupported_email_provider",
      503,
    );
  }

  const transporter = nodemailer.createTransport({
    host: DAUM_SMTP_HOST,
    port: DAUM_SMTP_PORT,
    secure: true,
    auth: {
      user: getRequiredAuthEnv("DAUM_SMTP_USER"),
      pass: getRequiredAuthEnv("DAUM_SMTP_APP_PASSWORD"),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporter.sendMail({
      from: getRequiredAuthEnv("AUTH_EMAIL_FROM"),
      to: email,
      subject: "[Tuti] 로그인 인증코드",
      text: [
        `Tuti 로그인 인증코드는 ${code}입니다.`,
        "",
        "인증코드는 10분 동안 한 번만 사용할 수 있어요.",
        "직접 요청하지 않았다면 이 메일을 무시해주세요.",
      ].join("\n"),
    });
  } catch {
    throw new AccountAuthError(
      "인증 메일을 보내지 못했어요.",
      "email_delivery_failed",
      502,
    );
  }
}
