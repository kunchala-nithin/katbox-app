import React, { useEffect, useRef, useState, useCallback } from "react";
import { BlurView } from "expo-blur";
import { refreshUser } from "@/src/lib/authStorage";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  TextInput,
  Platform,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons, MaterialIcons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import api from "@/src/lib/api";
import { useNavigationStore } from "@/src/store/navigationStore";
import HomeChefSkeleton from "@/src/components/skeletons/HomeChefSkeleton";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 16;
const BANNER_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;

const CITIES = ["Hyderabad", "Kukatpally", "Madhapur", "Nizampet" , "Secunderabad", "Ameerpet", "Banjara Hills", "Gachibowli", "Hitech City", "Jubilee Hills"];
const ITEM_HEIGHT = 20;

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MODAL_HEIGHT = 580;

const DEFAULT_COVER_IMAGES = [
  "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800",
  "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800",
  "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800",
];

// Helper to assign a relevant dynamic icon for cuisine filters
const getCuisineIcon = (cuisineName: string) => {
  const name = cuisineName.toLowerCase();
  if (name.includes("biryani")) return "pot-steam";
  if (name.includes("south")) return "food";
  if (name.includes("north")) return "bowl-mix";
  if (name.includes("andhra") || name.includes("telugu") || name.includes("spicy")) return "chili-hot";
  if (name.includes("mughlai")) return "silverware-fork-knife";
  if (name.includes("street")) return "food-turkey";
  if (name.includes("chinese") || name.includes("noodles")) return "noodles";
  if (name.includes("tandoori") || name.includes("grill")) return "fire";
  return "silverware";
};

// Reusable Auto-Scrolling Banner Carousel Component
const ChefBannerCarousel = ({
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
        x: nextIndex * BANNER_WIDTH,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, 3200);

    return () => clearInterval(interval);
  }, [totalBanners]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const computedIndex = Math.round(contentOffsetX / BANNER_WIDTH);
    if (computedIndex >= 0 && computedIndex < totalBanners && computedIndex !== activeIndex) {
      setActiveIndex(computedIndex);
    }
  };

  return (
    <View style={styles.coverImageContainer}>
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
        style={styles.bannerScrollView}
      >
        {bannerList.map((bannerObj: any, bIdx: number) => (
          <Image
            key={bIdx}
            source={{ uri: bannerObj.url || fallbackImage }}
            style={[
              styles.coverImage,
              { width: BANNER_WIDTH },
              isOffline && styles.imageGrayscale,
            ]}
          />
        ))}
      </ScrollView>

      {/* Small Centered Pagination Dots */}
      {totalBanners > 1 && (
        <View style={styles.paginationContainer} pointerEvents="none">
          {bannerList.map((_, dotIdx) => {
            const isActive = dotIdx === activeIndex;
            return (
              <View
                key={dotIdx}
                style={[
                  styles.paginationDot,
                  isActive && styles.paginationDotActive,
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export default function HomeMadeCaterers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { fromCategory, filterMealBox, filterCatering, targetChefId } = params;

  const translateY = useRef(new Animated.Value(0)).current;

  const [index, setIndex] = useState(0);
  const [isChef, setIsChef] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [DATA, setDATA] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("Rating");
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [showCuisineDropdown, setShowCuisineDropdown] = useState(false);
  const [expandedCuisines, setExpandedCuisines] = useState<Record<string, boolean>>({});

  const drawerAnim = useRef(new Animated.Value(0)).current;
  const [showDrawer, setShowDrawer] = useState(false);

  // Category Modal States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedChef, setSelectedChef] = useState<any>(null);
  const [chefCategories, setChefCategories] = useState<any[]>([]);
  const [chefMenus, setChefMenus] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [isModalOpening, setIsModalOpening] = useState(false);
  const hasTargetAutonavigated = useRef(false);

  const modalAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  const { setNavigationContext } = useNavigationStore();

  const toggleExpandCuisines = (chefId: string) => {
    setExpandedCuisines((prev) => ({
      ...prev,
      [chefId]: !prev[chefId],
    }));
  };

  const openDrawer = () => {
    setShowDrawer(true);
    Animated.spring(drawerAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowDrawer(false));
  };

  const openCategoryModal = async (chef: any) => {
    if (isModalOpening) return;

    setIsModalOpening(true);

    setChefCategories([]);
    setChefMenus([]);
    setCategoriesLoading(true);
    setSelectedChef(null);

    setTimeout(() => {
      setSelectedChef(chef);
      setShowCategoryModal(true);

      const fetchModalData = async () => {
        try {
          const [catRes, menuRes] = await Promise.all([
            api.get(`/api/chef-categories/chef/${chef.id}`),
            api.get(`/api/chef-categories/menu/chef/${chef.id}`)
          ]);
          setChefCategories(catRes.data || []);
          setChefMenus(menuRes.data || []);
        } catch (err) {
          console.log("Error fetching chef modal content packages:", err);
          setChefCategories([]);
          setChefMenus([]);
        } finally {
          setCategoriesLoading(false);
        }
      };
      fetchModalData();

      Animated.sequence([
        Animated.timing(cardScale, {
          toValue: 0.93,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.spring(modalAnim, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
            speed: 15,
          }),
          Animated.spring(cardScale, {
            toValue: 1,
            useNativeDriver: true,
            bounciness: 8,
            speed: 15,
          }),
        ]),
      ]).start(() => {
        setIsModalOpening(false);
      });
    }, 80);
  };

  const closeCategoryModal = () => {
    setIsModalOpening(true);
    Animated.timing(modalAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      setShowCategoryModal(false);

      setTimeout(() => {
        setSelectedChef(null);
        setChefCategories([]);
        setChefMenus([]);
        cardScale.setValue(1);
        modalAnim.setValue(SCREEN_HEIGHT);
        setIsModalOpening(false);
      }, 300);
    });
  };

  const drawerTranslate = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get("window").width, 0],
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (index + 1) % CITIES.length;
      Animated.timing(translateY, {
        toValue: -next * ITEM_HEIGHT,
        duration: 400,
        useNativeDriver: true,
      }).start();
      setIndex(next);
    }, 2000);

    return () => clearInterval(interval);
  }, [index]);

  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        try {
          const freshUser = await refreshUser();
          if (freshUser) {
            setIsChef(!!freshUser.isChef);
            setCurrentUser(freshUser);
          }
          const meRes = await api.get("/auth/me");
          if (meRes.data && meRes.data.user) {
            setCurrentUser(meRes.data.user);
          }
        } catch (err) {
          console.log("User load error:", err);
        }
      };
      loadUser();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      fetchChefs();
    }, [])
  );

  const fetchChefs = async () => {
    try {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const res = await api.get("/api/chefs");

      const formatted = res.data.chefs.map((chef: any, i: number) => {
        const hasBanners = chef.banners && chef.banners.length > 0;
        const resolvedCover = hasBanners
          ? chef.banners[0].url
          : chef.coverImage || DEFAULT_COVER_IMAGES[i % DEFAULT_COVER_IMAGES.length];

        return {
          id: chef._id,
          name: chef.name || "Chef",
          expText: chef.exp ? `${chef.exp} yrs experience` : "12 yrs experience",
          locationText: chef.location || "3.1 km",
          specialty: chef.specialty || "South Indian, North Indian, Andhra Meals, Biryani, Mughlai, Street Food",
          rating: chef.rating ? Number(chef.rating) : 4.8,
          ratingCount: chef.ratingCount ? String(chef.ratingCount) : "120",
          orderCount: chef.orderCount ? String(chef.orderCount) : "98",
          priceValue: chef.price !== undefined && chef.price !== null ? Number(chef.price) : 139,
          price: `Starts @ ₹${chef.price || 139}`,
          avatar: chef.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
          coverImage: resolvedCover,
          banners: chef.banners || [],
          foodType: chef.foodType || "BOTH",
          isAvailable: chef.isAvailable ?? true,
        };
      });

      setDATA(formatted);

      // If user came from a specific caterer card on Home.tsx, auto-navigate to ChefInfoScreen
      if (targetChefId && !hasTargetAutonavigated.current) {
        const targetChef = formatted.find((c: any) => c.id === targetChefId);
        if (targetChef && targetChef.isAvailable) {
          hasTargetAutonavigated.current = true;
          router.push({
            pathname: "/screens/ChefInfoScreen",
            params: {
              id: targetChef.id,
              chefId: targetChef.id,
              chefName: targetChef.name,
              name: targetChef.name,
              userId: currentUser?.id || currentUser?._id || "",
              userName: currentUser?.name || "",
              expText: targetChef.expText,
              locationText: targetChef.locationText,
              specialty: targetChef.specialty,
              rating: String(targetChef.rating),
              price: targetChef.price,
              avatar: targetChef.avatar,
              coverImage: targetChef.coverImage,
              banners: JSON.stringify(targetChef.banners || []),
              foodType: targetChef.foodType,
              isAvailable: String(targetChef.isAvailable),
            },
          });
        }
      }
    } catch (err) {
      console.log("Fetch chefs error", err);
    } finally {
      setLoading(false);
    }
  };

  const getFoodTypeIcon = (type: string) => {
    if (type === "VEG") {
      return (
        <View style={[styles.typeIconOutline, { borderColor: "#15803D" }]}>
          <View style={[styles.typeIconDot, { backgroundColor: "#15803D" }]} />
        </View>
      );
    }
    if (type === "NONVEG") {
      return (
        <View style={[styles.typeIconOutline, { borderColor: "#DC2626" }]}>
          <View style={[styles.typeIconDot, { backgroundColor: "#DC2626" }]} />
        </View>
      );
    }
    return (
      <View style={styles.dualTypeContainer}>
        <View style={[styles.typeIconOutline, { borderColor: "#15803D" }]}>
          <View style={[styles.typeIconDot, { backgroundColor: "#15803D" }]} />
        </View>
        <View style={[styles.typeIconOutline, { borderColor: "#DC2626" }]}>
          <View style={[styles.typeIconDot, { backgroundColor: "#DC2626" }]} />
        </View>
      </View>
    );
  };

  const handleChefCardPress = (item: any) => {
    if (!item.isAvailable) return;

    // Catering category flow -> Navigates to CateringMealPlans
    if (fromCategory === "Catering" || filterCatering === "true") {
      router.push({
        pathname: "/screens/CateringMealPlans",
        params: {
          id: item.id,
          chefId: item.id,
          chefName: item.name,
          name: item.name,
          userId: currentUser?.id || currentUser?._id || "",
          userName: currentUser?.name || "",
          rating: String(item.rating),
          location: item.locationText || "Hyderabad",
          image: item.avatar,
          isAvailable: String(item.isAvailable),
          fromCategory: "Catering",
        },
      });
      return;
    }

    // Meal Box category flow -> Go DIRECTLY to MealBoxPlans (skip ChefInfoScreen)
    if (fromCategory === "Meal Box" || filterMealBox === "true") {
      router.push({
        pathname: "/screens/MealBoxPlans",
        params: {
          id: item.id,
          chefId: item.id,
          chefName: item.name,
          userId: currentUser?.id || currentUser?._id || "",
          userName: currentUser?.name || "",
          location: item.locationText || "Hyderabad",
          chefImage: item.avatar,
          avatar: item.avatar,
          rating: String(item.rating),
          fromCategory: "Meal Box",
          filterMealBox: "true",
        },
      });
      return;
    }

    // Regular flow -> Navigates to ChefInfoScreen
    router.push({
      pathname: "/screens/ChefInfoScreen",
      params: {
        id: item.id,
        chefId: item.id,
        chefName: item.name,
        name: item.name,
        userId: currentUser?.id || currentUser?._id || "",
        userName: currentUser?.name || "",
        expText: item.expText,
        locationText: item.locationText,
        specialty: item.specialty,
        rating: String(item.rating),
        price: item.price,
        avatar: item.avatar,
        coverImage: item.coverImage,
        banners: JSON.stringify(item.banners || []),
        foodType: item.foodType,
        isAvailable: String(item.isAvailable),
        fromCategory: fromCategory,
        filterMealBox: filterMealBox,
      },
    });
  };

  // Dynamically extract unique cuisines from all chef specialties
  const availableCuisines = Array.from(
    new Set(
      DATA.flatMap((item) =>
        (item.specialty || "")
          .split(",")
          .map((c: string) => c.trim())
          .filter(Boolean)
      )
    )
  ).sort() as string[];

  const filteredData = DATA.filter((item) => {
    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.specialty.toLowerCase().includes(query) ||
        item.locationText.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // 2. Active Filter Pill Condition
    if (selectedFilter === "Veg") {
      if (item.foodType !== "VEG") return false;
    }

    // 3. Dynamic Cuisine Filter Condition
    if (selectedFilter === "Cuisine" && selectedCuisine) {
      const cuisinesList = (item.specialty || "")
        .split(",")
        .map((c: string) => c.trim().toLowerCase());
      if (!cuisinesList.includes(selectedCuisine.toLowerCase())) return false;
    }

    return true;
  }).sort((a, b) => {
    if (selectedFilter === "Rating") {
      return b.rating - a.rating;
    }
    return 0;
  });

  const getHeaderTitle = () => {
    if (fromCategory === "Meal Box") return "Meal Box Chefs";
    if (fromCategory === "Catering") return "Catering Chefs";
    return "All Chefs";
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />

      {/* ─── APP HEADER ─── */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerIconButton} 
          onPress={() => router.replace("/Home")}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerTitleCenter}>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          <View style={styles.liveLocationIndicator}>
            <View style={styles.livePulseDot} />
            <Text style={styles.headerSubtitle}>Verified Kitchens</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.headerIconButton} 
          onPress={isChef ? openDrawer : () => {}}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {/* ─── GLASSMORPHIC SEARCH BAR ─── */}
      <View style={styles.searchBoxWrapper}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#166534" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Chef, Location,Cuisine:"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearSearchBtn}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : (
            <View style={styles.cityContainer}>
              <Animated.View style={{ transform: [{ translateY }] }}>
                {CITIES.map((city, i) => (
                  <View key={i} style={{ height: ITEM_HEIGHT, justifyContent: "center" }}>
                    <Text style={styles.cityText}>"{city}"</Text>
                  </View>
                ))}
              </Animated.View>
            </View>
          )}
        </View>
      </View>

      {/* ─── INTERACTIVE FILTER PILLS ─── */}
      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity 
            style={[styles.filterButton, selectedFilter === "Rating" && styles.filterButtonActive]}
            onPress={() => {
              setSelectedFilter("Rating");
              setSelectedCuisine(null);
              setShowCuisineDropdown(false);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="star" size={13} color={selectedFilter === "Rating" ? "#FFF" : "#EAB308"} style={{ marginRight: 4 }} />
            <Text style={[styles.filterButtonText, selectedFilter === "Rating" && styles.filterButtonTextActive]}>Top Rated</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.filterButton, (selectedFilter === "Cuisine" || selectedCuisine !== null) && styles.filterButtonActive]}
            onPress={() => {
              setSelectedFilter("Cuisine");
              setShowCuisineDropdown(prev => !prev);
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="food-fork-drink" size={13} color={(selectedFilter === "Cuisine" || selectedCuisine !== null) ? "#FFF" : "#166534"} style={{ marginRight: 4 }} />
            <Text style={[styles.filterButtonText, (selectedFilter === "Cuisine" || selectedCuisine !== null) && styles.filterButtonTextActive]}>
              {selectedCuisine ? selectedCuisine : "Cuisines"}
            </Text>
            <Feather name={showCuisineDropdown ? "chevron-up" : "chevron-down"} size={13} color={(selectedFilter === "Cuisine" || selectedCuisine !== null) ? "#FFF" : "#64748B"} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.filterButton, selectedFilter === "Veg" && styles.filterButtonActive]}
            onPress={() => {
              setSelectedFilter(selectedFilter === "Veg" ? "" : "Veg");
              setSelectedCuisine(null);
              setShowCuisineDropdown(false);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.typeIconOutline, { borderColor: selectedFilter === "Veg" ? "#FFF" : "#15803D", width: 12, height: 12, marginRight: 4 }]}>
              <View style={[styles.typeIconDot, { backgroundColor: selectedFilter === "Veg" ? "#FFF" : "#15803D", width: 5, height: 5 }]} />
            </View>
            <Text style={[styles.filterButtonText, selectedFilter === "Veg" && styles.filterButtonTextActive]}>Pure Veg</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.filterButton, styles.moreFiltersBtn]}
            onPress={() => {
              setSelectedFilter("");
              setSelectedCuisine(null);
              setShowCuisineDropdown(false);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="filter" size={13} color="#0F172A" style={{ marginRight: 4 }} />
            <Text style={styles.filterButtonText}>All</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ─── DYNAMIC CUISINE DROPDOWN MENU WITH RESPECTIVE ICONS ─── */}
      {showCuisineDropdown && (
        <View style={styles.cuisineDropdownContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cuisineDropdownScroll}>
            <TouchableOpacity
              style={[styles.cuisineChip, selectedCuisine === null && styles.cuisineChipActive]}
              onPress={() => {
                setSelectedCuisine(null);
                setShowCuisineDropdown(false);
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons 
                name="silverware-variant" 
                size={14} 
                color={selectedCuisine === null ? "#FFF" : "#166534"} 
                style={{ marginRight: 5 }} 
              />
              <Text style={[styles.cuisineChipText, selectedCuisine === null && styles.cuisineChipTextActive]}>All Cuisines</Text>
            </TouchableOpacity>

            {availableCuisines.map((cuisineName) => {
              const isSelected = selectedCuisine === cuisineName;
              const iconName = getCuisineIcon(cuisineName);
              return (
                <TouchableOpacity
                  key={cuisineName}
                  style={[styles.cuisineChip, isSelected && styles.cuisineChipActive]}
                  onPress={() => {
                    setSelectedCuisine(cuisineName);
                    setSelectedFilter("Cuisine");
                    setShowCuisineDropdown(false);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons 
                    name={iconName as any} 
                    size={14} 
                    color={isSelected ? "#FFF" : "#166534"} 
                    style={{ marginRight: 5 }} 
                  />
                  <Text style={[styles.cuisineChipText, isSelected && styles.cuisineChipTextActive]}>{cuisineName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ─── CHEF CARDS LIST ─── */}
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {loading && DATA.length === 0 ? (
          <HomeChefSkeleton />
        ) : filteredData.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#64748B", fontSize: 14, fontWeight: "600" }}>No chefs match your selected filters.</Text>
          </View>
        ) : (
          filteredData.map((item) => {
            const isOffline = !item.isAvailable;
            const isExpanded = !!expandedCuisines[item.id];
            const isLongCuisine = (item.specialty || "").length > 34;

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, isOffline && styles.cardOffline]}
                activeOpacity={0.92}
                onPress={() => handleChefCardPress(item)}
              >
                {/* 1. TOP COVER BANNER WITH AUTO-SCROLL & SMALL DOTS */}
                <View style={styles.coverWrapper}>
                  <ChefBannerCarousel
                    banners={item.banners}
                    fallbackImage={item.coverImage || DEFAULT_COVER_IMAGES[0]}
                    isOffline={isOffline}
                  />

                  {/* Floating Rating Pill at Top-Right */}
                  <View style={styles.ratingBadgeOverlay}>
                    <Ionicons name="star" size={11} color="#FBBF24" />
                    <Text style={styles.ratingBadgeOverlayText}>{item.rating}</Text>
                  </View>

                  {/* Floating Dietary Badge at Bottom-Right */}
                  <View style={styles.dietaryBadgeOverlay}>
                    {getFoodTypeIcon(item.foodType)}
                  </View>

                  {/* Overlapping Chef Avatar */}
                  <View style={styles.avatarOverlayWrapper}>
                    <Image
                      source={{ uri: item.avatar }}
                      style={styles.avatarCircleImage}
                    />
                  </View>
                </View>

                {/* 2. CARD CONTENT DETAILS */}
                <View style={styles.cardContent}>
                  {/* Chef Name & Verified Status */}
                  <View style={styles.chefNameHeadingRow}>
                    <Text style={[styles.chefNameTitle, isOffline && styles.textMuted]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.verifiedInlineBadge}>
                      <MaterialIcons name="verified" size={11} color="#15803D" />
                      <Text style={styles.verifiedInlineBadgeText}>Verified Chef</Text>
                    </View>
                  </View>

                  {/* Experience & Location Info */}
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsText}>{item.expText}</Text>
                    <Text style={styles.dotSeparator}>•</Text>
                    <Text style={styles.detailsText}>{item.locationText}</Text>
                  </View>

                  {/* Specialty / Cuisines */}
                  <View style={styles.cuisineContainer}>
                    <Text
                      style={styles.cuisineText}
                      numberOfLines={isExpanded ? undefined : 1}
                    >
                      {item.specialty}
                    </Text>
                    {isLongCuisine && (
                      <TouchableOpacity
                        activeOpacity={0.6}
                        onPress={() => toggleExpandCuisines(item.id)}
                        style={styles.moreTouch}
                      >
                        <Text style={styles.moreText}>
                          {isExpanded ? " show less" : " ...more"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Pricing Row */}
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricePrefixText}>Starts @ </Text>
                    <Text style={styles.priceAmountText}>₹{item.priceValue}</Text>
                  </View>
                </View>

                {isOffline && (
                  <View style={styles.offlineBadge}>
                    <Text style={styles.offlineText}>🔴 Currently Offline</Text>
                  </View>
                )}
                {isOffline && <View style={styles.fullCardOverlay} />}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ─── CATEGORY BOTTOM SHEET MODAL ─── */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="none"
        onRequestClose={closeCategoryModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeCategoryModal}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          <Animated.View
            style={[
              styles.bottomModal,
              {
                transform: [{ translateY: modalAnim }],
              },
            ]}
          >
            {/* Modal Pull Handle */}
            <View style={styles.modalPullNotch} />

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={closeCategoryModal}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>

            {selectedChef && (
              <Animated.View style={{ transform: [{ scale: cardScale }] }}>
                <View style={styles.mergedChefHeader}>
                  <View style={styles.mergedAvatarWrapper}>
                    <Image
                      source={{ uri: selectedChef.avatar }}
                      style={styles.mergedAvatar}
                    />
                  </View>

                  <View style={styles.mergedRating}>
                    <Ionicons name="star" size={13} color="#FBBF24" />
                    <Text style={styles.mergedRatingText}>{selectedChef.rating}</Text>
                  </View>

                  <View style={styles.mergedContent}>
                    <View style={styles.mergedTitleRow}>
                      <Text style={styles.mergedName}>{selectedChef.name}</Text>
                      <Text style={styles.mergedPrice}>{selectedChef.price}</Text>
                    </View>
                    <Text style={styles.mergedExp}>{selectedChef.expText || selectedChef.exp}</Text>
                  </View>
                </View>
              </Animated.View>
            )}

            <View style={styles.divider} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {categoriesLoading ? (
                <Text style={{ padding: 24, color: "#64748B", textAlign: "center", fontWeight: "600" }}>Loading fresh menus...</Text>
              ) : chefCategories.length > 0 ? (
                <View style={styles.categoryGrid}>
                  {chefCategories.map((cat: any) => {
                    const hasMenu = chefMenus.some((m: any) => 
                      m.categoryId === cat._id || 
                      m.chefCategoryId === cat._id ||
                      m.name?.trim().toLowerCase() === cat.name?.trim().toLowerCase()
                    );

                    return (
                      <TouchableOpacity
                        key={cat._id}
                        style={styles.categoryCard}
                        activeOpacity={0.88}
                        onPress={() => {
                          closeCategoryModal();
                          
                          const targetScreenPath = hasMenu 
                            ? "/screens/CateringMealPlans" 
                            : "/screens/HomeMadeItemScreen";

                          setTimeout(() => {
                            router.push({
                              pathname: targetScreenPath,
                              params: {
                                id: selectedChef?.id,
                                chefId: selectedChef?.id,
                                chefName: selectedChef?.name,
                                userId: currentUser?.id || currentUser?._id || "",
                                userName: currentUser?.name || "",
                                categoryId: cat._id, 
                                name: selectedChef?.name,
                                rating: String(selectedChef?.rating),
                                location: selectedChef?.locationText || "Hyderabad",
                                isAvailable: String(selectedChef?.isAvailable),
                                category: cat.name,
                                hasCatering: String(hasMenu),
                              },
                            });
                          }, 250);
                        }}
                      >
                        <Image
                          source={{ uri: cat.heroImageUrl }}
                          style={styles.categoryImage}
                        />
                        <View style={styles.textContainer}>
                          <Text style={styles.categoryTitle} numberOfLines={2}>{cat.name}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ padding: 40, color: "#64748B", textAlign: "center" }}>
                  No categories added by this chef yet
                </Text>
              )}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ─── DRAWER ─── */}
      {showDrawer && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeDrawer}>
            <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.drawerContainer,
              { transform: [{ translateX: drawerTranslate }] },
            ]}
          >
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.drawerContent}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Chef Management</Text>
                <TouchableOpacity onPress={closeDrawer}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  closeDrawer();
                  setTimeout(() => router.push("/chefManagement/add-chefs"), 250);
                }}
              >
                <Ionicons name="person-add-outline" size={20} color="#fff" />
                <Text style={styles.drawerText}>Add Chef</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  closeDrawer();
                  setTimeout(() => router.push("/chefManagement/add-chefCategory"), 250);
                }}
              >
                <Ionicons name="person-add-outline" size={20} color="#fff" />
                <Text style={styles.drawerText}>Add ChefCategory</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  closeDrawer();
                  setTimeout(() => router.push("/chefManagement/all-orders"), 250);
                }}
              >
                <Ionicons name="person-add-outline" size={20} color="#fff" />
                <Text style={styles.drawerText}>All Orders</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#FAF8F5",
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FAF8F5",
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  liveLocationIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
    marginRight: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#15803D",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  searchBoxWrapper: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  clearSearchBtn: {
    padding: 4,
  },
  cityContainer: {
    height: ITEM_HEIGHT,
    overflow: "hidden",
    position: "absolute",
    right: 14,
  },
  cityText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },

  filterWrapper: {
    marginBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  filterButtonActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  filterButtonText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "700",
  },
  filterButtonTextActive: {
    color: "#FFFFFF",
  },
  moreFiltersBtn: {
    backgroundColor: "#F8FAFC",
  },

  /* CUISINE DROPDOWN STYLES */
  cuisineDropdownContainer: {
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  cuisineDropdownScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  cuisineChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  cuisineChipActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  cuisineChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  cuisineChipTextActive: {
    color: "#FFFFFF",
  },

  /* COMPACT CHEF CARD STYLES */
  card: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardOffline: { opacity: 0.6 },
  imageGrayscale: { opacity: 0.6 },
  fullCardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent", zIndex: 10 },
  
  coverWrapper: {
    width: "100%",
    height: 130,
    position: "relative",
  },
  coverImageContainer: {
    width: "100%",
    height: 130,
    position: "relative",
    backgroundColor: "#F1F5F9",
  },
  bannerScrollView: {
    width: "100%",
    height: "100%",
  },
  coverImage: {
    height: 130,
    resizeMode: "cover",
  },

  /* SMALL BOTTOM-CENTERED PAGINATION DOTS */
  paginationContainer: {
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    zIndex: 4,
  },
  paginationDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  paginationDotActive: {
    width: 12,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: "#FFFFFF",
  },

  ratingBadgeOverlay: {
    position: "absolute",
    top: 9,
    right: 9,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 10,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    zIndex: 5,
  },
  ratingBadgeOverlayText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "900",
  },

  dietaryBadgeOverlay: {
    position: "absolute",
    bottom: 9,
    right: 9,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 3.5,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 5,
  },

  avatarOverlayWrapper: {
    position: "absolute",
    bottom: -22,
    left: 14,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    zIndex: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarCircleImage: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
    resizeMode: "cover",
  },

  cardContent: {
    paddingTop: 26,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  chefNameHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  chefNameTitle: {
    fontSize: 16.5,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
    flex: 1,
  },
  verifiedInlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 2.5,
  },
  verifiedInlineBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#166534",
  },

  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  detailsText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  dotSeparator: {
    color: "#94A3B8",
    fontSize: 11,
    marginHorizontal: 5,
  },

  cuisineContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 6,
  },
  cuisineText: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
    lineHeight: 16,
  },
  moreTouch: {
    paddingVertical: 1,
  },
  moreText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "800",
  },

  pricingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  pricePrefixText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#15803D",
  },
  priceAmountText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#15803D",
  },

  typeIconOutline: {
    borderWidth: 1.4,
    width: 14,
    height: 14,
    borderRadius: 3.5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  typeIconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dualTypeContainer: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },

  textMuted: { color: "#94A3B8" },
  offlineBadge: {
    position: "absolute",
    top: 9,
    left: 9,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 5,
  },
  offlineText: { color: "#FFF", fontSize: 10, fontWeight: "800" },

  /* MODAL STYLES */
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  bottomModal: {
    height: MODAL_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -15 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 25,
  },
  modalPullNotch: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 10,
  },
  modalCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    zIndex: 100,
  },
  mergedChefHeader: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
    paddingTop: 16,
    backgroundColor: "#FFFFFF",
  },
  mergedAvatarWrapper: {
    position: "absolute",
    top: 16,
    left: 20,
    borderRadius: 40,
    padding: 3,
    backgroundColor: "#FFF",
    zIndex: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  mergedAvatar: { width: 64, height: 64, borderRadius: 32 },
  mergedRating: {
    position: "absolute",
    right: 60,
    top: 18,
    backgroundColor: "#0F172A",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 3,
  },
  mergedRatingText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  mergedContent: {
    paddingTop: 72,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  mergedTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mergedName: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  mergedPrice: { fontSize: 15, color: "#166534", fontWeight: "800" },
  mergedExp: { color: "#64748B", fontSize: 13, marginTop: 2, fontWeight: "500" },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  categoryCard: {
    width: "31%",
    marginBottom: 20,
  },
  categoryImage: {
    width: "100%",
    height: 84,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#F1F5F9",
  },
  textContainer: {
    paddingTop: 8,
    alignItems: "center",
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    lineHeight: 15,
  },

  /* DRAWER STYLES */
  drawerContainer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "78%",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    overflow: "hidden",
  },
  drawerContent: { flex: 1, paddingTop: 60, paddingHorizontal: 20 },
  drawerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
  drawerTitle: { fontSize: 18, fontWeight: "800", color: "#FFF" },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  drawerText: { marginLeft: 14, fontSize: 15, fontWeight: "600", color: "#FFF" },
});
