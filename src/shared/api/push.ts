export const pushPlatforms = ["android", "ios"] as const;

export type PushPlatform = (typeof pushPlatforms)[number];

export type RegisterPushDeviceRequest = {
  installationId: string;
  platform: PushPlatform;
  token: string;
  appVersion?: string;
  locale?: string;
};

export type UnregisterPushDeviceRequest = {
  installationId: string;
};

export type PushDeviceResponse = {
  registered: true;
};
