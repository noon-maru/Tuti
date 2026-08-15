"use client";

import { useRouter } from "next/navigation";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { LocationSettingsScreen } from "@/features/tuti/screens/location/LocationSettingsScreen";
import { useTutiStore } from "@/store/tuti";

export function LocationSettingsFlow() {
  const router = useRouter();
  const { requestLocation, requesting, withdrawLocation } =
    useLocationAccess();
  const userLocation = useTutiStore((state) => state.userLocation);
  const locationConsent = useTutiStore((state) => state.locationConsent);
  const locationPermissionStatus = useTutiStore(
    (state) => state.locationPermissionStatus,
  );

  return (
    <LocationSettingsScreen
      consent={locationConsent}
      locationAvailable={Boolean(userLocation)}
      permissionStatus={locationPermissionStatus}
      requesting={requesting}
      onBack={() => router.replace("/")}
      onEnable={async () => {
        const result = await requestLocation();
        return result.status === "ready";
      }}
      onWithdraw={async () => {
        if (
          !window.confirm(
            "위치정보 이용 동의를 철회할까요? 이후에는 현재 위치를 요청하지 않아요.",
          )
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
