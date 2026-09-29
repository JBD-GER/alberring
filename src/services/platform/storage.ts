import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeStorage {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}
const vault = registerPlugin<NativeStorage>("AlberringSecureStorage");

/** Native failures deliberately never fall back to plaintext WebView storage. */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    return Capacitor.isNativePlatform()
      ? (await vault.get({ key })).value
      : localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) await vault.set({ key, value });
    else localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) await vault.remove({ key });
    else localStorage.removeItem(key);
  },
};
