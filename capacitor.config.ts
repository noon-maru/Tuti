import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.noonmaru.tuti",
  appName: "Tuti",
  webDir: "out",
  ios: {
    scheme: "Tuti",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
