import React, { useEffect, useState, useRef } from "react";
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
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";

const { width } = Dimensions.get("window");

// Scroll thresholds for staged premium animation
const HERO_HEIGHT = 310;
const HEADER_START = 140;
const HEADER_END = 210;

// Reusable Auto-Scrolling Hero Banner Carousel for Screen Header
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
        x: nextIndex * width,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, 3500);

    return () => clearInterval(interval);
  }, [totalBanners]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const computedIndex = Math.round(contentOffsetX / width);
    if (computedIndex >= 0 && computedIndex < totalBanners && computedIndex !== activeIndex) {
      setActiveIndex(computedIndex);
    }
  };

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
        style={styles.heroBannerScrollView}
      >
        {bannerList.map((bannerObj: any, bIdx: number) => (
          <Image
            key={bIdx}
            source={{ uri: bannerObj.url || fallbackImage }}
            style={styles.heroCoverImage}
          />
        ))}
      </ScrollView>

      {/* Small Centered Pagination Dots */}
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

  // Category & Menu States
  const [chefCategories, setChefCategories] = useState<any[]>([]);
  const [chefMenus, setChefMenus] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [dynamicBanners, setDynamicBanners] = useState<any[]>([]);
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);

  // Animated scroll tracker
  const scrollY = useRef(new Animated.Value(0)).current;

  // Destructure incoming parameters
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
  } = params;

  const effectiveChefId = (chefId as string) || (id as string) || "";
  const effectiveChefName = (chefName as string) || (name as string) || "";
  const effectiveUserId = (userId as string) || "";
  const effectiveUserName = (userName as string) || "";

  const isMealBoxFlow = filterMealBox === "true" || fromCategory === "Meal Box";

  // Parse initial banners passed through route params
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
    }
  }, [effectiveChefId, filterMealBox]);

  const fetchChefDetails = async () => {
    setCategoriesLoading(true);
    try {
      const [catRes, menuRes, chefRes] = await Promise.all([
        api.get(`/api/chef-categories/chef/${effectiveChefId}`),
        api.get(`/api/chef-categories/menu/chef/${effectiveChefId}`),
        api.get(`/api/chefs`),
      ]);

      let fetchedCats = catRes.data || [];

      // If we entered via the Meal Box flow, filter the categories to ONLY show "Meal Box"
      if (filterMealBox === "true") {
        fetchedCats = fetchedCats.filter((c: any) =>
          c.name?.trim().toLowerCase().replace(/\s+/g, "") === "mealbox"
        );
      }

      setChefCategories(fetchedCats);
      setChefMenus(menuRes.data || []);

      if (chefRes.data && chefRes.data.chefs) {
        const matched = chefRes.data.chefs.find(
          (c: any) => c._id === effectiveChefId || c.id === effectiveChefId
        );
        if (matched && matched.banners && matched.banners.length > 0) {
          setDynamicBanners(matched.banners);
        }
      }
    } catch (err) {
      console.log("Error fetching chef content categories inside ChefInfoScreen layout:", err);
      setChefCategories([]);
      setChefMenus([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  // ── IMMEDIATE ZERO-FLASH REDIRECT FOR MEAL BOX CATEGORY FLOW ──
  useEffect(() => {
    if (isMealBoxFlow && !hasAutoNavigated && chefCategories.length > 0 && !categoriesLoading) {
      const mealBoxCat = chefCategories.find((c: any) =>
        c.name?.trim().toLowerCase().replace(/\s+/g, "") === "mealbox"
      );

      if (mealBoxCat) {
        setHasAutoNavigated(true); // Ensures this runs only once

        // Use replace to prevent ChefInfoScreen from staying in the back stack
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

  // ─── PREMIUM ANIMATION INTERPOLATIONS ───────────────────────────────────────

  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const stickyHeaderTranslateY = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [-130, 0],
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
    outputRange: [0.8, 1],
    extrapolate: "clamp",
  });

  const stickyNameTranslateX = scrollY.interpolate({
    inputRange: [HEADER_START, HEADER_END],
    outputRange: [-6, 0],
    extrapolate: "clamp",
  });

  const stickySubInfoOpacity = scrollY.interpolate({
    inputRange: [HEADER_START + 15, HEADER_END + 10],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const stickySubInfoTranslateY = scrollY.interpolate({
    inputRange: [HEADER_START + 15, HEADER_END + 10],
    outputRange: [4, 0],
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

  // ── IF REDIRECTING, RETURN A TRANSPARENT LOADER TO AVOID FLASHING UI ──
  if (isMealBoxFlow) {
    return (
      <View style={[styles.container, styles.centerLoaderContainer]}>
        <ActivityIndicator size="large" color="#49552D" />
      </View>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── PREMIUM STICKY COLLAPSED HEADER ───────────────────────────────── */}
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
          <BlurView
            intensity={85}
            tint="light"
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.stickyAndroidBackground]} />
        )}

        <Animated.View
          style={[styles.stickyBottomBorder, { opacity: stickyBorderOpacity }]}
        />

        <View style={styles.stickyContentRow}>
          <TouchableOpacity
            style={styles.stickyBackButton}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="chevron-left" size={22} color="#1A1512" />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.stickyAvatarWrapper,
              {
                transform: [{ scale: stickyAvatarScale }],
                opacity: stickyHeaderOpacity,
              },
            ]}
          >
            <Image
              source={{ uri: (avatar as string) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200" }}
              style={styles.stickyAvatarImage}
            />
            <View style={styles.stickyOnlineDot} />
          </Animated.View>

          <View style={styles.stickyInfoBlock}>
            <Animated.View
              style={[
                styles.stickyNameRatingRow,
                { transform: [{ translateX: stickyNameTranslateX }] },
              ]}
            >
              <Text style={styles.stickyChefNameText} numberOfLines={1}>
                {effectiveChefName}
              </Text>
              <View style={styles.stickyRatingPill}>
                <Ionicons name="star" size={10} color="#D4AF37" />
                <Text style={styles.stickyRatingValue}>{rating || "4.8"}</Text>
              </View>
            </Animated.View>

            <Animated.Text
              style={[
                styles.stickyCuisinesText,
                {
                  opacity: stickySubInfoOpacity,
                  transform: [{ translateY: stickySubInfoTranslateY }],
                },
              ]}
              numberOfLines={1}
            >
              {specialty || "Telugu"}&nbsp;&nbsp;•&nbsp;&nbsp;
              <Text style={styles.stickyTimeHighlight}>30–45 min delivery</Text>
            </Animated.Text>

            <Animated.Text
              style={[
                styles.stickyLocationText,
                {
                  opacity: stickySubInfoOpacity,
                  transform: [{ translateY: stickySubInfoTranslateY }],
                },
              ]}
              numberOfLines={1}
            >
              📍 {locationText || "Hyderabad"}
            </Animated.Text>
          </View>
        </View>
      </Animated.View>

      {/* ── SCROLLABLE CONTENT CANVAS ─────────────────────────────────────── */}
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
          <ChefHeaderBannerCarousel
            banners={dynamicBanners}
            fallbackImage={fallbackHeroImage}
          />
        </Animated.View>

        <View style={styles.mainDetailsCard}>
          <View style={styles.topEdgeMergedBadge}>
            <Text style={styles.topChefText}>Top Chef</Text>
          </View>

          <View style={styles.titleRow}>
            <View style={styles.nameBadgeContainer}>
              <View style={styles.profileAvatarWrapper}>
                <Image
                  source={{ uri: (avatar as string) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200" }}
                  style={styles.profileAvatarImage}
                />
              </View>
              <Text style={styles.chefNameText} numberOfLines={1}>
                {effectiveChefName}
              </Text>
            </View>
          </View>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={15} color="#EBA334" />
            <Text style={styles.ratingValueText}>{rating || "4.8"}</Text>
            <Text style={styles.ratingCountText}>(120)</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.mealsDeliveredText}>300+ meals delivered</Text>
          </View>

          <Text style={styles.cuisineText}>
            {specialty || "Telugu"} • Home-style Cooking
          </Text>

          <View style={styles.metricGridContainer}>
            <View style={styles.metricItemColumn}>
              <View style={styles.metricIconLabelRow}>
                <Feather name="clock" size={15} color="#49552D" />
                <Text style={styles.metricValueText}>30–45 min</Text>
              </View>
              <Text style={styles.metricSubTitleLabel}>Delivery Time</Text>
            </View>

            <View style={styles.metricItemColumn}>
              <View style={styles.metricIconLabelRow}>
                <Feather name="trending-up" size={15} color="#49552D" />
                <Text style={styles.metricValueText}>2.5 km</Text>
              </View>
              <Text style={styles.metricSubTitleLabel}>Distance</Text>
            </View>

            <View style={styles.metricItemColumn}>
              <View style={styles.metricIconLabelRow}>
                <Ionicons name="heart-outline" size={15} color="#49552D" />
                <Text style={styles.metricValueText}>₹150</Text>
              </View>
              <Text style={styles.metricSubTitleLabel}>Delivery Fee</Text>
            </View>
          </View>

          {/* DYNAMIC DISH SPECIFICATION LAYOUT GRID */}
          <View style={styles.sectionDividerBlock} />
          <View style={styles.popularSectionTitleRow}>
            <Text style={styles.sectionLabelHeading}>Popular Dishes</Text>
          </View>

          {categoriesLoading ? (
            <Text style={styles.loadingTextContainer}>Loading dishes...</Text>
          ) : chefCategories.length > 0 ? (
            <View style={styles.dishesHorizontalContainer}>
              {chefCategories.map((cat: any) => {
                const hasMenu = chefMenus.some((m: any) =>
                  m.categoryId === cat._id ||
                  m.chefCategoryId === cat._id ||
                  m.name?.trim().toLowerCase() === cat.name?.trim().toLowerCase()
                );

                const parsedPriceString = typeof price === "string" ? price : Array.isArray(price) ? price[0] : "";
                const dynamicDisplayPrice = parsedPriceString ? parsedPriceString.split("@")[1]?.trim() || "₹129" : "₹129";

                const isMealBox = cat.name?.trim().toLowerCase().replace(/\s+/g, "") === "mealbox";
                const isCatering = cat.name?.trim().toLowerCase().includes("catering");

                return (
                  <TouchableOpacity
                    key={cat._id}
                    style={styles.dishCompactCard}
                    activeOpacity={0.9}
                    onPress={() => {
                      if (isMealBox) {
                        router.push({
                          pathname: "/screens/MealBoxPlans",
                          params: {
                            id: effectiveChefId,
                            chefId: effectiveChefId,
                            chefName: effectiveChefName,
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                            categoryId: cat._id,
                            chefImage: avatar as string,
                            rating: rating as string,
                            location: locationText || "Hyderabad",
                          },
                        });
                      } else if (hasMenu || isCatering) {
                        router.push({
                          pathname: "/screens/CateringMealPlans",
                          params: {
                            id: effectiveChefId,
                            chefId: effectiveChefId,
                            chefName: effectiveChefName,
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                            categoryId: cat._id,
                            name: effectiveChefName,
                            rating: rating as string,
                            location: locationText || "Hyderabad",
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
                            chefName: effectiveChefName,
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                            categoryId: cat._id,
                            name: effectiveChefName,
                            rating: rating as string,
                            location: locationText || "Hyderabad",
                            category: cat.name,
                            hasCatering: "false",
                          },
                        });
                      }
                    }}
                  >
                    <Image
                      source={{ uri: cat.heroImageUrl || "https://via.placeholder.com/300x200" }}
                      style={styles.dishCardImage}
                    />
                    <View style={styles.dishCardContent}>
                      <Text style={styles.dishCardTitle} numberOfLines={1}>{cat.name}</Text>
                      <View style={styles.dishCardMetaRow}>
                        <View style={styles.dishCardRating}>
                          <Ionicons name="star" size={12} color="#EBA334" />
                          <Text style={styles.dishRatingValue}>{rating || "4.8"}</Text>
                        </View>
                        <Text style={styles.dishPriceText}>{dynamicDisplayPrice}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyTextContainer}>
              No specialty dishes added by this chef yet
            </Text>
          )}

          {/* EDITORIAL ABOUT SECTION */}
          <View style={styles.sectionDividerBlock} />
          <Text style={styles.sectionLabelHeading}>About Me</Text>
          <Text style={styles.aboutDescriptionText}>
            Namaste! I'm {effectiveChefName}. I love cooking traditional home-style meals with fresh ingredients and lots of love. Dedicated to providing healthy kitchen hygiene standards.
          </Text>
          <Text style={styles.aboutLocationSubText}>{locationText || "Hyderabad"}, Telangana</Text>

          {/* DYNAMIC DESIGN CHIP LIST PILLS */}
          <View style={styles.sectionDividerBlock} />
          <Text style={styles.sectionLabelHeading}>My Specialties</Text>
          <View style={styles.specialtiesChipsWrapper}>
            <View style={styles.specialtyChipItem}>
              <Text style={styles.specialtyChipText}>Pappu Annam</Text>
            </View>
            <View style={styles.specialtyChipItem}>
              <Text style={styles.specialtyChipText}>Pulihora</Text>
            </View>
            <View style={styles.specialtyChipItem}>
              <Text style={styles.specialtyChipText}>Gongura Pachadi</Text>
            </View>
            <View style={styles.specialtyChipItem}>
              <Text style={styles.specialtyChipText}>Sambar Annam</Text>
            </View>
            <View style={styles.specialtyChipItem}>
              <Text style={styles.specialtyChipText}>Curd Rice</Text>
            </View>
          </View>

        </View>
      </Animated.ScrollView>

      {/* ── FLOATING BACK BUTTON ── */}
      <Animated.View
        style={[
          styles.floatingBackButtonWrapper,
          { opacity: floatingButtonsOpacity },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.floatingBackButton}
          onPress={() => router.back()}
          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
        >
          <Feather name="chevron-left" size={26} color="#111111" />
        </TouchableOpacity>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF6F0",
  },
  centerLoaderContainer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // ─── PREMIUM DESIGN STICKY HEADER ───────────────────────────────────────

  stickyHeaderWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 146,
    zIndex: 20,
    overflow: "hidden",
    shadowColor: "#1A1512",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  stickyAndroidBackground: {
    backgroundColor: "rgba(252, 249, 245, 0.98)",
  },

  stickyBottomBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#EDE6DC",
  },

  stickyContentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
  },

  stickyBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EDE6DC",
    shadowColor: "#1E1A16",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  stickyAvatarWrapper: {
    position: "relative",
  },

  stickyAvatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EFEBE4",
    resizeMode: "cover",
    borderWidth: 1.5,
    borderColor: "#E5D9C8",
  },

  stickyOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: "#52C97A",
    borderWidth: 2,
    borderColor: "#FAF6F0",
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
    fontSize: 17,
    fontWeight: "800",
    color: "#1A1512",
    letterSpacing: -0.4,
    flexShrink: 1,
    marginRight: 6,
  },

  stickyRatingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFDF9",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2D3BE",
    gap: 2.5,
  },

  stickyRatingValue: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#1A1512",
  },

  stickyCuisinesText: {
    fontSize: 12.5,
    color: "#6E655F",
    fontWeight: "600",
    letterSpacing: -0.1,
    marginTop: 0,
  },

  stickyTimeHighlight: {
    color: "#49552D",
    fontWeight: "700",
  },

  stickyLocationText: {
    fontSize: 12,
    color: "#8A7E75",
    fontWeight: "600",
    letterSpacing: -0.1,
    marginTop: 3,
  },

  // ─── CANVAS DISPLAY CANVAS ───────────────────────────────────────────────

  scrollContent: {
    paddingBottom: 40,
  },

  heroCoverWrapper: {
    width: width,
    height: HERO_HEIGHT,
    position: "relative",
  },

  heroCoverContainer: {
    width: width,
    height: HERO_HEIGHT,
    backgroundColor: "#EFEBE4",
    position: "relative",
  },

  heroBannerScrollView: {
    width: width,
    height: "100%",
  },

  heroCoverImage: {
    width: width,
    height: HERO_HEIGHT,
    resizeMode: "cover",
  },

  heroPaginationContainer: {
    position: "absolute",
    bottom: 38,
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
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },

  heroPaginationDotActive: {
    width: 14,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFFFFF",
  },

  // ─── FLOATING BACK BUTTON (outside scroll, always on top) ───────────────

  floatingBackButtonWrapper: {
    position: "absolute",
    top: 52,
    left: 20,
    zIndex: 15,
  },

  floatingBackButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  mainDetailsCard: {
    flex: 1,
    backgroundColor: "#FAF6F0",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    paddingHorizontal: 22,
    paddingTop: 28,
    position: "relative",
  },

  /* TOP CHEF BADGE MERGED ON THE TOP-RIGHT EDGE TIP OF THE BEIGE BODY */
  topEdgeMergedBadge: {
    position: "absolute",
    top: 0,
    right: 24,
    backgroundColor: "#FDF1E2",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#FAD8B5",
    zIndex: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingRight: 80, // Leaves clearance for top-edge pinned badge
  },

  nameBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  profileAvatarWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    padding: 2,
    borderWidth: 1.5,
    borderColor: "#E2D3BE",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: "center",
    alignItems: "center",
  },

  profileAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 21,
    resizeMode: "cover",
  },

  chefNameText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1E1A16",
    letterSpacing: -0.3,
    flexShrink: 1,
    lineHeight: 23,
    includeFontPadding: false,
    textAlignVertical: "center",
  },

  topChefText: {
    color: "#D08535",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  ratingValueText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#E29543",
    marginLeft: 5,
  },

  ratingCountText: {
    color: "#8E8781",
    fontSize: 15,
    marginLeft: 3,
  },

  metaDot: {
    color: "#CBBFB5",
    fontSize: 14,
    paddingHorizontal: 6,
  },

  mealsDeliveredText: {
    fontSize: 14,
    color: "#655E58",
    fontWeight: "600",
  },

  cuisineText: {
    fontSize: 14.5,
    color: "#776F68",
    fontWeight: "500",
    marginTop: 8,
  },

  metricGridContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFFDFB",
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDE6DC",
  },

  metricItemColumn: {
    alignItems: "center",
    flex: 1,
  },

  metricIconLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  metricValueText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2C2621",
    letterSpacing: -0.1,
  },

  metricSubTitleLabel: {
    fontSize: 11.5,
    color: "#9E968F",
    fontWeight: "600",
    marginTop: 4,
  },

  sectionDividerBlock: {
    height: 1,
    backgroundColor: "#F1EAE1",
    marginVertical: 24,
  },

  sectionLabelHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E1A16",
    letterSpacing: -0.2,
    marginBottom: 16,
  },

  aboutDescriptionText: {
    fontSize: 15,
    color: "#5C554F",
    lineHeight: 23,
    fontWeight: "400",
  },

  aboutLocationSubText: {
    fontSize: 14,
    color: "#918981",
    fontWeight: "600",
    marginTop: 8,
  },

  popularSectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  viewAllTextLink: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#C47C30",
  },

  dishesHorizontalContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },

  dishCompactCard: {
    width: "48%",
    backgroundColor: "#FFFDFB",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EDE6DC",
    overflow: "hidden",
    marginBottom: 6,
    shadowColor: "#1A1512",
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  dishCoverContainer: {
    display: "none",
  },

  dishCardImage: {
    width: "100%",
    height: 120,
    resizeMode: "cover",
  },

  dishCardContent: {
    padding: 12,
  },

  dishCardTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#231F1B",
    letterSpacing: -0.1,
  },

  dishCardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },

  dishCardRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  dishRatingValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E1A16",
  },

  dishPriceText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#49552D",
  },

  loadingTextContainer: {
    paddingVertical: 12,
    color: "#8E867F",
    fontWeight: "500",
  },

  emptyTextContainer: {
    paddingVertical: 16,
    color: "#8E867F",
    fontWeight: "500",
  },

  specialtiesChipsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },

  specialtyChipItem: {
    backgroundColor: "#FAF4EC",
    borderWidth: 1,
    borderColor: "#F4E2CD",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 15,
  },

  specialtyChipText: {
    fontSize: 14,
    color: "#483626",
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});