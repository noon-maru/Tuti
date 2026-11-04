export const pushPlatforms = ["android", "ios", "web"] as const;

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
  /** 웹 브라우저 구독 철회용 자격 증명. 네이티브 기기에는 적용하지 않는다. */
  webSubscription?: unknown;
};

export type PushDeviceResponse = {
  registered: true;
};
