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
import {
  readLocationPermission,
  requestDeviceLocation,
  type LocationRequestResult,
} from "@/features/tuti/location/locationAccess";
import {
  fetchLocationConsent,
  updateLocationConsent,
} from "@/lib/tutiApi";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type { PreferredRegion } from "@/shared/tuti/types";
import { useTutiStore } from "@/store/tuti";

type LocationAccessContextValue = {
  requestLocation: () => Promise<LocationRequestResult>;
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
  const userLocation = useTutiStore((state) => state.userLocation);
  const locationConsent = useTutiStore((state) => state.locationConsent);
  const setUserLocation = useTutiStore((state) => state.setUserLocation);
  const clearUserLocation = useTutiStore((state) => state.clearUserLocation);
  const acceptLocationConsent = useTutiStore(
    (state) => state.acceptLocationConsent,
  );
  const declineLocationConsent = useTutiStore(
    (state) => state.declineLocationConsent,
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
  const [requesting, setRequesting] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const requestPromiseRef = useRef<Promise<LocationRequestResult> | null>(null);
  const requestResolverRef = useRef<
    ((result: LocationRequestResult) => void) | null
  >(null);
  const pendingLocationResultRef = useRef<LocationRequestResult | null>(null);
  const locationRef = useRef(userLocation);
  const consentRef = useRef(locationConsent);

  useEffect(() => {
    locationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    consentRef.current = locationConsent;
  }, [locationConsent]);

  useEffect(() => {
    if (
      locationConsent?.status !== "accepted" ||
      locationConsent.termsVersion !== LOCATION_TERMS_VERSION
    ) {
      return;
    }

    void readLocationPermission().then(setLocationPermissionStatus);
  }, [locationConsent, setLocationPermissionStatus]);

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

    if (result.status === "denied") {
      pendingLocationResultRef.current = result;
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
    const currentLocation = locationRef.current;

    if (currentLocation) {
      return Promise.resolve({
        status: "ready" as const,
        location: currentLocation,
      });
    }

    if (requestPromiseRef.current) return requestPromiseRef.current;

    const requestPromise = new Promise<LocationRequestResult>((resolve) => {
      requestResolverRef.current = resolve;
    });
    requestPromiseRef.current = requestPromise;

    const consent = consentRef.current;
    const acceptedCurrentTerms =
      consent?.status === "accepted" &&
      consent.termsVersion === LOCATION_TERMS_VERSION;

    if (acceptedCurrentTerms) {
      setConsentError(null);
      setRequesting(true);
      void fetchLocationConsent()
        .then((serverConsent) => {
          const acceptedOnServer =
            serverConsent?.status === "accepted" &&
            serverConsent.termsVersion === LOCATION_TERMS_VERSION &&
            serverConsent.ageConfirmed;
          if (!acceptedOnServer) {
            setRequesting(false);
            setConsentSheetOpen(true);
            return;
          }
          return resolveDeviceLocation();
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
    } else {
      setConsentError(null);
      setConsentSheetOpen(true);
    }

    return requestPromise;
  }, [resolveDeviceLocation]);

  const declineRequest = useCallback(() => {
    void updateLocationConsent("declined")
      .catch(() => null)
      .then(() => {
        declineLocationConsent();
        clearLocationQueries();
        setConsentSheetOpen(false);
        pendingLocationResultRef.current = { status: "declined" };
        setRegionSheetOpen(true);
      });
  }, [clearLocationQueries, declineLocationConsent]);

  const completeRegionPreference = useCallback(
    (region?: PreferredRegion) => {
      setPreferredRegion(region);
      clearLocationQueries();
      setRegionSheetOpen(false);

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
  }, [clearLocationQueries, withdrawLocationConsent]);

  const value = useMemo(
    () => ({ requestLocation, requesting, withdrawLocation }),
    [requestLocation, requesting, withdrawLocation],
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
      {regionSheetOpen && (
        <RegionPreferenceSheet
          initialRegion={preferredRegion}
          onComplete={completeRegionPreference}
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
