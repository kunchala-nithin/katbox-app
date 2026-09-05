import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const BASE_SAVED_ADDRESSES_PREFIX = '@user_saved_delivery_addresses_';
const ADDRESS_V2_MIGRATED_PREFIX = '@address_system_v2_migrated_';

const LOCAL_IP = "192.168.29.215";

const getFallbackBaseUrl = (): string => {
  if (Constants.executionEnvironment === "storeClient") {
    return `http://${LOCAL_IP}:4000`;
  }
  if (Platform.OS === "android") {
    return `http://${LOCAL_IP}:4000`;
  }
  return "http://localhost:4000";
};

export interface SavedAddress {
  id: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: 'Home' | 'Work' | 'Other';
  createdAt?: string | Date;
}

export interface ActiveAddress {
  id?: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: 'Home' | 'Work' | 'Other';
  updatedAt?: string | Date;
}

export type StoredUser = {
  id?: string;
  _id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  activeAddress?: ActiveAddress | null;
  savedAddresses?: SavedAddress[];
  isChef?: boolean;
};

export const saveSession = async (
  token: string,
  user: StoredUser
) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getToken = async () => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const getUser = async (): Promise<StoredUser | null> => {
  const user = await SecureStore.getItemAsync(USER_KEY);
  return user ? JSON.parse(user) : null;
};

export const removeToken = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
};

/**
 * Get user-scoped storage key for saved addresses
 */
export const getUserSavedAddressesKey = (userId?: string): string => {
  const cleanId = userId && userId.trim().length > 0 ? userId.trim() : 'guest';
  return `${BASE_SAVED_ADDRESSES_PREFIX}${cleanId}`;
};

/**
 * Migration key – one-time clear of old auto-saved GPS entries
 */
export const getAddressV2MigratedKey = (userId?: string): string => {
  const cleanId = userId && userId.trim().length > 0 ? userId.trim() : 'guest';
  return `${ADDRESS_V2_MIGRATED_PREFIX}${cleanId}`;
};

/**
 * Load saved addresses specifically for the logged-in user
 */
export const getSavedAddressesForUser = async (userId?: string): Promise<SavedAddress[]> => {
  try {
    const key = getUserSavedAddressesKey(userId);
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    const cachedUser = await getUser();
    if (cachedUser && cachedUser.savedAddresses && Array.isArray(cachedUser.savedAddresses)) {
      return cachedUser.savedAddresses;
    }

    return [];
  } catch (error) {
    console.log("Error loading user-scoped saved addresses:", error);
    return [];
  }
};

/**
 * Persist saved addresses + optionally active address to AsyncStorage and MongoDB
 */
export const setSavedAddressesForUser = async (
  userId: string | undefined,
  addresses: SavedAddress[],
  activeAddressObj?: ActiveAddress | null,
  activeAddressString?: string
): Promise<void> => {
  try {
    const key = getUserSavedAddressesKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(addresses));

    await updateUserAddress({
      savedAddresses: addresses,
      activeAddress: activeAddressObj,
      address: activeAddressString,
    });
  } catch (error) {
    console.log("Error saving user-scoped saved addresses:", error);
  }
};

/**
 * Sync active address and/or saved addresses array to MongoDB
 * Accepts either legacy string or structured activeAddress object
 */
export const updateUserAddress = async (payload: {
  address?: string;
  activeAddress?: ActiveAddress | null;
  savedAddresses?: SavedAddress[];
}): Promise<StoredUser | null> => {
  const token = await getToken();
  if (!token) {
    console.log("⚠️ No auth token found. Cannot sync address to MongoDB.");
    return null;
  }

  const baseUrl = getFallbackBaseUrl();
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const candidateUrls = [
    `${cleanBase}/api/auth/update-profile`,
    `${cleanBase}/auth/update-profile`,
  ];

  const body: any = {};
  if (payload.activeAddress !== undefined) {
    body.activeAddress = payload.activeAddress;
  }
  if (payload.address !== undefined) {
    body.address = payload.address;
  }
  if (Array.isArray(payload.savedAddresses)) {
    body.savedAddresses = payload.savedAddresses;
  }

  console.log(
    `📤 Sending address update to MongoDB:`,
    {
      hasActive: !!payload.activeAddress,
      address: payload.address,
      savedCount: payload.savedAddresses?.length ?? 'unchanged',
    }
  );

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("✅ MongoDB Address Update Success:", data?.message || "ok");
        if (data.user) {
          await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
          if (data.user.savedAddresses && Array.isArray(data.user.savedAddresses)) {
            const uid = data.user.id || data.user._id;
            const key = getUserSavedAddressesKey(uid);
            await AsyncStorage.setItem(key, JSON.stringify(data.user.savedAddresses));
          }
          return data.user;
        }
        return null;
      } else {
        console.log(`⚠️ Route failed (${res.status}) at ${url}`);
      }
    } catch (error) {
      console.log(`⚠️ Network error attempting ${url}:`, error);
    }
  }

  console.log("❌ Failed to update address across all candidate routes.");
  return null;
};

/**
 * One-time migration: clear old auto-added GPS entries from savedAddresses.
 * Keeps activeAddress intact. Runs only once per user.
 */
export const migrateAddressSystemV2IfNeeded = async (
  userId: string | undefined,
  currentActive?: ActiveAddress | null
): Promise<SavedAddress[]> => {
  try {
    if (!userId) return [];

    const migratedKey = getAddressV2MigratedKey(userId);
    const alreadyMigrated = await AsyncStorage.getItem(migratedKey);
    if (alreadyMigrated === '1') {
      return await getSavedAddressesForUser(userId);
    }

    console.log('🧹 Running one-time address v2 migration – clearing old auto-saved GPS entries');

    await updateUserAddress({
      savedAddresses: [],
      activeAddress: currentActive || undefined,
      address: currentActive
        ? (currentActive.houseDetails
            ? `${currentActive.houseDetails}, ${currentActive.fullAddress}`
            : currentActive.fullAddress)
        : undefined,
    });

    const key = getUserSavedAddressesKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify([]));
    await AsyncStorage.setItem(migratedKey, '1');

    return [];
  } catch (error) {
    console.log('Error during address v2 migration:', error);
    return await getSavedAddressesForUser(userId);
  }
};

/**
 * Fetch latest user from server
 */
export const refreshUser = async () => {
  const token = await getToken();

  if (!token) return null;

  try {
    console.log("🔄 Refreshing user with token");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const baseUrl = getFallbackBaseUrl();
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const candidateUrls = [
      `${cleanBase}/api/auth/me`,
      `${cleanBase}/auth/me`,
    ];

    let data: any = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) {
        // Try next
      }
    }

    clearTimeout(timeoutId);

    if (data && data.user) {
      await saveSession(token, data.user);
      const uid = data.user.id || data.user._id;
      if (data.user.savedAddresses && Array.isArray(data.user.savedAddresses)) {
        const key = getUserSavedAddressesKey(uid);
        await AsyncStorage.setItem(key, JSON.stringify(data.user.savedAddresses));
      }
      return data.user;
    }

    return null;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.log("⏱️ refreshUser timeout");
    } else {
      console.log("❌ refreshUser error:", err);
    }
    return null;
  }
};