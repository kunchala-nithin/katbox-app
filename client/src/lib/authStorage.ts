import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import api from "./api";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
// ✅ NEW: SecureStore key for the Expo push token (cached locally so
//         the app can still re-register the token when it wakes up).
const PUSH_TOKEN_KEY = "auth_push_token";

const BASE_SAVED_ADDRESSES_PREFIX =
  "@user_saved_delivery_addresses_";

const ADDRESS_V2_MIGRATED_PREFIX =
  "@address_system_v2_migrated_";

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
  tag: "Home" | "Work" | "Other";
  createdAt?: string | Date;
}

export interface ActiveAddress {
  id?: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: "Home" | "Work" | "Other";
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
  isAdmin?: boolean;
  // ✅ NEW: Expo push token (persisted for killed/minimized app notifications).
  pushToken?: string;
  // ✅ NEW: Convenience role hint (derived from isAdmin/isChef). Never
  //         authoritative on the backend, just used for routing.
  role?: "customer" | "chef" | "admin";
};

/**
 * ============================================================
 * NORMALIZE PHONE
 * ============================================================
 *
 * We always convert the phone into the same format before using
 * it as a storage key.
 *
 * Examples:
 *
 * 9133450555
 * +919133450555
 * 919133450555
 *
 * all become:
 *
 * +919133450555
 */
export const normalizePhoneForStorage = (
  phone?: string
): string => {
  if (!phone) {
    return "";
  }

  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (
    digits.length === 12 &&
    digits.startsWith("91")
  ) {
    return `+${digits}`;
  }

  return phone.startsWith("+")
    ? phone
    : `+${digits}`;
};

/**
 * ============================================================
 * SAVE KATBOX SESSION
 * ============================================================
 */
export const saveSession = async (
  token: string,
  user: StoredUser
): Promise<void> => {
  await SecureStore.setItemAsync(
    TOKEN_KEY,
    token
  );

  await SecureStore.setItemAsync(
    USER_KEY,
    JSON.stringify(user)
  );
};

/**
 * ============================================================
 * GET KATBOX TOKEN
 * ============================================================
 */
export const getToken = async (): Promise<
  string | null
> => {
  try {
    return await SecureStore.getItemAsync(
      TOKEN_KEY
    );
  } catch (error) {
    console.log(
      "Error reading auth token:",
      error
    );

    return null;
  }
};

/**
 * ============================================================
 * GET STORED USER
 * ============================================================
 */
export const getUser =
  async (): Promise<StoredUser | null> => {
    try {
      const user =
        await SecureStore.getItemAsync(
          USER_KEY
        );

      if (!user) {
        return null;
      }

      try {
        return JSON.parse(user);
      } catch (parseError) {
        console.log(
          "Invalid stored user JSON. Clearing corrupted user data.",
          parseError
        );

        await SecureStore.deleteItemAsync(
          USER_KEY
        );

        return null;
      }
    } catch (error) {
      console.log(
        "Error reading stored user:",
        error
      );

      return null;
    }
  };

/**
 * ============================================================
 * REMOVE AUTH SESSION
 * ============================================================
 *
 * We delete ONLY:
 *
 * auth_token
 * auth_user
 * auth_push_token    (✅ NEW)
 *
 * We do NOT touch any other keys.
 */
export const removeToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(
      TOKEN_KEY
    );
  } catch (error) {
    console.log(
      "Error removing auth token:",
      error
    );
  }

  try {
    await SecureStore.deleteItemAsync(
      USER_KEY
    );
  } catch (error) {
    console.log(
      "Error removing stored user:",
      error
    );
  }

  // ✅ NEW: Also clear the cached push token on logout so a subsequent
  //         user on the same device doesn't inherit the previous token.
  try {
    await SecureStore.deleteItemAsync(
      PUSH_TOKEN_KEY
    );
  } catch (error) {
    console.log(
      "Error removing stored push token:",
      error
    );
  }
};

/**
 * ============================================================
 * USER-SCOPED SAVED ADDRESS KEY
 * ============================================================
 */
export const getUserSavedAddressesKey = (
  userId?: string
): string => {
  const cleanId =
    userId &&
    userId.trim().length > 0
      ? userId.trim()
      : "guest";

  return `${BASE_SAVED_ADDRESSES_PREFIX}${cleanId}`;
};

/**
 * ============================================================
 * ADDRESS V2 MIGRATION KEY
 * ============================================================
 */
export const getAddressV2MigratedKey = (
  userId?: string
): string => {
  const cleanId =
    userId &&
    userId.trim().length > 0
      ? userId.trim()
      : "guest";

  return `${ADDRESS_V2_MIGRATED_PREFIX}${cleanId}`;
};

/**
 * ============================================================
 * LOAD SAVED ADDRESSES FOR CURRENT USER
 * ============================================================
 */
export const getSavedAddressesForUser =
  async (
    userId?: string
  ): Promise<SavedAddress[]> => {
    try {
      const key =
        getUserSavedAddressesKey(userId);

      const stored =
        await AsyncStorage.getItem(key);

      if (stored) {
        try {
          const parsed =
            JSON.parse(stored);

          if (
            Array.isArray(parsed) &&
            parsed.length > 0
          ) {
            return parsed;
          }
        } catch (parseError) {
          console.log(
            "Invalid saved address JSON:",
            parseError
          );
        }
      }

      const cachedUser =
        await getUser();

      if (
        cachedUser &&
        cachedUser.savedAddresses &&
        Array.isArray(
          cachedUser.savedAddresses
        )
      ) {
        return cachedUser.savedAddresses;
      }

      return [];
    } catch (error) {
      console.log(
        "Error loading user-scoped saved addresses:",
        error
      );

      return [];
    }
  };

/**
 * ============================================================
 * SAVE USER-SCOPED ADDRESSES
 * ============================================================
 *
 * This is the mobile entry-point that gets called from Home.tsx
 * whenever the user adds, edits, deletes, or selects an address.
 *
 * It performs TWO writes in one call:
 *
 *   1. AsyncStorage (instant offline cache, per user)
 *   2. MongoDB via `updateUserAddress` below
 *
 * The MongoDB write is what makes saved addresses appear on
 * other review screens (Catering / MealBox / HomeMade) after
 * a fresh `refreshUser()`.
 */
export const setSavedAddressesForUser =
  async (
    userId: string | undefined,
    addresses: SavedAddress[],
    activeAddressObj?: ActiveAddress | null,
    activeAddressString?: string
  ): Promise<void> => {
    try {
      const key =
        getUserSavedAddressesKey(userId);

      await AsyncStorage.setItem(
        key,
        JSON.stringify(addresses)
      );

      await updateUserAddress({
        savedAddresses: addresses,
        activeAddress:
          activeAddressObj,
        address:
          activeAddressString,
      });
    } catch (error) {
      console.log(
        "Error saving user-scoped saved addresses:",
        error
      );
    }
  };

/**
 * ============================================================
 * UPDATE USER ADDRESS
 * ============================================================
 *
 * FIX (this file):
 *
 * Previously this function called PATCH /auth/update-address,
 * which on the backend ONLY handles `activeAddress` and
 * `address`. It silently DROPPED any `savedAddresses` array
 * that we sent it.
 *
 * As a result:
 *
 *   - the local AsyncStorage cache had the new address
 *   - MongoDB did NOT, so:
 *       • other devices couldn't see it
 *       • a fresh login on the same device re-hydrated a stale
 *         list from the server
 *       • review screens (Catering / MealBox / HomeMade) that
 *         call refreshUser() never saw the newly added address
 *
 * We now route through PATCH /auth/update-profile, which the
 * backend already implements with full support for:
 *
 *   - savedAddresses[]   (dedupes by houseDetails + fullAddress)
 *   - activeAddress      (writes activeAddress + address)
 *   - address            (legacy string fallback)
 *   - name / pushToken   (optional, untouched when omitted)
 *
 * When we only send `activeAddress`, the backend leaves the
 * existing `savedAddresses` array on the user document intact.
 * When we send `savedAddresses`, it replaces the array with the
 * deduped version we provide. Both flows work correctly.
 *
 * The response shape is identical to the old endpoint:
 *   { success: true, message: string, user: <fullUserPayload> }
 * so no downstream code needs to change.
 */
export const updateUserAddress =
  async (payload: {
    address?: string;
    activeAddress?: ActiveAddress | null;
    savedAddresses?: SavedAddress[];
  }): Promise<StoredUser | null> => {
    const token = await getToken();

    if (!token) {
      console.log(
        "No auth token found. Cannot sync address to MongoDB."
      );

      return null;
    }

    try {
      const response =
        await api.patch(
          "/auth/update-profile",
          payload,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
          }
        );

      const updatedUser =
        response.data?.user ||
        response.data?.data?.user ||
        null;

      if (updatedUser) {
        await SecureStore.setItemAsync(
          USER_KEY,
          JSON.stringify(updatedUser)
        );
      }

      return updatedUser;
    } catch (error: any) {
      console.log(
        "Error syncing user address:",
        error?.response?.data ||
          error?.message ||
          error
      );

      return null;
    }
  };

/**
 * ============================================================
 * REFRESH USER FROM BACKEND
 * ============================================================
 *
 * Called from every review screen (Catering / MealBox / HomeMade)
 * inside their `useFocusEffect` to pull the freshest
 * `savedAddresses` + `activeAddress` from MongoDB. Once the
 * endpoint fix above is in place, this will return the list that
 * was just written by Home.tsx.
 */
export const refreshUser =
  async (): Promise<StoredUser | null> => {
    const token = await getToken();

    if (!token) {
      return null;
    }

    try {
      const response =
        await api.get(
          "/auth/me",
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      const updatedUser =
        response.data?.user ||
        response.data?.data?.user ||
        null;

      if (!updatedUser) {
        return null;
      }

      await SecureStore.setItemAsync(
        USER_KEY,
        JSON.stringify(updatedUser)
      );

      return updatedUser;
    } catch (error: any) {
      console.log(
        "Error refreshing user:",
        error?.response?.data ||
          error?.message ||
          error
      );

      return null;
    }
  };

/**
 * ============================================================
 * ✅ NEW: SAVE PUSH TOKEN
 * ============================================================
 *
 * Called once at app startup (from app/layout.tsx) after
 * `Notifications.getExpoPushTokenAsync()` returns a token.
 *
 * Writes to BOTH:
 *   • SecureStore (instant offline cache)
 *   • MongoDB via POST /auth/push-token (authoritative store)
 *
 * The MongoDB write is what lets the backend fire notifications
 * to the device even when the app is killed or minimized.
 *
 * Safe to call repeatedly — the backend upserts on (userId, token).
 */
export const savePushToken = async (
  pushToken: string
): Promise<void> => {
  if (!pushToken || typeof pushToken !== "string") {
    return;
  }

  // Local cache first so getCachedPushToken works even offline.
  try {
    await SecureStore.setItemAsync(
      PUSH_TOKEN_KEY,
      pushToken
    );
  } catch (err) {
    console.log("Error caching push token locally:", err);
  }

  const token = await getToken();
  if (!token) {
    // Not logged in yet — token will be flushed on next login.
    return;
  }

  try {
    await api.post(
      "/auth/push-token",
      { pushToken },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.log(
      "Error syncing push token to backend:",
      error?.response?.data ||
        error?.message ||
        error
    );
  }
};

/**
 * ============================================================
 * ✅ NEW: GET CACHED PUSH TOKEN
 * ============================================================
 *
 * Offline read of the push token from SecureStore. Used by
 * screens that need to embed the token directly in an order
 * payload (e.g. checkout.tsx) so the backend has it available
 * immediately, without waiting for a network round-trip.
 */
export const getCachedPushToken =
  async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(
        PUSH_TOKEN_KEY
      );
    } catch (error) {
      console.log(
        "Error reading cached push token:",
        error
      );

      return null;
    }
  };

/**
 * ============================================================
 * ✅ NEW: CLEAR PUSH TOKEN (LOCAL ONLY)
 * ============================================================
 *
 * Removes the cached token without touching the backend. Useful
 * for tests or forced re-registration on next app launch.
 */
export const clearPushToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(
      PUSH_TOKEN_KEY
    );
  } catch (error) {
    console.log(
      "Error clearing cached push token:",
      error
    );
  }
};