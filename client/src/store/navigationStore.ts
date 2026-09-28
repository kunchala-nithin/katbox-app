// src/store/navigationStore.ts
import { create } from 'zustand';

type ServiceType = 'homemade';

interface NavigationContext {
  serviceType: ServiceType;
  previousScreen: string;
  restaurantOrChef?: any;   // Can be restaurant or chef object
  menu?: any;
  selections?: any;
  orderDetails?: any;
  type?: 'veg' | 'nonveg';
}

interface NavigationStore {
  currentContext: NavigationContext | null;
  setNavigationContext: (context: NavigationContext | null) => void;
  clearNavigationContext: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentContext: null,

  setNavigationContext: (context) => set({ currentContext: context }),

  clearNavigationContext: () => set({ currentContext: null }),
}));