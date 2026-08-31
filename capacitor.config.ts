/// <reference types="@capacitor/local-notifications" />
/// <reference types="@capacitor/push-notifications" />
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
    PushNotifications: {
      presentationOptions: ["sound", "banner", "list"],
    },
  },
};

export default config;
