import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons, Feather, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";
import ChefInfoSkeleton from "@/src/components/skeletons/ChefInfoSkeleton";

const { width } = Dimensions.get("window");

const HERO_HEIGHT = 320;
const HEADER_START = 130;
const HEADER_END = 200;

const KATBOX = {
  bg: "#F9F6F0",
  card: "#FFFFFF",
  cardSoft: "#F4F1EA",
  primary: "#14532D",
  primaryDark: "#0F3E22",
  primaryLight: "#16A34A",
  primaryTint: "#E8F5E9",
  primaryTintSoft: "#F2FBF4",
  border: "#E6E2D6",
  borderSoft: "#EFECE6",
  textPrimary: "#111827",
  textSecondary: "#374151",
  textTertiary: "#6B7280",
  textMuted: "#9CA3AF",
  rating: "#F59E0B",
  ratingDeep: "#D97706",
  danger: "#DC2626",
  dangerTint: "#FEE2E2",
  dangerTintSoft: "#FEF2F2",
  shadow: "#111827",
};

const formatReviewDate = (value: any): string => {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

const ChefHeaderBannerCarousel = ({
  banners,
  fallbackImage,
}: {
  banners: any[];
  fallbackImage: string;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isInteracting = useRef(false);

  const bannerList = banners && banners.length > 0 ? banners : [{ url: fallbackImage }];
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
        x: nextIndex * width,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, 4000);

    return () => clearInterval(interval);
  }, [totalBanners]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const computedIndex = Math.round(contentOffsetX / width);
    if (computedIndex >= 0 && computedIndex < totalBanners && computedIndex !== activeIndex) {
      setActiveIndex(computedIndex);
    }
  }, [totalBanners, activeIndex]);

  return (
    <View style={styles.heroCoverContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onTouchStart={() => { isInteracting.current = true; }}
        onTouchEnd={() => { setTimeout(() => { isInteracting.current = false; }, 2000); }}
        onScrollBeginDrag={() => { isInteracting.current = true; }}
        onScrollEndDrag={() => { setTimeout(() => { isInteracting.current = false; }, 2000); }}
        onMomentumScrollEnd={(e) => {
          handleScroll(e);
          setTimeout(() => { isInteracting.current = false; }, 1500);
        }}
        style={styles.heroBannerScrollView}
      >
        {bannerList.map((bannerObj: any, bIdx: number) => (
          <View key={bIdx} style={styles.heroImageWrapper}>
            <Image
              source={{ uri: bannerObj.url || fallbackImage }}
              style={styles.heroCoverImage}
            />
            <View style={styles.heroImageGradientOverlay} />
          </View>
        ))}
      </ScrollView>

      {totalBanners > 1 && (
        <View style={styles.heroPaginationContainer} pointerEvents="none">
          {bannerList.map((_, dotIdx) => {
            const isActive = dotIdx === activeIndex;
            return (
              <View
                key={dotIdx}
                style={[
                  styles.heroPaginationDot,
                  isActive && styles.heroPaginationDotActive,
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export default function ChefInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [chefCategories, setChefCategories] = useState<any[]>([]);
  const [chefMenus, setChefMenus] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [dynamicBanners, setDynamicBanners] = useState<any[]>([]);
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);
  const [chefProfile, setChefProfile] = useState<any>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [chefReviews, setChefReviews] = useState<any[]>([]);
  const [reviewsSummary, setReviewsSummary] = useState<{
    averageRating: number;
    totalReviews: number;
    breakdown: Record<number, number>;
  }>({
    averageRating: 0,
    totalReviews: 0,
    breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });

  const scrollY = useRef(new Animated.Value(0)).current;

  const {
    id,
    chefId,
    chefName,
    userId,
    userName,
    name,
    expText,
    locationText,
    specialty,
    rating,
    price,
    avatar,
    coverImage,
    banners,
    foodType,
    fromCategory,
    filterMealBox,
    filterFoodAndCravings,
  } = params;

  const effectiveChefId = (chefId as string) || (id as string) || "";
  const effectiveChefName = (chefName as string) || (name as string) || "";
  const effectiveUserId = (userId as string) || "";
  const effectiveUserName = (userName as string) || "";

  const isMealBoxFlow = filterMealBox === "true" || fromCategory === "Meal Box";
  const isFoodAndCravingsFlow = filterFoodAndCravings === "true" || fromCategory === "Food & Cravings";

  useEffect(() => {
    if (banners) {
      try {
        const parsed = typeof banners === "string" ? JSON.parse(banners) : banners;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDynamicBanners(parsed);
        }
      } catch (e) {
        console.log("Error parsing banners param in ChefInfoScreen:", e);
      }
    }
  }, [banners]);

  useEffect(() => {
    if (effectiveChefId) {
      fetchChefDetails();
      fetchChefReviews();
    }
  }, [effectiveChefId, filterMealBox, filterFoodAndCravings, fromCategory]);

  useEffect(() => {
    const isLoading = categoriesLoading && chefCategories.length === 0 && !isMealBoxFlow;
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [categoriesLoading, chefCategories.length, isMealBoxFlow]);

  const fetchChefDetails = async () => {
    setCategoriesLoading(true);
    try {
      const [catRes, menuRes, chefRes] = await Promise.all([
        api.get(`/api/chef-categories/chef/${effectiveChefId}`),
        api.get(`/api/chef-categories/menu/chef/${effectiveChefId}`),
        api.get(`/api/chefs`),
      ]);

      let fetchedCats = catRes.data || [];

      if (isMealBoxFlow) {
        fetchedCats = fetchedCats.filter((c: any) =>
          c.name?.trim().toLowerCase().replace(/\s+/g, "") === "mealbox"
        );
      }

      if (isFoodAndCravingsFlow) {
        fetchedCats = fetchedCats.filter((c: any) => {
          const nameNormalized = (c.name || "").trim().toLowerCase().replace(/\s+/g, "");
          const isMealBox = nameNormalized.includes("mealbox");
          const isCatering = nameNormalized.includes("catering");
          return !isMealBox && !isCatering;
        });
      }

      setChefCategories(fetchedCats);
      setChefMenus(menuRes.data || []);

      if (chefRes.data && chefRes.data.chefs) {
        const matched = chefRes.data.chefs.find(
          (c: any) => c._id === effectiveChefId || c.id === effectiveChefId
        );
        if (matched) {
          setChefProfile(matched);
          if (matched.banners && matched.banners.length > 0) {
            setDynamicBanners(matched.banners);
          }
        }
      }
    } catch (err) {
      console.log("Error fetching chef content categories:", err);
      setChefCategories([]);
      setChefMenus([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchChefReviews = async () => {
    if (!effectiveChefId) return;
    setReviewsLoading(true);
    try {
      const res = await api.get(`/api/chefs/${effectiveChefId}/reviews`);
      if (res?.data?.success) {
        setChefReviews(Array.isArray(res.data.reviews) ? res.data.reviews : []);
        setReviewsSummary({
          averageRating: Number(res.data.averageRating) || 0,
          totalReviews: Number(res.data.totalReviews) || 0,
          breakdown: res.data.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
      }
    } catch (err) {
      console.log("Error fetching chef reviews:", err);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (isMealBoxFlow && !hasAutoNavigated && chefCategories.length > 0 && !categoriesLoading) {
      const mealBoxCat = chefCategories.find((c: any) =>
        c.name?.trim().toLowerCase().replace(/\s+/g, "") === "mealbox"
      );

      if (mealBoxCat) {
        setHasAutoNavigated(true);
        router.replace({
          pathname: "/screens/MealBoxPlans",
          params: {
            id: effectiveChefId,
            chefId: effectiveChefId,
            chefName: effectiveChefName,
            userId: effectiveUserId,
            userName: effectiveUserName,
            categoryId: mealBoxCat._id,
            chefImage: avatar as string,
            avatar: avatar as string,
            rating: rating as string,
            location: locationText || "Hyderabad",
            fromCategory: "Meal Box",
          },
        });
      }
    }
  }, [isMealBoxFlow, chefCategories, categoriesLoading, hasAutoNavigated, effectiveChefId]);

  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const stickyHeaderTranslateY = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [-120, 0],
    extrapolate: "clamp",
  });

  const heroCoverOpacity = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const stickyBorderOpacity = scrollY.interpolate({
    inputRange: [HEADER_END - 10, HEADER_END + 10],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const stickyAvatarScale = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [0.85, 1],
    extrapolate: "clamp",
  });

  const stickySubInfoOpacity = scrollY.interpolate({
    inputRange: [HEADER_START + 10, HEADER_END],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const floatingButtonsOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_START],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const fallbackHeroImage =
    (coverImage as string) ||
    "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800";

  const resolvedName = effectiveChefName || chefProfile?.name || "Master Chef";
  const resolvedAvatar = (avatar as string) || chefProfile?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200";

  const resolvedRating = useMemo(() => {
    const live = reviewsSummary?.averageRating;
    if (live && Number.isFinite(Number(live)) && Number(live) > 0) {
      return Number(live).toFixed(1);
    }
    const profileAvg = chefProfile?.averageRating;
    if (profileAvg !== undefined && profileAvg !== null && profileAvg !== "") {
      const n = Number(profileAvg);
      if (Number.isFinite(n) && n > 0) return n.toFixed(1);
    }
    const r = rating ?? chefProfile?.rating;
    if (r === undefined || r === null || r === "") return "4.9";
    const num = Number(r);
    return Number.isFinite(num) ? num.toFixed(1) : "4.9";
  }, [rating, chefProfile, reviewsSummary]);

  const resolvedRatingCount = useMemo(() => {
    const fromSummary = Number(reviewsSummary?.totalReviews) || 0;
    if (fromSummary > 0) return fromSummary;
    const fromProfile = Number(chefProfile?.totalReviews) || 0;
    if (fromProfile > 0) return fromProfile;
    return 0;
  }, [reviewsSummary, chefProfile]);

  const resolvedLocation = (locationText as string) || chefProfile?.location || "Banjara Hills, Hyderabad";
  const resolvedSpecialty = (specialty as string) || chefProfile?.specialty || "Royal Awadh Biryani, Andhra Meals, Tandoori";
  const resolvedExpText = (expText as string) || (chefProfile?.exp ? `${chefProfile.exp} yrs experience` : "14+ yrs experience");

  const resolvedPrice = useMemo(() => {
    let minPrice = Infinity;
    if (chefMenus && chefMenus.length > 0) {
      chefMenus.forEach((m: any) => {
        const p = Number(String(m.price || m.basePrice || "").replace(/[^0-9.]/g, ""));
        if (Number.isFinite(p) && p > 0 && p < minPrice) {
          minPrice = p;
        }
      });
    }
    if (chefCategories && chefCategories.length > 0) {
      chefCategories.forEach((c: any) => {
        const p = Number(String(c.price || c.startingPrice || "").replace(/[^0-9.]/g, ""));
        if (Number.isFinite(p) && p > 0 && p < minPrice) {
          minPrice = p;
        }
      });
    }
    if (minPrice !== Infinity) {
      return `₹${minPrice}`;
    }
    const raw = price ?? chefProfile?.price;
    if (!raw) return "₹149";
    if (typeof raw === "string" && raw.includes("@")) {
      return raw.split("@")[1]?.trim() || "₹149";
    }
    const num = Number(String(raw).replace(/[^0-9.]/g, ""));
    return Number.isFinite(num) && num > 0 ? `₹${num}` : "₹149";
  }, [chefMenus, chefCategories, price, chefProfile]);

  const resolvedFoodType: "VEG" | "NONVEG" | "BOTH" = (() => {
    const ft = (foodType as string) || chefProfile?.foodType;
    if (ft === "VEG") return "VEG";
    if (ft === "NONVEG") return "NONVEG";
    return "BOTH";
  })();

  const resolvedIsAvailable = chefProfile?.isAvailable ?? true;

  const resolvedSpecialties = useMemo(() => {
    const list = (resolvedSpecialty || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    return list.length > 0 ? list : ["Authentic Heritage Recipes"];
  }, [resolvedSpecialty]);

  const dietTag = (() => {
    if (resolvedFoodType === "VEG") {
      return { label: "100% Pure Veg", bg: "#F0FDF4", border: "#BBF7D0", fg: KATBOX.primaryDark };
    }
    if (resolvedFoodType === "NONVEG") {
      return { label: "Non-Veg Special", bg: KATBOX.dangerTintSoft, border: "#FECACA", fg: KATBOX.danger };
    }
    return { label: "Veg & Non-Veg", bg: KATBOX.cardSoft, border: KATBOX.border, fg: KATBOX.textSecondary };
  })();

  const openReviewsModal = () => {
    setShowReviewsModal(true);
    fetchChefReviews();
  };

  const closeReviewsModal = () => {
    setShowReviewsModal(false);
  };

  if (isMealBoxFlow) {
    return (
      <View style={[styles.container, styles.centerLoaderContainer]}>
        <ActivityIndicator size="large" color={KATBOX.primary} />
      </View>
    );
  }

  if (showSkeleton) {
    return <ChefInfoSkeleton />;
  }

  const liveAvg = Number(resolvedRating) || 0;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.stickyHeaderWrapper,
          {
            opacity: stickyHeaderOpacity,
            transform: [{ translateY: stickyHeaderTranslateY }],
          },
        ]}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.stickyAndroidBackground]} />
        )}
        <Animated.View style={[styles.stickyBottomBorder, { opacity: stickyBorderOpacity }]} />

        <View style={styles.stickyContentRow}>
          <TouchableOpacity
            style={styles.stickyBackButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="chevron-left" size={20} color={KATBOX.textPrimary} />
          </TouchableOpacity>

          <Animated.View style={[styles.stickyAvatarWrapper, { transform: [{ scale: stickyAvatarScale }] }]}>
            <Image source={{ uri: resolvedAvatar }} style={styles.stickyAvatarImage} />
            {resolvedIsAvailable && <View style={styles.stickyOnlineDot} />}
          </Animated.View>

          <View style={styles.stickyInfoBlock}>
            <View style={styles.stickyNameRatingRow}>
              <Text style={styles.stickyChefNameText} numberOfLines={1}>{resolvedName}</Text>
              <View style={styles.stickyRatingPill}>
                <Ionicons name="star" size={10} color={KATBOX.ratingDeep} />
                <Text style={styles.stickyRatingValue}>{resolvedRating}</Text>
              </View>
            </View>

            <Animated.Text
              style={[styles.stickyCuisinesText, { opacity: stickySubInfoOpacity }]}
              numberOfLines={1}
            >
              {resolvedSpecialty.split(",")[0]?.trim()} • <Text style={styles.stickyTimeHighlight}>{resolvedExpText}</Text>
            </Animated.Text>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        <Animated.View style={[styles.heroCoverWrapper, { opacity: heroCoverOpacity }]}>
          <ChefHeaderBannerCarousel banners={dynamicBanners} fallbackImage={fallbackHeroImage} />
        </Animated.View>

        <View style={styles.mainDetailsCard}>
          <View
            style={[
              styles.topEdgeMergedBadge,
              { backgroundColor: dietTag.bg, borderColor: dietTag.border },
            ]}
          >
            <View style={[styles.dietDotBox, { borderColor: dietTag.fg, marginRight: 5 }]}>
              <View style={[styles.dietDotInner, { backgroundColor: dietTag.fg }]} />
            </View>
            <Text style={[styles.topChefText, { color: dietTag.fg }]}>{dietTag.label}</Text>
          </View>

          <View style={styles.titleRow}>
            <View style={styles.nameBadgeContainer}>
              <View style={styles.profileAvatarWrapper}>
                <Image source={{ uri: resolvedAvatar }} style={styles.profileAvatarImage} />
                {resolvedIsAvailable && <View style={styles.profileOnlineDot} />}
              </View>

              <View style={{ flex: 1, justifyContent: "center" }}>
                <View style={styles.nameWithRatingRow}>
                  <Text style={styles.chefNameText} numberOfLines={1}>
                    {resolvedName}
                  </Text>

                  <View style={styles.ratingAndReviewsColumn}>
                    <TouchableOpacity
                      style={styles.ratingBadgeBox}
                      activeOpacity={0.85}
                      onPress={openReviewsModal}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="star" size={12} color="#FFFFFF" />
                      <Text style={styles.ratingValueText}>{resolvedRating}</Text>
                      {resolvedRatingCount > 0 && (
                        <Text style={styles.ratingCountInlineText}>
                          ({resolvedRatingCount})
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.viewReviewsLinkRow}
                      onPress={openReviewsModal}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.viewReviewsLinkText}>
                        View Reviews
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inlineMetaRow}>
                  <MaterialIcons name="verified" size={13} color={KATBOX.primary} />
                  <Text style={styles.inlineVerifiedText}>Katbox Verified Partner</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.cuisineText} numberOfLines={2}>
            {resolvedSpecialty}
          </Text>

          <View style={styles.metricGridContainer}>
            <View style={styles.metricItemColumn}>
              <View style={styles.metricIconLabelRow}>
                <Feather name="award" size={15} color={KATBOX.primary} />
                <Text style={styles.metricValueText} numberOfLines={1}>
                  {resolvedExpText.replace(" experience", "")}
                </Text>
              </View>
              <Text style={styles.metricSubTitleLabel}>Experience</Text>
            </View>

            <View style={styles.metricDivider} />

            <TouchableOpacity
              style={styles.metricItemColumn}
              activeOpacity={0.7}
              onPress={openReviewsModal}
            >
              <View style={styles.metricIconLabelRow}>
                <Feather name="star" size={15} color={KATBOX.primary} />
                <Text style={styles.metricValueText} numberOfLines={1}>{resolvedRating} / 5</Text>
              </View>
              <Text style={styles.metricSubTitleLabel}>
                {resolvedRatingCount > 0
                  ? `${resolvedRatingCount} Review${resolvedRatingCount === 1 ? "" : "s"}`
                  : "Rating Score"}
              </Text>
            </TouchableOpacity>

            <View style={styles.metricDivider} />

            <View style={styles.metricItemColumn}>
              <View style={styles.metricIconLabelRow}>
                <Feather name="tag" size={15} color={KATBOX.primary} />
                <Text style={styles.metricValueText} numberOfLines={1}>{resolvedPrice}</Text>
              </View>
              <Text style={styles.metricSubTitleLabel}>Starts From</Text>
            </View>
          </View>

          <View style={styles.sectionDividerBlock} />
          <View style={styles.popularSectionTitleRow}>
            <Text style={styles.sectionLabelHeading}>Signature Categories & Dishes</Text>
            <View style={styles.sectionHeadingAccent} />
          </View>

          {categoriesLoading ? (
            <View style={styles.loadingRowContainer}>
              <ActivityIndicator size="small" color={KATBOX.primary} />
              <Text style={styles.loadingTextContainer}>Curating master kitchen menus...</Text>
            </View>
          ) : chefCategories.length > 0 ? (
            <View style={styles.dishesHorizontalContainer}>
              {chefCategories.map((cat: any) => {
                const hasMenu = chefMenus.some(
                  (m: any) =>
                    m.categoryId === cat._id ||
                    m.chefCategoryId === cat._id ||
                    m.name?.trim().toLowerCase() === cat.name?.trim().toLowerCase()
                );
                const isMealBox = cat.name?.trim().toLowerCase().replace(/\s+/g, "") === "mealbox";
                const isCatering = cat.name?.trim().toLowerCase().includes("catering");
                // Check if this category is Quick Bites
                const isQuickBites = cat.name?.trim().toLowerCase().replace(/\s+/g, "") === "quickbites";

                return (
                  <TouchableOpacity
                    key={cat._id}
                    style={styles.dishCompactCard}
                    activeOpacity={0.92}
                    onPress={() => {
                      if (isMealBox) {
                        router.push({
                          pathname: "/screens/MealBoxPlans",
                          params: {
                            id: effectiveChefId,
                            chefId: effectiveChefId,
                            chefName: resolvedName,
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                            categoryId: cat._id,
                            chefImage: resolvedAvatar,
                            rating: resolvedRating,
                            location: resolvedLocation,
                          },
                        });
                      } else if (hasMenu || isCatering) {
                        router.push({
                          pathname: "/screens/CateringMealPlans",
                          params: {
                            id: effectiveChefId,
                            chefId: effectiveChefId,
                            chefName: resolvedName,
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                            categoryId: cat._id,
                            name: resolvedName,
                            rating: resolvedRating,
                            location: resolvedLocation,
                            category: cat.name,
                            hasCatering: "true",
                          },
                        });
                      } else {
                        router.push({
                          pathname: "/screens/HomeMadeItemScreen",
                          params: {
                            id: effectiveChefId,
                            chefId: effectiveChefId,
                            chefName: resolvedName,
                            name: resolvedName,
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                            categoryId: cat._id,
                            image: cat.heroImageUrl || fallbackHeroImage,
                            rating: resolvedRating,
                            location: resolvedLocation,
                            category: cat.name,
                            hasCatering: "false",
                            fromCategory: fromCategory,
                            filterFoodAndCravings: filterFoodAndCravings,
                            // ⭐ Forward QuickBites flag so HomeMadeItemScreen / Review triggers fast delivery logic
                            isQuickBites: isQuickBites ? "true" : "false",
                          },
                        });
                      }
                    }}
                  >
                    <Image
                      source={{ uri: cat.heroImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400" }}
                      style={styles.dishCardImage}
                    />
                    <View style={styles.dishCardContent}>
                      <Text style={styles.dishCardTitle} numberOfLines={1}>{cat.name}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyTextContainer}>No specialty items currently listed.</Text>
          )}

          <View style={styles.sectionDividerBlock} />
          <Text style={styles.sectionLabelHeading}>About The Chef</Text>
          <Text style={styles.aboutDescriptionText}>
            Welcome to my kitchen! I am {resolvedName}, dedicated to bringing authentic, soulful, home-cooked flavors straight to your dining table. Using premium farm-fresh ingredients, traditional heirloom recipes, and rigorous hygiene protocols, every meal is crafted with absolute love.
          </Text>
          <View style={styles.aboutLocationRow}>
            <Ionicons name="location-outline" size={15} color={KATBOX.primary} />
            <Text style={styles.aboutLocationSubText}>{resolvedLocation}</Text>
          </View>

          <View style={styles.sectionDividerBlock} />
          <Text style={styles.sectionLabelHeading}>Culinary Expertise</Text>
          <View style={styles.specialtiesChipsWrapper}>
            {resolvedSpecialties.map((chip: string, i: number) => (
              <View key={`${chip}-${i}`} style={styles.specialtyChipItem}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={13} color={KATBOX.primary} style={{ marginRight: 6 }} />
                <Text style={styles.specialtyChipText}>{chip}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionDividerBlock} />
          <Text style={styles.sectionLabelHeading}>Katbox Quality Promise</Text>
          <View style={styles.highlightsWrap}>
            <View style={styles.highlightCard}>
              <View style={styles.highlightIconWrap}>
                <MaterialIcons name="verified-user" size={18} color={KATBOX.primary} />
              </View>
              <Text style={styles.highlightTitle}>FSSAI Certified</Text>
              <Text style={styles.highlightSub}>Strict hygiene checks</Text>
            </View>
            <View style={styles.highlightCard}>
              <View style={styles.highlightIconWrap}>
                <MaterialCommunityIcons name="chef-hat" size={18} color={KATBOX.primary} />
              </View>
              <Text style={styles.highlightTitle}>100% Homecooked</Text>
              <Text style={styles.highlightSub}>No artificial colors</Text>
            </View>
            <View style={styles.highlightCard}>
              <View style={styles.highlightIconWrap}>
                <MaterialCommunityIcons name="clock-check-outline" size={18} color={KATBOX.primary} />
              </View>
              <Text style={styles.highlightTitle}>Freshly Prepared</Text>
              <Text style={styles.highlightSub}>Made upon order</Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      <Animated.View
        style={[styles.floatingBackButtonWrapper, { opacity: floatingButtonsOpacity }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.floatingBackButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Feather name="chevron-left" size={24} color={KATBOX.textPrimary} />
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={showReviewsModal}
        transparent
        animationType="slide"
        onRequestClose={closeReviewsModal}
      >
        <View style={styles.reviewsModalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={closeReviewsModal}
          />

          <View style={styles.reviewsModalSheet}>
            <View style={styles.reviewsModalHandle} />

            <View style={styles.reviewsModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewsModalTitle}>Ratings & Reviews</Text>
                <Text style={styles.reviewsModalSubtitle} numberOfLines={1}>
                  {resolvedName} • Katbox Verified
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeReviewsModal}
                style={styles.reviewsModalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color={KATBOX.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.reviewsSummaryCard}>
              <View style={styles.reviewsSummaryLeft}>
                <Text style={styles.reviewsSummaryAvg}>
                  {resolvedRating}
                </Text>
                <View style={styles.reviewsSummaryStarsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons
                      key={`summary-star-${s}`}
                      name={s <= Math.round(liveAvg) ? "star" : "star-outline"}
                      size={14}
                      color={KATBOX.rating}
                      style={{ marginHorizontal: 1 }}
                    />
                  ))}
                </View>
                <Text style={styles.reviewsSummaryCount}>
                  {resolvedRatingCount} review{resolvedRatingCount === 1 ? "" : "s"}
                </Text>
              </View>

              <View style={styles.reviewsSummaryRight}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = Number(reviewsSummary?.breakdown?.[star] || 0);
                  const pct = resolvedRatingCount > 0
                    ? Math.max(0, Math.min(100, (count / resolvedRatingCount) * 100))
                    : 0;
                  return (
                    <View key={`breakdown-${star}`} style={styles.reviewsBreakdownRow}>
                      <Text style={styles.reviewsBreakdownStarNum}>{star}</Text>
                      <Ionicons name="star" size={9} color={KATBOX.rating} style={{ marginRight: 5 }} />
                      <View style={styles.reviewsBreakdownBarBg}>
                        <View
                          style={[
                            styles.reviewsBreakdownBarFill,
                            { width: `${pct}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.reviewsBreakdownCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <ScrollView
              style={styles.reviewsListScroll}
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {reviewsLoading ? (
                <View style={styles.reviewsEmptyWrap}>
                  <ActivityIndicator size="small" color={KATBOX.primary} />
                  <Text style={styles.reviewsEmptyText}>Loading reviews...</Text>
                </View>
              ) : chefReviews.length === 0 ? (
                <View style={styles.reviewsEmptyWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={30} color={KATBOX.textMuted} />
                  <Text style={styles.reviewsEmptyTitle}>No reviews yet</Text>
                  <Text style={styles.reviewsEmptyText}>
                    Be the first to order & rate this chef.
                  </Text>
                </View>
              ) : (
                chefReviews.map((rev: any, idx: number) => {
                  const initial = (rev?.userName || "C").trim().charAt(0).toUpperCase() || "C";
                  return (
                    <View key={rev?._id || `rev-${idx}`} style={styles.reviewCardItem}>
                      <View style={styles.reviewCardHeaderRow}>
                        {rev?.userAvatar ? (
                          <Image source={{ uri: rev.userAvatar }} style={styles.reviewAvatarImg} />
                        ) : (
                          <View style={styles.reviewAvatarFallback}>
                            <Text style={styles.reviewAvatarFallbackText}>{initial}</Text>
                          </View>
                        )}

                        <View style={styles.reviewHeaderInfoCol}>
                          <Text style={styles.reviewUserName} numberOfLines={1}>
                            {rev?.userName || "Customer"}
                          </Text>
                          <View style={styles.reviewStarsRow}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Ionicons
                                key={`rev-star-${idx}-${s}`}
                                name={s <= (Number(rev?.rating) || 0) ? "star" : "star-outline"}
                                size={11}
                                color={KATBOX.rating}
                                style={{ marginRight: 1 }}
                              />
                            ))}
                            <Text style={styles.reviewRatingText}>
                              {Number(rev?.rating) || 0}/5
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.reviewDateText}>
                          {formatReviewDate(rev?.createdAt)}
                        </Text>
                      </View>

                      {rev?.comment ? (
                        <Text style={styles.reviewCommentText}>
                          {rev.comment}
                        </Text>
                      ) : null}

                      {Array.isArray(rev?.images) && rev.images.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={{ marginTop: 10 }}
                        >
                          <View style={styles.reviewImagesRow}>
                            {rev.images.map((img: any, i: number) => (
                              <Image
                                key={`rev-img-${idx}-${i}`}
                                source={{ uri: img?.url }}
                                style={styles.reviewImageThumb}
                              />
                            ))}
                          </View>
                        </ScrollView>
                      )}

                      {rev?.orderId ? (
                        <View style={styles.reviewOrderTag}>
                          <Ionicons name="checkmark-circle" size={11} color={KATBOX.primary} />
                          <Text style={styles.reviewOrderTagText}>
                            Verified Order #{rev.orderId}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: KATBOX.bg,
  },
  centerLoaderContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  stickyHeaderWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 136,
    zIndex: 20,
    overflow: "hidden",
    shadowColor: KATBOX.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  stickyAndroidBackground: {
    backgroundColor: "rgba(249, 246, 240, 0.98)",
  },
  stickyBottomBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: KATBOX.border,
  },
  stickyContentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 16,
    gap: 12,
  },
  stickyBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: KATBOX.border,
    shadowColor: KATBOX.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stickyAvatarWrapper: {
    position: "relative",
  },
  stickyAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: KATBOX.cardSoft,
    resizeMode: "cover",
    borderWidth: 1.5,
    borderColor: KATBOX.primaryTint,
  },
  stickyOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: KATBOX.primaryLight,
    borderWidth: 2,
    borderColor: KATBOX.bg,
  },
  stickyInfoBlock: {
    flex: 1,
    justifyContent: "center",
  },
  stickyNameRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stickyChefNameText: {
    fontSize: 16.5,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.3,
    flexShrink: 1,
    marginRight: 6,
  },
  stickyRatingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.primaryTint,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    gap: 2,
  },
  stickyRatingValue: {
    fontSize: 11,
    fontWeight: "800",
    color: KATBOX.primaryDark,
  },
  stickyCuisinesText: {
    fontSize: 12,
    color: KATBOX.textTertiary,
    fontWeight: "600",
    marginTop: 2,
  },
  stickyTimeHighlight: {
    color: KATBOX.primary,
    fontWeight: "700",
  },
  scrollContent: {
    paddingBottom: 48,
  },
  heroCoverWrapper: {
    width: width,
    height: HERO_HEIGHT,
    position: "relative",
  },
  heroCoverContainer: {
    width: width,
    height: HERO_HEIGHT,
    backgroundColor: KATBOX.borderSoft,
    position: "relative",
  },
  heroBannerScrollView: {
    width: width,
    height: "100%",
  },
  heroImageWrapper: {
    width: width,
    height: HERO_HEIGHT,
    position: "relative",
  },
  heroCoverImage: {
    width: width,
    height: HERO_HEIGHT,
    resizeMode: "cover",
  },
  heroImageGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  heroPaginationContainer: {
    position: "absolute",
    bottom: 36,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    zIndex: 5,
  },
  heroPaginationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  heroPaginationDotActive: {
    width: 16,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFFFFF",
  },
  floatingBackButtonWrapper: {
    position: "absolute",
    top: 48,
    left: 18,
    zIndex: 15,
  },
  floatingBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: KATBOX.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  mainDetailsCard: {
    flex: 1,
    backgroundColor: KATBOX.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 20,
    paddingTop: 28,
    position: "relative",
  },
  topEdgeMergedBadge: {
    position: "absolute",
    top: 0,
    right: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderTopWidth: 0,
    zIndex: 10,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingRight: 0,
  },
  nameWithRatingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  nameBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  profileAvatarWrapper: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: KATBOX.card,
    padding: 2,
    borderWidth: 2,
    borderColor: KATBOX.primaryTint,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    resizeMode: "cover",
  },
  profileOnlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: KATBOX.primaryLight,
    borderWidth: 2,
    borderColor: KATBOX.card,
  },
  chefNameText: {
    fontSize: 20,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 24,
    flexShrink: 1,
    marginRight: 6,
  },
  inlineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  inlineVerifiedText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: KATBOX.primary,
  },
  topChefText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  dietTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  dietTagChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 6,
  },
  dietDotBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KATBOX.card,
  },
  dietDotInner: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
  },
  dietTagText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  ratingBadgeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  ratingValueText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  ratingCountInlineText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    marginLeft: 2,
  },
  ratingCountText: {
    color: KATBOX.textTertiary,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
  },
  cuisineText: {
    fontSize: 14,
    color: KATBOX.textTertiary,
    fontWeight: "500",
    marginTop: 8,
    lineHeight: 20,
  },
  metricGridContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: KATBOX.card,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: KATBOX.border,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricItemColumn: {
    alignItems: "center",
    flex: 1,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: KATBOX.borderSoft,
  },
  metricIconLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metricValueText: {
    fontSize: 14,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.1,
  },
  metricSubTitleLabel: {
    fontSize: 11,
    color: KATBOX.textMuted,
    fontWeight: "600",
    marginTop: 3,
  },
  sectionDividerBlock: {
    height: 1,
    backgroundColor: KATBOX.borderSoft,
    marginVertical: 22,
  },
  sectionLabelHeading: {
    fontSize: 17,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  sectionHeadingAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: KATBOX.primary,
    marginTop: -10,
    marginBottom: 16,
  },
  aboutDescriptionText: {
    fontSize: 14.5,
    color: KATBOX.textSecondary,
    lineHeight: 22,
    fontWeight: "400",
  },
  aboutLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  aboutLocationSubText: {
    fontSize: 13.5,
    color: KATBOX.textTertiary,
    fontWeight: "600",
  },
  popularSectionTitleRow: {
    marginBottom: 4,
  },
  dishesHorizontalContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  dishCompactCard: {
    width: "48%",
    backgroundColor: KATBOX.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: KATBOX.border,
    overflow: "hidden",
    marginBottom: 4,
    shadowColor: KATBOX.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  dishCardImage: {
    width: "100%",
    height: 124,
    resizeMode: "cover",
    backgroundColor: KATBOX.cardSoft,
  },
  dishCardContent: {
    padding: 11,
  },
  dishCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.1,
  },
  loadingRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingTextContainer: {
    color: KATBOX.textTertiary,
    fontWeight: "500",
    fontSize: 13.5,
  },
  emptyTextContainer: {
    paddingVertical: 12,
    color: KATBOX.textTertiary,
    fontWeight: "500",
    fontSize: 13.5,
  },
  specialtiesChipsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  specialtyChipItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.primaryTintSoft,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  specialtyChipText: {
    fontSize: 12.5,
    color: KATBOX.primary,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  highlightsWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  highlightCard: {
    flex: 1,
    backgroundColor: KATBOX.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  highlightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: KATBOX.primaryTint,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  highlightTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    textAlign: "center",
    letterSpacing: -0.1,
  },
  highlightSub: {
    fontSize: 10,
    color: KATBOX.textTertiary,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  ratingAndReviewsColumn: {
    alignItems: "flex-end",
    gap: 4,
  },
  viewReviewsLinkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewReviewsLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: KATBOX.primary,
    textDecorationLine: "underline",
    letterSpacing: -0.1,
  },
  reviewsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  reviewsModalSheet: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: KATBOX.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  reviewsModalHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#CBD5E1",
    borderRadius: 10,
    alignSelf: "center",
    marginBottom: 12,
  },
  reviewsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  reviewsModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.3,
  },
  reviewsModalSubtitle: {
    fontSize: 12,
    color: KATBOX.textTertiary,
    fontWeight: "600",
    marginTop: 2,
  },
  reviewsModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: KATBOX.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  reviewsSummaryCard: {
    flexDirection: "row",
    backgroundColor: KATBOX.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: KATBOX.border,
    marginBottom: 16,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  reviewsSummaryLeft: {
    width: 110,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: KATBOX.borderSoft,
    paddingRight: 12,
  },
  reviewsSummaryAvg: {
    fontSize: 36,
    fontWeight: "900",
    color: KATBOX.textPrimary,
    letterSpacing: -1,
    lineHeight: 40,
  },
  reviewsSummaryStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  reviewsSummaryCount: {
    fontSize: 11.5,
    color: KATBOX.textTertiary,
    fontWeight: "600",
    marginTop: 4,
  },
  reviewsSummaryRight: {
    flex: 1,
    paddingLeft: 14,
    justifyContent: "center",
  },
  reviewsBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2.5,
  },
  reviewsBreakdownStarNum: {
    fontSize: 10.5,
    fontWeight: "700",
    color: KATBOX.textTertiary,
    width: 10,
    textAlign: "center",
  },
  reviewsBreakdownBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: KATBOX.borderSoft,
    marginHorizontal: 6,
    overflow: "hidden",
  },
  reviewsBreakdownBarFill: {
    height: "100%",
    backgroundColor: KATBOX.rating,
    borderRadius: 3,
  },
  reviewsBreakdownCount: {
    fontSize: 10.5,
    fontWeight: "700",
    color: KATBOX.textTertiary,
    width: 22,
    textAlign: "right",
  },
  reviewsListScroll: {
    flexGrow: 0,
  },
  reviewsEmptyWrap: {
    paddingVertical: 40,
    alignItems: "center",
  },
  reviewsEmptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    marginTop: 10,
  },
  reviewsEmptyText: {
    fontSize: 12.5,
    color: KATBOX.textTertiary,
    fontWeight: "500",
    marginTop: 4,
    textAlign: "center",
  },
  reviewCardItem: {
    backgroundColor: KATBOX.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
    marginBottom: 12,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  reviewCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reviewAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: KATBOX.cardSoft,
    resizeMode: "cover",
  },
  reviewAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: KATBOX.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarFallbackText: {
    fontSize: 15,
    fontWeight: "800",
    color: KATBOX.primaryDark,
  },
  reviewHeaderInfoCol: {
    flex: 1,
    marginLeft: 10,
    paddingRight: 8,
  },
  reviewUserName: {
    fontSize: 13.5,
    fontWeight: "800",
    color: KATBOX.textPrimary,
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  reviewRatingText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: KATBOX.textTertiary,
    marginLeft: 4,
  },
  reviewDateText: {
    fontSize: 10.5,
    color: KATBOX.textMuted,
    fontWeight: "600",
  },
  reviewCommentText: {
    fontSize: 13,
    color: KATBOX.textSecondary,
    lineHeight: 19,
    marginTop: 10,
  },
  reviewImagesRow: {
    flexDirection: "row",
    gap: 8,
  },
  reviewImageThumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    resizeMode: "cover",
    backgroundColor: KATBOX.cardSoft,
  },
  reviewOrderTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: KATBOX.primaryTintSoft,
    alignSelf: "flex-start",
  },
  reviewOrderTagText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: KATBOX.primary,
    letterSpacing: -0.1,
  },
});