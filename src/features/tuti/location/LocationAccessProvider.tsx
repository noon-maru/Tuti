"use client";

import { useQueryClient } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
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
import { LocationFailureSheet } from "@/features/tuti/components/LocationFailureSheet";
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
import { getLocationTermsVersion } from "@/shared/location/terms";
import { useLegalPolicyRelease } from "@/features/legal/useLegalPolicyRelease";
import { getSessionSnapshot, isSessionCurrent, subscribeToSession } from "@/lib/auth/session";
import type { PreferredRegion } from "@/shared/tuti/types";
import { useTutiStore } from "@/store/tuti";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { clearLocationQueryCache } from "./clearLocationQueries";

type LocationAccessContextValue = {
  requestLocation: () => Promise<LocationRequestResult>;
  refreshLocationConsent: () => Promise<void>;
  requestRegionPreference: () => void;
  pauseLocation: () => Promise<void>;
  withdrawLocation: () => Promise<void>;
  requesting: boolean;
  resolvingLocation: boolean;
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
  useLegalPolicyRelease();
  const session = useSession();
  const sessionUserId = session?.userId;
  const locationConsent = useTutiStore((state) => state.locationConsent);
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const setUserLocation = useTutiStore((state) => state.setUserLocation);
  const clearUserLocation = useTutiStore((state) => state.clearUserLocation);
  const syncLocationConsent = useTutiStore(
    (state) => state.syncLocationConsent,
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
  const [locationFailure, setLocationFailure] = useState<
    "denied" | "unavailable" | "timeout" | null
  >(null);
  const requestPromiseRef = useRef<Promise<LocationRequestResult> | null>(null);
  const requestResolverRef = useRef<
    ((result: LocationRequestResult) => void) | null
  >(null);
  const pendingLocationResultRef = useRef<LocationRequestResult | null>(null);
  const deviceRequestGeneration = useRef(0);
  const consentSyncGeneration = useRef(0);
  const declineWriteRef = useRef<number | null>(null);
  const previousConsentStatus = useRef(locationConsent?.status);


  const refreshLocationConsent = useCallback(async () => {
    // 권한 팝업에서 복귀하는 focus 이벤트가 수동 위치 요청의 세대를 바꾸면 안 된다.
    if (requestPromiseRef.current) return;
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
      locationConsent.termsVersion !== getLocationTermsVersion()
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

  const clearLocationQueries = useCallback(() => {
    clearLocationQueryCache(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (!hasHydrated || !sessionUserId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshLocationConsent().catch(() => null);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const nativeListener = Capacitor.isNativePlatform()
      ? App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refreshLocationConsent().catch(() => null);
        })
      : null;
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (nativeListener) void nativeListener.then((listener) => listener.remove());
    };
  }, [hasHydrated, sessionUserId, refreshLocationConsent]);

  useEffect(() => {
    const previous = previousConsentStatus.current;
    previousConsentStatus.current = locationConsent?.status;
    if (hasHydrated && previous === "accepted" && locationConsent?.status !== "accepted") {
      deviceRequestGeneration.current += 1;
      clearLocationQueries();
    }
  }, [hasHydrated, locationConsent?.status, clearLocationQueries]);

  const finishRequest = useCallback((result: LocationRequestResult) => {
    setLocationFailure(null);
    pendingLocationResultRef.current = null;
    requestResolverRef.current?.(result);
    requestResolverRef.current = null;
    requestPromiseRef.current = null;
  }, []);

  useEffect(() => {
    let activeUserId = getSessionSnapshot()?.userId;
    const unsubscribe = subscribeToSession(() => {
      const nextUserId = getSessionSnapshot()?.userId;
      const previousUserId = activeUserId;
      activeUserId = nextUserId;
      // 최초 익명 세션 준비는 계정 전환으로 취급하지 않는다.
      if (!previousUserId || previousUserId === nextUserId) return;
      deviceRequestGeneration.current += 1;
      consentSyncGeneration.current += 1;
      declineWriteRef.current = null;
      clearUserLocation();
      clearLocationQueries();
      finishRequest({ status: "declined" });
      setRequesting(false);
      setConsentSheetOpen(false);
      setRegionSheetOpen(false);
      setRegionSheetDismissible(false);
    });
    return () => {
      unsubscribe();
      deviceRequestGeneration.current += 1;
      consentSyncGeneration.current += 1;
      requestResolverRef.current?.({ status: "declined" });
      requestResolverRef.current = null;
      requestPromiseRef.current = null;
    };
  }, [clearLocationQueries, clearUserLocation, finishRequest]);

  const resolveDeviceLocation = useCallback(async () => {
    const generation = ++deviceRequestGeneration.current;
    setRequesting(true);
    const result = await requestDeviceLocation();
    if (generation !== deviceRequestGeneration.current) return;

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
      setLocationFailure(result.status);
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

  const chooseRegionAfterFailure = useCallback(() => {
    if (requesting) return;
    setLocationFailure(null);
    setRegionSheetDismissible(false);
    setRegionSheetOpen(true);
  }, [requesting]);

  const requestLocation = useCallback(() => {
    if (requestPromiseRef.current) return requestPromiseRef.current;

    const requestPromise = new Promise<LocationRequestResult>((resolve) => {
      requestResolverRef.current = resolve;
    });
    requestPromiseRef.current = requestPromise;
    const generation = ++consentSyncGeneration.current;

    setConsentError(null);
    setRequesting(true);
    // Read the authenticated user's consent, not the previous session's cache.
    void fetchLocationConsent()
        .then((serverConsent) => {
          if (generation !== consentSyncGeneration.current) return;
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
            return updateLocationConsent("accepted", true).then(({ consent: saved }) => {
              if (generation !== consentSyncGeneration.current) return;
              if (saved?.status !== "accepted" || !saved.ageConfirmed || saved.termsVersion !== getLocationTermsVersion()) throw new Error("현재 위치 동의를 다시 확인해주세요.");
              syncLocationConsent(saved);
              return resolveDeviceLocation();
            });
          }
          setRequesting(false);
          setConsentSheetOpen(true);
        })
        .catch((error) => {
          if (generation !== consentSyncGeneration.current) return;
          setRequesting(false);
          setConsentSheetOpen(true);
          setConsentError(
            error instanceof Error
              ? error.message
              : "위치정보 동의를 기록하지 못했어요.",
          );
        });

    return requestPromise;
  }, [resolveDeviceLocation, syncLocationConsent]);

  const requestRegionPreference = useCallback(() => {
    pendingLocationResultRef.current = null;
    setRegionSheetDismissible(true);
    setRegionSheetOpen(true);
  }, []);

  const declineRequest = useCallback(() => {
    if (declineWriteRef.current !== null) return;
    const owner = getSessionSnapshot();
    if (!owner) { setConsentError("계정을 확인한 뒤 다시 시도해주세요."); return; }
    const generation = ++consentSyncGeneration.current;
    declineWriteRef.current = generation;
    deviceRequestGeneration.current += 1;
    clearUserLocation("region");
    clearLocationQueries();
    setRequesting(true);
    setConsentError(null);
    void updateLocationConsent("declined", false, getLocationTermsVersion(), owner.userId)
      .then(({ consent: saved }) => {
        if (generation !== consentSyncGeneration.current || !isSessionCurrent(owner)) return;
        if (saved?.status !== "declined") throw new Error("위치정보 거절 결과를 확인하지 못했어요.");
        syncLocationConsent(saved);
        setConsentSheetOpen(false);
        pendingLocationResultRef.current = { status: "declined" };
        setRegionSheetDismissible(false);
        setRegionSheetOpen(true);
      })
      .catch(error => {
        if (generation !== consentSyncGeneration.current || !isSessionCurrent(owner)) return;
        setConsentError(error instanceof Error ? error.message : "위치정보 선택을 저장하지 못했어요. 다시 시도해주세요.");
      })
      .finally(() => {
        if (declineWriteRef.current === generation) declineWriteRef.current = null;
        if (generation === consentSyncGeneration.current && isSessionCurrent(owner)) setRequesting(false);
      });
  }, [clearLocationQueries, clearUserLocation, syncLocationConsent]);

  const completeRegionPreference = useCallback(
    (region: PreferredRegion) => {
      // 사용자가 지역을 고른 뒤 도착한 이전 GPS·동의 응답이 선택을 덮어쓰지 않는다.
      deviceRequestGeneration.current += 1;
      consentSyncGeneration.current += 1;
      setRequesting(false);
      setConsentSheetOpen(false);
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
    const generation = ++consentSyncGeneration.current;
    setConsentError(null);
    setRequesting(true);
    void updateLocationConsent("accepted", true)
      .then(({ consent: saved }) => {
        if (generation !== consentSyncGeneration.current) return;
        if (saved?.status !== "accepted" || !saved.ageConfirmed || saved.termsVersion !== getLocationTermsVersion()) throw new Error("현재 위치 동의를 다시 확인해주세요.");
        syncLocationConsent(saved);
        return resolveDeviceLocation();
      })
      .catch((error) => {
        if (generation !== consentSyncGeneration.current) return;
        setRequesting(false);
        setConsentError(
          error instanceof Error
            ? error.message
            : "위치정보 동의를 기록하지 못했어요.",
        );
      });
  }, [resolveDeviceLocation, syncLocationConsent]);

  const withdrawLocation = useCallback(async () => {
    const owner = getSessionSnapshot();
    if (!owner) throw new Error("계정을 확인한 뒤 다시 시도해주세요.");
    deviceRequestGeneration.current += 1;
    const generation = ++consentSyncGeneration.current;
    clearUserLocation("region");
    clearLocationQueries();
    finishRequest({ status: "declined" });
    setRequesting(true);
    setConsentSheetOpen(false);
    try {
      const response = await updateLocationConsent("withdrawn", false, getLocationTermsVersion(), owner.userId);
      if (generation !== consentSyncGeneration.current || !isSessionCurrent(owner)) throw new Error("계정이나 위치 설정이 변경되었어요. 다시 확인해주세요.");
      if (response.consent?.status !== "withdrawn") throw new Error("위치 동의 철회 결과를 확인하지 못했어요.");
      syncLocationConsent(response.consent);
      await preferencesStorage.flush();
      if (generation !== consentSyncGeneration.current || !isSessionCurrent(owner)) throw new Error("계정이나 위치 설정이 변경되었어요. 다시 확인해주세요.");
    } finally {
      if (generation === consentSyncGeneration.current && isSessionCurrent(owner)) setRequesting(false);
    }
    setRegionSheetDismissible(true);
    setRegionSheetOpen(true);
  }, [clearLocationQueries, clearUserLocation, finishRequest, syncLocationConsent]);

  const pauseLocation = useCallback(async () => {
    const owner = getSessionSnapshot();
    if (!owner) throw new Error("계정을 확인한 뒤 다시 시도해주세요.");
    deviceRequestGeneration.current += 1;
    const generation = ++consentSyncGeneration.current;
    clearUserLocation("region");
    clearLocationQueries();
    finishRequest({ status: "declined" });
    setRequesting(true);
    setConsentSheetOpen(false);
    try {
      const response = await updateLocationConsent("paused", false, getLocationTermsVersion(), owner.userId);
      if (generation !== consentSyncGeneration.current || !isSessionCurrent(owner)) throw new Error("계정이나 위치 설정이 변경되었어요. 다시 확인해주세요.");
      if (response.consent?.status !== "paused") throw new Error("위치 일시 중지 결과를 확인하지 못했어요.");
      syncLocationConsent(response.consent);
    } finally {
      if (generation === consentSyncGeneration.current && isSessionCurrent(owner)) setRequesting(false);
    }
    setRegionSheetDismissible(true);
    setRegionSheetOpen(true);
  }, [clearLocationQueries, clearUserLocation, finishRequest, syncLocationConsent]);

  const value = useMemo(
    () => ({
      requestLocation,
      refreshLocationConsent,
      requestRegionPreference,
      requesting,
      resolvingLocation: requesting || consentSheetOpen || regionSheetOpen || locationFailure !== null,
      pauseLocation,
      withdrawLocation,
    }),
    [
      pauseLocation,
      requestLocation,
      refreshLocationConsent,
      requestRegionPreference,
      requesting,
      consentSheetOpen,
      regionSheetOpen,
      locationFailure,
      withdrawLocation,
    ],
  );

  return (
    <LocationAccessContext.Provider value={value}>
      {children}
      {consentSheetOpen && (
        <LocationConsentSheet
          key={getLocationTermsVersion()}
          requesting={requesting}
          error={consentError}
          onAgree={agreeAndRequest}
          onDecline={declineRequest}
        />
      )}
      {locationFailure && (
        <LocationFailureSheet
          reason={locationFailure}
          requesting={requesting}
          onRetry={() => void resolveDeviceLocation()}
          onChooseRegion={chooseRegionAfterFailure}
        />
      )}
      {!locationFailure && regionSheetOpen && (
        <RegionPreferenceSheet
          initialRegion={preferredRegion}
          onComplete={completeRegionPreference}
          onDismiss={
            regionSheetDismissible
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
