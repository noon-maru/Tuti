import { prisma } from "../src/server/db/prisma";
import { recordLocationSecurityAuditEvent } from "../src/server/location/securityAudit";

const input = parseArguments(process.argv.slice(2));

try {
  const event = await recordLocationSecurityAuditEvent({
    category: "permission_change",
    result: "success",
    actorIdentity: `operator:${process.env.TUTI_OPERATOR_ID ?? "unknown"}`,
    targetIdentity: `operator:${input.subject}`,
    action: `infrastructure-access.${input.action}`,
    resource: input.system,
    details: {
      previousAccess: input.previousAccess ?? "none",
      nextAccess: input.nextAccess ?? "none",
      reason: input.reason,
      source: "operations_cli",
    },
  });
  console.log(
    JSON.stringify(
      {
        id: event.id,
        category: event.category,
        action: event.action,
        resource: event.resource,
        occurredAt: event.occurredAt.toISOString(),
        retentionUntil: event.retentionUntil.toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

function parseArguments(args: string[]) {
  const subject = readRequired(args, "--subject");
  const system = readRequired(args, "--system");
  const action = readRequired(args, "--action");
  const reason = readRequired(args, "--reason");
  const previousAccess = readOptional(args, "--previous");
  const nextAccess = readOptional(args, "--next");

  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(subject)) {
    throw new Error("--subject는 80자 이하의 계정 식별값이어야 합니다.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(system)) {
    throw new Error("--system은 80자 이하의 시스템 식별값이어야 합니다.");
  }
  if (action !== "grant" && action !== "change" && action !== "revoke") {
    throw new Error("--action은 grant, change 또는 revoke여야 합니다.");
  }
  if (reason.length > 300) throw new Error("--reason은 300자 이하여야 합니다.");
  if (action === "grant" && !nextAccess) {
    throw new Error("권한 부여에는 --next가 필요합니다.");
  }
  if (action === "revoke" && !previousAccess) {
    throw new Error("권한 말소에는 --previous가 필요합니다.");
  }

  return {
    subject,
    system,
    action,
    reason,
    previousAccess,
    nextAccess,
  };
}

function readRequired(args: string[], name: string) {
  const value = readOptional(args, name);
  if (!value) throw new Error(`${name} 값이 필요합니다.`);
  return value;
}

function readOptional(args: string[], name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1]?.trim() : undefined;
  return value || undefined;
}
