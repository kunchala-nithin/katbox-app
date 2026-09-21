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
  FlatList,
  ActivityIndicator,
  Modal,
  Dimensions,
  LayoutAnimation,
  UIManager,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";
import MealBoxPlansSkeleton from "@/src/components/skeletons/MealBoxPlansSkeleton";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const filterCategories = ["All Plans", "Breakfast", "Lunch", "Snacks", "Dinner"];

const STATUS_BAR_PADDING = Platform.OS === "ios" ? 48 : (StatusBar.currentHeight || 24);
const SCROLL_THRESHOLD = 70;

// ─── Collapsed-header geometry (mirrors HomeChefDetail) ───
// The sticky header sits at `top: STATUS_BAR_PADDING + STICKY_TOP_OFFSET`
// with a height of STICKY_HEIGHT, so its bottom edge sits at
// `STATUS_BAR_PADDING + STICKY_TOP_OFFSET + STICKY_HEIGHT`. Adding PILLS_GAP
// gives the exact spot (in content-local coordinates, i.e. below the
// container's own STATUS_BAR_PADDING) where the pills should rest once the
// header is collapsed.
const STICKY_TOP_OFFSET = 4;
const STICKY_HEIGHT = 48;
const PILLS_GAP = 6;
const TARGET_PILLS_TOP_IN_CONTENT = STICKY_TOP_OFFSET + STICKY_HEIGHT + PILLS_GAP; // 58

const LAYOUT_ANIM_CONFIG = LayoutAnimation.create(
  220,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity
);

const generateUpcomingDays = (planCategory = "") => {
  const daysList = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const now = new Date();
  const currentHour = now.getHours();

  let cutoffHour = 10;
  const cat = planCategory.toLowerCase();

  if (cat.includes("breakfast")) {
    cutoffHour = 4;
  } else if (cat.includes("lunch") && cat.includes("dinner")) {
    cutoffHour = 9;
  } else if (cat.includes("lunch")) {
    cutoffHour = 9;
  } else if (cat.includes("snack")) {
    cutoffHour = 13;
  } else if (cat.includes("dinner")) {
    cutoffHour = 16;
  }

  for (let i = 0; i < 24; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayOfWeekIndex = date.getDay();
    const localIsoString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const isToday = i === 0;
    const isPastCutoff = isToday && currentHour >= cutoffHour;

    daysList.push({
      id: `date-${i}`,
      dayName: dayNames[dayOfWeekIndex],
      dayNumber: date.getDate(),
      monthName: monthNames[date.getMonth()],
      fullDateString: localIsoString,
      isSunday: dayOfWeekIndex === 0,
      isSaturday: dayOfWeekIndex === 6,
      isPastCutoff: isPastCutoff,
    });
  }
  return daysList;
};

const MealBoxPlans = () => {
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [selectedCategory, setSelectedCategory] = useState("All Plans");
  const categoryListRef = useRef<FlatList<string> | null>(null);

  const handleCategoryPress = (category: string) => {
    const categoryIndex = filterCategories.indexOf(category);

    setSelectedCategory(category);

    if (categoryIndex >= 0) {
      requestAnimationFrame(() => {
        categoryListRef.current?.scrollToIndex({
          index: categoryIndex,
          animated: true,
          viewPosition: 0.5,
          viewOffset: 0,
        });
      });
    }
  };

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [headerHeight, setHeaderHeight] = useState(Platform.OS === "ios" ? 220 : 205);

  // Tracks whether the header is collapsed. This is the ONLY thing that
  // decides the header's real layout below (full header vs. a small fixed
  // spacer). Because it's real layout — not a manually-computed transform —
  // the container's onLayout below always measures the correct height,
  // which headerHeight feeds straight into the scroll content's paddingTop.
  // There is exactly one source of truth, so no separate calculation can
  // ever drift out of sync and leave a gap.
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollapsedRef = useRef(false);

  const [showSkeleton, setShowSkeleton] = useState(false);

  const [isModalVisibleState, setIsModalVisibleState] = useState(false);
  const [selectedPlanData, setSelectedPlanData] = useState<any>(null);

  const [isWeeklyExpanded, setIsWeeklyExpanded] = useState(false);
  const [isFlexibleExpanded, setIsFlexibleExpanded] = useState(false);
  const [isSingleMealExpanded, setIsSingleMealExpanded] = useState(false);

  const [selectedWeeklyDateIds, setSelectedWeeklyDateIds] = useState<string[]>([]);
  const [selectedDateIds, setSelectedDateIds] = useState<string[]>([]);
  const [selectedSingleDateId, setSelectedSingleDateId] = useState<string | null>(null);

  const [upcomingCalendarDays, setUpcomingCalendarDays] = useState(() => generateUpcomingDays());

  const { id, chefId, chefName, userId, userName, location, chefImage, avatar, rating, fromCategory } = params;
  const effectiveChefId = (chefId as string) || (id as string) || "";
  const effectiveChefName = (chefName as string) || "";
  const effectiveUserId = (userId as string) || "";
  const effectiveUserName = (userName as string) || "";

  const stickyDisplayTitle = effectiveChefName ? effectiveChefName : "Meal Boxes";
  const stickyDisplaySubtitle = location ? `${location}` : "Meal Box Categories";

  const activeImageUri = (chefImage as string) || (avatar as string);
  const chefAvatar = activeImageUri ? { uri: activeImageUri } : { uri: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=150" };
  const displayRating = rating ? (rating as string) : "4.8";

  useEffect(() => {
    const fetchChefPlans = async () => {
      if (!effectiveChefId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await api.get(`/api/chef-categories/plans/chef/${effectiveChefId}`);
        if (res.data && Array.isArray(res.data)) {
          const chefScopedPlans = res.data.filter((p: any) => {
            if (!p.chefId) return true;
            const pChefId = typeof p.chefId === "object" ? p.chefId._id || p.chefId.id : p.chefId;
            return String(pChefId) === String(effectiveChefId);
          });
          setPlans(chefScopedPlans);
        } else {
          setPlans([]);
        }
      } catch (err) {
        console.log("Error fetching chef dynamic plan packages in MealBoxPlans:", err);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };
    fetchChefPlans();
  }, [effectiveChefId]);

  useEffect(() => {
    const isInitialLoad = loading && plans.length === 0 && !!effectiveChefId;
    if (!isInitialLoad) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [loading, plans.length, effectiveChefId]);

  const getFilteredPlans = () => {
    let list = plans;

    if (selectedCategory === "All Plans") return list;
    return list.filter((plan) => {
      const planCat = plan.category?.toLowerCase() || "";
      if (selectedCategory === "Breakfast") return planCat.includes("breakfast");
      if (selectedCategory === "Lunch") return planCat === "lunch";
      if (selectedCategory === "Snacks") return planCat.includes("snack");
      if (selectedCategory === "Dinner") return planCat.includes("dinner");
      return true;
    });
  };

  const titleTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -32],
    extrapolate: "clamp",
  });

  const titleScale = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.92],
    extrapolate: "clamp",
  });

  const mainHeaderOpacity = scrollY.interpolate({
    inputRange: [0, 45],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const stickyHeaderTranslateY = scrollY.interpolate({
    inputRange: [25, 75],
    outputRange: [20, 0],
    extrapolate: "clamp",
  });

  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [40, 75],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const shadowBorderOpacity = scrollY.interpolate({
    inputRange: [0, 45],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Animated scroll event that also notifies us when the collapse threshold
  // is crossed. setState is only fired on threshold changes → no per-frame
  // re-renders, so scrolling animation stays perfectly smooth. When the
  // threshold flips we ask LayoutAnimation to smoothly animate the resulting
  // real layout change (header shrinking/growing, pills + content sliding),
  // instead of us trying to hand-compute a matching pixel offset ourselves.
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
            LayoutAnimation.configureNext(LAYOUT_ANIM_CONFIG);
            setIsCollapsed(collapsed);
          }
        },
      }
    ),
    [scrollY]
  );

  const handleBackPress = () => {
    router.replace({
      pathname: "/screens/AllChefCards",
      params: {
        fromCategory: "Meal Box",
        filterMealBox: "true"
      },
    });
  };

  const openPlanModal = (item: any, displayMealsPerDay: string, displayMealsPerWeek: string, planImgUrl: string) => {
    setSelectedPlanData({
      item,
      displayMealsPerDay,
      displayMealsPerWeek,
      planImgUrl
    });

    setUpcomingCalendarDays(generateUpcomingDays(item.category));

    setIsWeeklyExpanded(false);
    setIsFlexibleExpanded(false);
    setIsSingleMealExpanded(false);
    setSelectedWeeklyDateIds([]);
    setSelectedDateIds([]);
    setSelectedSingleDateId(null);
    setIsModalVisibleState(true);
  };

  const handleWeeklyDateSelectionToggle = (dayItem: any) => {
    if (dayItem.isPastCutoff) {
      alert("Today's cutoff time for this meal category has passed. Same-day operations require at least 4 hours advance notice.");
      return;
    }
    if (dayItem.isSunday || dayItem.isSaturday) {
      alert("Weekends are unavailable for structured weekly delivery services. Please select a weekday.");
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (selectedWeeklyDateIds.includes(dayItem.id)) {
      setSelectedWeeklyDateIds([]);
      return;
    }

    const startIndex = upcomingCalendarDays.findIndex((d) => d.id === dayItem.id);
    if (startIndex === -1) return;

    const automaticallySelectedIds: string[] = [];
    let currentIndex = startIndex;

    while (automaticallySelectedIds.length < 5 && currentIndex < upcomingCalendarDays.length) {
      const candidateDay = upcomingCalendarDays[currentIndex];
      if (!candidateDay.isSunday && !candidateDay.isSaturday) {
        automaticallySelectedIds.push(candidateDay.id);
      }
      currentIndex++;
    }

    setSelectedWeeklyDateIds(automaticallySelectedIds);
  };

  const handleDateSelectionToggle = (dayItem: any) => {
    if (dayItem.isPastCutoff) {
      alert("Today's cutoff time for this meal category has passed. Same-day operations require at least 4 hours advance notice.");
      return;
    }
    if (dayItem.isSunday) {
      alert("Sundays are unavailable for delivery services. Please choose another delivery window.");
      return;
    }

    setSelectedDateIds((prevIds) => {
      if (prevIds.includes(dayItem.id)) {
        return prevIds.filter((id) => id !== dayItem.id);
      } else {
        if (prevIds.length >= 6) {
          alert("Maximum limit reached. You can select up to 6 days only.");
          return prevIds;
        }
        return [...prevIds, dayItem.id];
      }
    });
  };

  const handleSingleDateSelectionToggle = (dayItem: any) => {
    if (dayItem.isPastCutoff) {
      alert("Today's cutoff time for this meal category has passed. Same-day operations require at least 4 hours advance notice.");
      return;
    }
    if (dayItem.isSunday) {
      alert("Sundays are unavailable for delivery services. Please choose another delivery window.");
      return;
    }
    setSelectedSingleDateId(dayItem.id);
  };

  const handlePlanSelection = (durationCategory: string) => {
    if (!selectedPlanData) return;

    if (durationCategory === "Weekly Plan" && selectedWeeklyDateIds.length === 0) {
      alert("Please choose a start date from the calendar timeline.");
      return;
    }

    if (durationCategory === "Flexible Days" && selectedDateIds.length === 0) {
      alert("Please choose at least one delivery day from the calendar.");
      return;
    }

    if (durationCategory === "Single Meal" && !selectedSingleDateId) {
      alert("Please choose a delivery day from the calendar.");
      return;
    }

    setIsModalVisibleState(false);

    const { item, displayMealsPerDay, displayMealsPerWeek, planImgUrl } = selectedPlanData;

    let selectedDaysMetadata: any[] = [];
    if (durationCategory === "Weekly Plan") {
      selectedDaysMetadata = upcomingCalendarDays
        .filter((d) => selectedWeeklyDateIds.includes(d.id))
        .map((d) => ({
          dayName: d.dayName,
          dayNumber: String(d.dayNumber),
          monthName: d.monthName,
          fullDateString: d.fullDateString,
        }));
    } else if (durationCategory === "Flexible Days") {
      selectedDaysMetadata = upcomingCalendarDays
        .filter((d) => selectedDateIds.includes(d.id))
        .map((d) => ({
          dayName: d.dayName,
          dayNumber: String(d.dayNumber),
          monthName: d.monthName,
          fullDateString: d.fullDateString,
        }));
    } else if (durationCategory === "Single Meal") {
      selectedDaysMetadata = upcomingCalendarDays
        .filter((d) => d.id === selectedSingleDateId)
        .map((d) => ({
          dayName: d.dayName,
          dayNumber: String(d.dayNumber),
          monthName: d.monthName,
          fullDateString: d.fullDateString,
        }));
    }

    router.push({
      pathname: "/screens/MealBoxItems",
      params: {
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        userId: effectiveUserId,
        userName: effectiveUserName,
        location: location,
        chefImage: chefImage,
        avatar: avatar,
        rating: rating,
        planId: item._id || item.id,
        planName: item.name || item.title,
        planPrice: item.price,
        category: item.category,
        description: item.description || item.subtitle,
        mealsPerDay: displayMealsPerDay,
        mealsPerWeek: displayMealsPerWeek,
        planImage: planImgUrl,
        selectedDurationType: durationCategory,
        chosenFlexibleDates: (durationCategory === "Weekly Plan" || durationCategory === "Flexible Days" || durationCategory === "Single Meal") ? JSON.stringify(selectedDaysMetadata) : undefined,
      },
    });
  };

  const visibleWeeklyDays = selectedWeeklyDateIds.length > 0
    ? upcomingCalendarDays.filter((day) => selectedWeeklyDateIds.includes(day.id))
    : upcomingCalendarDays;

  const singleMealStartingPrice = (() => {
    if (!selectedPlanData || !selectedPlanData.item) return null;
    const rawBase = parseInt(String(selectedPlanData.item.price || "0").replace(/[^0-9]/g, ""), 10) || 0;
    if (rawBase <= 0) return null;
    const computed = Math.round((rawBase / 5) * 1.35);
    return computed;
  })();

  if (showSkeleton) {
    return <MealBoxPlansSkeleton />;
  }

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

        {isCollapsed ? (
          // Fully collapsed: swap the tall "Meal Boxes" block for a small
          // fixed-height spacer. This is REAL layout (not a faked transform),
          // so the container's onLayout above measures the true shrunk
          // height, which flows straight into headerHeight → the scroll
          // content's paddingTop. That's the only place a "gap" could ever
          // come from, and now there's nothing left to miscalculate.
          <View style={styles.collapsedHeaderSpacer} pointerEvents="none" />
        ) : (
          <Animated.View
            style={[
              styles.mainHeaderWrapper,
              {
                opacity: mainHeaderOpacity,
                transform: [
                  { translateY: titleTranslateY },
                  { scale: titleScale }
                ]
              }
            ]}
            pointerEvents="auto"
          >
            <View style={styles.mainTitleRow}>
              <TouchableOpacity
                style={styles.actionIconButton}
                onPress={handleBackPress}
                activeOpacity={0.75}
              >
                <Ionicons name="chevron-back" size={20} color="#0D2E22" />
              </TouchableOpacity>
            </View>

            <View style={styles.heroTextContainer}>
              <Text style={styles.screenTitle} numberOfLines={1}>
                Meal Boxes
              </Text>
              <Text style={styles.screenSubtitle} numberOfLines={1}>
                {effectiveChefName
                  ? `Curated meal plans by ${effectiveChefName}`
                  : "Choose your favorite meal schedule and enjoy"}
              </Text>
            </View>
          </Animated.View>
        )}

        <Animated.View
          style={[
            styles.stickyHeaderWrapper,
            {
              opacity: stickyHeaderOpacity,
              transform: [{ translateY: stickyHeaderTranslateY }]
            }
          ]}
          pointerEvents={isCollapsed ? "auto" : "none"}
        >
          <View style={styles.navBarRow}>
            <TouchableOpacity
              style={styles.actionIconButtonCompact}
              onPress={handleBackPress}
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
                  <Ionicons name="location-sharp" size={10} color="#0F382A" />
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
          </View>
        </Animated.View>

        <View
          style={styles.pillsOuterWrapper}
          pointerEvents="box-none"
          onStartShouldSetResponder={() => false}
          onMoveShouldSetResponder={() => false}
          onStartShouldSetResponderCapture={() => false}
          onMoveShouldSetResponderCapture={() => false}
        >
          <FlatList
            ref={categoryListRef}
            data={filterCategories}
            horizontal={true}
            keyExtractor={(item) => item}
            getItemLayout={(_, index) => ({
              length: 82,
              offset: index * 90,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              const fallbackOffset = Math.max(0, info.index * 90 - 90);
              categoryListRef.current?.scrollToOffset({
                offset: fallbackOffset,
                animated: true,
              });
            }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsScrollContainer}
            style={styles.pillsScrollView}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            directionalLockEnabled={true}
            keyboardShouldPersistTaps="handled"
            bounces={true}
            alwaysBounceHorizontal={true}
            overScrollMode="always"
            removeClippedSubviews={false}
            decelerationRate="fast"
            scrollEventThrottle={16}
            renderItem={({ item }) => {
              const isSelected = selectedCategory === item;
              return (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleCategoryPress(item)}
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
            }}
            ItemSeparatorComponent={() => <View style={styles.pillSeparator} />}
          />
        </View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 12 }]}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#166534" />
            <Text style={styles.loadingSubtitleText}>Loading meal plans...</Text>
          </View>
        ) : getFilteredPlans().length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={28} color="#0F382A" />
            </View>
            <Text style={styles.emptyTitle}>No Plans Available</Text>
            <Text style={styles.emptySubtitle}>
              There are no {selectedCategory === "All Plans" ? "active" : selectedCategory.toLowerCase()} meal plans available right now.
            </Text>
          </View>
        ) : (
          getFilteredPlans().map((item) => {
            const planImgUrl = item.heroImageUrl || item.image;
            const displayMealsPerDay = item.mealsPerDay
              ? (String(item.mealsPerDay).toLowerCase().includes("meal") ? item.mealsPerDay : `${item.mealsPerDay} Meals / Day`)
              : "2 Meals / Day";

            const displayMealsPerWeek = item.mealsPerWeek
              ? (String(item.mealsPerWeek).toLowerCase().includes("meal") ? item.mealsPerWeek : `${item.mealsPerWeek} Meals / Week`)
              : "20 Meals / Week";

            return (
              <View key={item._id || item.id} style={styles.cardShadowWrapper}>
                <Pressable
                  style={({ pressed }) => [
                    styles.cardSurface,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => openPlanModal(item, displayMealsPerDay, displayMealsPerWeek, planImgUrl)}
                >
                  <View style={styles.imageContainer}>
                    <Image source={{ uri: planImgUrl }} style={styles.cardImage} />

                    <View style={styles.cardTopBadge}>
                      <Text style={styles.cardTopBadgeText}>{item.category?.toUpperCase() || "MEAL BOX"}</Text>
                    </View>

                    <View style={styles.textOverlayContainer}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.name || item.title}</Text>
                      <Text style={styles.cardSubtitle} numberOfLines={2}>{item.description || item.subtitle}</Text>
                    </View>
                  </View>

                  <View style={styles.detailsContainer}>
                    <View style={styles.infoRow}>
                      <Ionicons name="time-outline" size={13} color="#0F382A" />
                      <Text style={styles.infoRowText}>{displayMealsPerDay}</Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Ionicons name="calendar-outline" size={13} color="#0F382A" />
                      <Text style={styles.infoRowText}>{displayMealsPerWeek}</Text>
                    </View>

                    <View style={styles.cardDividerLine} />

                    <View style={styles.footerRow}>
                      <View style={styles.priceContainer}>
                        <View style={styles.priceFlexBlock}>
                          <Text style={styles.currencySymbol}>₹</Text>
                          <Text style={styles.priceNumber}>{item.price}</Text>
                          <Text style={styles.pricePeriod}>/ week</Text>
                        </View>
                        <Text style={styles.savingsText}>Save up to 10%</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.selectButton}
                        activeOpacity={0.85}
                        onPress={() => openPlanModal(item, displayMealsPerDay, displayMealsPerWeek, planImgUrl)}
                      >
                        <Text style={styles.selectButtonText}>Select Plan</Text>
                        <Ionicons name="arrow-forward" size={13} color="#FAF8F5" style={styles.buttonArrow} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          })
        )}
      </Animated.ScrollView>

      {/* SEMI-BLURRED BOTTOM MODAL */}
      <Modal
        visible={isModalVisibleState}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsModalVisibleState(false)}
      >
        <View style={styles.modalRootWrapper}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

          <TouchableOpacity
            style={styles.modalDismissTracker}
            activeOpacity={1}
            onPress={() => setIsModalVisibleState(false)}
          />

          <View style={[
            styles.modalContentSheet,
            (isWeeklyExpanded || isFlexibleExpanded || isSingleMealExpanded) && styles.modalContentSheetExpanded
          ]}>
            <View style={styles.modalHeaderIndicatorRow}>
              <View style={styles.modalPillHandle} />
            </View>

            <View style={styles.modalMetaInfoSection}>
              <Text style={styles.modalMainTitle}>Select Configuration</Text>
              <Text style={styles.modalSubtitle}>Choose a delivery schedule that suits you best</Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalOptionsContainer}
            >
              {/* Option 1: Single Meal Box */}
              <View style={[
                styles.modalCategoryOptionContainer,
                isSingleMealExpanded && styles.modalCategoryOptionContainerActive
              ]}>
                {singleMealStartingPrice !== null && (
                  <View style={styles.premiumPriceBadgeAbsolute}>
                    <Ionicons name="sparkles" size={9} color="#FAF8F5" style={styles.premiumPriceBadgeIcon} />
                    <Text style={styles.premiumPriceBadgeText}>Starts @ ₹{singleMealStartingPrice}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.modalCategoryOptionHeader}
                  activeOpacity={0.8}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setIsSingleMealExpanded(!isSingleMealExpanded);
                    setIsWeeklyExpanded(false);
                    setIsFlexibleExpanded(false);
                  }}
                >
                  <View style={[
                    styles.modalIconWrapper,
                    isSingleMealExpanded ? styles.modalIconWrapperActive : styles.modalIconWrapperInactive
                  ]}>
                    <Ionicons name="restaurant-outline" size={16} color={isSingleMealExpanded ? "#FAF8F5" : "#166534"} />
                  </View>
                  <View style={styles.modalOptionTextContent}>
                    <View style={styles.modalOptionTitleRow}>
                      <Text style={[
                        styles.modalOptionTitle,
                        isSingleMealExpanded && styles.modalOptionTitleActive
                      ]}>Single Meal Box</Text>
                    </View>
                    <Text style={styles.modalOptionDescription}>Order a single trial meal box</Text>
                  </View>
                  <Ionicons
                    name={isSingleMealExpanded ? "chevron-down-sharp" : "chevron-forward-sharp"}
                    size={14}
                    color="#0B261D"
                    style={styles.luxuryArrowStyle}
                  />
                </TouchableOpacity>

                {isSingleMealExpanded && (
                  <View style={styles.expandedCalendarWrapper}>
                    <View style={styles.calendarLabelRow}>
                      <Text style={styles.calendarSectionLabel}>Select Delivery Day</Text>
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.calendarStripScroll}
                      nestedScrollEnabled={true}
                    >
                      {upcomingCalendarDays.map((day) => {
                        const isDateSelected = selectedSingleDateId === day.id;
                        const isDisabled = day.isSunday || day.isPastCutoff;
                        return (
                          <TouchableOpacity
                            key={day.id}
                            activeOpacity={isDisabled ? 1 : 0.9}
                            onPress={() => handleSingleDateSelectionToggle(day)}
                            style={[
                              styles.dateBoxCard,
                              isDateSelected ? styles.dateBoxCardActive : styles.dateBoxCardInactive,
                              isDisabled && styles.dateBoxCardDisabled
                            ]}
                          >
                            <Text style={[
                              styles.dateBoxDayName,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.dayName}
                            </Text>
                            <Text style={[
                              styles.dateBoxDayNumber,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.dayNumber}
                            </Text>
                            <Text style={[
                              styles.dateBoxMonthName,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.isPastCutoff ? "Closed" : day.monthName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.confirmFlexButton,
                        !selectedSingleDateId && styles.confirmFlexButtonDisabled
                      ]}
                      activeOpacity={!selectedSingleDateId ? 1 : 0.9}
                      onPress={() => handlePlanSelection("Single Meal")}
                    >
                      <Text style={styles.confirmFlexButtonText}>
                        {!selectedSingleDateId ? "Select Day to Confirm" : "Confirm Delivery Date"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Option 2: Flexible Days */}
              <View style={[
                styles.modalCategoryOptionContainer,
                isFlexibleExpanded && styles.modalCategoryOptionContainerActive
              ]}>
                <TouchableOpacity
                  style={styles.modalCategoryOptionHeader}
                  activeOpacity={0.8}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setIsFlexibleExpanded(!isFlexibleExpanded);
                    setIsWeeklyExpanded(false);
                    setIsSingleMealExpanded(false);
                  }}
                >
                  <View style={[
                    styles.modalIconWrapper,
                    isFlexibleExpanded ? styles.modalIconWrapperActive : styles.modalIconWrapperInactive
                  ]}>
                    <Ionicons name="sparkles-outline" size={16} color={isFlexibleExpanded ? "#FAF8F5" : "#166534"} />
                  </View>
                  <View style={styles.modalOptionTextContent}>
                    <View style={styles.modalOptionTitleRow}>
                      <Text style={[
                        styles.modalOptionTitle,
                        isFlexibleExpanded && styles.modalOptionTitleActive
                      ]}>Flexible Days</Text>
                      <View style={styles.luxuryMiniBadge}>
                        <Text style={styles.luxuryMiniBadgeText}>CUSTOM DATES</Text>
                      </View>
                    </View>
                    <Text style={styles.modalOptionDescription}>Pick your own delivery dates (Max 6 days)</Text>
                  </View>
                  <Ionicons
                    name={isFlexibleExpanded ? "chevron-down-sharp" : "chevron-forward-sharp"}
                    size={14}
                    color="#0B261D"
                    style={styles.luxuryArrowStyle}
                  />
                </TouchableOpacity>

                {isFlexibleExpanded && (
                  <View style={styles.expandedCalendarWrapper}>
                    <View style={styles.calendarLabelRow}>
                      <Text style={styles.calendarSectionLabel}>Select Random Days</Text>
                      {selectedDateIds.length > 0 && (
                        <Text style={styles.selectedCountText}>{selectedDateIds.length} / 6 Selected</Text>
                      )}
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.calendarStripScroll}
                      nestedScrollEnabled={true}
                    >
                      {upcomingCalendarDays.map((day) => {
                        const isDateSelected = selectedDateIds.includes(day.id);
                        const isDisabled = day.isSunday || day.isPastCutoff;
                        return (
                          <TouchableOpacity
                            key={day.id}
                            activeOpacity={isDisabled ? 1 : 0.9}
                            onPress={() => handleDateSelectionToggle(day)}
                            style={[
                              styles.dateBoxCard,
                              isDateSelected ? styles.dateBoxCardActive : styles.dateBoxCardInactive,
                              isDisabled && styles.dateBoxCardDisabled
                            ]}
                          >
                            <Text style={[
                              styles.dateBoxDayName,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.dayName}
                            </Text>
                            <Text style={[
                              styles.dateBoxDayNumber,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.dayNumber}
                            </Text>
                            <Text style={[
                              styles.dateBoxMonthName,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.isPastCutoff ? "Closed" : day.monthName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.confirmFlexButton,
                        selectedDateIds.length === 0 && styles.confirmFlexButtonDisabled
                      ]}
                      activeOpacity={selectedDateIds.length === 0 ? 1 : 0.9}
                      onPress={() => handlePlanSelection("Flexible Days")}
                    >
                      <Text style={styles.confirmFlexButtonText}>
                        {selectedDateIds.length === 0 ? "Select Days to Confirm" : "Confirm Custom Schedule"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Option 3: Weekly Plan */}
              <View style={[
                styles.modalCategoryOptionContainer,
                isWeeklyExpanded && styles.modalCategoryOptionContainerActive
              ]}>
                <TouchableOpacity
                  style={styles.modalCategoryOptionHeader}
                  activeOpacity={0.8}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setIsWeeklyExpanded(!isWeeklyExpanded);
                    setIsFlexibleExpanded(false);
                    setIsSingleMealExpanded(false);
                  }}
                >
                  <View style={[
                    styles.modalIconWrapper,
                    isWeeklyExpanded ? styles.modalIconWrapperActive : styles.modalIconWrapperInactive
                  ]}>
                    <Ionicons name="calendar-clear-outline" size={17} color={isWeeklyExpanded ? "#FAF8F5" : "#166534"} />
                  </View>
                  <View style={styles.modalOptionTextContent}>
                    <View style={styles.modalOptionTitleRow}>
                      <Text style={[
                        styles.modalOptionTitle,
                        isWeeklyExpanded && styles.modalOptionTitleActive
                      ]}>Weekly Plan</Text>
                      <View style={styles.luxuryMiniBadge}>
                        <Text style={styles.luxuryMiniBadgeText}>MOST POPULAR</Text>
                      </View>
                    </View>
                    <Text style={styles.modalOptionDescription}>Regular daily delivery from Monday to Friday</Text>
                  </View>
                  <Ionicons
                    name={isWeeklyExpanded ? "chevron-down-sharp" : "chevron-forward-sharp"}
                    size={14}
                    color="#0B261D"
                    style={styles.luxuryArrowStyle}
                  />
                </TouchableOpacity>

                {isWeeklyExpanded && (
                  <View style={styles.expandedCalendarWrapper}>
                    <View style={styles.calendarLabelRow}>
                      <Text style={styles.calendarSectionLabel}>Select Start Date</Text>
                      {selectedWeeklyDateIds.length > 0 && (
                        <Text style={styles.selectedCountText}>5 Days Scheduled</Text>
                      )}
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.calendarStripScroll}
                      nestedScrollEnabled={true}
                    >
                      {visibleWeeklyDays.map((day) => {
                        const isDateSelected = selectedWeeklyDateIds.includes(day.id);
                        const isWeekend = day.isSunday || day.isSaturday;
                        const isDisabled = isWeekend || day.isPastCutoff;
                        return (
                          <TouchableOpacity
                            key={day.id}
                            activeOpacity={isDisabled ? 1 : 0.9}
                            onPress={() => handleWeeklyDateSelectionToggle(day)}
                            style={[
                              styles.dateBoxCard,
                              isDateSelected ? styles.dateBoxCardActive : styles.dateBoxCardInactive,
                              isDisabled && styles.dateBoxCardDisabled
                            ]}
                          >
                            <Text style={[
                              styles.dateBoxDayName,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.dayName}
                            </Text>
                            <Text style={[
                              styles.dateBoxDayNumber,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.dayNumber}
                            </Text>
                            <Text style={[
                              styles.dateBoxMonthName,
                              isDateSelected ? styles.dateBoxTextActive : styles.dateBoxTextInactive,
                              isDisabled && styles.dateBoxTextDisabled
                            ]}>
                              {day.isPastCutoff ? "Closed" : day.monthName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.confirmFlexButton,
                        selectedWeeklyDateIds.length === 0 && styles.confirmFlexButtonDisabled
                      ]}
                      activeOpacity={selectedWeeklyDateIds.length === 0 ? 1 : 0.9}
                      onPress={() => handlePlanSelection("Weekly Plan")}
                    >
                      <Text style={styles.confirmFlexButtonText}>
                        {selectedWeeklyDateIds.length === 0 ? "Select Day to Confirm" : "Confirm Weekly Schedule"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* HOW IT WORKS SECTION */}
              <View style={styles.stepperMainCardContainer}>
                <View style={styles.stepperHeadingRow}>
                  <Ionicons name="sparkles" size={12} color="#166534" />
                  <Text style={styles.stepperSectionHeading}>How it works</Text>
                </View>
                <View style={styles.stepperRowWrapper}>
                  <View style={styles.stepSingleBlock}>
                    <View style={styles.stepIconOuterBubble}>
                      <Ionicons name="options" size={13} color="#166534" />
                    </View>
                    <Text style={styles.stepTextLabelTitle}>1. Style</Text>
                    <Text style={styles.stepTextLabelDesc}>Choose a cycle</Text>
                  </View>

                  <View style={styles.stepConnectingBarDivider} />

                  <View style={styles.stepSingleBlock}>
                    <View style={styles.stepIconOuterBubble}>
                      <Ionicons name="calendar" size={13} color="#166534" />
                    </View>
                    <Text style={styles.stepTextLabelTitle}>2. Date</Text>
                    <Text style={styles.stepTextLabelDesc}>4-hr notice rule</Text>
                  </View>

                  <View style={styles.stepConnectingBarDivider} />

                  <View style={styles.stepSingleBlock}>
                    <View style={styles.stepIconOuterBubble}>
                      <Ionicons name="checkmark-circle" size={13} color="#166534" />
                    </View>
                    <Text style={styles.stepTextLabelTitle}>3. Menu</Text>
                    <Text style={styles.stepTextLabelDesc}>Pick fresh meals</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default MealBoxPlans;

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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
    zIndex: -1,
  },
  mainHeaderWrapper: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  collapsedHeaderSpacer: {
    // Exactly the space needed so the pills row (rendered right after this)
    // lands at content-local y = TARGET_PILLS_TOP_IN_CONTENT — precisely
    // below the sticky header + its gap. Real height, so onLayout on the
    // parent container picks it up automatically; nothing else to sync.
    width: "100%",
    height: TARGET_PILLS_TOP_IN_CONTENT,
  },
  mainTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 6,
  },
  actionIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  actionIconButtonCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  tagBadgeText: {
    color: "#0F382A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  heroTextContainer: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  screenSubtitle: {
    fontSize: 12.5,
    color: "#4F6B61",
    marginTop: 3,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.1,
  },
  stickyHeaderWrapper: {
    position: "absolute",
    top: STATUS_BAR_PADDING + 4,
    left: 0,
    right: 0,
    width: "100%",
    height: 48,
    justifyContent: "center",
  },
  navBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 48,
  },
  stickyChefContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  avatarBorderRing: {
    padding: 1.5,
    borderRadius: 18,
    backgroundColor: "rgba(15, 56, 42, 0.15)",
    marginRight: 8,
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
    marginTop: 1,
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
    backgroundColor: "#0F382A",
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.2)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
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
    height: 46,
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
    zIndex: 100,
    elevation: 100,
  },
  pillsScrollView: {
    width: "100%",
    height: 46,
    flexGrow: 0,
    flexShrink: 0,
    zIndex: 101,
    elevation: 101,
  },
  pillsScrollContainer: {
    paddingHorizontal: 16,
    alignItems: "center",
    flexGrow: 0,
    flexDirection: "row",
  },
  pillSeparator: {
    width: 8,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    height: 34,
    minWidth: 82,
  },
  pillButtonActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  pillButtonInactive: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(15, 56, 42, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
  },
  activeDotIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFFFFF",
    marginRight: 5,
  },
  pillText: {
    fontSize: 12,
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
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  cardShadowWrapper: {
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    transform: [{ scale: 0.96 }],
  },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 155,
    backgroundColor: "#E5ECE8",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardTopBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(250, 248, 245, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  cardTopBadgeText: {
    color: "#0F382A",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  textOverlayContainer: {
    position: "absolute",
    bottom: 10,
    left: 12,
    right: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.4,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#E5ECE8",
    marginTop: 2,
    fontWeight: "500",
    lineHeight: 14,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  detailsContainer: {
    padding: 10,
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  infoRowText: {
    fontSize: 11.5,
    color: "#4F6B61",
    marginLeft: 6,
    fontWeight: "600",
  },
  cardDividerLine: {
    height: 1,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    marginVertical: 7,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceContainer: {
    justifyContent: "center",
  },
  priceFlexBlock: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0B261D",
  },
  priceNumber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B261D",
    marginLeft: 2,
    letterSpacing: -0.4,
  },
  pricePeriod: {
    fontSize: 11,
    color: "#5B756C",
    fontWeight: "600",
    marginLeft: 3,
  },
  savingsText: {
    color: "#0F382A",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  selectButtonText: {
    color: "#FAF8F5",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  buttonArrow: {
    marginLeft: 4,
  },
  loadingContainer: {
    marginTop: 60,
    alignItems: "center",
  },
  loadingSubtitleText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
    letterSpacing: 0.5,
  },
  emptyContainer: {
    marginTop: 50,
    alignItems: "center",
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
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
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "500",
  },
  modalRootWrapper: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11, 38, 29, 0.45)",
  },
  modalDismissTracker: {
    flex: 1,
  },
  modalContentSheet: {
    height: SCREEN_HEIGHT * 0.44,
    backgroundColor: "#FAF8F5",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 22,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.08)",
  },
  modalContentSheetExpanded: {
    height: SCREEN_HEIGHT * 0.62,
  },
  modalHeaderIndicatorRow: {
    alignItems: "center",
    paddingVertical: 10,
  },
  modalPillHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(22, 101, 52, 0.15)",
  },
  modalMetaInfoSection: {
    marginBottom: 12,
    alignItems: "center",
  },
  modalMainTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#5B756C",
    marginTop: 3,
    fontWeight: "500",
    textAlign: "center",
  },
  modalOptionsContainer: {
    gap: 10,
    paddingBottom: 24,
  },
  modalCategoryOptionContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.08)",
    overflow: "hidden",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    position: "relative",
  },
  modalCategoryOptionContainerActive: {
    borderColor: "#166534",
    borderWidth: 1.5,
    shadowOpacity: 0.06,
  },
  modalCategoryOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  modalIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalIconWrapperActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  modalIconWrapperInactive: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(22, 101, 52, 0.12)",
  },
  modalOptionTextContent: {
    flex: 1,
    marginLeft: 11,
  },
  modalOptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modalOptionTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  modalOptionTitleActive: {
    color: "#166534",
  },
  luxuryMiniBadge: {
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
  },
  luxuryMiniBadgeText: {
    color: "#166534",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  premiumPriceBadgeAbsolute: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
    zIndex: 10,
  },
  premiumPriceBadgeIcon: {
    marginRight: 3,
  },
  premiumPriceBadgeText: {
    color: "#FAF8F5",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  modalOptionDescription: {
    fontSize: 11,
    color: "#5B756C",
    marginTop: 3,
    fontWeight: "500",
    lineHeight: 14,
  },
  luxuryArrowStyle: {
    opacity: 0.75,
  },
  expandedCalendarWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(22, 101, 52, 0.06)",
    backgroundColor: "#FFFFFF",
  },
  calendarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  calendarSectionLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0B261D",
  },
  selectedCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  calendarStripScroll: {
    gap: 8,
    paddingRight: 12,
    paddingBottom: 3,
  },
  dateBoxCard: {
    width: 60,
    height: 68,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateBoxCardActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  dateBoxCardInactive: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(22, 101, 52, 0.12)",
  },
  dateBoxCardDisabled: {
    backgroundColor: "#F2EFEB",
    borderColor: "#E5E0D8",
    opacity: 0.5,
  },
  dateBoxDayName: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 1,
  },
  dateBoxDayNumber: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  dateBoxMonthName: {
    fontSize: 9.5,
    fontWeight: "600",
    marginTop: 1,
  },
  dateBoxTextActive: {
    color: "#FAF8F5",
  },
  dateBoxTextInactive: {
    color: "#4F6B61",
  },
  dateBoxTextDisabled: {
    color: "#9EA8A3",
  },
  confirmFlexButton: {
    backgroundColor: "#166534",
    borderRadius: 12,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  confirmFlexButtonDisabled: {
    backgroundColor: "#8E9F97",
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmFlexButtonText: {
    color: "#FAF8F5",
    fontSize: 13,
    fontWeight: "800",
  },
  stepperMainCardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.08)",
    marginTop: 6,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  stepperHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
    justifyContent: "center",
  },
  stepperSectionHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  stepperRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  stepSingleBlock: {
    alignItems: "center",
    flex: 1,
  },
  stepIconOuterBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(22, 101, 52, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.1)",
  },
  stepTextLabelTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0B261D",
    textAlign: "center",
  },
  stepTextLabelDesc: {
    fontSize: 9,
    fontWeight: "500",
    color: "#5B756C",
    textAlign: "center",
    marginTop: 1,
    lineHeight: 11,
    paddingHorizontal: 2,
  },
  stepConnectingBarDivider: {
    height: 1,
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    flex: 0.3,
    marginTop: -22,
  },
});