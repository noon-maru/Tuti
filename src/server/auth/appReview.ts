const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

type AuthEnvironment = Record<string, string | undefined>;

export type AppReviewAuthConfig = {
  email: string;
  verificationCode: string;
};

export class AppReviewAuthConfigurationError extends Error {
  readonly code = "app_review_auth_not_configured";

  constructor() {
    super("심사용 계정 설정을 확인해주세요.");
  }
}

export function getAppReviewAuthConfig(
  environment: AuthEnvironment = process.env,
): AppReviewAuthConfig | null {
  const email = environment.AUTH_APP_REVIEW_EMAIL?.trim().toLowerCase() ?? "";
  const verificationCode = environment.AUTH_APP_REVIEW_CODE?.trim() ?? "";

  if (!email && !verificationCode) return null;

  if (
    !EMAIL_PATTERN.test(email) ||
    !VERIFICATION_CODE_PATTERN.test(verificationCode)
  ) {
    throw new AppReviewAuthConfigurationError();
  }

  return { email, verificationCode };
}

export function isAppReviewEmail(
  email: string,
  config: AppReviewAuthConfig | null,
) {
  return config !== null && email === config.email;
}
