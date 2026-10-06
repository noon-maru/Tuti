export type NativeAppPlatform = "android" | "ios";

export type AppUpdatePolicyResponse = {
  currentVersion: string;
  latestVersion: string | null;
  minimumVersion: string | null;
  platform: NativeAppPlatform;
  required: boolean;
  storeUrl: string | null;
  updateAvailable: boolean;
};
