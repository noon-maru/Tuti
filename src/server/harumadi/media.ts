import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequiredAuthEnv } from "@/server/auth/config";

type Scope = { userId: string; bookId: string; entryId: string; accessRevision: number; expires: number; entryVersion?: string };
const sign = (value: string) => createHmac("sha256", getRequiredAuthEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY")).update(`harumadi-media-v1:${value}`).digest("hex");
export function sharedImageUrl(userId: string, bookId: string, entryId: string, accessRevision: number, entryVersion?: string) {
  const value = Buffer.from(JSON.stringify({ userId, bookId, entryId, accessRevision, expires: (Math.floor(Date.now() / 300_000) + 3) * 300_000, ...(entryVersion ? { entryVersion } : {}) })).toString("base64url");
  return `/api/harumadis/${encodeURIComponent(bookId)}/images/${encodeURIComponent(entryId)}?ticket=${value}.${sign(value)}`;
}
export function readSharedImageTicket(ticket: string | null): Scope | null {
  if (!ticket || ticket.length > 2048) return null;
  const [value, signature, ...rest] = ticket.split(".");
  if (!value || !signature || rest.length || !/^[a-f0-9]{64}$/.test(signature)) return null;
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(value), "hex"))) return null;
  try {
    const scope = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Scope;
    if (![scope.userId, scope.bookId, scope.entryId].every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) || !Number.isSafeInteger(scope.accessRevision) || !Number.isFinite(scope.expires) || scope.expires <= Date.now()) return null;
    return scope;
  } catch { return null; }
}
