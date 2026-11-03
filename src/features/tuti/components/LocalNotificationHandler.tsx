"use client";
import { useEffect } from "react";
import { disableDailyTutiReminder, supportsLocalNotifications } from "../notifications/localNotifications";

// Remove the previous recurring outing reminder on upgrade. New writing reminders
// are server scheduled, so writing on another device also suppresses today's nudge.
export function LocalNotificationHandler() {
  useEffect(() => {
    if (supportsLocalNotifications()) void disableDailyTutiReminder().catch(() => {});
  }, []);
  return null;
}
