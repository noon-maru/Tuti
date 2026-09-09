const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type AuthEnvironment = Record<string, string | undefined>;

export type AppReviewAuthConfig = {
  email: string;
  credential: string;
  verificationMethod: "password" | "code";
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
  const password = environment.AUTH_APP_REVIEW_PASSWORD?.trim() ?? "";
  const verificationCode = environment.AUTH_APP_REVIEW_CODE?.trim() ?? "";

  if (!email && !password && !verificationCode) return null;

  if (!EMAIL_PATTERN.test(email)) {
    throw new AppReviewAuthConfigurationError();
  }

  if (password) {
    if (
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      throw new AppReviewAuthConfigurationError();
    }

    return {
      email,
      credential: password,
      verificationMethod: "password",
    };
  }

  if (!VERIFICATION_CODE_PATTERN.test(verificationCode)) {
    throw new AppReviewAuthConfigurationError();
  }

  return {
    email,
    credential: verificationCode,
    verificationMethod: "code",
  };
}

export function isAppReviewEmail(
  email: string,
  config: AppReviewAuthConfig | null,
) {
  return config !== null && email === config.email;
}
