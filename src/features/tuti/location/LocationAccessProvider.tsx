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
import {
  readLocationPermission,
  requestDeviceLocation,
  type LocationRequestResult,
} from "@/features/tuti/location/locationAccess";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import { useTutiStore } from "@/store/tuti";

type LocationAccessContextValue = {
  requestLocation: () => Promise<LocationRequestResult>;
  withdrawLocation: () => void;
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
  const [consentSheetOpen, setConsentSheetOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const requestPromiseRef = useRef<Promise<LocationRequestResult> | null>(null);
  const requestResolverRef = useRef<
    ((result: LocationRequestResult) => void) | null
  >(null);
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
      void resolveDeviceLocation();
    } else {
      setConsentSheetOpen(true);
    }

    return requestPromise;
  }, [resolveDeviceLocation]);

  const declineRequest = useCallback(() => {
    declineLocationConsent();
    clearLocationQueries();
    setConsentSheetOpen(false);
    finishRequest({ status: "declined" });
  }, [clearLocationQueries, declineLocationConsent, finishRequest]);

  const agreeAndRequest = useCallback(() => {
    acceptLocationConsent();
    void resolveDeviceLocation();
  }, [acceptLocationConsent, resolveDeviceLocation]);

  const withdrawLocation = useCallback(() => {
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
          onAgree={agreeAndRequest}
          onDecline={declineRequest}
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
