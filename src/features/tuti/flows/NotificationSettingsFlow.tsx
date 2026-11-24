"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationSettingsScreen } from "@/features/tuti/screens/notifications/NotificationSettingsScreen";
import { notificationSettingsQuery, saveNotificationSettings } from "@/lib/notificationSettings";
import { notificationSettingsKey, notificationSettingsMutation } from "@/lib/optimisticNotificationSettings";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/shared/notifications/preferences";
import { disableDailyTutiReminder } from "../notifications/localNotifications";
import { enableServerPushNotifications, disableServerPushNotifications, getPushNotificationStatus } from "../notifications/pushNotifications";
import { usePushEnvironment } from "../hooks/usePushEnvironment";
import { useSession } from "../hooks/useSession";
import { getSessionSnapshot } from "@/lib/auth/session";
import { showErrorToast } from "@/lib/feedback";
import { WEB_PUSH_USER_ENABLED } from "@/shared/notifications/rollout";
import { Capacitor } from "@capacitor/core";

export function NotificationSettingsFlow() {
  const router = useRouter(), client = useQueryClient();
  const owner = useSession()?.userId ?? "";
  const pushEnvironment = usePushEnvironment();
  const available = pushEnvironment === "native" || WEB_PUSH_USER_ENABLED;
  const browser = pushEnvironment === "native" || pushEnvironment === "checking" ? null : pushEnvironment;
  const mutationKey = notificationSettingsKey(owner);
  const saving = useIsMutating({ mutationKey }) > 0;
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<{ owner: string; text: string } | null>(null);
  const query = useQuery({ ...notificationSettingsQuery(owner), enabled: Boolean(owner && available && !saving) });
  const permission = useQuery({ queryKey: ["push-permission", owner], queryFn: getPushNotificationStatus,
    enabled: Boolean(owner && available && !saving), staleTime: 0, retry: false });
  const operations = notificationSettingsMutation(client, {
    currentOwner: () => getSessionSnapshot()?.userId,
    enable: enableServerPushNotifications, save: saveNotificationSettings,
    disable: disableServerPushNotifications, cancelLegacy: disableDailyTutiReminder,
  });
  const mutation = useMutation({ ...operations, mutationKey,
    onSuccess(result, input) {
      operations.onSuccess(result, input);
      if (getSessionSnapshot()?.userId !== input.owner) return;
      window.dispatchEvent(new Event("tuti-notification-settings-changed"));
      setNotice({ owner: input.owner, text: result.cleanupPending
        ? "설정은 저장했어요. 기기 알림 정리는 다음 연결 때 다시 확인할게요." : "알림 설정을 저장했어요." });
    },
    onError(error, input, context) {
      operations.onError(error, input, context);
      if (getSessionSnapshot()?.userId === input.owner) showErrorToast(
        error instanceof Error && !(error instanceof TypeError) ? error.message : "알림 설정을 저장하지 못해 이전 설정으로 돌렸어요. 연결을 확인하고 다시 시도해주세요.");
    },
    onSettled(_data, _error, input) {
      if (getSessionSnapshot()?.userId === input.owner) {
        void client.invalidateQueries({ queryKey: notificationSettingsKey(input.owner) });
        void client.invalidateQueries({ queryKey: ["push-permission", input.owner] });
      }
    },
  });
  useEffect(() => {
    if (!WEB_PUSH_USER_ENABLED && !Capacitor.isNativePlatform()) router.replace("/settings");
  }, [router]);

  const change = async (patch: Partial<NotificationSettings>) => {
    if (!owner || !query.data || inFlight.current || client.isMutating({ mutationKey }) || getSessionSnapshot()?.userId !== owner) return;
    inFlight.current = true;
    setNotice(null);
    const next = { ...query.data, ...patch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || query.data.timeZone };
    try {
      await mutation.mutateAsync({ owner, next, enableDevice: patch.newsEnabled === true || patch.reminderEnabled === true,
        wasEnabled: query.data.newsEnabled || query.data.reminderEnabled });
    } catch { /* onError rolls back the optimistic display. */ }
    finally { inFlight.current = false; }
  };
  if (!WEB_PUSH_USER_ENABLED && pushEnvironment !== "native") return null;
  const message = notice?.owner === owner ? notice.text : permission.isError
    ? "기기의 알림 권한을 확인하지 못했어요. 다시 불러와주세요." : query.isError
    ? "알림 설정을 불러오지 못했어요. 연결을 확인하고 다시 불러와주세요." : null;
  return <NotificationSettingsScreen settings={query.data ?? DEFAULT_NOTIFICATION_SETTINGS}
    supported={permission.data?.supported ?? false} browser={browser} status={permission.data ?? null}
    busy={saving || !query.data || permission.isPending || permission.isError} saving={saving} message={message}
    onRetry={(!query.data && query.isError) || permission.isError ? () => { void query.refetch(); void permission.refetch(); } : undefined}
    onBack={() => router.back()} onChange={change} />;
}
