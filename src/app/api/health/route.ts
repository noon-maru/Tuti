import { prisma } from "@/server/db/prisma";
import {
  isObjectStorageEnabled,
  verifyObjectStorageConnection,
} from "@/server/storage/objectStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 3_000;

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  const checkedAt = new Date().toISOString();

  if (scope === "liveness") {
    return healthResponse(200, {
      status: "ok",
      scope: "liveness",
      release: process.env.TUTI_RELEASE ?? "unknown",
      checkedAt,
    });
  }

  const database = await checkDependency(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  const objectStorage = isObjectStorageEnabled()
    ? await checkDependency(verifyObjectStorageConnection)
    : { status: "disabled" as const, latencyMs: 0 };
  const ready = database.status === "ok" &&
    (objectStorage.status === "ok" || objectStorage.status === "disabled");

  return healthResponse(ready ? 200 : 503, {
    status: ready ? "ok" : "degraded",
    scope: "readiness",
    release: process.env.TUTI_RELEASE ?? "unknown",
    checkedAt,
    dependencies: {
      database,
      objectStorage,
    },
  });
}

async function checkDependency(operation: () => Promise<unknown>) {
  const startedAt = performance.now();

  try {
    await Promise.race([
      operation(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("health_check_timeout")), CHECK_TIMEOUT_MS),
      ),
    ]);
    return {
      status: "ok" as const,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return {
      status: "error" as const,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

function healthResponse(status: number, body: object) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
