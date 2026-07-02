import { getCurrentStore } from "@/lib/store/resolve";
import {
  resolveStoreSettings,
  type SettingKey,
  type StoreSettingValues,
} from "./registry";

// Feature settings for the CURRENT request's store (resolved from the host).
// Piggybacks on the cached store lookup in lib/store/resolve — no extra query —
// so a settings change appears once STORE_TAG is revalidated.
export async function getStoreSettings(): Promise<StoreSettingValues> {
  const store = await getCurrentStore();
  return resolveStoreSettings(store.settings, store.plan);
}

// Convenience: one resolved setting for the current store.
export async function getStoreSetting(key: SettingKey): Promise<boolean> {
  return (await getStoreSettings())[key];
}
