const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api";

export function apiUrl(path: string) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
