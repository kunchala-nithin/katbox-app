// src/store/deliveryLocationStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DeliveryLocation {
  id?: string;
  title?: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag?: 'Home' | 'Work' | 'Other';
  updatedAt: string;
}

interface DeliveryLocationStore {
  /** The currently active delivery location (single source of truth). */
  deliveryLocation: DeliveryLocation | null;
  /** True once we've finished reading from AsyncStorage on app start. */
  hydrated: boolean;
  /** Set / replace the active delivery location. Persists to AsyncStorage. */
  setDeliveryLocation: (location: DeliveryLocation | null) => Promise<void>;
  /** Clear the active delivery location (also clears AsyncStorage). */
  clearDeliveryLocation: () => Promise<void>;
  /** Read persisted location from AsyncStorage (call once on app mount). */
  hydrateDeliveryLocation: () => Promise<void>;
}

const STORAGE_KEY = '@katbox_delivery_location_v1';

export const useDeliveryLocationStore = create<DeliveryLocationStore>((set) => ({
  deliveryLocation: null,
  hydrated: false,

  setDeliveryLocation: async (location) => {
    set({ deliveryLocation: location });
    try {
      if (location) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.log('deliveryLocationStore: persist error', e);
    }
  },

  clearDeliveryLocation: async () => {
    set({ deliveryLocation: null });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.log('deliveryLocationStore: clear error', e);
    }
  },

  hydrateDeliveryLocation: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeliveryLocation;
        set({ deliveryLocation: parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch (e) {
      console.log('deliveryLocationStore: hydrate error', e);
      set({ hydrated: true });
    }
  },
}));