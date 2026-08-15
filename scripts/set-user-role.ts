import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type UserRole,
} from "../src/generated/prisma/client";
import { buildLocationSecurityAuditEventData } from "../src/server/location/securityAudit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const { email, role } = parseArguments(process.argv.slice(2));

try {
  const identities = await prisma.authIdentity.findMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      userId: true,
      email: true,
    },
  });
  const userIds = Array.from(
    new Set(identities.map((identity) => identity.userId)),
  );

  if (userIds.length === 0) {
    throw new Error(`계정을 찾지 못했습니다: ${email}`);
  }

  if (userIds.length > 1) {
    throw new Error(
      `같은 이메일에 연결된 계정이 ${userIds.length}개입니다. 먼저 계정 병합 상태를 확인해주세요.`,
    );
  }

  const currentUser = await prisma.user.findUniqueOrThrow({
    where: { id: userIds[0] },
    select: { role: true },
  });
  const permissionAudit = buildLocationSecurityAuditEventData({
    category: "permission_change",
    result: "success",
    actorIdentity: `cli:${process.env.SUDO_USER ?? "tuti-operator"}`,
    targetIdentity: `user:${userIds[0]}`,
    action: "application-role.change",
    resource: "tuti_admin",
    details: {
      previousRole: currentUser.role,
      nextRole: role,
      source: "cli",
    },
  });
  const user = await prisma.$transaction(async (transaction) => {
    const updatedUser = await transaction.user.update({
      where: { id: userIds[0] },
      data: { role },
      select: { id: true, role: true },
    });
    await transaction.systemLog.create({
      data: {
        id: randomUUID(),
        category: "permission",
        action: "role.changed.cli",
        message: `${email} 계정의 권한을 ${role}(으)로 변경했습니다.`,
        targetType: "user",
        targetId: updatedUser.id,
        metadata: {
          email,
          role,
          source: "cli",
        },
      },
    });
    await transaction.locationSecurityAuditEvent.create({
      data: permissionAudit,
    });
    return updatedUser;
  });

  console.log(`${email} (${user.id}) → ${user.role}`);
} finally {
  await prisma.$disconnect();
}

function parseArguments(args: string[]): { email: string; role: UserRole } {
  const email = readArgument(args, "--email") ?? args.find(
    (argument) => !argument.startsWith("--") && argument.includes("@"),
  );
  const requestedRole =
    readArgument(args, "--role") ??
    args.find((argument) => argument === "user" || argument === "admin") ??
    "admin";

  if (!email) {
    throw new Error(
      "사용법: pnpm admin:role -- --email admin@tuti.today --role admin",
    );
  }

  if (requestedRole !== "user" && requestedRole !== "admin") {
    throw new Error("role은 user 또는 admin이어야 합니다.");
  }

  return {
    email: email.trim().toLowerCase(),
    role: requestedRole,
  };
}

function readArgument(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
