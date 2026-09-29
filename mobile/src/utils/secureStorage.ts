/**
 * secureStorage.ts
 *
 * Web-safe wrapper around expo-secure-store.
 * On native (iOS/Android), uses SecureStore (encrypted Keychain / Keystore).
 * On web (npm run web / Expo web), falls back to localStorage since
 * expo-secure-store has no web implementation (its web build exports {}).
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const IS_WEB = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (IS_WEB) {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (IS_WEB) {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (IS_WEB) {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
