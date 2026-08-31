export const ANDROID_BACK_EVENT = "tuti:android-back";

const MAIN_CHILD_ROUTES = new Set([
  "/account-deletion",
  "/inquiry",
  "/journal",
  "/legal",
  "/location",
  "/login",
  "/notifications",
]);

export function resolveAndroidBackDestination(pathname: string) {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (normalizedPathname === "/" || normalizedPathname === "/entry") {
    return null;
  }

  if (normalizedPathname === "/legal/privacy/2026-10-01") {
    return "/legal/privacy";
  }

  if (
    normalizedPathname === "/legal/privacy" ||
    normalizedPathname === "/legal/location-terms"
  ) {
    return "/legal";
  }

  if (
    normalizedPathname === "/journal/detail" ||
    normalizedPathname === "/journal/edit" ||
    normalizedPathname === "/journal/new"
  ) {
    return "/journal";
  }

  if (MAIN_CHILD_ROUTES.has(normalizedPathname)) {
    return "/";
  }

  return "/";
}

export function dispatchAndroidBackEvent() {
  return window.dispatchEvent(
    new Event(ANDROID_BACK_EVENT, { cancelable: true }),
  );
}
