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
  KeyboardAvoidingView,
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import api from '@/src/lib/api';
import {
  getUser,
  updateUserAddress,
  getSavedAddressesForUser,
  setSavedAddressesForUser,
  migrateAddressSystemV2IfNeeded,
  SavedAddress,
  ActiveAddress,
} from '@/src/lib/authStorage';

// Safe Dynamic Resolution for WebView to prevent Invariant Violation / RNCWebViewModule crashes
let NativeWebViewComponent: any = null;
try {
  const RNWebViewModule = require('react-native-webview');
  NativeWebViewComponent = RNWebViewModule.WebView || RNWebViewModule.default || null;
} catch (e) {
  NativeWebViewComponent = null;
}

const SafeMapWebView = React.forwardRef<any, any>((props, ref) => {
  if (NativeWebViewComponent) {
    return <NativeWebViewComponent ref={ref} {...props} />;
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.mapFallbackContainer]}>
      <Ionicons name="map-outline" size={48} color="#15803D" style={{ marginBottom: 8 }} />
      <Text style={styles.mapFallbackTitle}>Interactive Map View</Text>
      <Text style={styles.mapFallbackSubtitle}>
        Drag pin or search to set your location coordinates
      </Text>
    </View>
  );
});

const { width, height } = Dimensions.get('window');
const HOME_CARD_WIDTH = 220;

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
  price: string;
  image: string;
}

interface SearchSuggestion {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
}

// ─── Static Data ───
const BANNER_SLIDES: BannerSlide[] = [
  {
    id: '1',
    titlePrimary: 'Healthy Meals,',
    titleSecondary: 'Delivered Daily!',
    tagline: 'Fresh homestyle curated menu\nright at your doorstep.',
    badge: 'MEAL BOX PLANS',
    price: '899',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=1200&auto=format&fit=crop&q=80',
  },
  {
    id: '2',
    titlePrimary: 'Royal Biryani &',
    titleSecondary: 'Homely Curries',
    tagline: 'Authentic flavours crafted\nwith zero preservatives.',
    badge: 'CHEF SPECIALS',
    price: '999',
    image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=1200&auto=format&fit=crop&q=80',
  },
  {
    id: '3',
    titlePrimary: 'Grand Party &',
    titleSecondary: 'Event Catering',
    tagline: 'Professional top chefs for\nauthentic celebrations.',
    badge: 'EVENT CATERING',
    price: '1299',
    image: 'https://images.unsplash.com/photo-1555244162-803834f70033?w=1200&auto=format&fit=crop&q=80',
  },
  {
    id: '4',
    titlePrimary: 'Book a Personal',
    titleSecondary: 'Chef for Today',
    tagline: 'Enjoy luxury live dining\ncooked live in your kitchen.',
    badge: 'LIVE CHEF ON DEMAND',
    price: '1499',
    image: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=1200&auto=format&fit=crop&q=80',
  },
];

const CATEGORIES: CategoryItem[] = [
  { id: '1', name: 'Meal Boxes', icon: 'food-takeout-box-outline', type: 'mci', badge: 'HOT' },
  { id: '2', name: 'Catering', icon: 'silverware-fork-knife', type: 'mci' },
  { id: '3', name: 'Hire Chef', icon: 'user-tie', type: 'fa5' },
  { id: '4', name: 'Healthy', icon: 'leaf', type: 'ionicons' },
  { id: '5', name: 'View All', icon: 'grid', type: 'feather' },
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

  // Address bottom sheet
  const [isAddressSheetVisible, setIsAddressSheetVisible] = useState<boolean>(false);

  // Editing Address State
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Real Map Modal States
  const [mapCoords, setMapCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 17.3850,
    longitude: 78.4867,
  });
  const mapCoordsRef = useRef<{ latitude: number; longitude: number }>({
    latitude: 17.3850,
    longitude: 78.4867,
  });
  const [isMapModalVisible, setIsMapModalVisible] = useState<boolean>(false);
  const [pinnedAddress, setPinnedAddress] = useState<string>('Locating address...');
  const [houseDetail, setHouseDetail] = useState<string>('');
  const [customTagTitle, setCustomTagTitle] = useState<string>('');
  const [addressTag, setAddressTag] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);
  const [isMapMoving, setIsMapMoving] = useState<boolean>(false);

  // High Speed Search & Suggestion States
  const [mapSearchQuery, setMapSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [isSearchingMap, setIsSearchingMap] = useState<boolean>(false);

  const searchCacheRef = useRef<{ [key: string]: SearchSuggestion[] }>({});
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const webViewRef = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);
  const geocodeTimeoutRef = useRef<any>(null);

  // Guard so GPS location is applied only once per session
  const hasAppliedGpsOnceRef = useRef<boolean>(false);
  const hasRunMigrationRef = useRef<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [favorites, setFavorites] = useState<{ [key: string]: boolean }>({});
  const [activeBannerIndex, setActiveBannerIndex] = useState<number>(0);
  const [couponApplied, setCouponApplied] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('1');

  const bannerScrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const caterersSectionRef = useRef<View>(null);

  // Helper: format display string from address object
  const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
    if (!addr) return 'Select delivery location';
    if (addr.houseDetails && addr.houseDetails.trim().length > 0) {
      return `${addr.houseDetails}, ${addr.fullAddress}`;
    }
    return addr.fullAddress || 'Select delivery location';
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

  // Fetch dynamic chefs from backend
  const fetchDynamicChefs = async () => {
    try {
      setChefsLoading(true);
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

  // Load User Data & Scoped Saved Addresses from MongoDB / Storage
  const loadUserDataAndAddresses = async () => {
    try {
      let activeUid = '';
      let loadedActive: ActiveAddress | null = null;

      const cachedUser = await getUser();
      if (cachedUser) {
        setCurrentUser(cachedUser);
        activeUid = cachedUser.id || cachedUser._id || '';
        setCurrentUserId(activeUid);
        if (cachedUser.name && cachedUser.name.trim().length > 0) {
          setUserName(cachedUser.name.trim());
        }

        if (cachedUser.activeAddress && cachedUser.activeAddress.fullAddress) {
          loadedActive = cachedUser.activeAddress;
          setActiveAddress(cachedUser.activeAddress);
          setLocationDisplay(formatAddressDisplay(cachedUser.activeAddress));
          if (cachedUser.activeAddress.id) {
            setSelectedAddressId(cachedUser.activeAddress.id);
          }
        } else if (cachedUser.address && cachedUser.address.trim().length > 0) {
          setLocationDisplay(cachedUser.address.trim());
        }

        if (cachedUser.savedAddresses && Array.isArray(cachedUser.savedAddresses)) {
          setSavedAddresses(cachedUser.savedAddresses);
        }
      }

      const freshUser = await refreshUser();
      if (freshUser) {
        setCurrentUser(freshUser);
        const freshUid = freshUser.id || freshUser._id || activeUid;
        setCurrentUserId(freshUid);
        activeUid = freshUid;

        if (freshUser.name && freshUser.name.trim().length > 0) {
          setUserName(freshUser.name.trim());
        }

        if (freshUser.activeAddress && freshUser.activeAddress.fullAddress) {
          loadedActive = freshUser.activeAddress;
          setActiveAddress(freshUser.activeAddress);
          setLocationDisplay(formatAddressDisplay(freshUser.activeAddress));
          if (freshUser.activeAddress.id) {
            setSelectedAddressId(freshUser.activeAddress.id);
          }
        } else if (freshUser.address && freshUser.address.trim().length > 0) {
          setLocationDisplay(freshUser.address.trim());
        }

        if (!hasRunMigrationRef.current) {
          hasRunMigrationRef.current = true;
          const cleaned = await migrateAddressSystemV2IfNeeded(freshUid, loadedActive);
          setSavedAddresses(cleaned);
        } else if (freshUser.savedAddresses && Array.isArray(freshUser.savedAddresses)) {
          setSavedAddresses(freshUser.savedAddresses);
        }
      } else if (activeUid && !hasRunMigrationRef.current) {
        hasRunMigrationRef.current = true;
        const cleaned = await migrateAddressSystemV2IfNeeded(activeUid, loadedActive);
        setSavedAddresses(cleaned);
      }
    } catch (error) {
      console.log('Error loading logged in user data:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadUserDataAndAddresses();
      fetchDynamicChefs();
      fetchCartCount();
    }, [])
  );

  // Check Location Services & Permissions
  const checkLocationStatusAndPrompt = async () => {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const { status } = await Location.getForegroundPermissionsAsync();

      if (!servicesEnabled || status !== 'granted') {
        setIsPermissionPopupVisible(true);
      } else {
        setIsPermissionPopupVisible(false);
        if (!hasAppliedGpsOnceRef.current) {
          fetchCurrentLocationDynamically();
        }
      }
    } catch (e) {
      setIsPermissionPopupVisible(true);
    }
  };

  useEffect(() => {
    checkLocationStatusAndPrompt();
  }, []);

  // Persist saved addresses + optional new active address
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

  /**
   * Fetch current GPS location and set it as activeAddress ONLY.
   */
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

      mapCoordsRef.current = coords;
      setMapCoords(coords);

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
      setPinnedAddress(fullLocation);
      setSelectedAddressId(gpsActive.id || '');

      await updateUserAddress({
        activeAddress: gpsActive,
        address: formatAddressDisplay(gpsActive),
      });

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

  // Handle "Allow Location Access" Action
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

  // Live Geocoding on Map Drag End
  const handleMapMoved = (lat: number, lng: number) => {
    setIsMapMoving(false);
    mapCoordsRef.current = { latitude: lat, longitude: lng };
    setIsReverseGeocoding(true);

    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }

    geocodeTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (results && results.length > 0) {
          const item = results[0];
          const road = item.street || item.name || item.district || item.subregion || '';
          const cityArea = item.city || item.subregion || item.region || '';
          const formatted = [road, cityArea].filter(Boolean).join(', ') || 'Selected Location';
          setPinnedAddress(formatted);
        } else {
          setPinnedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
        }
      } catch (err) {
        setPinnedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
      } finally {
        setIsReverseGeocoding(false);
      }
    }, 350);
  };

  // Ultra-Fast Telangana Address Search
  const handleSearchAddressChange = (text: string) => {
    setMapSearchQuery(text);
    const cleanText = text.trim();

    if (!cleanText) {
      setSearchResults([]);
      setIsSearchingMap(false);
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      return;
    }

    const cacheKey = cleanText.toLowerCase();
    if (searchCacheRef.current[cacheKey]) {
      setSearchResults(searchCacheRef.current[cacheKey]);
      setIsSearchingMap(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setIsSearchingMap(true);

      try {
        const queryWithState = `${cleanText}, Telangana`;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            queryWithState
          )}&format=json&countrycodes=in&viewbox=77.2,19.9,81.8,15.8&bounded=1&limit=5&addressdetails=0`,
          {
            signal: controller.signal,
            headers: {
              'User-Agent': 'FoodDeliverySpeedEngine/2.0',
            },
          }
        );
        const data = await res.json();
        const results = data || [];
        searchCacheRef.current[cacheKey] = results;
        setSearchResults(results);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setSearchResults([]);
        }
      } finally {
        setIsSearchingMap(false);
      }
    }, 180);
  };

  // Select Search Result -> Pan Real Map
  const handleSelectSearchResult = (item: SearchSuggestion) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    mapCoordsRef.current = { latitude: lat, longitude: lon };
    setPinnedAddress(item.display_name);
    setSearchResults([]);
    setMapSearchQuery('');

    if (webViewRef.current && webViewRef.current.injectJavaScript) {
      webViewRef.current.injectJavaScript(`
        if (window.map) {
          window.map.panTo([${lat}, ${lon}], { animate: true, duration: 0.8 });
        }
        true;
      `);
    }
  };

  const handleRecenterToGPS = async () => {
    try {
      setIsReverseGeocoding(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant location permission to detect GPS.');
        setIsReverseGeocoding(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;

      mapCoordsRef.current = { latitude: lat, longitude: lon };

      if (webViewRef.current && webViewRef.current.injectJavaScript) {
        webViewRef.current.injectJavaScript(`
          if (window.map) {
            window.map.panTo([${lat}, ${lon}], { animate: true, duration: 0.8 });
          }
          true;
        `);
      }
      handleMapMoved(lat, lon);
    } catch (e) {
      setIsReverseGeocoding(false);
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
    setPinnedAddress(item.fullAddress);
    setMapCoords({ latitude: item.latitude, longitude: item.longitude });
    mapCoordsRef.current = { latitude: item.latitude, longitude: item.longitude };
    setIsAddressSheetVisible(false);

    await updateUserAddress({
      activeAddress: newActive,
      address: formatAddressDisplay(newActive),
    });
  };

  const handleOpenEditAddress = (item: SavedAddress) => {
    setEditingAddressId(item.id);
    setPinnedAddress(item.fullAddress);
    setHouseDetail(item.houseDetails || '');
    setAddressTag(item.tag);
    if (item.tag === 'Other') {
      setCustomTagTitle(item.title);
    } else {
      setCustomTagTitle('');
    }
    setMapCoords({ latitude: item.latitude, longitude: item.longitude });
    mapCoordsRef.current = { latitude: item.latitude, longitude: item.longitude };
    setSearchResults([]);
    setMapSearchQuery('');
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
          },
        },
      ]
    );
  };

  const handleOpenAddNewAddress = () => {
    setEditingAddressId(null);
    setHouseDetail('');
    setCustomTagTitle('');
    setAddressTag('Home');
    setSearchResults([]);
    setMapSearchQuery('');
    setIsAddressSheetVisible(false);
    setIsMapModalVisible(true);
  };

  const handleConfirmLocation = async () => {
    if (pinnedAddress && pinnedAddress !== 'Locating address...') {
      const trimmedHouse = houseDetail.trim();
      const title =
        addressTag === 'Other' && customTagTitle.trim().length > 0
          ? customTagTitle.trim()
          : addressTag;

      if (editingAddressId) {
        const updated = savedAddresses.map((a) => {
          if (a.id === editingAddressId) {
            return {
              ...a,
              title,
              houseDetails: trimmedHouse || undefined,
              fullAddress: pinnedAddress,
              latitude: mapCoordsRef.current.latitude,
              longitude: mapCoordsRef.current.longitude,
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
          latitude: mapCoordsRef.current.latitude,
          longitude: mapCoordsRef.current.longitude,
          tag: addressTag,
          updatedAt: new Date().toISOString(),
        };

        await persistSavedAddresses(updated, newActive);
        setSelectedAddressId(editingAddressId);
      } else {
        const duplicate = isAddressDuplicate(
          savedAddresses,
          pinnedAddress,
          trimmedHouse,
          mapCoordsRef.current.latitude,
          mapCoordsRef.current.longitude
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
            latitude: mapCoordsRef.current.latitude,
            longitude: mapCoordsRef.current.longitude,
            tag: addressTag,
            updatedAt: new Date().toISOString(),
          };
          await persistSavedAddresses(updated, newActive);
          setSelectedAddressId(duplicate.id);
        } else {
          const newAddressItem: SavedAddress = {
            id: `addr_${Date.now()}`,
            title,
            houseDetails: trimmedHouse || undefined,
            fullAddress: pinnedAddress,
            latitude: mapCoordsRef.current.latitude,
            longitude: mapCoordsRef.current.longitude,
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
        }
      }
    }
    setEditingAddressId(null);
    setIsMapModalVisible(false);
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

  const handleCategoryPress = (item: CategoryItem) => {
    setSelectedCategory(item.id);
    const isMealBox = item.id === '1' || item.name.includes('Meal Box');
    const isCatering = item.id === '2' || item.name.includes('Catering');

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
    } else if (item.id === '5' || item.name.includes('View All')) {
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

  // Fully dynamic and robust filter & search matching logic
  const filteredChefs = chefsData.filter((chef) => {
    // 1. Search Query Filter (name, specialty/cuisine, or location)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const chefName = (chef.name || '').toLowerCase();
      const chefSpecialty = (chef.specialty || '').toLowerCase();
      const chefLocation = (chef.locationText || '').toLowerCase();
      
      const matchesSearch = chefName.includes(q) || chefSpecialty.includes(q) || chefLocation.includes(q);
      if (!matchesSearch) return false;
    }

    // 2. Filter Tag Condition (Veg, Non Veg, Biryani, North Indian, All)
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
      () => {}
    );
  };

  const detailedMapHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { -webkit-tap-highlight-color: transparent; outline: none; }
          html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background-color: #F8FAFC; }
          .leaflet-control-attribution { display: none !important; }
          .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          
          .custom-zoom-panel {
            position: absolute;
            right: 14px;
            top: 14px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .glass-zoom-btn {
            width: 36px;
            height: 36px;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-radius: 12px;
            border: 1px solid rgba(226, 232, 240, 0.8);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
            color: #1E293B;
            font-size: 19px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            user-select: none;
            transition: all 0.15s ease;
          }
          .glass-zoom-btn:active {
            transform: scale(0.92);
            background: #F1F5F9;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <div class="custom-zoom-panel">
          <div class="glass-zoom-btn" onclick="map.zoomIn()">+</div>
          <div class="glass-zoom-btn" onclick="map.zoomOut()">−</div>
        </div>
        <script>
          var map = L.map('map', {
            center: [${mapCoords.latitude}, ${mapCoords.longitude}],
            zoom: 16,
            zoomControl: false,
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true
          });

          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            minZoom: 10,
            subdomains: 'abcd'
          }).addTo(map);

          map.on('movestart', function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MOVE_START' }));
            }
          });

          map.on('moveend', function() {
            var center = map.getCenter();
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MOVE_END',
                lat: center.lat,
                lng: center.lng
              }));
            }
          });
        </script>
      </body>
    </html>
  `;
  // ─── Chef role check (no loader — smooth back navigation) ───
  const [isChefUser, setIsChefUser] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const checkRole = async () => {
        try {
          // Cached only — no network, no flicker
          const user = await getUser();
          if (active) setIsChefUser(!!user?.isChef);
        } catch {
          if (active) setIsChefUser(false);
        }
      };
      checkRole();
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
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
              <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.75}>
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
                {greeting}, <Text style={styles.userNameText}>{userName}!</Text> 👋
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
              {BANNER_SLIDES.map((slide) => (
                <View key={slide.id} style={styles.bannerSlideCard}>
                  <View style={styles.bannerLeftSection}>
                    <View style={styles.mealBadgePill}>
                      <View style={styles.badgeGreenDot} />
                      <Text style={styles.mealBadgeText}>{slide.badge}</Text>
                    </View>

                    <Text style={styles.bannerTitlePrimary}>{slide.titlePrimary}</Text>
                    <Text style={styles.bannerTitleSecondary}>{slide.titleSecondary}</Text>
                    <Text style={styles.bannerSubtitle}>{slide.tagline}</Text>

                    <TouchableOpacity
                      style={styles.bannerExploreBtn}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({
                          pathname: '/screens/AllChefCards',
                          params: { fromCategory: 'Meal Box', filterMealBox: 'true' },
                        })
                      }
                    >
                      <Text style={styles.bannerExploreBtnText}>Explore Plans</Text>
                      <Feather name="arrow-right" size={13} color="#111813" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.bannerRightSection}>
                    <Image
                      source={{ uri: slide.image }}
                      style={styles.bannerFoodImage}
                      resizeMode="cover"
                    />

                    <View style={styles.startsAtBadge}>
                      <Text style={styles.startsAtLabel}>STARTS AT</Text>
                      <Text style={styles.startsAtPrice}>₹{slide.price}</Text>
                      <Text style={styles.startsAtDuration}>/week</Text>
                    </View>
                  </View>
                </View>
              ))}
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
          {/* ─── 5-Column Quick Category Grid ─── */}
          <View style={styles.categoryGridSection}>
            <View style={styles.categoryGridRow}>
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
                        <View style={styles.categoryHotBadge}>
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
            </View>
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
                <Text style={styles.couponHeading}>Flat 15% OFF on your first order</Text>
                <View style={styles.couponCodeRow}>
                  <Text style={styles.useCodeLabel}>Use code: </Text>
                  <View style={styles.dashedCodeBox}>
                    <Text style={styles.dashedCodeText}>KATBOX15</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.applyNowBtn, couponApplied && styles.applyNowBtnApplied]}
                onPress={handleApplyCoupon}
                activeOpacity={0.85}
              >
                <Text style={styles.applyNowBtnText}>
                  {couponApplied ? 'Applied' : 'Apply Now'}
                </Text>
                {!couponApplied && (
                  <Feather name="arrow-right" size={12} color="#451A03" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── Dynamic Top Home Made Caterers Section ─── */}
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
        </View>
      </ScrollView>

      {/* ─── SCREEN-OPEN LOCATION PERMISSION PROMPT MODAL ─── */}
      <Modal
        visible={isPermissionPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
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
              {/* ── Active Address Section ── */}
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

              {/* ── Saved Addresses Section ── */}
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

      {/* ─── REAL HALF-SCREEN MAP MODAL ─── */}
      <Modal
        visible={isMapModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setEditingAddressId(null);
          setIsMapModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.realMapModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

          <View style={styles.realMapTopHeader}>
            <View style={styles.realMapHeaderRow}>
              <TouchableOpacity
                style={styles.realMapBackBtn}
                onPress={() => {
                  setEditingAddressId(null);
                  setIsMapModalVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={22} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.realMapSearchInputWrapper}>
                <Feather name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.realMapSearchInput}
                  placeholder="Search street, area in Telangana..."
                  placeholderTextColor="#94A3B8"
                  value={mapSearchQuery}
                  onChangeText={handleSearchAddressChange}
                />
                {isSearchingMap && (
                  <ActivityIndicator size="small" color="#15803D" style={{ marginRight: 6 }} />
                )}
                {mapSearchQuery.length > 0 && !isSearchingMap && (
                  <TouchableOpacity onPress={() => handleSearchAddressChange('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {searchResults.length > 0 && (
              <View style={styles.searchResultsDropdown}>
                {searchResults.map((item: SearchSuggestion) => (
                  <TouchableOpacity
                    key={item.place_id}
                    style={styles.searchResultItemRow}
                    activeOpacity={0.8}
                    onPress={() => handleSelectSearchResult(item)}
                  >
                    <Ionicons name="location-outline" size={18} color="#15803D" style={{ marginRight: 10 }} />
                    <Text style={styles.searchResultItemText} numberOfLines={2}>
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.halfScreenMapContainer}>
            <SafeMapWebView
              ref={webViewRef}
              source={{ html: detailedMapHTML }}
              style={StyleSheet.absoluteFillObject}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onMessage={(event: any) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'MOVE_START') {
                    setIsMapMoving(true);
                    setIsReverseGeocoding(true);
                  } else if (data.type === 'MOVE_END' && data.lat && data.lng) {
                    handleMapMoved(data.lat, data.lng);
                  }
                } catch (e) {
                  // Fallback
                }
              }}
            />

            <View style={styles.centerFixedPinOverlay} pointerEvents="none">
              <View style={[styles.pinTooltipBubble, isMapMoving && styles.pinTooltipBubbleActive]}>
                <View style={styles.pinDotIndicator} />
                <Text style={styles.pinTooltipBubbleText}>
                  {isReverseGeocoding ? 'Locating address...' : 'Delivering here'}
                </Text>
              </View>
              <View style={[styles.pinIconWrapper, isMapMoving && styles.pinIconWrapperElevated]}>
                <Ionicons name="location-sharp" size={34} color="#15803D" />
                <View style={styles.pinCenterCoreDot} />
              </View>
              <View style={[styles.pinRadarRing, isMapMoving && styles.pinRadarRingActive]} />
              <View style={styles.pinGroundShadowDot} />
            </View>

            <TouchableOpacity
              style={styles.mapGpsRecenterBtn}
              activeOpacity={0.85}
              onPress={handleRecenterToGPS}
            >
              <Ionicons name="locate" size={21} color="#15803D" />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomLocationCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.bottomSheetScrollContent}
            >
              <View style={styles.pinnedAddressSummaryRow}>
                <View style={styles.pinnedAddressIconBox}>
                  <Ionicons name="location" size={22} color="#15803D" />
                </View>

                <View style={styles.pinnedAddressDetailsCol}>
                  <View style={styles.pinnedAddressHeaderFlex}>
                    <Text style={styles.pinnedAddressLabel}>
                      {editingAddressId ? 'Edit Selected Location' : 'Selected Delivery Area'}
                    </Text>
                    {isReverseGeocoding && (
                      <ActivityIndicator size="small" color="#15803D" style={{ marginLeft: 8 }} />
                    )}
                  </View>
                  <Text style={styles.pinnedAddressFullString} numberOfLines={2}>
                    {pinnedAddress}
                  </Text>
                </View>
              </View>

              <View style={styles.doorNumberSection}>
                <Text style={styles.inputFieldTitle}>HOUSE / FLAT / BLOCK NO. & LANDMARK</Text>
                <View style={styles.doorNumberInputWrapper}>
                  <MaterialCommunityIcons name="home-city-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.doorNumberInput}
                    placeholder="e.g. Flat 402, Royal Residency, Near Metro Pillar 12"
                    placeholderTextColor="#94A3B8"
                    value={houseDetail}
                    onChangeText={setHouseDetail}
                  />
                  {houseDetail.length > 0 && (
                    <TouchableOpacity onPress={() => setHouseDetail('')}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.addressTagContainer}>
                <Text style={styles.addressTagTitle}>SAVE ADDRESS AS</Text>
                <View style={styles.addressTagRow}>
                  {(['Home', 'Work', 'Other'] as const).map((tag) => {
                    const isSelected = addressTag === tag;
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[styles.addressTagChip, isSelected && styles.addressTagChipActive]}
                        activeOpacity={0.8}
                        onPress={() => setAddressTag(tag)}
                      >
                        {tag === 'Home' && (
                          <Ionicons
                            name="home"
                            size={13}
                            color={isSelected ? '#FFFFFF' : '#475569'}
                            style={{ marginRight: 5 }}
                          />
                        )}
                        {tag === 'Work' && (
                          <Ionicons
                            name="briefcase"
                            size={13}
                            color={isSelected ? '#FFFFFF' : '#475569'}
                            style={{ marginRight: 5 }}
                          />
                        )}
                        {tag === 'Other' && (
                          <Ionicons
                            name="bookmark"
                            size={13}
                            color={isSelected ? '#FFFFFF' : '#475569'}
                            style={{ marginRight: 5 }}
                          />
                        )}
                        <Text style={[styles.addressTagText, isSelected && styles.addressTagTextActive]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {addressTag === 'Other' && (
                  <View style={[styles.doorNumberInputWrapper, { marginTop: 8 }]}>
                    <Feather name="tag" size={16} color="#64748B" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.doorNumberInput}
                      placeholder="e.g. Mom's Place, Friend's Villa, Gym"
                      placeholderTextColor="#94A3B8"
                      value={customTagTitle}
                      onChangeText={setCustomTagTitle}
                    />
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.confirmAndSetLocationCTA}
                activeOpacity={0.9}
                onPress={handleConfirmLocation}
              >
                <Text style={styles.confirmAndSetLocationCTAText}>
                  {editingAddressId ? 'Update Saved Address' : 'Confirm & Save Address'}
                </Text>
                <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  badgeGreenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ADE80',
    marginRight: 5,
  },
  mealBadgeText: {
    color: '#86EFAC',
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
    color: '#9CA3AF',
    fontSize: 7,
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

  // ─── 5-Column Quick Grid Styles ───
  categoryGridSection: {
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  categoryGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  categoryGridItem: {
    width: (width - 24) / 5,
    alignItems: 'center',
  },
  categoryIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIconCircleActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#15803D',
  },
  categoryHotBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E11D48',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 10,
  },
  categoryHotBadgeText: {
    color: '#FFFFFF',
    fontSize: 6.5,
    fontWeight: '900',
  },
  categoryNameText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    marginTop: 6,
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
  applyNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE68A',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
  },
  applyNowBtnApplied: {
    backgroundColor: '#52B788',
  },
  applyNowBtnText: {
    color: '#451A03',
    fontSize: 10.5,
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

  realMapModalRoot: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  realMapTopHeader: {
    paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 0) + 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 100,
  },
  realMapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  realMapBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  realMapSearchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  realMapSearchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  searchResultsDropdown: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  searchResultItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F1F5F9',
  },
  searchResultItemText: {
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '500',
    flex: 1,
    lineHeight: 17,
  },

  halfScreenMapContainer: {
    height: height * 0.42,
    width: '100%',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  mapFallbackContainer: {
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mapFallbackTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
  },
  mapFallbackSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  centerFixedPinOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  pinTooltipBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 14,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pinTooltipBubbleActive: {
    transform: [{ translateY: -4 }],
    backgroundColor: '#0F172A',
  },
  pinDotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    marginRight: 6,
  },
  pinTooltipBubbleText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pinIconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  pinIconWrapperElevated: {
    transform: [{ translateY: -6 }],
  },
  pinCenterCoreDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    top: 9,
  },
  pinRadarRing: {
    width: 22,
    height: 9,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(21, 128, 61, 0.35)',
    backgroundColor: 'rgba(21, 128, 61, 0.12)',
    marginTop: -8,
  },
  pinRadarRingActive: {
    borderColor: 'rgba(21, 128, 61, 0.65)',
    backgroundColor: 'rgba(21, 128, 61, 0.22)',
    transform: [{ scale: 1.25 }],
  },
  pinGroundShadowDot: {
    width: 8,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginTop: 2,
  },
  mapGpsRecenterBtn: {
    position: 'absolute',
    bottom: 16,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 40,
  },

  bottomLocationCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 18,
  },
  bottomSheetScrollContent: {
    paddingBottom: 10,
  },
  pinnedAddressSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pinnedAddressIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  pinnedAddressDetailsCol: {
    flex: 1,
  },
  pinnedAddressHeaderFlex: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  pinnedAddressLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pinnedAddressFullString: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },

  doorNumberSection: {
    marginBottom: 12,
  },
  inputFieldTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  doorNumberInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  doorNumberInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },

  addressTagContainer: {
    marginBottom: 14,
  },
  addressTagTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  addressTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  addressTagChipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  addressTagText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  addressTagTextActive: {
    color: '#FFFFFF',
  },

  confirmAndSetLocationCTA: {
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
  confirmAndSetLocationCTAText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});