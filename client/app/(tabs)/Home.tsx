// Home.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BlurView } from 'expo-blur';
import { refreshUser } from '@/src/lib/authStorage';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  StatusBar,
  Dimensions,
  Platform,
  ActivityIndicator,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
  Pressable,
} from 'react-native';
import {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
  Feather,
  FontAwesome5,
} from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { AppOwnership } from 'expo-constants';
import { useRouter, useLocalSearchParams } from 'expo-router';
import api from '@/src/lib/api';
import {
  getUser,
  updateUserAddress,
  getSavedAddressesForUser,
  setSavedAddressesForUser,
  SavedAddress,
  ActiveAddress,
} from '@/src/lib/authStorage';
import AddressMapModal, {
  AddressMapConfirmPayload,
} from '@/src/components/AddressMapModal';
// ✅ NEW: single-source-of-truth for delivery location (survives back navigation)
import { useDeliveryLocationStore } from '@/src/store/deliveryLocationStore';

const { width, height } = Dimensions.get('window');
const HOME_CARD_WIDTH = 220;

// ─── Banner Images Imported From Assets Folder ───
const BANNER_IMG_1 = require('@/assets/images/banner1.png');
const BANNER_IMG_2 = require('@/assets/images/banner2.png');
const BANNER_IMG_3 = require('@/assets/images/banner3.png');
const BANNER_IMG_4 = require('@/assets/images/banner4.png');
const BANNER_IMG_5 = require('@/assets/images/banner5.png');

// ─── Interfaces ───
interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  type: 'mci' | 'ionicons' | 'feather' | 'fa5';
  badge?: string;
}

interface BannerSlide {
  id: string;
  titlePrimary: string;
  titleSecondary: string;
  tagline: string;
  badge: string;
  price?: string;
  unit?: string;
  image: any;
  isComingSoon?: boolean;
  isFullBanner?: boolean;
}

// ─── Static Data ───
const BANNER_SLIDES: BannerSlide[] = [
  // ─── 1st Banner : FULL IMAGE BANNER (Vinayaka Chaviti Special) ───
  {
    id: '1',
    titlePrimary: '',
    titleSecondary: '',
    tagline: '',
    badge: '',
    image: BANNER_IMG_1,
    isComingSoon: false,
    isFullBanner: true,
  },
  // ─── 2nd Banner : CATERING SERVICE ───
  {
    id: '2',
    titlePrimary: 'Festive Feasts,',
    titleSecondary: 'Served with Love',
    tagline: 'Let Bappa bless your celebrations with authentic catering spreads made fresh.',
    badge: 'CATERING SERVICE',
    price: '129',
    unit: '/platter',
    image: BANNER_IMG_2,
    isComingSoon: false,
  },
  // ─── 3rd Banner : CATERING MEAL PLANS ───
  {
    id: '3',
    titlePrimary: 'Traditional',
    titleSecondary: 'Katbox Platters',
    tagline: 'Wholesome Event Platters  with authentic flavours, served on banana leaf.',
    badge: 'CATERING MEAL PLANS',
    price: '129',
    unit: '/platter',
    image: BANNER_IMG_3,
    isComingSoon: false,
  },
  // ─── 4th Banner : MEAL BOX PLANS ───
  {
    id: '4',
    titlePrimary: 'Wholesome',
    titleSecondary: 'Daily Meal Boxes',
    tagline: 'Homestyle meals with dal, rotis and curries, delivered fresh to your door.',
    badge: 'MEAL BOX PLANS',
    price: '99',
    unit: '/Meal',
    image: BANNER_IMG_4,
    isComingSoon: false,
  },
  // ─── 5th Banner : HOMEMADE FOODS ───
  {
    id: '5',
    titlePrimary: 'Taste Tradition',
    titleSecondary: 'In Every Bite',
    tagline: 'Authentic pickles, karam podis and sweets, crafted the homemade way.',
    badge: 'HOMEMADE FOODS',
    price: '99',
    unit: 'onwardsx',
    image: BANNER_IMG_5,
    isComingSoon: false,
  },
  // ─── 6th Banner : COMING SOON (Static URL) ───
  {
    id: '6',
    titlePrimary: 'Personal Master Chef',
    titleSecondary: 'At Your Kitchen',
    tagline: 'Luxury on-demand home chefs cooking custom feasts live at your venue.',
    badge: 'COMING SOON',
    image: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=1200&auto=format&fit=crop&q=80',
    isComingSoon: true,
  },
];

// ✅ UPDATED: Quick Bites (with "45 MIN" badge) inserted at position 5, View All moved to position 6
const CATEGORIES: CategoryItem[] = [
  { id: '1', name: 'Meal Boxes', icon: 'food-takeout-box-outline', type: 'mci', badge: 'HOT' },
  { id: '2', name: 'Catering', icon: 'silverware-fork-knife', type: 'mci' },
  { id: '3', name: 'Hire Chef', icon: 'user-tie', type: 'fa5', badge: 'SOON' },
  { id: '4', name: 'Food & Cravings', icon: 'silverware-variant', type: 'mci' },
  { id: '5', name: 'Quick Bites', icon: 'lightning-bolt', type: 'mci', badge: '45 MIN' },
  { id: '6', name: 'View All', icon: 'grid', type: 'feather' },
];

const FILTER_TAGS = [
  { name: 'All', icon: null },
  { name: 'Veg', icon: 'leaf' },
  { name: 'Non Veg', icon: 'drumstick' },
  { name: 'Biryani', icon: 'pot-steam' },
  { name: 'North Indian', icon: 'food-croissant' },
];

const DEFAULT_COVER_IMAGES = [
  'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800',
  'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
  'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800',
];

// Reusable Auto-Scrolling Banner Carousel Component for Home Chef Cards
const HomeChefBannerCarousel = ({
  banners,
  fallbackImage,
  isOffline,
}: {
  banners: any[];
  fallbackImage: string;
  isOffline: boolean;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isInteracting = useRef(false);

  const bannerList =
    banners && banners.length > 0
      ? banners
      : [{ url: fallbackImage }];

  const totalBanners = bannerList.length;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (totalBanners <= 1) return;

    const interval = setInterval(() => {
      if (isInteracting.current) return;

      const nextIndex = (activeIndexRef.current + 1) % totalBanners;
      scrollRef.current?.scrollTo({
        x: nextIndex * HOME_CARD_WIDTH,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, 3200);

    return () => clearInterval(interval);
  }, [totalBanners]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const computedIndex = Math.round(contentOffsetX / HOME_CARD_WIDTH);
    if (computedIndex >= 0 && computedIndex < totalBanners && computedIndex !== activeIndex) {
      setActiveIndex(computedIndex);
    }
  };

  return (
    <View style={styles.homeCardCoverContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onTouchStart={() => {
          isInteracting.current = true;
        }}
        onTouchEnd={() => {
          setTimeout(() => {
            isInteracting.current = false;
          }, 2000);
        }}
        onScrollBeginDrag={() => {
          isInteracting.current = true;
        }}
        onScrollEndDrag={() => {
          setTimeout(() => {
            isInteracting.current = false;
          }, 2000);
        }}
        onMomentumScrollEnd={(e) => {
          handleScroll(e);
          setTimeout(() => {
            isInteracting.current = false;
          }, 1500);
        }}
        style={styles.homeCardBannerScrollView}
      >
        {bannerList.map((bannerObj: any, bIdx: number) => (
          <Image
            key={bIdx}
            source={{ uri: bannerObj.url || fallbackImage }}
            style={[
              styles.homeCardCoverImage,
              isOffline && styles.imageGrayscale,
            ]}
          />
        ))}
      </ScrollView>

      {totalBanners > 1 && (
        <View style={styles.homeCardPaginationContainer} pointerEvents="none">
          {bannerList.map((_, dotIdx) => {
            const isActive = dotIdx === activeIndex;
            return (
              <View
                key={dotIdx}
                style={[
                  styles.homeCardPaginationDot,
                  isActive && styles.homeCardPaginationDotActive,
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  // ✅ NEW: Delivery location store (single source of truth for lat/lng)
  const setDeliveryLocationInStore = useDeliveryLocationStore((s) => s.setDeliveryLocation);
  const hydrateDeliveryLocation = useDeliveryLocationStore((s) => s.hydrateDeliveryLocation);
  const [greeting, setGreeting] = useState<'Good Morning' | 'Good Afternoon' | 'Good Evening' | 'Welcome'>('Good Morning');
  const [userName, setUserName] = useState<string>('User');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  // ─── Dynamic Chef Data States ───
  const [chefsData, setChefsData] = useState<any[]>([]);
  const [chefsLoading, setChefsLoading] = useState<boolean>(true);
  const [expandedCuisines, setExpandedCuisines] = useState<{ [key: string]: boolean }>({});

  // ─── Cart Count State ───
  const [cartItemCount, setCartItemCount] = useState<number>(0);

  // ─── Location / Address States ───
  const [locationDisplay, setLocationDisplay] = useState<string>('Detecting location...');
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);
  const [activeAddress, setActiveAddress] = useState<ActiveAddress | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');

  // Screen-Open Permission Prompt Modal State
  const [isPermissionPopupVisible, setIsPermissionPopupVisible] = useState<boolean>(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);

  // ─── ✅ NEW: Notification Permission Prompt States ───
  const [isNotificationPopupVisible, setIsNotificationPopupVisible] = useState<boolean>(false);
  const [isRequestingNotification, setIsRequestingNotification] = useState<boolean>(false);
  const hasPromptedNotificationRef = useRef<boolean>(false);

  // Coming Soon Popup Modal State for Hire Chef
  const [isComingSoonModalVisible, setIsComingSoonModalVisible] = useState<boolean>(false);

  // ─── Notifications Panel State ───
  const [isNotificationsVisible, setIsNotificationsVisible] = useState<boolean>(false);

  // ─── Bottom-of-Scroll Refresh States ───
  const [isRefreshingScreen, setIsRefreshingScreen] = useState<boolean>(false);
  const lastRefreshTimeRef = useRef<number>(0);
  const isRefreshingRef = useRef<boolean>(false);

  // ─── Global "data is refreshing" guard ───
  const isDataRefreshingRef = useRef<boolean>(false);

  // ✅ PERF: Throttle refs — prevent duplicate network calls on rapid focus events
  const lastUserRefreshAtRef = useRef<number>(0);
  const lastChefsFetchedAtRef = useRef<number>(0);
  const hasFocusedOnceRef = useRef<boolean>(false);

  // Address bottom sheet
  const [isAddressSheetVisible, setIsAddressSheetVisible] = useState<boolean>(false);

  // Editing Address State
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // ─── Map Modal Initial-Value States (fed into <AddressMapModal />) ───
  const [isMapModalVisible, setIsMapModalVisible] = useState<boolean>(false);
  const [mapInitialCoords, setMapInitialCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 17.3850,
    longitude: 78.4867,
  });
  const [mapInitialPinnedAddress, setMapInitialPinnedAddress] = useState<string>('');
  const [mapInitialHouseDetail, setMapInitialHouseDetail] = useState<string>('');
  const [mapInitialCustomTagTitle, setMapInitialCustomTagTitle] = useState<string>('');
  const [mapInitialAddressTag, setMapInitialAddressTag] = useState<'Home' | 'Work' | 'Other'>('Home');

  // Guard so GPS location is applied only once per session
  const hasAppliedGpsOnceRef = useRef<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [favorites, setFavorites] = useState<{ [key: string]: boolean }>({});
  const [activeBannerIndex, setActiveBannerIndex] = useState<number>(0);
  const [couponApplied, setCouponApplied] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('1');

  // ✅ NEW: "view all →" hint shown when the last (View All) category is off-screen
  const [showViewAllHint, setShowViewAllHint] = useState<boolean>(true);

  const bannerScrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const caterersSectionRef = useRef<View>(null);
  // ✅ NEW: ref for the horizontal Quick-Category scroller
  const categoryScrollRef = useRef<ScrollView>(null);

  // Helper: format display string from address object
  const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
    if (!addr) return 'Select delivery location';
    if (addr.houseDetails && addr.houseDetails.trim().length > 0) {
      return `${addr.houseDetails}, ${addr.fullAddress}`;
    }
    return addr.fullAddress || 'Select delivery location';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NEW: Push the active address into the global delivery-location store so
  //         downstream screens (Checkout, Orders, Admin) can read lat/lng
  //         without prop-drilling through 8 screens.
  // ─────────────────────────────────────────────────────────────────────────
  const syncActiveAddressToStore = async (addr: ActiveAddress | null | undefined) => {
    if (!addr || !addr.fullAddress) return;
    try {
      await setDeliveryLocationInStore({
        id: addr.id,
        title: addr.title,
        houseDetails: addr.houseDetails || '',
        fullAddress: addr.fullAddress,
        latitude: addr.latitude,
        longitude: addr.longitude,
        tag: addr.tag,
        updatedAt:
          addr.updatedAt instanceof Date
            ? addr.updatedAt.toISOString()
            : addr.updatedAt || new Date().toISOString(),
      });
    } catch (e) {
      console.log('syncActiveAddressToStore error:', e);
    }
  };

  // Helper function to check if address already exists in user's saved addresses
  const isAddressDuplicate = (
    existingList: SavedAddress[],
    fullAddr: string,
    houseDetails?: string,
    lat?: number,
    lon?: number
  ) => {
    const cleanFull = fullAddr.trim().toLowerCase();
    const cleanHouse = (houseDetails || '').trim().toLowerCase();

    return existingList.find((item) => {
      const matchString =
        item.fullAddress.trim().toLowerCase() === cleanFull &&
        (item.houseDetails || '').trim().toLowerCase() === cleanHouse;
      const matchCoords =
        lat &&
        lon &&
        Math.abs(item.latitude - lat) < 0.0002 &&
        Math.abs(item.longitude - lon) < 0.0002;
      return matchString || matchCoords;
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ PERF: fetchDynamicChefs with throttle + smart loading state
  //    - `silent = true`  → do NOT show loading spinner
  //    - `force = true`   → bypass the 20-second throttle
  //    - When chefsData already exists, we never flip chefsLoading back to true
  // ─────────────────────────────────────────────────────────────────────────
  const fetchDynamicChefs = async (silent: boolean = false, force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastChefsFetchedAtRef.current < 20000) {
      // Recently fetched — skip to avoid redundant network calls
      return;
    }
    try {
      // Only show the big loading state if we truly have no data yet
      if (!silent && chefsData.length === 0) {
        setChefsLoading(true);
      }
      const res = await api.get('/api/chefs');
      if (res.data && res.data.chefs) {
        const formatted = res.data.chefs.map((chef: any, i: number) => {
          const hasBanners = chef.banners && chef.banners.length > 0;
          const resolvedCover = hasBanners
            ? chef.banners[0].url
            : chef.coverImage || DEFAULT_COVER_IMAGES[i % DEFAULT_COVER_IMAGES.length];

          return {
            id: chef._id,
            name: chef.name || 'Chef',
            expText: chef.exp ? `${chef.exp} yrs experience` : '12 yrs experience',
            locationText: chef.location || '3.1 km',
            specialty: chef.specialty || 'South Indian, North Indian, Andhra Meals, Biryani, Mughlai, Street Food',
            rating: chef.rating ? String(chef.rating) : '4.8',
            ratingCount: chef.ratingCount ? String(chef.ratingCount) : '120',
            orderCount: chef.orderCount ? String(chef.orderCount) : '98',
            priceValue: chef.price !== undefined && chef.price !== null ? String(chef.price) : '139',
            price: `Starts @ ₹${chef.price || 139}`,
            avatar: chef.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
            coverImage: resolvedCover,
            banners: chef.banners || [],
            foodType: chef.foodType || 'BOTH',
            isAvailable: chef.isAvailable ?? true,
          };
        });
        setChefsData(formatted);
        lastChefsFetchedAtRef.current = Date.now();
      }
    } catch (err) {
      console.log('Home fetch dynamic chefs error:', err);
    } finally {
      setChefsLoading(false);
    }
  };

  // Fetch Cart Item Count
  const fetchCartCount = async () => {
    try {
      const res = await api.get('/api/cart');
      if (res.data.success && res.data.cart) {
        const totalCount = res.data.cart.reduce((acc: number, item: any) => acc + (item.totalItems || 1), 0);
        setCartItemCount(totalCount);
      } else {
        setCartItemCount(0);
      }
    } catch (err) {
      setCartItemCount(0);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ PERF: loadUserDataAndAddresses — TWO-PHASE
  //    Phase 1: Read AsyncStorage instantly → paint name/address immediately
  //    Phase 2: Background network refresh → update silently when it arrives
  // ─────────────────────────────────────────────────────────────────────────
  const loadUserDataAndAddresses = async () => {
    try {
      // ─── PHASE 1: FAST — apply cached data right away ───
      const cachedUser = await getUser();
      let activeUid = '';

      if (cachedUser) {
        setCurrentUser(cachedUser);
        activeUid = cachedUser.id || cachedUser._id || '';
        setCurrentUserId(activeUid);
        if (cachedUser.name && cachedUser.name.trim().length > 0 && cachedUser.name.trim().toLowerCase() !== 'user') {
          setUserName(cachedUser.name.trim());
        }

        if (cachedUser.activeAddress && cachedUser.activeAddress.fullAddress) {
          setActiveAddress(cachedUser.activeAddress);
          setLocationDisplay(formatAddressDisplay(cachedUser.activeAddress));
          if (cachedUser.activeAddress.id) {
            setSelectedAddressId(cachedUser.activeAddress.id);
          }
          // ✅ NEW: push cached active address to the store immediately
          syncActiveAddressToStore(cachedUser.activeAddress);
        } else if (cachedUser.address && cachedUser.address.trim().length > 0) {
          setLocationDisplay(cachedUser.address.trim());
        }

        if (cachedUser.savedAddresses && Array.isArray(cachedUser.savedAddresses)) {
          setSavedAddresses(cachedUser.savedAddresses);
        }
      }

      // ─── PHASE 2: BACKGROUND — refresh from server, non-blocking ───
      const now = Date.now();
      if (now - lastUserRefreshAtRef.current < 15000) {
        // Recently refreshed — skip
        return;
      }
      lastUserRefreshAtRef.current = now;

      refreshUser()
        .then((freshUser) => {
          if (!freshUser) return;
          setCurrentUser(freshUser);
          const freshUid = freshUser.id || freshUser._id || activeUid;
          setCurrentUserId(freshUid);

          if (freshUser.name && freshUser.name.trim().length > 0 && freshUser.name.trim().toLowerCase() !== 'user') {
            setUserName(freshUser.name.trim());
          }

          if (freshUser.activeAddress && freshUser.activeAddress.fullAddress) {
            setActiveAddress(freshUser.activeAddress);
            setLocationDisplay(formatAddressDisplay(freshUser.activeAddress));
            if (freshUser.activeAddress.id) {
              setSelectedAddressId(freshUser.activeAddress.id);
            }
            // ✅ NEW: push freshly-fetched active address to the store
            syncActiveAddressToStore(freshUser.activeAddress);
          } else if (freshUser.address && freshUser.address.trim().length > 0) {
            setLocationDisplay(freshUser.address.trim());
          }

          if (freshUser.savedAddresses && Array.isArray(freshUser.savedAddresses)) {
            setSavedAddresses(freshUser.savedAddresses);
          }
        })
        .catch((err) => {
          console.log('Silent user refresh failed:', err);
        });
    } catch (error) {
      console.log('Error loading logged in user data:', error);
    }
  };

  // ─── CENTRAL RELOAD (pull-to-refresh) — forces fresh data ───
  const reloadAllDynamicData = useCallback(async () => {
    isDataRefreshingRef.current = true;
    // Reset throttles so reload forces a real refresh
    lastChefsFetchedAtRef.current = 0;
    lastUserRefreshAtRef.current = 0;
    try {
      await Promise.allSettled([
        loadUserDataAndAddresses(),
        fetchDynamicChefs(true, true), // silent + force
        fetchCartCount(),
        checkLocationStatusAndPrompt(),
      ]);
    } catch (e) {
      console.log('Reload all dynamic data error:', e);
    } finally {
      isDataRefreshingRef.current = false;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ PERF: useFocusEffect — only the FIRST focus shows loading spinners
  //    Subsequent focuses are silent + throttled
  // ─────────────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const isFirstFocus = !hasFocusedOnceRef.current;
      hasFocusedOnceRef.current = true;

      // Fire all three in parallel, without awaiting (non-blocking)
      loadUserDataAndAddresses();          // Instant from cache + bg refresh
      fetchDynamicChefs(!isFirstFocus);    // silent on subsequent focuses
      fetchCartCount();
    }, [])
  );

  // ✅ NEW: Hydrate the persisted delivery location on mount so back-navigation
  //         and app restarts still remember lat/lng of the same user.
  useEffect(() => {
    hydrateDeliveryLocation();
  }, [hydrateDeliveryLocation]);

  // ─── BOTTOM-OF-SCROLL REFRESH ───
  const refreshWholeScreen = useCallback(async () => {
    if (isRefreshingRef.current) return;
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 8000) return;

    lastRefreshTimeRef.current = now;
    isRefreshingRef.current = true;
    setIsRefreshingScreen(true);

    try {
      await Promise.all([
        reloadAllDynamicData(),
        new Promise<void>((resolve) => setTimeout(resolve, 600)),
      ]);
    } catch (e) {
      console.log('Screen refresh error:', e);
    } finally {
      setIsRefreshingScreen(false);
      isRefreshingRef.current = false;
    }
  }, [reloadAllDynamicData]);

  const handleMainScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 60;
    const isNearBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isNearBottom && !isRefreshingRef.current) {
      refreshWholeScreen();
    }
  };

  const checkLocationStatusAndPrompt = async () => {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const { status } = await Location.getForegroundPermissionsAsync();

      if (!servicesEnabled || status !== 'granted') {
        if (!isDataRefreshingRef.current) {
          setIsPermissionPopupVisible(true);
        }
      } else {
        setIsPermissionPopupVisible(false);
        if (!hasAppliedGpsOnceRef.current) {
          fetchCurrentLocationDynamically();
        }
      }
    } catch (e) {
      if (!isDataRefreshingRef.current) {
        setIsPermissionPopupVisible(true);
      }
    }
  };

  useEffect(() => {
    checkLocationStatusAndPrompt();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NEW: Register (or refresh) the current user's Expo push token on the
  //    backend. Idempotent — the server just overwrites the pushToken field.
  //    Silent no-op on Expo Go or simulators.
  // ─────────────────────────────────────────────────────────────────────────
  const registerPushTokenForCurrentUser = async (): Promise<boolean> => {
    try {
      const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
      if (isExpoGo) {
        console.log('📱 Running in Expo Go - skipping remote push token registration');
        return false;
      }

      if (!Device.isDevice) {
        return false;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      if (!projectId) {
        console.log('⚠️ No EAS projectId found. Push token registration skipped.');
        return false;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData?.data;
      if (!token) return false;

      await api.patch('/api/auth/update-profile', { pushToken: token });
      console.log('📲 Push token registered from Home:', token);
      return true;
    } catch (err) {
      console.log('❌ Push token registration error (Home):', err);
      return false;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NEW: Check notification permission and show the prompt modal if needed.
  //    If already granted, silently registers the token so a reinstall or
  //    token rotation is handled automatically.
  // ─────────────────────────────────────────────────────────────────────────
  const checkNotificationPermissionAndPrompt = async () => {
    try {
      const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
      if (isExpoGo) return;              // Silently skip in Expo Go
      if (!Device.isDevice) return;      // Silently skip on simulator

      const { status } = await Notifications.getPermissionsAsync();

      if (status !== 'granted') {
        setIsNotificationPopupVisible(true);
      } else {
        // Already granted — make sure token is registered
        await registerPushTokenForCurrentUser();
      }
    } catch (err) {
      console.log('Notification permission check error:', err);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NEW: User tapped "Allow Notifications" in the prompt modal.
  // ─────────────────────────────────────────────────────────────────────────
  const handleAllowNotificationPopup = async () => {
    setIsRequestingNotification(true);
    try {
      const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
      if (isExpoGo) {
        setIsNotificationPopupVisible(false);
        return;
      }

      const { status } = await Notifications.requestPermissionsAsync();

      if (status === 'granted') {
        await registerPushTokenForCurrentUser();
      }
      // Whether granted or denied, close the modal — the OS remembers
      // the user's choice, so we should not nag repeatedly.
      setIsNotificationPopupVisible(false);
    } catch (err) {
      console.log('Notification permission request error:', err);
      setIsNotificationPopupVisible(false);
    } finally {
      setIsRequestingNotification(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NEW: On first mount of Home (i.e. first authenticated screen), after a
  //    short delay so the screen paints first, check notification permission.
  //    The ref prevents this from firing on every remount within the session.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasPromptedNotificationRef.current) return;
    hasPromptedNotificationRef.current = true;

    const timer = setTimeout(() => {
      checkNotificationPermissionAndPrompt();
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const persistSavedAddresses = async (
    addresses: SavedAddress[],
    newActive?: ActiveAddress | null
  ) => {
    try {
      setSavedAddresses(addresses);
      if (newActive) {
        setActiveAddress(newActive);
        setLocationDisplay(formatAddressDisplay(newActive));
        if (newActive.id) setSelectedAddressId(newActive.id);
      }
      await setSavedAddressesForUser(
        currentUserId,
        addresses,
        newActive ?? undefined,
        newActive ? formatAddressDisplay(newActive) : undefined
      );
    } catch (err) {
      console.log('Error saving addresses to storage:', err);
    }
  };

  // Dynamic Greeting based on time of day
  useEffect(() => {
    const updateGreeting = () => {
      const currentHour = new Date().getHours();
      if (currentHour >= 5 && currentHour < 12) {
        setGreeting('Good Morning');
      } else if (currentHour >= 12 && currentHour < 17) {
        setGreeting('Good Afternoon');
      } else if (currentHour >= 17 && currentHour < 22) {
        setGreeting('Good Evening');
      } else {
        setGreeting('Welcome');
      }
    };
    updateGreeting();
  }, []);

  // Auto-scroll banner
  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (activeBannerIndex + 1) % BANNER_SLIDES.length;
      bannerScrollRef.current?.scrollTo({
        x: nextIndex * (width - 32),
        animated: true,
      });
      setActiveBannerIndex(nextIndex);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeBannerIndex]);

  const fetchCurrentLocationDynamically = async () => {
    if (hasAppliedGpsOnceRef.current) return;
    setIsLoadingLocation(true);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setIsLoadingLocation(false);
        setIsPermissionPopupVisible(true);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setIsLoadingLocation(false);
        setIsPermissionPopupVisible(true);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const coords = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      const reverseGeocode = await Location.reverseGeocodeAsync(coords);

      let fullLocation = 'Hyderabad, Telangana';
      let primaryName = 'Current Location';
      if (reverseGeocode && reverseGeocode.length > 0) {
        const address = reverseGeocode[0];
        primaryName =
          address.name || address.street || address.district || address.city || 'Current Location';
        const city = address.city || address.subregion || address.region || '';
        fullLocation = city ? `${primaryName}, ${city}` : primaryName;
      }

      const gpsActive: ActiveAddress = {
        id: `gps_${Date.now()}`,
        title: primaryName !== 'Current Location' ? primaryName : 'Current Location',
        houseDetails: '',
        fullAddress: fullLocation,
        latitude: coords.latitude,
        longitude: coords.longitude,
        tag: 'Home',
        updatedAt: new Date().toISOString(),
      };

      setActiveAddress(gpsActive);
      setLocationDisplay(formatAddressDisplay(gpsActive));
      setSelectedAddressId(gpsActive.id || '');

      await updateUserAddress({
        activeAddress: gpsActive,
        address: formatAddressDisplay(gpsActive),
      });

      // ✅ NEW: GPS-detected location → push to store
      await syncActiveAddressToStore(gpsActive);

      hasAppliedGpsOnceRef.current = true;
    } catch (error) {
      console.error('Error getting location:', error);
      if (!activeAddress && locationDisplay === 'Detecting location...') {
        setLocationDisplay('Select delivery location');
      }
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleAllowLocationPopup = async () => {
    setIsRequestingPermission(true);
    try {
      setIsPermissionPopupVisible(false);
      hasAppliedGpsOnceRef.current = false;
      await fetchCurrentLocationDynamically();
    } catch (e) {
      setIsPermissionPopupVisible(false);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleSelectSavedAddress = async (item: SavedAddress) => {
    const newActive: ActiveAddress = {
      id: item.id,
      title: item.title,
      houseDetails: item.houseDetails || '',
      fullAddress: item.fullAddress,
      latitude: item.latitude,
      longitude: item.longitude,
      tag: item.tag,
      updatedAt: new Date().toISOString(),
    };

    setSelectedAddressId(item.id);
    setActiveAddress(newActive);
    setLocationDisplay(formatAddressDisplay(newActive));
    setIsAddressSheetVisible(false);

    await updateUserAddress({
      activeAddress: newActive,
      address: formatAddressDisplay(newActive),
    });

    // ✅ NEW: user picked a saved address → push to store
    await syncActiveAddressToStore(newActive);

    // ✅ Force a fresh fetch since the delivery location changed
    fetchDynamicChefs(true, true);
  };

  const handleOpenEditAddress = (item: SavedAddress) => {
    setEditingAddressId(item.id);
    setMapInitialCoords({
      latitude: item.latitude || 17.3850,
      longitude: item.longitude || 78.4867,
    });
    setMapInitialPinnedAddress(item.fullAddress);
    setMapInitialHouseDetail(item.houseDetails || '');
    setMapInitialCustomTagTitle(item.tag === 'Other' ? item.title : '');
    setMapInitialAddressTag(item.tag);
    setIsAddressSheetVisible(false);
    setIsMapModalVisible(true);
  };

  const handleDeleteAddress = (item: SavedAddress) => {
    Alert.alert(
      'Delete Address',
      `Are you sure you want to remove "${item.title}" from saved addresses?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = savedAddresses.filter((a) => a.id !== item.id);
            let nextActive: ActiveAddress | null = activeAddress;

            if (selectedAddressId === item.id || (activeAddress && activeAddress.id === item.id)) {
              if (updated.length > 0) {
                const nextItem = updated[0];
                nextActive = {
                  id: nextItem.id,
                  title: nextItem.title,
                  houseDetails: nextItem.houseDetails || '',
                  fullAddress: nextItem.fullAddress,
                  latitude: nextItem.latitude,
                  longitude: nextItem.longitude,
                  tag: nextItem.tag,
                  updatedAt: new Date().toISOString(),
                };
                setSelectedAddressId(nextItem.id);
              } else {
                nextActive = null;
                setSelectedAddressId('');
                setLocationDisplay('Select delivery location');
              }
            }

            await persistSavedAddresses(updated, nextActive);

            // ✅ NEW: if the active address was replaced, sync the new one
            if (nextActive) {
              await syncActiveAddressToStore(nextActive);
            }
          },
        },
      ]
    );
  };

  const handleOpenAddNewAddress = () => {
    setEditingAddressId(null);
    setMapInitialCoords(
      activeAddress && activeAddress.latitude !== 0 && activeAddress.longitude !== 0
        ? { latitude: activeAddress.latitude, longitude: activeAddress.longitude }
        : { latitude: 17.3850, longitude: 78.4867 }
    );
    setMapInitialPinnedAddress(activeAddress?.fullAddress || '');
    setMapInitialHouseDetail('');
    setMapInitialCustomTagTitle('');
    setMapInitialAddressTag('Home');
    setIsAddressSheetVisible(false);
    setIsMapModalVisible(true);
  };

  const handleMapClose = () => {
    setEditingAddressId(null);
    setIsMapModalVisible(false);
  };

  const handleMapConfirm = async (payload: AddressMapConfirmPayload) => {
    const { coords, pinnedAddress, houseDetail: trimmedHouse, customTagTitle: tagInput, addressTag } = payload;

    const title =
      addressTag === 'Other' && tagInput.trim().length > 0
        ? tagInput.trim()
        : addressTag;

    if (editingAddressId) {
      const updated = savedAddresses.map((a) => {
        if (a.id === editingAddressId) {
          return {
            ...a,
            title,
            houseDetails: trimmedHouse || undefined,
            fullAddress: pinnedAddress,
            latitude: coords.latitude,
            longitude: coords.longitude,
            tag: addressTag,
          };
        }
        return a;
      });

      const newActive: ActiveAddress = {
        id: editingAddressId,
        title,
        houseDetails: trimmedHouse || '',
        fullAddress: pinnedAddress,
        latitude: coords.latitude,
        longitude: coords.longitude,
        tag: addressTag,
        updatedAt: new Date().toISOString(),
      };

      await persistSavedAddresses(updated, newActive);
      setSelectedAddressId(editingAddressId);
      // ✅ NEW: edited address is now active → sync to store
      await syncActiveAddressToStore(newActive);
    } else {
      const duplicate = isAddressDuplicate(
        savedAddresses,
        pinnedAddress,
        trimmedHouse,
        coords.latitude,
        coords.longitude
      );

      if (duplicate) {
        const updated = savedAddresses.map((a) =>
          a.id === duplicate.id ? { ...a, title, tag: addressTag } : a
        );
        const newActive: ActiveAddress = {
          id: duplicate.id,
          title,
          houseDetails: trimmedHouse || '',
          fullAddress: pinnedAddress,
          latitude: coords.latitude,
          longitude: coords.longitude,
          tag: addressTag,
          updatedAt: new Date().toISOString(),
        };
        await persistSavedAddresses(updated, newActive);
        setSelectedAddressId(duplicate.id);
        // ✅ NEW: dedup-matched address is now active → sync to store
        await syncActiveAddressToStore(newActive);
      } else {
        const newAddressItem: SavedAddress = {
          id: `addr_${Date.now()}`,
          title,
          houseDetails: trimmedHouse || undefined,
          fullAddress: pinnedAddress,
          latitude: coords.latitude,
          longitude: coords.longitude,
          tag: addressTag,
          createdAt: new Date().toISOString(),
        };
        const updatedList = [newAddressItem, ...savedAddresses];

        const newActive: ActiveAddress = {
          id: newAddressItem.id,
          title: newAddressItem.title,
          houseDetails: newAddressItem.houseDetails || '',
          fullAddress: newAddressItem.fullAddress,
          latitude: newAddressItem.latitude,
          longitude: newAddressItem.longitude,
          tag: newAddressItem.tag,
          updatedAt: new Date().toISOString(),
        };

        await persistSavedAddresses(updatedList, newActive);
        setSelectedAddressId(newAddressItem.id);
        // ✅ NEW: brand-new address is now active → sync to store
        await syncActiveAddressToStore(newActive);
      }
    }

    setEditingAddressId(null);
    setIsMapModalVisible(false);

    // ✅ Force a fresh fetch since the delivery location changed
    fetchDynamicChefs(true, true);
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApplyCoupon = () => {
    setCouponApplied(!couponApplied);
  };

  const handleBannerScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(event.nativeEvent.contentOffset.x / (width - 32));
    if (slide !== activeBannerIndex && slide >= 0 && slide < BANNER_SLIDES.length) {
      setActiveBannerIndex(slide);
    }
  };

  // ✅ NEW: detect whether the last category ("View All") is currently visible
  const handleCategoryScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const maxScrollX = contentSize.width - layoutMeasurement.width;
    const isAtEnd = maxScrollX <= 0 || contentOffset.x >= maxScrollX - 15;
    setShowViewAllHint(!isAtEnd);
  };

  // ✅ UPDATED: tapping "view all →" hint navigates to the SAME destination
  //             as tapping the "View All" category (i.e. AllChefCards page).
  const handleViewAllHintPress = () => {
    setSelectedCategory('6');
    router.push('/screens/AllChefCards');
  };

  const handleCategoryPress = (item: CategoryItem) => {
    setSelectedCategory(item.id);
    const isMealBox = item.id === '1' || item.name.includes('Meal Box');
    const isCatering = item.id === '2' || item.name.includes('Catering');
    const isHireChef = item.id === '3' || item.name.includes('Hire Chef');
    const isFoodAndCravings = item.id === '4' || item.name.includes('Food & Cravings');
    const isQuickBites = item.id === '5' || item.name.includes('Quick Bites');

    if (isHireChef) {
      setIsComingSoonModalVisible(true);
      return;
    }

    if (isQuickBites) {
      router.push({
        pathname: '/screens/AllChefCards',
        params: { fromCategory: 'Quick Bites', filterQuickBites: 'true' },
      });
      return;
    }

    if (isMealBox) {
      router.push({
        pathname: '/screens/AllChefCards',
        params: { fromCategory: 'Meal Box', filterMealBox: 'true' },
      });
    } else if (isCatering) {
      router.push({
        pathname: '/screens/AllChefCards',
        params: { fromCategory: 'Catering', filterCatering: 'true' },
      });
    } else if (isFoodAndCravings) {
      router.push({
        pathname: '/screens/AllChefCards',
        params: { fromCategory: 'Food & Cravings', filterFoodAndCravings: 'true' },
      });
    } else if (item.id === '6' || item.name.includes('View All')) {
      // ✅ SAME destination as the "view all →" underlined hint
      router.push('/screens/AllChefCards');
    }
  };

  const renderCategoryIcon = (item: CategoryItem, isSelected: boolean) => {
    const color = isSelected ? '#15803D' : '#2D6A4F';
    if (item.type === 'ionicons') {
      return <Ionicons name={item.icon as any} size={22} color={color} />;
    }
    if (item.type === 'fa5') {
      return <FontAwesome5 name={item.icon as any} size={19} color={color} />;
    }
    if (item.type === 'feather') {
      return <Feather name={item.icon as any} size={21} color={color} />;
    }
    return <MaterialCommunityIcons name={item.icon as any} size={22} color={color} />;
  };

  const filteredChefs = chefsData.filter((chef) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const chefName = (chef.name || '').toLowerCase();
      const chefSpecialty = (chef.specialty || '').toLowerCase();
      const chefLocation = (chef.locationText || '').toLowerCase();

      const matchesSearch = chefName.includes(q) || chefSpecialty.includes(q) || chefLocation.includes(q);
      if (!matchesSearch) return false;
    }

    if (selectedTag === 'Veg') {
      if (chef.foodType !== 'VEG') return false;
    } else if (selectedTag === 'Non Veg') {
      if (chef.foodType !== 'NONVEG' && chef.foodType !== 'BOTH') return false;
    } else if (selectedTag === 'Biryani') {
      const spec = (chef.specialty || '').toLowerCase();
      const name = (chef.name || '').toLowerCase();
      if (!spec.includes('biryani') && !name.includes('biryani')) return false;
    } else if (selectedTag === 'North Indian') {
      const spec = (chef.specialty || '').toLowerCase();
      if (!spec.includes('north') && !spec.includes('punjabi') && !spec.includes('mughlai')) return false;
    }

    return true;
  });

  const handleSearchIconPress = () => {
    caterersSectionRef.current?.measureLayout(
      mainScrollRef.current as any,
      (x, y) => {
        mainScrollRef.current?.scrollTo({ y: y - 20, animated: true });
      },
      () => { }
    );
  };

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={true}
        alwaysBounceVertical={true}
        overScrollMode="always"
        onScroll={handleMainScroll}
        scrollEventThrottle={200}
      >
        {/* ─── Top Header (Dark Forest) ─── */}
        <View style={styles.darkHeaderSection}>
          <View style={styles.topBarRow}>
            <TouchableOpacity
              style={styles.locationContainer}
              activeOpacity={0.8}
              onPress={() => setIsAddressSheetVisible(true)}
            >
              <Ionicons name="location-sharp" size={23} color="#52B788" style={{ marginRight: 6 }} />
              <View>
                <Text style={styles.deliverToLabel}>DELIVER TO</Text>
                <View style={styles.locationNameRow}>
                  <Text style={styles.locationNameText} numberOfLines={1}>
                    {locationDisplay}
                  </Text>
                  {isLoadingLocation ? (
                    <ActivityIndicator size="small" color="#52B788" style={{ marginLeft: 4 }} />
                  ) : (
                    <Ionicons name="chevron-down" size={13} color="#E5E7EB" style={{ marginLeft: 4 }} />
                  )}
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.topRightActions}>
              <TouchableOpacity
                style={styles.headerIconButton}
                activeOpacity={0.75}
                onPress={() => setIsNotificationsVisible(true)}
              >
                <Ionicons name="notifications-outline" size={19} color="#E5E7EB" />
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>3</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerIconButton, { marginLeft: 10 }]}
                activeOpacity={0.75}
                onPress={() => {
                  router.push({
                    pathname: "/screens/CartScreen",
                    params: { fromHome: "true" }
                  });
                }}
              >
                <Ionicons name="cart-outline" size={19} color="#E5E7EB" />
                {cartItemCount > 0 && (
                  <View style={[styles.badgePill, styles.cartBadgePill]}>
                    <Text style={styles.badgePillText}>{cartItemCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.greetingContainer}>
            <View style={styles.greetingTitleRow}>
              <Text style={styles.greetingTitleText}>
                {greeting}, <Text style={styles.userNameText}>{userName}!</Text>
              </Text>
            </View>
            <Text style={styles.greetingSubText}>Let's start your healthy meal journey</Text>
          </View>

          <View style={styles.searchBarRow}>
            <View style={styles.searchInputContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search chefs, cuisines or meals..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={17} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.filterIconButton}
              activeOpacity={0.8}
              onPress={handleSearchIconPress}
            >
              <Feather name="search" size={18} color="#52B788" />
            </TouchableOpacity>
          </View>

          <View style={styles.bannerCarouselContainer}>
            <ScrollView
              ref={bannerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleBannerScroll}
              scrollEventThrottle={16}
              style={styles.bannerScroll}
            >
              {BANNER_SLIDES.map((slide) => {
                // ─── 1st Banner : FULL IMAGE ONLY ───
                if (slide.isFullBanner) {
                  return (
                    <TouchableOpacity
                      key={slide.id}
                      style={styles.bannerFullSlideCard}
                      activeOpacity={0.92}
                      onPress={() => router.push('/screens/AllChefCards')}
                    >
                      <Image
                        source={
                          typeof slide.image === 'string'
                            ? { uri: slide.image }
                            : slide.image
                        }
                        style={styles.bannerFullImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  );
                }

                // ─── 2nd Banner onwards : Half Info + Half Image Layout ───
                return (
                  <View key={slide.id} style={styles.bannerSlideCard}>
                    <View style={styles.bannerLeftSection}>
                      <View style={[styles.mealBadgePill, slide.isComingSoon && styles.comingSoonBadgePill]}>
                        <View style={[styles.badgeGreenDot, slide.isComingSoon && styles.comingSoonBadgeDot]} />
                        <Text style={[styles.mealBadgeText, slide.isComingSoon && styles.comingSoonBadgeText]}>
                          {slide.badge}
                        </Text>
                      </View>

                      <Text style={styles.bannerTitlePrimary}>{slide.titlePrimary}</Text>
                      <Text style={[styles.bannerTitleSecondary, slide.isComingSoon && styles.comingSoonTitleSecondary]}>
                        {slide.titleSecondary}
                      </Text>
                      <Text style={styles.bannerSubtitle}>{slide.tagline}</Text>

                      {slide.isComingSoon ? (
                        <TouchableOpacity
                          style={styles.bannerNotifyBtn}
                          activeOpacity={0.85}
                          onPress={() => setIsComingSoonModalVisible(true)}
                        >
                          <MaterialCommunityIcons name="clock-fast" size={14} color="#FBBF24" style={{ marginRight: 5 }} />
                          <Text style={styles.bannerNotifyBtnText}>Coming Soon</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.bannerExploreBtn}
                          activeOpacity={0.85}
                          onPress={() => {
                            if (slide.id === '2') {
                              router.push({
                                pathname: '/screens/AllChefCards',
                                params: { fromCategory: 'Catering', filterCatering: 'true' },
                              });
                            } else if (slide.id === '3') {
                              router.push({
                                pathname: '/screens/AllChefCards',
                                params: { fromCategory: 'Catering', filterCatering: 'true' },
                              });
                            } else if (slide.id === '4') {
                              router.push({
                                pathname: '/screens/AllChefCards',
                                params: { fromCategory: 'Meal Box', filterMealBox: 'true' },
                              });
                            } else if (slide.id === '5') {
                              router.push({
                                pathname: '/screens/AllChefCards',
                                params: { fromCategory: 'Pickles & Podis', filterCategory: 'Pickles & Podis' },
                              });
                            } else {
                              router.push('/screens/AllChefCards');
                            }
                          }}
                        >
                          <Text style={styles.bannerExploreBtnText}>Explore Plans</Text>
                          <Feather name="arrow-right" size={13} color="#111813" style={{ marginLeft: 6 }} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.bannerRightSection}>
                      <Image
                        source={
                          typeof slide.image === 'string'
                            ? { uri: slide.image }
                            : slide.image
                        }
                        style={styles.bannerFoodImage}
                        resizeMode="cover"
                      />

                      {slide.isComingSoon ? (
                        <View style={styles.comingSoonTagBanner}>
                          <Ionicons name="sparkles" size={11} color="#FBBF24" style={{ marginRight: 4 }} />
                          <Text style={styles.comingSoonTagText}>LAUNCHING SOON</Text>
                        </View>
                      ) : (
                        <View style={styles.startsAtBadge}>
                          <Text style={styles.startsAtLabel}>STARTS AT</Text>
                          <Text style={styles.startsAtPrice}>₹{slide.price}</Text>
                          <Text style={styles.startsAtDuration}>{slide.unit || '/pack'}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.bannerDotsRow}>
              {BANNER_SLIDES.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.bannerDot,
                    activeBannerIndex === idx ? styles.bannerDotActive : null,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.collapsingBodySection}>
          {/* ─── 6-Column Quick Category Grid (Horizontal Scroll) ─── */}
          <View style={styles.categoryGridSection}>
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={handleCategoryScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.categoryGridScrollContent}
            >
              {CATEGORIES.map((item) => {
                const isSelected = selectedCategory === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.categoryGridItem}
                    activeOpacity={0.75}
                    onPress={() => handleCategoryPress(item)}
                  >
                    <View
                      style={[
                        styles.categoryIconCircle,
                        isSelected && styles.categoryIconCircleActive,
                      ]}
                    >
                      {renderCategoryIcon(item, isSelected)}
                      {item.badge && (
                        <View
                          style={[
                            styles.categoryHotBadge,
                            item.badge === 'SOON' && styles.categorySoonBadge,
                            item.badge === '45 MIN' && styles.categoryQuickBadge,
                          ]}
                        >
                          <Text style={styles.categoryHotBadgeText}>{item.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.categoryNameText,
                        isSelected && styles.categoryNameTextActive,
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ✅ UPDATED: "view all →" underlined hint now sits BELOW the
                category bar. Shows only when the last (View All) category is
                off-screen. Tapping navigates to the SAME destination as the
                View All category. */}
            {showViewAllHint && (
              <TouchableOpacity
                style={styles.viewAllHintContainer}
                onPress={handleViewAllHintPress}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <Text style={styles.viewAllHintText}>view all →</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.couponContainer}>
            <View style={styles.couponCard}>
              <View style={styles.giftIconContainer}>
                <Image
                  source={{
                    uri: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&auto=format&fit=crop&q=80',
                  }}
                  style={styles.giftBoxImage}
                />
              </View>

              <View style={styles.couponDetails}>
                <Text style={styles.couponHeading}>Flat ₹500 OFF on your first order</Text>
                <View style={styles.couponCodeRow}>
                  <Text style={styles.useCodeLabel}>Use code: </Text>
                  <View style={styles.dashedCodeBox}>
                    <Text style={styles.dashedCodeText}>KATBOX500</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ─── Top Home Made Caterers Section ─── */}
          <View ref={caterersSectionRef} style={styles.caterersSection}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Top Home Made Caterers</Text>
                <View style={styles.sectionSubRow}>
                  <Text style={styles.sectionSubtitle}>Verified chefs delivering pure hygiene</Text>
                  <MaterialCommunityIcons
                    name="shield-check"
                    size={14}
                    color="#2D6A4F"
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.seeAllBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/screens/AllChefCards')}
              >
                <Text style={styles.seeAllBtnText}>See all</Text>
                <Feather name="arrow-right" size={13} color="#2D6A4F" style={{ marginLeft: 3 }} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsScroll}
            >
              {FILTER_TAGS.map((tag) => {
                const isSelected = selectedTag === tag.name;
                return (
                  <TouchableOpacity
                    key={tag.name}
                    onPress={() => setSelectedTag(tag.name)}
                    style={[styles.filterPill, isSelected && styles.filterPillActive]}
                    activeOpacity={0.8}
                  >
                    {tag.icon === 'leaf' && (
                      <Ionicons
                        name="leaf-outline"
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#2D6A4F'}
                        style={{ marginRight: 5 }}
                      />
                    )}
                    {tag.icon === 'drumstick' && (
                      <MaterialCommunityIcons
                        name="food-drumstick-outline"
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#6B7280'}
                        style={{ marginRight: 5 }}
                      />
                    )}
                    {tag.icon === 'pot-steam' && (
                      <MaterialCommunityIcons
                        name="pot-steam-outline"
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#6B7280'}
                        style={{ marginRight: 5 }}
                      />
                    )}
                    {tag.icon === 'food-croissant' && (
                      <MaterialCommunityIcons
                        name="silverware-fork-knife"
                        size={11}
                        color={isSelected ? '#FFFFFF' : '#6B7280'}
                        style={{ marginRight: 5 }}
                      />
                    )}
                    <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                      {tag.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.caterersDeckScroll}
            >
              {chefsLoading && chefsData.length === 0 ? (
                <View style={styles.caterersLoadingContainer}>
                  <ActivityIndicator size="small" color="#15803D" />
                  <Text style={styles.caterersLoadingText}>Loading verified chefs...</Text>
                </View>
              ) : filteredChefs.length > 0 ? (
                filteredChefs.map((caterer) => {
                  const isFav = favorites[caterer.id];
                  const isOffline = !caterer.isAvailable;
                  const isExpanded = !!expandedCuisines[caterer.id];

                  return (
                    <TouchableOpacity
                      key={caterer.id}
                      style={[styles.catererDeckCard, isOffline && styles.cardOffline]}
                      activeOpacity={0.9}
                      onPress={() => {
                        if (isOffline) return;
                        router.push('/screens/AllChefCards');
                      }}
                    >
                      <View style={styles.foodImageContainer}>
                        <HomeChefBannerCarousel
                          banners={caterer.banners}
                          fallbackImage={caterer.coverImage || DEFAULT_COVER_IMAGES[0]}
                          isOffline={isOffline}
                        />

                        <View style={styles.cardBestsellerTag}>
                          <MaterialIcons name="verified" size={9} color="#FFFFFF" style={{ marginRight: 3 }} />
                          <Text style={styles.cardBestsellerText}>Verified</Text>
                        </View>

                        <TouchableOpacity
                          style={styles.cardFavButton}
                          onPress={() => toggleFavorite(caterer.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={isFav ? 'heart' : 'heart-outline'}
                            size={17}
                            color={isFav ? '#E11D48' : '#FFFFFF'}
                          />
                        </TouchableOpacity>

                        <View style={styles.chefAvatarPill}>
                          <Image source={{ uri: caterer.avatar }} style={styles.chefImage} />
                        </View>
                      </View>

                      <View style={styles.cardBody}>
                        <Text style={styles.catererTitle} numberOfLines={1}>
                          {caterer.name}
                        </Text>

                        <View style={styles.ratingDistanceRow}>
                          <Ionicons name="star" size={12} color="#D97706" />
                          <Text style={styles.ratingNumber}>{caterer.rating}</Text>
                          <Text style={styles.reviewsCount}>({caterer.ratingCount || '120+'})</Text>
                          <Text style={styles.dotSeparator}>•</Text>
                          <Text style={styles.distanceValue} numberOfLines={1}>{caterer.locationText}</Text>
                        </View>

                        <View style={styles.cuisineTimeRow}>
                          <Text style={styles.timeValue}>{caterer.expText}</Text>
                        </View>

                        <View style={styles.cuisineContainer}>
                          <Text
                            style={styles.cuisineValue}
                            numberOfLines={isExpanded ? undefined : 1}
                          >
                            {caterer.specialty}
                          </Text>
                          {caterer.specialty && caterer.specialty.length > 22 && (
                            <TouchableOpacity
                              onPress={() =>
                                setExpandedCuisines((prev) => ({
                                  ...prev,
                                  [caterer.id]: !prev[caterer.id],
                                }))
                              }
                              activeOpacity={0.7}
                              style={styles.moreLessBtn}
                            >
                              <Text style={styles.moreLessText}>
                                {isExpanded ? ' less' : ' ...more'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        <View style={styles.cardBottomRow}>
                          <View style={styles.pricingRow}>
                            <Text style={styles.perPlateLabel}>Starts @ </Text>
                            <Text style={styles.priceGreen}>₹{caterer.priceValue}</Text>
                          </View>

                          <View style={styles.vegNonVegBadgeContainer}>
                            {caterer.foodType === 'VEG' && (
                              <View style={styles.vegBadgeCircle}>
                                <View style={styles.vegInnerDot} />
                              </View>
                            )}
                            {caterer.foodType === 'NONVEG' && (
                              <View style={styles.nonVegBadgeCircle}>
                                <View style={styles.nonVegInnerTriangle} />
                              </View>
                            )}
                            {caterer.foodType !== 'VEG' && caterer.foodType !== 'NONVEG' && (
                              <View style={styles.bothBadgeRow}>
                                <View style={styles.vegBadgeCircle}>
                                  <View style={styles.vegInnerDot} />
                                </View>
                                <View style={[styles.nonVegBadgeCircle, { marginLeft: 3 }]}>
                                  <View style={styles.nonVegInnerTriangle} />
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {isOffline && (
                        <View style={styles.offlineBadgeHome}>
                          <Text style={styles.offlineTextHome}>🔴 Offline</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.caterersLoadingContainer}>
                  <Text style={styles.caterersLoadingText}>No chefs found for this category</Text>
                </View>
              )}
            </ScrollView>
          </View>

          <View style={styles.trustBannerContainer}>
            <View style={styles.trustCard}>
              <View style={styles.trustItem}>
                <MaterialCommunityIcons name="moped" size={22} color="#2D6A4F" />
                <Text style={styles.trustItemText}>On-time{'\n'}Delivery</Text>
              </View>

              <View style={styles.trustDivider} />

              <View style={styles.trustItem}>
                <MaterialCommunityIcons name="shopping-outline" size={20} color="#2D6A4F" />
                <Text style={styles.trustItemText}>No Minimum{'\n'}Order</Text>
              </View>

              <View style={styles.trustDivider} />

              <View style={styles.trustItem}>
                <Ionicons name="leaf-outline" size={20} color="#2D6A4F" />
                <Text style={styles.trustItemText}>100%{'\n'}Homemade</Text>
              </View>

              <View style={styles.trustDivider} />

              <View style={styles.trustItem}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color="#2D6A4F" />
                <Text style={styles.trustItemText}>Hygienic &{'\n'}Safe</Text>
              </View>
            </View>
          </View>

          {/* ─── BOTTOM-OF-SCROLL REFRESH FOOTER ─── */}
          {isRefreshingScreen && (
            <View style={styles.screenRefreshFooter}>
              <ActivityIndicator size="small" color="#15803D" />
              <Text style={styles.screenRefreshFooterText}>Refreshing screen…</Text>
            </View>
          )}

        </View>
      </ScrollView>

      {/* ─── NOTIFICATIONS POPUP PANEL ─── */}
      <Modal
        visible={isNotificationsVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsNotificationsVisible(false)}
      >
        <Pressable
          style={styles.notificationBackdrop}
          onPress={() => setIsNotificationsVisible(false)}
        >
          <Pressable
            style={[
              styles.notificationPanelCard,
              {
                top:
                  Platform.OS === 'ios'
                    ? 56
                    : (StatusBar.currentHeight || 0) + 12,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.notificationPanelHeader}>
              <View style={styles.notificationPanelHeaderLeft}>
                <View style={styles.notificationPanelIconDot} />
                <Text style={styles.notificationPanelHeaderTitle}>Notifications</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsNotificationsVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.notificationPanelDivider} />

            <ScrollView
              style={styles.notificationPanelScroll}
              contentContainerStyle={styles.notificationPanelScrollContent}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              bounces={true}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.notificationItemRow}>
                <View style={[styles.notificationItemIconWrap, { backgroundColor: 'rgba(74, 222, 128, 0.14)' }]}>
                  <Ionicons name="sparkles-outline" size={16} color="#4ADE80" />
                </View>
                <View style={styles.notificationItemTextCol}>
                  <Text style={styles.notificationItemTitle}>Welcome to Katbox!</Text>
                  <Text style={styles.notificationItemBody}>
                    Your trusted home for hygienic meal boxes, catering & homemade foods.
                  </Text>
                </View>
              </View>

              <View style={styles.notificationItemRow}>
                <View style={[styles.notificationItemIconWrap, { backgroundColor: 'rgba(251, 191, 36, 0.16)' }]}>
                  <MaterialCommunityIcons name="firework" size={16} color="#FBBF24" />
                </View>
                <View style={styles.notificationItemTextCol}>
                  <Text style={styles.notificationItemTitle}>Ganesh Chaturthi Special</Text>
                  <Text style={styles.notificationItemBody}>
                    Flat ₹500 OFF on your first order. Use code KATBOX500 at checkout.
                  </Text>
                </View>
              </View>

              <View style={styles.notificationItemRow}>
                <View style={[styles.notificationItemIconWrap, { backgroundColor: 'rgba(96, 165, 250, 0.14)' }]}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={16} color="#60A5FA" />
                </View>
                <View style={styles.notificationItemTextCol}>
                  <Text style={styles.notificationItemTitle}>Katbox Catering</Text>
                  <Text style={styles.notificationItemBody}>
                    Book live event catering for weddings, pujas & parties.
                  </Text>
                </View>
              </View>

              <View style={styles.notificationItemRow}>
                <View style={[styles.notificationItemIconWrap, { backgroundColor: 'rgba(74, 222, 128, 0.14)' }]}>
                  <MaterialCommunityIcons name="food-takeout-box-outline" size={16} color="#4ADE80" />
                </View>
                <View style={styles.notificationItemTextCol}>
                  <Text style={styles.notificationItemTitle}>Katbox Mealbox</Text>
                  <Text style={styles.notificationItemBody}>
                    Fresh daily thalis & custom meal plans delivered to your door.
                  </Text>
                </View>
              </View>

              <View style={styles.notificationItemRow}>
                <View style={[styles.notificationItemIconWrap, { backgroundColor: 'rgba(244, 114, 182, 0.14)' }]}>
                  <Ionicons name="home-outline" size={16} color="#F472B6" />
                </View>
                <View style={styles.notificationItemTextCol}>
                  <Text style={styles.notificationItemTitle}>Katbox Homemade Foods</Text>
                  <Text style={styles.notificationItemBody}>
                    Authentic home-cooked pickles, podis & regional specials.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.notificationPanelFooter}>
              <Text style={styles.notificationPanelFooterText}>
                Pull up to see more · Tap outside to close
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── HIRE CHEF COMING SOON MODAL ─── */}
      <Modal
        visible={isComingSoonModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsComingSoonModalVisible(false)}
      >
        <View style={styles.comingSoonModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setIsComingSoonModalVisible(false)}
          />
          <View style={styles.comingSoonModalCard}>
            <TouchableOpacity
              style={styles.comingSoonCloseBtn}
              activeOpacity={0.8}
              onPress={() => setIsComingSoonModalVisible(false)}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>

            <View style={styles.comingSoonChefBadge}>
              <FontAwesome5 name="user-tie" size={30} color="#15803D" />
              <View style={styles.comingSoonSparklePill}>
                <Ionicons name="sparkles" size={10} color="#B45309" />
                <Text style={styles.comingSoonSparkleText}>PREMIUM</Text>
              </View>
            </View>

            <Text style={styles.comingSoonCardTitle}>Hire Chef On Demand</Text>
            <View style={styles.comingSoonPillTag}>
              <View style={styles.comingSoonPulseDot} />
              <Text style={styles.comingSoonPillTagText}>Launching Very Soon</Text>
            </View>

            <Text style={styles.comingSoonCardDescription}>
              We are carefully vetting top five-star home chefs and catering masters across Hyderabad to cook live in your kitchen for private dinners, family functions, and celebrations.
            </Text>

            <View style={styles.comingSoonFeaturesList}>
              <View style={styles.comingSoonFeatureRow}>
                <View style={styles.comingSoonCheckCircle}>
                  <Ionicons name="checkmark" size={13} color="#15803D" />
                </View>
                <Text style={styles.comingSoonFeatureText}>Experienced, verified master cooks</Text>
              </View>

              <View style={styles.comingSoonFeatureRow}>
                <View style={styles.comingSoonCheckCircle}>
                  <Ionicons name="checkmark" size={13} color="#15803D" />
                </View>
                <Text style={styles.comingSoonFeatureText}>Live, hygienic custom meal preparation</Text>
              </View>

              <View style={styles.comingSoonFeatureRow}>
                <View style={styles.comingSoonCheckCircle}>
                  <Ionicons name="checkmark" size={13} color="#15803D" />
                </View>
                <Text style={styles.comingSoonFeatureText}>Hassle-free kitchen cleanup included</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.comingSoonActionBtn}
              activeOpacity={0.88}
              onPress={() => setIsComingSoonModalVisible(false)}
            >
              <Text style={styles.comingSoonActionBtnText}>Got it, Notify Me!</Text>
              <Feather name="bell" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── LOCATION PERMISSION MODAL ─── */}
      <Modal
        visible={isPermissionPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => { }}
      >
        <View style={styles.permissionModalBackdrop}>
          <View style={styles.permissionCardContainer}>
            <View style={styles.permissionIllustrationCircle}>
              <Ionicons name="location" size={38} color="#15803D" />
              <View style={styles.permissionPulseDot} />
            </View>

            <Text style={styles.permissionCardTitle}>Find Nearby Chefs & Meals</Text>
            <Text style={styles.permissionCardDescription}>
              Allow location access to discover hygienic home caterers, live chefs, and fresh meal boxes delivering to your exact doorstep.
            </Text>

            <View style={styles.permissionFeaturesList}>
              <View style={styles.permissionFeatureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#15803D" style={{ marginRight: 8 }} />
                <Text style={styles.permissionFeatureText}>Accurate delivery time estimations</Text>
              </View>
              <View style={styles.permissionFeatureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#15803D" style={{ marginRight: 8 }} />
                <Text style={styles.permissionFeatureText}>Verified home chefs nearest to you</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.permissionAllowButton}
              activeOpacity={0.88}
              onPress={handleAllowLocationPopup}
              disabled={isRequestingPermission}
            >
              {isRequestingPermission ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.permissionAllowButtonText}>Allow Location Access</Text>
                  <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── ✅ NEW: NOTIFICATION PERMISSION MODAL ─── */}
      <Modal
        visible={isNotificationPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsNotificationPopupVisible(false)}
      >
        <View style={styles.permissionModalBackdrop}>
          <View style={styles.permissionCardContainer}>
            <View style={[styles.permissionIllustrationCircle, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="notifications" size={38} color="#2563EB" />
              <View style={[styles.permissionPulseDot, { borderColor: 'rgba(37, 99, 235, 0.3)' }]} />
            </View>

            <Text style={styles.permissionCardTitle}>Stay Updated with Katbox</Text>
            <Text style={styles.permissionCardDescription}>
              Allow notifications to get instant updates on your order status, delivery progress, and exclusive offers.
            </Text>

            <View style={styles.permissionFeaturesList}>
              <View style={styles.permissionFeatureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#2563EB" style={{ marginRight: 8 }} />
                <Text style={styles.permissionFeatureText}>Real-time order & delivery updates</Text>
              </View>
              <View style={styles.permissionFeatureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#2563EB" style={{ marginRight: 8 }} />
                <Text style={styles.permissionFeatureText}>Chef acceptance & status alerts</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.permissionAllowButton, { backgroundColor: '#2563EB', shadowColor: '#2563EB' }]}
              activeOpacity={0.88}
              onPress={handleAllowNotificationPopup}
              disabled={isRequestingNotification}
            >
              {isRequestingNotification ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.permissionAllowButtonText}>Allow Notifications</Text>
                  <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 12, paddingVertical: 6 }}
              onPress={() => setIsNotificationPopupVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12.5, color: '#64748B', fontWeight: '600' }}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── SAVED ADDRESSES BOTTOM SHEET ─── */}
      <Modal
        visible={isAddressSheetVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddressSheetVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={styles.sheetBackdropDismiss}
            activeOpacity={1}
            onPress={() => setIsAddressSheetVisible(false)}
          />

          <View style={styles.savedAddressSheetContainer}>
            <View style={styles.sheetHandleBar} />

            <View style={styles.sheetHeaderRow}>
              <View>
                <Text style={styles.sheetTitle}>Choose Delivery Location</Text>
                <Text style={styles.sheetSubtitle}>Select, edit, or manage saved addresses</Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setIsAddressSheetVisible(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.savedAddressList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {activeAddress && activeAddress.fullAddress ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.4, marginBottom: 8 }}>
                    ACTIVE ADDRESS
                  </Text>
                  <View style={[styles.savedAddressItemCard, styles.savedAddressItemCardActive]}>
                    <TouchableOpacity
                      style={styles.savedAddressMainTouchable}
                      activeOpacity={0.8}
                      onPress={() => setIsAddressSheetVisible(false)}
                    >
                      <View style={[styles.savedAddressIconCircle, styles.savedAddressIconCircleActive]}>
                        <Ionicons name="navigate" size={17} color="#FFFFFF" />
                      </View>
                      <View style={styles.savedAddressTextCol}>
                        <View style={styles.savedAddressTitleRow}>
                          <Text style={styles.savedAddressItemTitle}>{activeAddress.title || 'Current'}</Text>
                          <View style={styles.activeCheckPill}>
                            <Ionicons name="checkmark-circle" size={13} color="#15803D" />
                            <Text style={styles.activeCheckPillText}>Active</Text>
                          </View>
                        </View>
                        {activeAddress.houseDetails ? (
                          <Text style={styles.savedAddressHouseString} numberOfLines={1}>
                            {activeAddress.houseDetails}
                          </Text>
                        ) : null}
                        <Text style={styles.savedAddressFullString} numberOfLines={2}>
                          {activeAddress.fullAddress}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.4, marginBottom: 8 }}>
                SAVED ADDRESSES
              </Text>

              {savedAddresses.length > 0 ? (
                savedAddresses.map((item) => {
                  const isSelected =
                    selectedAddressId === item.id ||
                    (activeAddress && activeAddress.id === item.id);
                  return (
                    <View
                      key={item.id}
                      style={[styles.savedAddressItemCard, isSelected && styles.savedAddressItemCardActive]}
                    >
                      <TouchableOpacity
                        style={styles.savedAddressMainTouchable}
                        activeOpacity={0.8}
                        onPress={() => handleSelectSavedAddress(item)}
                      >
                        <View style={[styles.savedAddressIconCircle, isSelected && styles.savedAddressIconCircleActive]}>
                          {item.tag === 'Home' && (
                            <Ionicons name="home" size={17} color={isSelected ? '#FFFFFF' : '#15803D'} />
                          )}
                          {item.tag === 'Work' && (
                            <Ionicons name="briefcase" size={17} color={isSelected ? '#FFFFFF' : '#15803D'} />
                          )}
                          {item.tag === 'Other' && (
                            <Ionicons name="bookmark" size={17} color={isSelected ? '#FFFFFF' : '#15803D'} />
                          )}
                        </View>

                        <View style={styles.savedAddressTextCol}>
                          <View style={styles.savedAddressTitleRow}>
                            <Text style={styles.savedAddressItemTitle}>{item.title}</Text>
                            {isSelected && (
                              <View style={styles.activeCheckPill}>
                                <Ionicons name="checkmark-circle" size={13} color="#15803D" />
                                <Text style={styles.activeCheckPillText}>Active</Text>
                              </View>
                            )}
                          </View>

                          {item.houseDetails ? (
                            <Text style={styles.savedAddressHouseString} numberOfLines={1}>
                              {item.houseDetails}
                            </Text>
                          ) : null}

                          <Text style={styles.savedAddressFullString} numberOfLines={2}>
                            {item.fullAddress}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.addressActionButtonsRow}>
                        <TouchableOpacity
                          style={styles.addressActionButton}
                          activeOpacity={0.7}
                          onPress={() => handleOpenEditAddress(item)}
                        >
                          <Feather name="edit-2" size={15} color="#2563EB" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.addressActionButton, { marginLeft: 8 }]}
                          activeOpacity={0.7}
                          onPress={() => handleDeleteAddress(item)}
                        >
                          <Feather name="trash-2" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptySavedAddressesBox}>
                  <Ionicons name="location-outline" size={32} color="#94A3B8" style={{ marginBottom: 6 }} />
                  <Text style={styles.emptySavedAddressesTitle}>No saved addresses yet</Text>
                  <Text style={styles.emptySavedAddressesSubtitle}>
                    Add your home, office, or custom locations for quick 1-tap checkout.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.addNewAddressMapBtn}
                activeOpacity={0.85}
                onPress={handleOpenAddNewAddress}
              >
                <View style={styles.addNewAddressIconBox}>
                  <Ionicons name="add" size={20} color="#15803D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addNewAddressTitle}>Add New Address</Text>
                  <Text style={styles.addNewAddressSubtitle}>Pin exact location on real detailed map</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── REAL MAP MODAL (extracted to <AddressMapModal />) ─── */}
      <AddressMapModal
        visible={isMapModalVisible}
        editing={editingAddressId !== null}
        initialCoords={mapInitialCoords}
        initialPinnedAddress={mapInitialPinnedAddress}
        initialHouseDetail={mapInitialHouseDetail}
        initialCustomTagTitle={mapInitialCustomTagTitle}
        initialAddressTag={mapInitialAddressTag}
        onClose={handleMapClose}
        onConfirm={handleMapConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#111813',
  },
  scrollContent: {
    backgroundColor: '#111813',
    paddingBottom: Platform.OS === 'ios' ? 78 : 62,
  },

  darkHeaderSection: {
    backgroundColor: '#111813',
    paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 0) + 12,
    paddingHorizontal: 16,
    paddingBottom: 0,
    zIndex: 20,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1A241D',
    borderWidth: 1,
    borderColor: '#26342A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  deliverToLabel: {
    color: '#52B788',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  locationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  locationNameText: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '700',
    maxWidth: width * 0.42,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgePill: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#E11D48',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#111813',
    paddingHorizontal: 2,
  },
  cartBadgePill: {
    backgroundColor: '#40916C',
  },
  badgePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },

  greetingContainer: {
    marginTop: 16,
    marginBottom: 14,
  },
  greetingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingTitleText: {
    fontSize: 21,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: -0.3,
  },
  userNameText: {
    color: '#74C69D',
  },
  greetingSubText: {
    fontSize: 12.5,
    color: '#9CA3AF',
    marginTop: 3,
    fontWeight: '400',
  },

  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A241D',
    borderRadius: 14,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#26342A',
  },
  searchInput: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '500',
  },
  filterIconButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#1A241D',
    borderWidth: 1,
    borderColor: '#26342A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  bannerCarouselContainer: {
    marginTop: 4,
    marginBottom: -20,
    position: 'relative',
    zIndex: 30,
  },
  bannerScroll: {
    width: width - 32,
    borderRadius: 22,
  },
  bannerSlideCard: {
    width: width - 32,
    height: 200,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#132117',
    borderWidth: 1,
    borderColor: '#223628',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  bannerFullSlideCard: {
    width: width - 32,
    height: 200,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#132117',
    borderWidth: 1,
    borderColor: '#223628',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  bannerFullImage: {
    width: '100%',
    height: '100%',
  },
  bannerLeftSection: {
    flex: 1.15,
    paddingTop: 14,
    paddingBottom: 20,
    paddingLeft: 16,
    paddingRight: 6,
    justifyContent: 'center',
  },
  mealBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  comingSoonBadgePill: {
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  badgeGreenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ADE80',
    marginRight: 5,
  },
  comingSoonBadgeDot: {
    backgroundColor: '#FBBF24',
  },
  mealBadgeText: {
    color: '#86EFAC',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  comingSoonBadgeText: {
    color: '#FDE68A',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  bannerTitlePrimary: {
    fontSize: 17.5,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  bannerTitleSecondary: {
    fontSize: 17.5,
    fontWeight: '900',
    color: '#4ADE80',
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  comingSoonTitleSecondary: {
    color: '#FBBF24',
  },
  bannerSubtitle: {
    fontSize: 10,
    color: '#D1D5DB',
    marginTop: 4,
    lineHeight: 14,
  },
  bannerExploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 18,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  bannerExploreBtnText: {
    color: '#111813',
    fontSize: 10.5,
    fontWeight: '800',
  },
  bannerNotifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#26342A',
    borderWidth: 1,
    borderColor: '#FBBF24',
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 18,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  bannerNotifyBtnText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '800',
  },
  bannerRightSection: {
    flex: 1,
    position: 'relative',
    height: '100%',
  },
  bannerFoodImage: {
    width: '100%',
    height: '100%',
  },
  startsAtBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#0F1A13',
    borderWidth: 1.5,
    borderColor: '#4ADE80',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    zIndex: 10,
  },
  comingSoonTagBanner: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#0F1A13',
    borderWidth: 1.5,
    borderColor: '#FBBF24',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  comingSoonTagText: {
    color: '#FDE68A',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  startsAtLabel: {
    color: '#86EFAC',
    fontSize: 6.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  startsAtPrice: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
  },
  startsAtDuration: {
    color: '#FFFFFF',
    fontSize: 9,
  },
  bannerDotsRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 35,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 3,
  },
  bannerDotActive: {
    width: 18,
    backgroundColor: '#4ADE80',
    borderRadius: 3,
  },

  collapsingBodySection: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 48,
    marginTop: -16,
    zIndex: 10,
    paddingBottom: 8,
  },

  /* ─── CATEGORY STRIP (Premium) ─── */
  categoryGridSection: {
    paddingHorizontal: 0,
    marginBottom: 18,
    paddingTop: 2,
  },
  // ✅ UPDATED: hint now sits BELOW the category bar (right-aligned).
  //    Tapping navigates to the SAME destination as the "View All" category.
  viewAllHintContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  viewAllHintText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
    textDecorationLine: 'underline',
    letterSpacing: 0.25,
  },
  // ✅ UPDATED: horizontal scroller for 6 categories
  categoryGridScrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  categoryGridItem: {
    width: (width - 20) / 5,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  categoryIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 19,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  categoryIconCircleActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#15803D',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 5,
  },
  // ✅ UPDATED: premium badge with white ring, shadow, and proper alignment.
  //    Sized so short labels (HOT / SOON) and longer labels (45 MIN) both
  //    render cleanly without overlapping adjacent categories.
  categoryHotBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    zIndex: 10,
    minWidth: 22,
    minHeight: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  categorySoonBadge: {
    backgroundColor: '#D97706',
  },
  // ✅ NEW: distinct premium green for the "45 MIN" Quick Bites speed badge
  categoryQuickBadge: {
    backgroundColor: '#15803D',
  },
  categoryHotBadgeText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 9,
  },
  categoryNameText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    marginTop: 7,
    lineHeight: 13,
  },
  categoryNameTextActive: {
    color: '#15803D',
    fontWeight: '800',
  },

  couponContainer: {
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#183526',
    borderRadius: 15,
    padding: 10,
    paddingRight: 12,
  },
  giftIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 9,
    overflow: 'hidden',
    marginRight: 9,
  },
  giftBoxImage: {
    width: '100%',
    height: '100%',
  },
  couponDetails: {
    flex: 1,
  },
  couponHeading: {
    color: '#F9FAFB',
    fontSize: 11.5,
    fontWeight: '700',
  },
  couponCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  useCodeLabel: {
    color: '#D1D5DB',
    fontSize: 10,
  },
  dashedCodeBox: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#FBBF24',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dashedCodeText: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '800',
  },

  caterersSection: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#1F2937',
  },
  sectionSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllBtnText: {
    fontSize: 12,
    color: '#2D6A4F',
    fontWeight: '700',
  },
  filterPillsScroll: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 5.5,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: '#2D6A4F',
    borderColor: '#2D6A4F',
  },
  filterPillText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  caterersDeckScroll: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  caterersLoadingContainer: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  caterersLoadingText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  catererDeckCard: {
    width: HOME_CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  cardOffline: {
    opacity: 0.6,
  },
  imageGrayscale: {
    opacity: 0.6,
  },
  foodImageContainer: {
    height: 120,
    width: '100%',
    position: 'relative',
  },
  homeCardCoverContainer: {
    width: '100%',
    height: 120,
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  homeCardBannerScrollView: {
    width: '100%',
    height: '100%',
  },
  homeCardCoverImage: {
    width: HOME_CARD_WIDTH,
    height: 120,
    resizeMode: 'cover',
  },
  homeCardPaginationContainer: {
    position: 'absolute',
    bottom: 5,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3.5,
    zIndex: 4,
  },
  homeCardPaginationDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  homeCardPaginationDotActive: {
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  cardBestsellerTag: {
    position: 'absolute',
    top: 7,
    left: 7,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    zIndex: 5,
  },
  cardBestsellerText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  cardFavButton: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  chefAvatarPill: {
    position: 'absolute',
    bottom: -11,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    zIndex: 6,
    backgroundColor: '#FFFFFF',
  },
  chefImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    resizeMode: 'cover',
  },
  cardBody: {
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  catererTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1F2937',
  },
  ratingDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5.5,
  },
  ratingNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1F2937',
    marginLeft: 3,
  },
  reviewsCount: {
    fontSize: 10.5,
    color: '#6B7280',
    marginLeft: 2,
  },
  dotSeparator: {
    fontSize: 10.5,
    color: '#9CA3AF',
    marginHorizontal: 4,
  },
  distanceValue: {
    fontSize: 10.5,
    color: '#6B7280',
    flex: 1,
  },
  cuisineTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cuisineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 3,
  },
  cuisineValue: {
    fontSize: 10.5,
    color: '#6B7280',
    flexShrink: 1,
  },
  moreLessBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreLessText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
  },
  timeValue: {
    fontSize: 10.5,
    color: '#6B7280',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceGreen: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#2D6A4F',
  },
  perPlateLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
  },
  vegNonVegBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vegBadgeCircle: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.2,
    borderColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
  },
  vegInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  nonVegBadgeCircle: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.2,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  nonVegInnerTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#DC2626',
    transform: [{ rotate: '180deg' }],
  },
  bothBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineBadgeHome: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 10,
  },
  offlineTextHome: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },

  trustBannerContainer: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 0,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  trustItem: {
    alignItems: 'center',
    flex: 1,
  },
  trustItemText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 11,
  },
  trustDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E5E7EB',
  },

  screenRefreshFooter: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  screenRefreshFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.2,
  },

  notificationBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  notificationPanelCard: {
    position: 'absolute',
    right: 14,
    width: Math.min(300, width - 28),
    maxHeight: 440,
    backgroundColor: '#0F1A13',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#26342A',
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 15,
    overflow: 'hidden',
  },
  notificationPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexShrink: 0,
  },
  notificationPanelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationPanelIconDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4ADE80',
    marginRight: 8,
  },
  notificationPanelHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: -0.2,
  },
  notificationPanelDivider: {
    height: 1,
    backgroundColor: '#1E2E23',
    marginBottom: 4,
    flexShrink: 0,
  },
  notificationPanelScroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 120,
    paddingHorizontal: 6,
  },
  notificationPanelScrollContent: {
    paddingTop: 2,
    paddingBottom: 10,
    paddingRight: 4,
  },
  notificationItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  notificationItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    flexShrink: 0,
  },
  notificationItemTextCol: {
    flex: 1,
  },
  notificationItemTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -0.1,
  },
  notificationItemBody: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 15,
    fontWeight: '500',
  },
  notificationPanelFooter: {
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E2E23',
    alignItems: 'center',
    marginTop: 4,
    flexShrink: 0,
  },
  notificationPanelFooterText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  comingSoonModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 18, 13, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  comingSoonModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 25,
    position: 'relative',
  },
  comingSoonCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  comingSoonChefBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 12,
    position: 'relative',
  },
  comingSoonSparklePill: {
    position: 'absolute',
    bottom: -6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  comingSoonSparkleText: {
    color: '#92400E',
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginLeft: 2,
  },
  comingSoonCardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginTop: 6,
  },
  comingSoonPillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  comingSoonPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
    marginRight: 6,
  },
  comingSoonPillTagText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  comingSoonCardDescription: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  comingSoonFeaturesList: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  comingSoonFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  comingSoonCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  comingSoonFeatureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  comingSoonActionBtn: {
    width: '100%',
    backgroundColor: '#15803D',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  comingSoonActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  permissionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  permissionCardContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 25,
  },
  permissionIllustrationCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  permissionPulseDot: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1.5,
    borderColor: 'rgba(21, 128, 61, 0.3)',
  },
  permissionCardTitle: {
    fontSize: 18.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  permissionCardDescription: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  permissionFeaturesList: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  permissionFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  permissionFeatureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  permissionAllowButton: {
    width: '100%',
    backgroundColor: '#15803D',
    borderRadius: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  permissionAllowButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetBackdropDismiss: {
    flex: 1,
  },
  savedAddressSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: height * 0.72,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 20,
  },
  sheetHandleBar: {
    width: 40,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedAddressList: {
    marginBottom: 10,
  },
  emptySavedAddressesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  emptySavedAddressesTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  emptySavedAddressesSubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 15,
  },
  savedAddressItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  savedAddressItemCardActive: {
    borderColor: '#15803D',
    backgroundColor: '#F0FDF4',
  },
  savedAddressMainTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  savedAddressIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  savedAddressIconCircleActive: {
    backgroundColor: '#15803D',
  },
  savedAddressTextCol: {
    flex: 1,
    paddingRight: 6,
  },
  savedAddressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedAddressItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeCheckPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  activeCheckPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
    marginLeft: 2,
  },
  savedAddressHouseString: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  savedAddressFullString: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  addressActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
  },
  addressActionButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  addNewAddressMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#15803D',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 13,
    marginTop: 4,
    marginBottom: 10,
  },
  addNewAddressIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addNewAddressTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  addNewAddressSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
});