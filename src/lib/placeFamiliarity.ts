import { fetchWithPinnedSession } from "@/lib/auth/session";

async function request(owner: string, placeId: string, familiar?: boolean, signal?: AbortSignal) {
  const response = await fetchWithPinnedSession(familiar === undefined ? `place-familiarity?placeId=${encodeURIComponent(placeId)}` : "place-familiarity", {
    method: familiar === undefined ? "GET" : "PUT", cache: "no-store", signal,
    ...(familiar === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId, familiar }) }),
  }, owner);
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "장소 표시를 저장하지 못했어요.");
  if (body.placeId !== placeId || typeof body.familiar !== "boolean") throw new Error("장소 표시 응답을 확인하지 못했어요.");
  return { placeId, familiar: body.familiar as boolean };
}
export const readPlaceFamiliarity = (owner: string, placeId: string, signal?: AbortSignal) => request(owner, placeId, undefined, signal);
export const savePlaceFamiliarity = (owner: string, placeId: string, familiar: boolean) => request(owner, placeId, familiar);
