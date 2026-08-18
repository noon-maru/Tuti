export const NATIVE_OAUTH_RETURN_TO = "/_native/oauth/callback";
export const NATIVE_OAUTH_SCHEME = "com.noonmaru.tuti:";
export const NATIVE_OAUTH_HOST = "oauth";
export const NATIVE_OAUTH_PATH = "/callback";

export function createNativeOAuthCallbackUrl(
  parameter: "oauthTicket" | "oauthError",
  value: string,
) {
  const callbackUrl = new URL(
    `${NATIVE_OAUTH_SCHEME}//${NATIVE_OAUTH_HOST}${NATIVE_OAUTH_PATH}`,
  );
  callbackUrl.searchParams.set(parameter, value);
  return callbackUrl.toString();
}

export function readNativeOAuthCallback(url: string) {
  try {
    const callbackUrl = new URL(url);

    if (
      callbackUrl.protocol !== NATIVE_OAUTH_SCHEME ||
      callbackUrl.hostname !== NATIVE_OAUTH_HOST ||
      callbackUrl.pathname !== NATIVE_OAUTH_PATH
    ) {
      return null;
    }

    const oauthTicket = callbackUrl.searchParams.get("oauthTicket");
    const oauthError = callbackUrl.searchParams.get("oauthError");

    if (!oauthTicket && !oauthError) return null;

    const loginParams = new URLSearchParams();
    if (oauthTicket) loginParams.set("oauthTicket", oauthTicket);
    if (oauthError) loginParams.set("oauthError", oauthError);
    return `/login?${loginParams.toString()}`;
  } catch {
    return null;
  }
}
