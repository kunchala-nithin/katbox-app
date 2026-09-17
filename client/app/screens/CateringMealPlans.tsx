import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "@/src/lib/api";
import MenuCard from "@/src/components/MenuCard";
import { useNavigationStore } from "@/src/store/navigationStore";

const filterCategories = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const STATUS_BAR_PADDING = Platform.OS === "ios" ? 48 : (StatusBar.currentHeight || 24);
const SCROLL_THRESHOLD = 70;

export default function HomeChefDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { currentContext, setNavigationContext } = useNavigationStore();

  let id = params.id as string | undefined;
  let chefId = params.chefId as string | undefined;
  let chefName = params.chefName as string | undefined;
  let userId = params.userId as string | undefined;
  let userName = params.userName as string | undefined;
  let name = params.name as string | undefined;
  let image = params.image as string | undefined;
  let rating = params.rating as string | undefined;
  let location = params.location as string | undefined;
  let isAvailable = params.isAvailable !== "false";
  let categoryId = params.categoryId as string | undefined;
  let categoryName = params.category as string | undefined;

  // ─── Read incoming address params (forwarded from AllChefCards / ChefInfoScreen) ───
  const incomingActiveAddressParam =
    typeof params.activeAddressParam === "string" ? (params.activeAddressParam as string) : "";
  const incomingSavedAddressesParam =
    typeof params.savedAddressesParam === "string" ? (params.savedAddressesParam as string) : "";

  const forwardAddressParams = () => ({
    activeAddressParam: incomingActiveAddressParam,
    savedAddressesParam: incomingSavedAddressesParam,
  });

  const effectiveChefId = chefId || id || "";
  const effectiveChefName = chefName || name || "";
  const effectiveUserId = userId || "";
  const effectiveUserName = userName || "";

  if (!id && currentContext?.restaurantOrChef) {
    const chef = currentContext.restaurantOrChef;
    id = chef.id || chef._id;
    name = chef.name;
    image = chef.image || chef.cover;
    rating = chef.rating || "4.8";
    location = chef.location || "Hyderabad";
    isAvailable = chef.isAvailable !== false;
    if (chef.selectedCategoryName) {
      categoryName = chef.selectedCategoryName;
    }
  }

  const scrollY = useRef(new Animated.Value(0)).current;
  const [selectedCategory, setSelectedCategory] = useState("Breakfast");
  const [showVegOnly, setShowVegOnly] = useState(false);
  const toggleAnim = useRef(new Animated.Value(0)).current;

  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(Platform.OS === "ios" ? 220 : 205);

  // Tracks whether the header is collapsed. We only flip this when the
  // threshold is crossed so that re-renders stay minimal (and animations
  // remain on the native driver / smooth).
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollapsedRef = useRef(false);

  const isOffline = !isAvailable;

  const handleToggleVeg = () => {
    const nextVal = !showVegOnly;
    setShowVegOnly(nextVal);
    Animated.spring(toggleAnim, {
      toValue: nextVal ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 50,
    }).start();
  };

  const toggleTranslate = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  });

  const fetchChefMenus = async () => {
    if (!effectiveChefId) return;
    try {
      setLoading(true);
      let url = `/api/chef-categories/menu/chef/${effectiveChefId}`;
      if (categoryId) {
        url = `/api/chef-categories/menu/chef/${effectiveChefId}?categoryId=${categoryId}`;
      }
      const res = await api.get(url);
      setMenus(res.data || []);
    } catch (e) {
      console.log("menu error", e);
      setMenus([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveChefId) {
      fetchChefMenus();
    }
  }, [effectiveChefId, categoryId]);

  // 200 ms delay threshold — only show the loading spinner if the initial
  // fetch exceeds 200 ms. This avoids a flash of spinner on fast responses
  // while still providing feedback on slow networks.
  useEffect(() => {
    if (!loading) {
      setShowLoadingIndicator(false);
      return;
    }
    const t = setTimeout(() => setShowLoadingIndicator(true), 200);
    return () => clearTimeout(t);
  }, [loading]);

  // Animated scroll event that also notifies us when the collapse threshold
  // is crossed. setState is only fired on threshold changes → no per-frame
  // re-renders, so scrolling animation stays perfectly smooth.
  const onScroll = useCallback(
    Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        useNativeDriver: true,
        listener: (event: any) => {
          const y = event?.nativeEvent?.contentOffset?.y ?? 0;
          const collapsed = y >= SCROLL_THRESHOLD;
          if (collapsed !== isCollapsedRef.current) {
            isCollapsedRef.current = collapsed;
            setIsCollapsed(collapsed);
          }
        },
      }
    ),
    [scrollY]
  );

  const filteredMenus = menus.filter((m) => {
    const matchesMealType = m.mealType === selectedCategory;
    const matchesCategory =
      !categoryId ||
      m.categoryId === categoryId ||
      m.chefCategoryId === categoryId;

    const isItemNonVeg =
      m.isNonVeg === true ||
      m.isVeg === false ||
      m.foodType?.toLowerCase() === "non-veg" ||
      m.name?.toLowerCase().includes("non-veg") ||
      m.name?.toLowerCase().includes("chicken") ||
      m.name?.toLowerCase().includes("mutton") ||
      m.name?.toLowerCase().includes("fish") ||
      m.category?.toLowerCase().includes("non-veg");

    // When showVegOnly is ON → only veg cards; when OFF → show all (veg + non-veg)
    const matchesVegFilter = showVegOnly ? !isItemNonVeg : true;

    return matchesMealType && matchesCategory && matchesVegFilter;
  });

  const stickyDisplayTitle = effectiveChefName || "Home Chef";
  const stickyDisplaySubtitle = location ? `${location}` : "Home Kitchen";
  const chefAvatar = image
    ? { uri: image as string }
    : { uri: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=150" };
  const displayRating = rating ? (rating as string) : "4.8";

  // ── Smoother / longer interpolation ranges for a gentler collapse ──
  const titleTranslateY = scrollY.interpolate({
    inputRange: [0, 95],
    outputRange: [0, -34],
    extrapolate: "clamp",
  });

  const titleScale = scrollY.interpolate({
    inputRange: [0, 95],
    outputRange: [1, 0.92],
    extrapolate: "clamp",
  });

  const mainHeaderOpacity = scrollY.interpolate({
    inputRange: [0, 55],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const stickyHeaderTranslateY = scrollY.interpolate({
    inputRange: [20, 70],
    outputRange: [22, 0],
    extrapolate: "clamp",
  });

  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [35, 70],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const shadowBorderOpacity = scrollY.interpolate({
    inputRange: [0, 55],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const navigateToMenuItemScreen = (menu: any) => {
    if (!menu) return;

    const chefObject = {
      id: effectiveChefId,
      chefId: effectiveChefId,
      chefName: effectiveChefName,
      name: effectiveChefName,
      image,
      rating,
      location,
      userId: effectiveUserId,
      userName: effectiveUserName,
      selectedCategoryName: categoryName || params.category,
    };

    const resolvedMenuImage = menu.heroImageUrl || menu.image || menu.coverImage || image;
    const finalImageStringUrl = typeof resolvedMenuImage === "object" ? resolvedMenuImage?.uri : resolvedMenuImage;

    const rawPlateItems = menu.items || menu.plateItems || menu.mealItems || menu.dishes || menu.menuItems || [];
    const serializedPlateItems = JSON.stringify(
      rawPlateItems.map((item: any, index: number) => ({
        id: item._id || item.id || String(index),
        name: item.name || item.title || item.itemName || "Course Item",
        image: item.image || item.imageUrl || item.coverImage || "",
      }))
    );

    setNavigationContext({
      serviceType: "homemade",
      previousScreen: "HomeChefDetail",
      restaurantOrChef: chefObject,
      menu: {
        ...menu,
        resolvedImageString: finalImageStringUrl,
      },
    });

    router.push({
      pathname: "/screens/CateringMenuItemScreen",
      params: {
        planId: menu._id || menu.id,
        planName: menu.name || menu.title,
        planPrice: menu.price,
        mealsPerDay: menu.mealsPerDay,
        mealsPerWeek: menu.mealsPerWeek,
        category: menu.category || menu.mealType || categoryName || params.category,
        planImage: finalImageStringUrl,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        userId: effectiveUserId,
        userName: effectiveUserName,
        plateItems: serializedPlateItems,
        menu: JSON.stringify(menu),
        chef: JSON.stringify(chefObject),
        // Forward address params down the chain
        ...forwardAddressParams(),
      },
    });
  };

  const handleBack = () => {
    router.replace({
      pathname: "/screens/AllChefCards",
      params: {
        fromCategory: "Catering",
        filterCatering: "true",
        // Forward address params back so the chain stays intact
        ...forwardAddressParams(),
      },
    });
  };

  const renderVegToggle = (compact = false) => {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleToggleVeg}
        style={[
          compact ? styles.vegToggleContainerCompact : styles.vegToggleContainer,
          showVegOnly ? styles.vegToggleVegBorder : styles.vegToggleOffBorder,
        ]}
      >
        <View
          style={[
            compact ? styles.vegSquareBoxCompact : styles.vegSquareBox,
            showVegOnly ? styles.vegSquareBoxVeg : styles.vegSquareBoxOff,
          ]}
        >
          <View
            style={[
              compact ? styles.vegInnerDotCompact : styles.vegInnerDot,
              showVegOnly ? styles.vegInnerDotVeg : styles.vegInnerDotOff,
            ]}
          />
        </View>

        <Text
          style={[
            compact ? styles.vegToggleTextCompact : styles.vegToggleText,
            showVegOnly ? styles.vegTextVeg : styles.vegTextOff,
          ]}
        >
          Veg
        </Text>

        <View
          style={[
            compact ? styles.switchTrackCompact : styles.switchTrack,
            showVegOnly ? styles.switchTrackVeg : styles.switchTrackOff,
          ]}
        >
          <Animated.View
            style={[
              compact ? styles.switchThumbCompact : styles.switchThumb,
              { transform: [{ translateX: toggleTranslate }] },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <View
        style={styles.fixedHeaderContainer}
        onLayout={(e) => {
          const calculatedHeight = e.nativeEvent.layout.height;
          if (calculatedHeight > 0 && Math.abs(calculatedHeight - headerHeight) > 1) {
            setHeaderHeight(calculatedHeight);
          }
        }}
      >
        <Animated.View style={[styles.headerShadowOverlay, { opacity: shadowBorderOpacity }]} />

        <Animated.View
          style={[
            styles.mainHeaderWrapper,
            {
              opacity: mainHeaderOpacity,
              transform: [{ translateY: titleTranslateY }, { scale: titleScale }],
            },
          ]}
          pointerEvents={isCollapsed ? "none" : "auto"}
        >
          <View style={styles.mainTitleRow}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={handleBack}
              activeOpacity={0.75}
            >
              <Ionicons name="chevron-back" size={20} color="#0D2E22" />
            </TouchableOpacity>
            {renderVegToggle(false)}
          </View>

          <View style={styles.heroTextContainer}>
            <Text style={styles.screenTitle} numberOfLines={1}>
              Choose Your Platter
            </Text>
            <Text style={styles.screenSubtitle} numberOfLines={1}>
              {effectiveChefName
                ? `Fresh homemade ${showVegOnly ? "veg " : ""}meals by ${effectiveChefName}`
                : `Delicious ${showVegOnly ? "veg " : ""}meals prepared with care`}
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.stickyHeaderWrapper,
            {
              opacity: stickyHeaderOpacity,
              transform: [{ translateY: stickyHeaderTranslateY }],
            },
          ]}
          pointerEvents={isCollapsed ? "auto" : "none"}
        >
          <View style={styles.navBarRow}>
            <TouchableOpacity
              style={styles.actionIconButtonCompact}
              onPress={handleBack}
              activeOpacity={0.75}
            >
              <Ionicons name="chevron-back" size={19} color="#0D2E22" />
            </TouchableOpacity>

            <View style={styles.stickyChefContainer}>
              <View style={styles.avatarBorderRing}>
                <Image source={chefAvatar} style={styles.chefAvatar} />
              </View>
              <View style={styles.chefTextContainer}>
                <Text style={styles.stickyTitle} numberOfLines={1}>
                  {stickyDisplayTitle}
                </Text>
                <View style={styles.locationPinRow}>
                  <Ionicons name="location-sharp" size={10} color="#166538" />
                  <Text style={styles.stickySubtitleMini} numberOfLines={1}>
                    {stickyDisplaySubtitle}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={11} color="#FFFFFF" />
              <Text style={styles.ratingText}>{displayRating}</Text>
            </View>

            <View style={{ marginLeft: 8 }}>
              {renderVegToggle(true)}
            </View>
          </View>
        </Animated.View>

        {!isOffline && (
          <View style={styles.pillsOuterWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsScrollContainer}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              overScrollMode="never"
            >
              {filterCategories.map((item, index) => {
                const isSelected = selectedCategory === item;
                return (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.8}
                    onPress={() => setSelectedCategory(item)}
                    style={[
                      styles.pillButton,
                      isSelected ? styles.pillButtonActive : styles.pillButtonInactive,
                    ]}
                  >
                    {isSelected && <View style={styles.activeDotIndicator} />}
                    <Text
                      style={[
                        styles.pillText,
                        isSelected ? styles.pillTextActive : styles.pillTextInactive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 2 }]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        bounces
        decelerationRate="normal"
        overScrollMode="never"
      >
        {loading ? (
          showLoadingIndicator ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#166538" />
              <Text style={styles.loadingSubtitleText}>Loading meals...</Text>
            </View>
          ) : null
        ) : isOffline ? (
          <View style={styles.offlineCard}>
            <View style={styles.premiumOfflineIconWrap}>
              <Ionicons name="moon" size={26} color="#166538" />
            </View>
            <View style={styles.offlinePillHeader}>
              <Text style={styles.offlineBadgeText}>CLOSED FOR TODAY</Text>
            </View>
            <Text style={styles.offlineBigMessage}>
              This kitchen is currently closed.
            </Text>
            <Text style={styles.offlineSubMessage}>
              You can place orders again tomorrow morning.
            </Text>
          </View>
        ) : filteredMenus.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <MaterialIcons name="restaurant" size={28} color="#166538" />
            </View>
            <Text style={styles.emptyTitle}>No Meals Available</Text>
            <Text style={styles.emptySubtitle}>
              There are no {showVegOnly ? "veg " : ""}{selectedCategory.toLowerCase()} items available right now. Please check back later.
            </Text>
          </View>
        ) : (
          filteredMenus.map((menu) => (
            <View key={menu._id || menu.id} style={styles.cardSpacing}>
              <MenuCard
                menu={menu}
                showActions={false}
                compact
                onPress={() => navigateToMenuItemScreen(menu)}
              />
            </View>
          ))
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF8F5",
  },
  fixedHeaderContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FAF8F5",
    zIndex: 20,
    paddingTop: STATUS_BAR_PADDING,
  },
  headerShadowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FAF8F5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(22, 101, 56, 0.10)",
    shadowColor: "#0B261D",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    zIndex: -1,
  },
  mainHeaderWrapper: {
    width: "100%",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 8,
  },
  mainTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
  },
  actionIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.12)",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  actionIconButtonCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.12)",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 101, 56, 0.06)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.12)",
  },
  tagBadgeText: {
    color: "#0F382A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  vegToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 7,
    height: 40,
  },
  vegToggleContainerCompact: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 17,
    borderWidth: 1,
    gap: 5,
    height: 34,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  vegToggleVegBorder: {
    borderColor: "#166538",
  },
  vegToggleNonVegBorder: {
    borderColor: "#D32F2F",
  },
  vegSquareBox: {
    width: 15,
    height: 15,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  vegSquareBoxCompact: {
    width: 12,
    height: 12,
    borderWidth: 1.2,
    borderRadius: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  vegSquareBoxVeg: {
    borderColor: "#166538",
  },
  vegSquareBoxNonVeg: {
    borderColor: "#D32F2F",
  },
  vegInnerDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
  },
  vegInnerDotCompact: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  vegInnerDotVeg: {
    backgroundColor: "#166538",
  },
  vegInnerDotNonVeg: {
    backgroundColor: "#D32F2F",
  },
  vegToggleText: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  vegToggleTextCompact: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  vegTextVeg: {
    color: "#107C41",
  },
  vegTextNonVeg: {
    color: "#D32F2F",
  },
  switchTrack: {
    width: 38,
    height: 19,
    borderRadius: 10,
    padding: 2,
    justifyContent: "center",
  },
  switchTrackCompact: {
    width: 32,
    height: 16,
    borderRadius: 8,
    padding: 1.5,
    justifyContent: "center",
  },
  switchTrackVeg: {
    backgroundColor: "#166538",
  },
  switchTrackNonVeg: {
    backgroundColor: "#D32F2F",
  },
  switchThumb: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  switchThumbCompact: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#FFFFFF",
  },
  heroTextContainer: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  screenSubtitle: {
    fontSize: 13.5,
    color: "#4F6B61",
    marginTop: 5,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.1,
    paddingHorizontal: 16,
  },
  stickyHeaderWrapper: {
    position: "absolute",
    top: STATUS_BAR_PADDING + 4,
    left: 0,
    right: 0,
    width: "100%",
    height: 50,
    justifyContent: "center",
  },
  navBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 50,
  },
  stickyChefContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 10,
  },
  avatarBorderRing: {
    padding: 2,
    borderRadius: 19,
    backgroundColor: "rgba(22, 101, 56, 0.15)",
    marginRight: 9,
  },
  chefAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5ECE8",
  },
  chefTextContainer: {
    justifyContent: "center",
    flexShrink: 1,
  },
  stickyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  locationPinRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  stickySubtitleMini: {
    fontSize: 11,
    color: "#5B756C",
    fontWeight: "600",
    marginLeft: 3,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166538",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.2)",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  ratingText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
    marginLeft: 3,
    letterSpacing: 0.2,
  },
  pillsOuterWrapper: {
    width: "100%",
    paddingTop: 2,
    height: 42,
  },
  pillsScrollContainer: {
    paddingHorizontal: 18,
    gap: 10,
    paddingBottom: 6,
    paddingTop: 0,
    alignItems: "center",
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    height: 34,
  },
  pillButtonActive: {
    backgroundColor: "#166538",
    borderColor: "#166538",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  pillButtonInactive: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(22, 101, 56, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  activeDotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  pillTextActive: {
    color: "#FAF8F5",
  },
  pillTextInactive: {
    color: "#4F6B61",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  cardSpacing: {
    marginBottom: 6, // Reduced spacing to make cards fit more compactly and appear tighter vertically
    transform: [{ scale: 0.96 }], // Slightly scales down the card container appearance without changing inner components
  },
  loadingContainer: {
    marginTop: 70,
    alignItems: "center",
  },
  loadingSubtitleText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F382A",
    letterSpacing: 0.5,
  },
  offlineCard: {
    marginTop: 44,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 38,
    paddingHorizontal: 26,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.1)",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  premiumOfflineIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.15)",
  },
  offlinePillHeader: {
    backgroundColor: "#166538",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 16,
  },
  offlineBadgeText: {
    color: "#FAF8F5",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  offlineBigMessage: {
    fontSize: 17,
    color: "#0B261D",
    textAlign: "center",
    fontWeight: "800",
    lineHeight: 24,
  },
  offlineSubMessage: {
    fontSize: 13.5,
    color: "#5B756C",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  emptyContainer: {
    marginTop: 56,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  emptySubtitle: {
    textAlign: "center",
    color: "#5B756C",
    marginTop: 7,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "500",
  },

  vegToggleOffBorder: {
    borderColor: 'rgba(22, 101, 56, 0.25)',
  },
  vegSquareBoxOff: {
    borderColor: '#94A3B8',
  },
  vegInnerDotOff: {
    backgroundColor: '#94A3B8',
  },
  vegTextOff: {
    color: '#5B756C',
  },
  switchTrackOff: {
    backgroundColor: '#CBD5E1',
  },
});