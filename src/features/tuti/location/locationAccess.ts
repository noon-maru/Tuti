import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
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

function hasNativeLocationPermission(
  permission: Awaited<ReturnType<typeof Geolocation.checkPermissions>>,
) {
  return (
    permission.location === "granted" ||
    permission.coarseLocation === "granted"
  );
}

function mapNativeLocationError(error: unknown): DeviceLocationRequestResult {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  if (code === "OS-PLUG-GLOC-0003") return { status: "denied" };
  if (code === "OS-PLUG-GLOC-0010") return { status: "timeout" };
  return { status: "unavailable" };
}

export async function readLocationPermission(): Promise<LocationPermissionStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const permission = await Geolocation.checkPermissions();

      if (hasNativeLocationPermission(permission)) return "granted";
      if (
        permission.location === "denied" &&
        permission.coarseLocation === "denied"
      ) {
        return "denied";
      }
      return "prompt";
    } catch {
      return "unavailable";
    }
  }

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

async function requestNativeDeviceLocation(): Promise<DeviceLocationRequestResult> {
  try {
    const permission = await Geolocation.requestPermissions({
      permissions: ["location"],
    });

    if (!hasNativeLocationPermission(permission)) {
      return { status: "denied" };
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1_000,
      timeout: 8_000,
    });

    return {
      status: "ready",
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    };
  } catch (error) {
    return mapNativeLocationError(error);
  }
}

export function requestDeviceLocation(): Promise<DeviceLocationRequestResult> {
  if (Capacitor.isNativePlatform()) {
    return requestNativeDeviceLocation();
  }

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
