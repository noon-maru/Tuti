import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "today.tuti.app",
  appName: "Tuti",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
