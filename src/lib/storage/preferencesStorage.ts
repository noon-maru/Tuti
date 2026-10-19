import { Preferences } from "@capacitor/preferences";
import { createOrderedStorage } from "./orderedStorage";

export const preferencesStorage = createOrderedStorage({
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
});
