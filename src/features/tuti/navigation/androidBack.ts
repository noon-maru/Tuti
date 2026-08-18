export const ANDROID_BACK_EVENT = "tuti:android-back";

export function dispatchAndroidBackEvent() {
  return window.dispatchEvent(
    new Event(ANDROID_BACK_EVENT, { cancelable: true }),
  );
}
