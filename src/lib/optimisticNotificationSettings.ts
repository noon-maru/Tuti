import type { QueryClient } from "@tanstack/react-query";
import type { NotificationSettings } from "@/shared/notifications/preferences";

export const notificationSettingsKey = (owner: string) => ["notification-settings", owner] as const;
export type NotificationSettingsChange = { owner: string; next: NotificationSettings; enableDevice: boolean; wasEnabled: boolean };
type Services = {
  currentOwner: () => string | undefined;
  enable: () => Promise<{ status: string }>;
  save: (settings: NotificationSettings, owner: string) => Promise<NotificationSettings>;
  disable: () => Promise<void>;
  cancelLegacy: () => Promise<unknown>;
};

/** 서버 저장 전에는 표시만 바꾼다. 한 계정의 저장은 한 번에 하나만 실행한다. */
export function notificationSettingsMutation(client: QueryClient, services: Services) {
  const assertOwner = (owner: string) => {
    if (services.currentOwner() !== owner) throw new Error("계정이 바뀌었어요. 현재 계정에서 다시 시도해주세요.");
  };
  return {
    async onMutate(input: NotificationSettingsChange) {
      assertOwner(input.owner);
      const key = notificationSettingsKey(input.owner);
      await client.cancelQueries({ queryKey: key });
      assertOwner(input.owner);
      const previous = client.getQueryData<NotificationSettings>(key);
      if (!previous) throw new Error("알림 설정을 먼저 불러와주세요.");
      client.setQueryData(key, input.next);
      return { previous };
    },
    async mutationFn(input: NotificationSettingsChange) {
      assertOwner(input.owner);
      let registeredHere = false, savedHere = false;
      try {
        if (input.enableDevice) {
          if ((await services.enable()).status !== "registered") throw new Error("기기 설정에서 Tuti 알림을 허용해주세요.");
          registeredHere = true;
        }
        assertOwner(input.owner);
        const settings = await services.save(input.next, input.owner);
        savedHere = true;
        assertOwner(input.owner);
        // 실제 저장을 마친 뒤의 기기 정리 실패는 서버 설정을 되돌리지 않는다.
        let cleanupPending = false;
        try {
          await services.cancelLegacy();
          assertOwner(input.owner);
          if (!settings.newsEnabled && !settings.reminderEnabled) await services.disable();
        } catch { cleanupPending = true; }
        return { settings, cleanupPending };
      } catch (error) {
        // 신규 등록에 실패한 설정을 활성 상태로 남기지 않는다. 기존 등록은 보존한다.
        if (registeredHere && !savedHere && !input.wasEnabled && services.currentOwner() === input.owner) {
          await services.disable().catch(() => {});
        }
        throw error;
      }
    },
    onError(_error: unknown, input: NotificationSettingsChange, context: { previous: NotificationSettings } | undefined) {
      if (services.currentOwner() === input.owner && context) client.setQueryData(notificationSettingsKey(input.owner), context.previous);
    },
    onSuccess(result: { settings: NotificationSettings }, input: NotificationSettingsChange) {
      if (services.currentOwner() === input.owner) client.setQueryData(notificationSettingsKey(input.owner), result.settings);
    },
  };
}
