import type { OAuthProvider } from "@/shared/api/session";

export const accountAuthEnabled =
  process.env.NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED === "true";

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  apple: "Apple",
  google: "Google",
  kakao: "Kakao",
};

export const oauthProviderEnabled: Record<OAuthProvider, boolean> = {
  apple: false,
  google:
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true",
  kakao:
    process.env.NEXT_PUBLIC_KAKAO_OAUTH_ENABLED === "true",
};
