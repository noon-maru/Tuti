"use client";
import { confirmAction } from "@/lib/feedback";

import { useRouter } from "next/navigation";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { LocationSettingsScreen } from "@/features/tuti/screens/location/LocationSettingsScreen";
import { useTutiStore } from "@/store/tuti";

export function LocationSettingsFlow() {
  const router = useRouter();
  const {
    requestLocation,
    requestRegionPreference,
    requesting,
    pauseLocation,
    withdrawLocation,
  } = useLocationAccess();
  const userLocation = useTutiStore((state) => state.userLocation);
  const locationConsent = useTutiStore((state) => state.locationConsent);
  const locationPermissionStatus = useTutiStore(
    (state) => state.locationPermissionStatus,
  );
  const preferredRegion = useTutiStore((state) => state.preferredRegion);

  return (
    <LocationSettingsScreen
      consent={locationConsent}
      locationAvailable={Boolean(userLocation)}
      permissionStatus={locationPermissionStatus}
      preferredRegionName={preferredRegion?.sigunguName}
      requesting={requesting}
      onBack={() => router.replace("/settings")}
      onEnable={async () => {
        const result = await requestLocation();
        return result.status === "ready";
      }}
      onChangeRegion={requestRegionPreference}
      onPause={async () => {
        try {
          await pauseLocation();
          return true;
        } catch {
          return false;
        }
      }}
      onWithdraw={async () => {
        if (
          !(await confirmAction("위치정보 이용 동의를 철회할까요? 이후에는 현재 위치를 요청하지 않아요.", {"title":"동의 철회","confirmLabel":"철회하기","tone":"danger"}))
        ) {
          return null;
        }
        try {
          await withdrawLocation();
          return true;
        } catch {
          return false;
        }
      }}
    />
  );
}
