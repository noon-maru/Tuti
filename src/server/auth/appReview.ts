const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type AuthEnvironment = Record<string, string | undefined>;

export type AppReviewAuthConfig = {
  email: string;
  credential: string;
  verificationMethod: "password";
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
  if (!email && !password) return null;

  if (!EMAIL_PATTERN.test(email)) {
    throw new AppReviewAuthConfigurationError();
  }

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

export function isAppReviewEmail(
  email: string,
  config: AppReviewAuthConfig | null,
) {
  return config !== null && email === config.email;
}
