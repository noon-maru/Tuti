import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequiredAuthEnv } from "@/server/auth/config";

type Scope = { userId: string; bookId: string; entryId: string; accessRevision: number; expires: number };
const sign = (value: string) => createHmac("sha256", getRequiredAuthEnv("AUTH_EMAIL_CODE_SECRET")).update(`harumadi-media-v1:${value}`).digest("hex");
export function sharedImageUrl(userId: string, bookId: string, entryId: string, accessRevision: number) {
  const value = Buffer.from(JSON.stringify({ userId, bookId, entryId, accessRevision, expires: Date.now() + 15 * 60_000 })).toString("base64url");
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
