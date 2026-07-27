import { prisma } from "@/server/db/prisma";

export const adminSettingDefinitions = [
  {
    key: "places.publicDataAutoApprove",
    label: "공공데이터 장소 자동 승인",
    description:
      "활성화하면 향후 공공데이터 동기화로 들어온 장소를 검토 없이 노출합니다.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    key: "reports.intakeEnabled",
    label: "사용자 신고 접수",
    description: "신규 콘텐츠 신고 접수 API를 활성화합니다.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    key: "service.maintenanceNotice",
    label: "서비스 안내 문구",
    description: "관리자가 공유할 운영 안내 문구입니다. 비워둘 수 있습니다.",
    type: "text",
    defaultValue: "",
  },
] as const;

export type AdminSettingKey =
  (typeof adminSettingDefinitions)[number]["key"];

export async function getAdminSettings() {
  const storedSettings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: adminSettingDefinitions.map((setting) => setting.key),
      },
    },
  });
  const storedByKey = new Map(
    storedSettings.map((setting) => [setting.key, setting]),
  );

  return adminSettingDefinitions.map((definition) => {
    const stored = storedByKey.get(definition.key);

    return {
      ...definition,
      value: stored?.value ?? definition.defaultValue,
      updatedAt: stored?.updatedAt.toISOString() ?? null,
    };
  });
}

export function isAdminSettingKey(value: string): value is AdminSettingKey {
  return adminSettingDefinitions.some((setting) => setting.key === value);
}

export async function isSettingEnabled(key: AdminSettingKey) {
  const definition = adminSettingDefinitions.find(
    (setting) => setting.key === key,
  );
  const setting = await prisma.appSetting.findUnique({ where: { key } });

  return (setting?.value ?? definition?.defaultValue) === "true";
}
