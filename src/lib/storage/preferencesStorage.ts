import { Preferences } from "@capacitor/preferences";
import type { StateStorage } from "zustand/middleware";

export const preferencesStorage: StateStorage = {
  async getItem(key) {
    const { value } = await Preferences.get({ key });
    return value;
  },

  async setItem(key, value) {
    await Preferences.set({ key, value });
  },

  async removeItem(key) {
    await Preferences.remove({ key });
  },
};
