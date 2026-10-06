"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LocationConsentSheet } from "@/features/tuti/components/LocationConsentSheet";
import { RegionPreferenceSheet } from "@/features/tuti/components/RegionPreferenceSheet";
import { useSession } from "@/features/tuti/hooks/useSession";
import {
  readLocationPermission,
  requestDeviceLocation,
  type LocationRequestResult,
} from "@/features/tuti/location/locationAccess";
import {
  canUseLocationWithoutConsentPrompt,
  isPausedLocationConsent,
} from "@/features/tuti/location/locationConsentFlow";
import {
  fetchLocationConsent,
  updateLocationConsent,
} from "@/lib/tutiApi";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type { PreferredRegion } from "@/shared/tuti/types";
import { useTutiStore } from "@/store/tuti";

type LocationAccessContextValue = {
  requestLocation: () => Promise<LocationRequestResult>;
  refreshLocationConsent: () => Promise<void>;
  requestRegionPreference: () => void;
  pauseLocation: () => Promise<void>;
  withdrawLocation: () => Promise<void>;
  requesting: boolean;
};

const LocationAccessContext = createContext<LocationAccessContextValue | null>(
  null,
);

export function LocationAccessProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const session = useSession();
  const sessionUserId = session?.userId;
  const locationConsent = useTutiStore((state) => state.locationConsent);
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const setUserLocation = useTutiStore((state) => state.setUserLocation);
  const clearUserLocation = useTutiStore((state) => state.clearUserLocation);
  const acceptLocationConsent = useTutiStore(
    (state) => state.acceptLocationConsent,
  );
  const syncLocationConsent = useTutiStore(
    (state) => state.syncLocationConsent,
  );
  const declineLocationConsent = useTutiStore(
    (state) => state.declineLocationConsent,
  );
  const pauseLocationConsent = useTutiStore(
    (state) => state.pauseLocationConsent,
  );
  const withdrawLocationConsent = useTutiStore(
    (state) => state.withdrawLocationConsent,
  );
  const setLocationPermissionStatus = useTutiStore(
    (state) => state.setLocationPermissionStatus,
  );
  const preferredRegion = useTutiStore((state) => state.preferredRegion);
  const setPreferredRegion = useTutiStore(
    (state) => state.setPreferredRegion,
  );
  const [consentSheetOpen, setConsentSheetOpen] = useState(false);
  const [regionSheetOpen, setRegionSheetOpen] = useState(false);
  const [regionSheetDismissible, setRegionSheetDismissible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const requestPromiseRef = useRef<Promise<LocationRequestResult> | null>(null);
  const requestResolverRef = useRef<
    ((result: LocationRequestResult) => void) | null
  >(null);
  const pendingLocationResultRef = useRef<LocationRequestResult | null>(null);
  const consentSyncGeneration = useRef(0);

  const refreshLocationConsent = useCallback(async () => {
    const generation = ++consentSyncGeneration.current;
    const serverConsent = await fetchLocationConsent();
    if (generation !== consentSyncGeneration.current) return;
    syncLocationConsent(serverConsent ? {
      status: serverConsent.status,
      termsVersion: serverConsent.termsVersion,
      updatedAt: serverConsent.updatedAt,
    } : undefined);
  }, [syncLocationConsent]);

  useEffect(() => {
    if (
      locationConsent?.status !== "accepted" ||
      locationConsent.termsVersion !== LOCATION_TERMS_VERSION
    ) {
      return;
    }

    let cancelled = false;
    void readLocationPermission().then((permission) => {
      if (!cancelled) setLocationPermissionStatus(permission);
    });
    return () => { cancelled = true; };
  }, [locationConsent, setLocationPermissionStatus]);

  useEffect(() => {
    if (!hasHydrated || !sessionUserId) return;
    if (requestPromiseRef.current) return;
    let cancelled = false;
    const generation = consentSyncGeneration.current;

    void fetchLocationConsent()
      .then((serverConsent) => {
        if (cancelled || generation !== consentSyncGeneration.current) return;
        const consent = serverConsent
            ? {
                status: serverConsent.status,
                termsVersion: serverConsent.termsVersion,
                updatedAt: serverConsent.updatedAt,
              }
            : undefined;
        syncLocationConsent(consent);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [hasHydrated, sessionUserId, syncLocationConsent]);

  const regionPreferenceRequired = Boolean(
    hasHydrated &&
      !requesting &&
      !consentSheetOpen &&
      locationConsent &&
      locationConsent.status !== "accepted" &&
      !preferredRegion?.sigunguName,
  );

  const clearLocationQueries = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["departure-plan"] });
    queryClient.removeQueries({ queryKey: ["travel-time"] });
    queryClient.removeQueries({ queryKey: ["recommendations"] });
  }, [queryClient]);

  const finishRequest = useCallback((result: LocationRequestResult) => {
    requestResolverRef.current?.(result);
    requestResolverRef.current = null;
    requestPromiseRef.current = null;
  }, []);

  const resolveDeviceLocation = useCallback(async () => {
    setRequesting(true);
    const result = await requestDeviceLocation();

    if (result.status === "ready") {
      setUserLocation(result.location);
      setLocationPermissionStatus("granted");
    } else {
      clearUserLocation();
      setLocationPermissionStatus(result.status);
      clearLocationQueries();
    }

    setRequesting(false);
    setConsentSheetOpen(false);

    if (result.status !== "ready") {
      pendingLocationResultRef.current = result;
      setRegionSheetDismissible(false);
      setRegionSheetOpen(true);
      return;
    }

    finishRequest(result);
  }, [
    clearLocationQueries,
    clearUserLocation,
    finishRequest,
    setLocationPermissionStatus,
    setUserLocation,
  ]);

  const requestLocation = useCallback(() => {
    if (requestPromiseRef.current) return requestPromiseRef.current;

    const requestPromise = new Promise<LocationRequestResult>((resolve) => {
      requestResolverRef.current = resolve;
    });
    requestPromiseRef.current = requestPromise;
    consentSyncGeneration.current += 1;

    setConsentError(null);
    setRequesting(true);
    // Read the authenticated user's consent, not the previous session's cache.
    void fetchLocationConsent()
        .then((serverConsent) => {
          const consent = serverConsent ? {
            status: serverConsent.status,
            termsVersion: serverConsent.termsVersion,
            updatedAt: serverConsent.updatedAt,
          } : undefined;
          syncLocationConsent(consent);
          const acceptedOnServer =
            serverConsent?.status === "accepted" &&
            canUseLocationWithoutConsentPrompt(consent) &&
            serverConsent.ageConfirmed;
          if (acceptedOnServer) return resolveDeviceLocation();
          if (isPausedLocationConsent(consent) && serverConsent?.ageConfirmed) {
            return updateLocationConsent("accepted", true).then(() => {
              acceptLocationConsent();
              return resolveDeviceLocation();
            });
          }
          setRequesting(false);
          setConsentSheetOpen(true);
        })
        .catch((error) => {
          setRequesting(false);
          setConsentSheetOpen(true);
          setConsentError(
            error instanceof Error
              ? error.message
              : "위치정보 동의를 기록하지 못했어요.",
          );
        });

    return requestPromise;
  }, [acceptLocationConsent, resolveDeviceLocation, syncLocationConsent]);

  const requestRegionPreference = useCallback(() => {
    pendingLocationResultRef.current = null;
    setRegionSheetDismissible(true);
    setRegionSheetOpen(true);
  }, []);

  const declineRequest = useCallback(() => {
    void updateLocationConsent("declined")
      .catch(() => null)
      .then(() => {
        declineLocationConsent();
        clearLocationQueries();
        setConsentSheetOpen(false);
        pendingLocationResultRef.current = { status: "declined" };
        setRegionSheetDismissible(false);
        setRegionSheetOpen(true);
      });
  }, [clearLocationQueries, declineLocationConsent]);

  const completeRegionPreference = useCallback(
    (region: PreferredRegion) => {
      setPreferredRegion(region);
      clearLocationQueries();
      setRegionSheetOpen(false);
      setRegionSheetDismissible(false);

      const result = pendingLocationResultRef.current ?? {
        status: "declined" as const,
      };
      pendingLocationResultRef.current = null;
      finishRequest(result);
    },
    [clearLocationQueries, finishRequest, setPreferredRegion],
  );

  const agreeAndRequest = useCallback(() => {
    setConsentError(null);
    setRequesting(true);
    void updateLocationConsent("accepted", true)
      .then(() => {
        acceptLocationConsent();
        return resolveDeviceLocation();
      })
      .catch((error) => {
        setRequesting(false);
        setConsentError(
          error instanceof Error
            ? error.message
            : "위치정보 동의를 기록하지 못했어요.",
        );
      });
  }, [acceptLocationConsent, resolveDeviceLocation]);

  const withdrawLocation = useCallback(async () => {
    await updateLocationConsent("withdrawn");
    withdrawLocationConsent();
    clearLocationQueries();
    pendingLocationResultRef.current = null;
    setRegionSheetDismissible(true);
    setRegionSheetOpen(true);
  }, [clearLocationQueries, withdrawLocationConsent]);

  const pauseLocation = useCallback(async () => {
    await updateLocationConsent("paused");
    pauseLocationConsent();
    clearLocationQueries();
    pendingLocationResultRef.current = null;
    setRegionSheetDismissible(true);
    setRegionSheetOpen(true);
  }, [clearLocationQueries, pauseLocationConsent]);

  const value = useMemo(
    () => ({
      requestLocation,
      refreshLocationConsent,
      requestRegionPreference,
      requesting,
      pauseLocation,
      withdrawLocation,
    }),
    [
      pauseLocation,
      requestLocation,
      refreshLocationConsent,
      requestRegionPreference,
      requesting,
      withdrawLocation,
    ],
  );

  return (
    <LocationAccessContext.Provider value={value}>
      {children}
      {consentSheetOpen && (
        <LocationConsentSheet
          requesting={requesting}
          error={consentError}
          onAgree={agreeAndRequest}
          onDecline={declineRequest}
        />
      )}
      {(regionSheetOpen || regionPreferenceRequired) && (
        <RegionPreferenceSheet
          initialRegion={preferredRegion}
          onComplete={completeRegionPreference}
          onDismiss={
            regionSheetOpen && !regionPreferenceRequired && regionSheetDismissible
              ? () => {
                  setRegionSheetOpen(false);
                  setRegionSheetDismissible(false);
                }
              : undefined
          }
        />
      )}
    </LocationAccessContext.Provider>
  );
}

export function useLocationAccess() {
  const value = useContext(LocationAccessContext);

  if (!value) {
    throw new Error(
      "useLocationAccess must be used inside LocationAccessProvider.",
    );
  }

  return value;
}
