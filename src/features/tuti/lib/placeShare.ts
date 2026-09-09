import { apiUrl } from "@/lib/api/apiUrl";

const DEFAULT_PUBLIC_ORIGIN = "https://tuti.today";

export function getPublicPlaceUrl(placeId: string) {
  const apiBaseUrl = apiUrl("");
  const fallbackOrigin =
    typeof window === "undefined" ? DEFAULT_PUBLIC_ORIGIN : window.location.origin;

  try {
    const apiOrigin = new URL(apiBaseUrl, fallbackOrigin).origin;
    return createPublicPlaceUrl(placeId, apiOrigin);
  } catch {
    return createPublicPlaceUrl(placeId, DEFAULT_PUBLIC_ORIGIN);
  }
}

export function createPublicPlaceUrl(placeId: string, origin: string) {
  return new URL(`/place/${encodeURIComponent(placeId)}`, origin).toString();
}
