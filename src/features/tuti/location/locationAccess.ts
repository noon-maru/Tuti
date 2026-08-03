import type {
  LocationPermissionStatus,
  UserLocation,
} from "@/shared/tuti/types";

export type DeviceLocationRequestResult =
  | { status: "ready"; location: UserLocation }
  | { status: "denied" | "unavailable" | "timeout" };

export type LocationRequestResult =
  | DeviceLocationRequestResult
  | { status: "declined" };

export async function readLocationPermission(): Promise<LocationPermissionStatus> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "unavailable";
  }

  if (!navigator.permissions?.query) return "unknown";

  try {
    const permission = await navigator.permissions.query({
      name: "geolocation",
    });

    if (permission.state === "granted") return "granted";
    if (permission.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

export function requestDeviceLocation(): Promise<DeviceLocationRequestResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: "unavailable" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: "ready",
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: "denied" });
          return;
        }

        if (error.code === error.TIMEOUT) {
          resolve({ status: "timeout" });
          return;
        }

        resolve({ status: "unavailable" });
      },
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1_000,
        timeout: 8_000,
      },
    );
  });
}
