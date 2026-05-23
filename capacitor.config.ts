import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.tuti.prototype",
  appName: "Tuti",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
