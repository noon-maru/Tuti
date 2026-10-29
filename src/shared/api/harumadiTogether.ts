export type HarumadiParticipant = { userId: string; name: string; owner: boolean };
export type HarumadiInviteItem = { id: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null };
export type HarumadiTogether = { owner: boolean; participants: HarumadiParticipant[]; invites: HarumadiInviteItem[] };
export type HarumadiComment = { id: string; authorId: string | null; authorName: string; parentId: string | null;
  body: string; revision: number; createdAt: string; updatedAt: string; deleted: boolean; canEdit: boolean; canDelete: boolean };
export const HARUMADI_COMMENT_LIMIT = 1000;
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function harumadiInviteUrl(token: string, apiBase: string, localOrigin: string) {
  if (!INVITE_TOKEN.test(token)) throw new Error("초대 링크를 확인해주세요.");
  const origin = new URL(apiBase, localOrigin).origin;
  const url = new URL("/harumadi/invite", origin === "null" ? "https://tuti.today" : origin);
  url.hash = token;
  return url.toString();
}
export function parseTogetherComment(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > HARUMADI_COMMENT_LIMIT ||
    (input.parentId !== undefined && input.parentId !== null && (typeof input.parentId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.parentId)))) return null;
  return { body: input.body.trim(), parentId: typeof input.parentId === "string" ? input.parentId : null };
}
