import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { AnonymousSession } from "@/shared/api/anonymousSession";

const BEARER_PREFIX = "Bearer ";
const MINIMUM_TOKEN_LENGTH = 32;

export async function createAnonymousSession(): Promise<AnonymousSession> {
  const accessToken = randomBytes(32).toString("base64url");
  const userId = randomUUID();

  await prisma.anonymousUser.create({
    data: {
      id: userId,
      tokenHash: hashAccessToken(accessToken),
    },
  });

  return { accessToken, userId };
}

export async function authenticateAnonymousUser(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith(BEARER_PREFIX)) return null;

  const accessToken = authorization.slice(BEARER_PREFIX.length).trim();

  if (accessToken.length < MINIMUM_TOKEN_LENGTH) return null;

  return prisma.anonymousUser.findUnique({
    where: {
      tokenHash: hashAccessToken(accessToken),
    },
    select: {
      id: true,
    },
  });
}

function hashAccessToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}
