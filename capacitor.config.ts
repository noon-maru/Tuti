/// <reference types="@capacitor/local-notifications" />
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
  plugins: {
    LocalNotifications: {
      smallIcon: "tuti_notification_icon",
      iconColor: "#8CBDEF",
      presentationOptions: ["sound", "banner", "list"],
    },
  },
};

export default config;
