import nodemailer from "nodemailer";
import { join } from "node:path";
import { getRequiredAuthEnv } from "@/server/auth/config";
import { AccountAuthError } from "@/server/auth/session";
import { palette } from "@/styles/tokens";

const DAUM_SMTP_HOST = "smtp.daum.net";
const DAUM_SMTP_PORT = 465;
const BRAND_ICON_CID = "tuti-brand-icon";

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
    const message = createVerificationEmail(code);

    await transporter.sendMail({
      from: getRequiredAuthEnv("AUTH_EMAIL_FROM"),
      to: email,
      ...message,
    });
  } catch {
    throw new AccountAuthError(
      "인증 메일을 보내지 못했어요.",
      "email_delivery_failed",
      502,
    );
  }
}

export function createVerificationEmail(code: string) {
  return {
    subject: "[Tuti] 로그인 인증코드를 보내드려요",
    text: [
      "오늘 가능한 만큼만, 잠깐 다른 공기로.",
      "",
      "Tuti에 다시 오신 것을 환영해요.",
      `로그인 인증코드는 ${code}입니다.`,
      "",
      "이 코드는 10분 동안 한 번만 사용할 수 있어요.",
      "직접 요청하지 않았다면 입력하지 않고 이 메일을 닫아주세요.",
      "",
      "Tuti",
    ].join("\n"),
    html: createVerificationEmailHtml(code),
    attachments: [
      {
        filename: "tuti-icon.png",
        path: join(process.cwd(), "public/app-icons/icon-128.png"),
        cid: BRAND_ICON_CID,
      },
    ],
  };
}

function createVerificationEmailHtml(code: string) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Tuti 로그인 인증코드</title>
    <style>
      @media only screen and (max-width: 520px) {
        .email-shell { padding: 20px 12px !important; }
        .email-card { padding: 36px 24px 32px !important; }
        .verification-code { font-size: 30px !important; letter-spacing: 6px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${palette.neutral[200]};color:${palette.neutral[1300]};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Tuti 로그인에 사용할 6자리 인증코드가 도착했어요.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${palette.neutral[200]};">
      <tr>
        <td class="email-shell" align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:480px;">
            <tr>
              <td class="email-card" style="padding:44px 40px 36px;background:${palette.neutral[100]};border:1px solid ${palette.neutral[500]};border-radius:32px;font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center">
                      <img src="cid:${BRAND_ICON_CID}" width="72" height="72" alt="Tuti" style="display:block;width:72px;height:72px;border:0;border-radius:20px;">
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:18px;font-size:28px;font-weight:700;line-height:1.2;letter-spacing:-0.4px;">
                      Tuti
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:8px;color:${palette.neutral[900]};font-size:14px;line-height:1.5;letter-spacing:-0.2px;">
                      오늘 가능한 만큼만, 잠깐 다른 공기로.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:40px;font-size:22px;font-weight:700;line-height:1.35;letter-spacing:-0.4px;">
                      다시 만나서 반가워요.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:10px;color:${palette.neutral[900]};font-size:15px;line-height:1.6;letter-spacing:-0.2px;">
                      Tuti에 안전하게 로그인하려면<br>
                      아래 6자리 코드를 입력해주세요.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:24px;">
                      <div class="verification-code" style="padding:20px 12px;background:${palette.secondary[200]};border:2px solid ${palette.secondary[500]};border-radius:18px;color:${palette.neutral[1300]};font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:34px;font-weight:700;line-height:1.2;letter-spacing:8px;text-align:center;">
                        ${code}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:18px;color:${palette.neutral[900]};font-size:13px;line-height:1.6;letter-spacing:-0.1px;text-align:center;">
                      인증코드는 <strong style="color:${palette.brand[800]};">10분 동안</strong><br>
                      한 번만 사용할 수 있어요.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:32px;">
                      <div style="height:1px;background:${palette.neutral[300]};line-height:1px;">&nbsp;</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:20px;color:${palette.neutral[900]};font-size:12px;line-height:1.6;letter-spacing:-0.1px;">
                      이 로그인을 직접 요청하지 않았다면 코드를 입력하지 말고
                      메일을 닫아주세요. 계정에는 아무 변화도 생기지 않아요.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 16px 0;color:${palette.neutral[800]};font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;line-height:1.5;">
                지금의 상태에 맞는 장소를 준비하는 Tuti
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
