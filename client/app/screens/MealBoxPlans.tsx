import React, { useRef, useState, useEffect } from "react";
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

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const filterCategories = ["All Plans", "Breakfast", "Lunch", "Snacks", "Dinner", "Lunch + Dinner"];

const STATUS_BAR_PADDING = Platform.OS === "ios" ? 48 : (StatusBar.currentHeight || 24);
const SCROLL_THRESHOLD = 70;

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
  const [isNonVeg, setIsNonVeg] = useState(false);
  const toggleAnim = useRef(new Animated.Value(0)).current;

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [headerHeight, setHeaderHeight] = useState(Platform.OS === "ios" ? 220 : 205);

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

  const handleToggleVeg = () => {
    const nextVal = !isNonVeg;
    setIsNonVeg(nextVal);
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

  const getFilteredPlans = () => {
    let list = plans;

    // Filter by Veg/Non-Veg
    list = list.filter((plan) => {
      const isPlanNonVeg =
        plan.isNonVeg === true ||
        plan.isVeg === false ||
        plan.foodType?.toLowerCase() === "non-veg" ||
        plan.name?.toLowerCase().includes("non-veg") ||
        plan.category?.toLowerCase().includes("non-veg");

      return isNonVeg ? isPlanNonVeg : !isPlanNonVeg;
    });

    // Filter by Category
    if (selectedCategory === "All Plans") return list;
    return list.filter((plan) => {
      const planCat = plan.category?.toLowerCase() || "";
      if (selectedCategory === "Breakfast") return planCat.includes("breakfast");
      if (selectedCategory === "Lunch") return planCat === "lunch";
      if (selectedCategory === "Snacks") return planCat.includes("snack");
      if (selectedCategory === "Dinner") return planCat.includes("dinner");
      if (selectedCategory === "Lunch + Dinner") return planCat.includes("lunch") && (planCat.includes("dinner") || planCat.includes("din"));
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

  const renderVegToggle = (compact = false) => {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleToggleVeg}
        style={[
          compact ? styles.vegToggleContainerCompact : styles.vegToggleContainer,
          isNonVeg ? styles.vegToggleNonVegBorder : styles.vegToggleVegBorder,
        ]}
      >
        <View
          style={[
            compact ? styles.vegSquareBoxCompact : styles.vegSquareBox,
            isNonVeg ? styles.vegSquareBoxNonVeg : styles.vegSquareBoxVeg,
          ]}
        >
          <View
            style={[
              compact ? styles.vegInnerDotCompact : styles.vegInnerDot,
              isNonVeg ? styles.vegInnerDotNonVeg : styles.vegInnerDotVeg,
            ]}
          />
        </View>

        <Text
          style={[
            compact ? styles.vegToggleTextCompact : styles.vegToggleText,
            isNonVeg ? styles.vegTextNonVeg : styles.vegTextVeg,
          ]}
        >
          {isNonVeg ? "Non-Veg" : "Veg"}
        </Text>

        <View
          style={[
            compact ? styles.switchTrackCompact : styles.switchTrack,
            isNonVeg ? styles.switchTrackNonVeg : styles.switchTrackVeg,
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
              transform: [
                { translateY: titleTranslateY },
                { scale: titleScale }
              ]
            }
          ]}
          pointerEvents={(scrollY as any).__getValue?.() >= SCROLL_THRESHOLD ? "none" : "auto"}
        >
          <View style={styles.mainTitleRow}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={handleBackPress}
              activeOpacity={0.75}
            >
              <Ionicons name="chevron-back" size={20} color="#0D2E22" />
            </TouchableOpacity>

            {renderVegToggle(false)}
          </View>

          <View style={styles.heroTextContainer}>
            <Text style={styles.screenTitle} numberOfLines={1}>
              Meal Boxes
            </Text>
            <Text style={styles.screenSubtitle} numberOfLines={1}>
              {effectiveChefName
                ? `Curated ${isNonVeg ? "non-veg" : "veg"} meal plans by ${effectiveChefName}`
                : `Choose your favorite ${isNonVeg ? "non-veg" : "veg"} meal schedule and enjoy`}
            </Text>
          </View>
        </Animated.View>

        <Animated.View 
          style={[
            styles.stickyHeaderWrapper, 
            { 
              opacity: stickyHeaderOpacity,
              transform: [{ translateY: stickyHeaderTranslateY }]
            }
          ]}
          pointerEvents={(scrollY as any).__getValue?.() >= SCROLL_THRESHOLD ? "auto" : "none"}
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

            <View style={{ marginLeft: 8 }}>
              {renderVegToggle(true)}
            </View>
          </View>
        </Animated.View>

        <View style={styles.pillsOuterWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsScrollContainer}
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
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 16 }]}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
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
              There are no {isNonVeg ? "non-veg" : "veg"} {selectedCategory === "All Plans" ? "active" : selectedCategory.toLowerCase()} meal plans available right now.
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

                    <TouchableOpacity style={styles.bookmarkButton} activeOpacity={0.75}>
                      <Ionicons name="bookmark-outline" size={18} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={styles.textOverlayContainer}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.name || item.title}</Text>
                      <Text style={styles.cardSubtitle} numberOfLines={2}>{item.description || item.subtitle}</Text>
                    </View>
                  </View>

                  <View style={styles.detailsContainer}>
                    <View style={styles.infoRow}>
                      <Ionicons name="time-outline" size={16} color="#0F382A" />
                      <Text style={styles.infoRowText}>{displayMealsPerDay}</Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Ionicons name="calendar-outline" size={16} color="#0F382A" />
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
                        <Ionicons name="arrow-forward" size={15} color="#FAF8F5" style={styles.buttonArrow} />
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
                    <Ionicons name="sparkles" size={10} color="#FAF8F5" style={styles.premiumPriceBadgeIcon} />
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
                    <Ionicons name="restaurant-outline" size={19} color={isSingleMealExpanded ? "#FAF8F5" : "#166534"} />
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
                    size={16} 
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
                    <Ionicons name="sparkles-outline" size={19} color={isFlexibleExpanded ? "#FAF8F5" : "#166534"} />
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
                    size={16} 
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
                    <Ionicons name="calendar-clear-outline" size={20} color={isWeeklyExpanded ? "#FAF8F5" : "#166534"} />
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
                    size={16} 
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
                  <Ionicons name="sparkles" size={14} color="#166534" />
                  <Text style={styles.stepperSectionHeading}>How it works</Text>
                </View>
                <View style={styles.stepperRowWrapper}>
                  <View style={styles.stepSingleBlock}>
                    <View style={styles.stepIconOuterBubble}>
                      <Ionicons name="options" size={15} color="#166534" />
                    </View>
                    <Text style={styles.stepTextLabelTitle}>1. Style</Text>
                    <Text style={styles.stepTextLabelDesc}>Choose a cycle</Text>
                  </View>

                  <View style={styles.stepConnectingBarDivider} />

                  <View style={styles.stepSingleBlock}>
                    <View style={styles.stepIconOuterBubble}>
                      <Ionicons name="calendar" size={15} color="#166534" />
                    </View>
                    <Text style={styles.stepTextLabelTitle}>2. Date</Text>
                    <Text style={styles.stepTextLabelDesc}>4-hr notice rule</Text>
                  </View>

                  <View style={styles.stepConnectingBarDivider} />

                  <View style={styles.stepSingleBlock}>
                    <View style={styles.stepIconOuterBubble}>
                      <Ionicons name="checkmark-circle" size={15} color="#166534" />
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
    paddingBottom: 6,
  },
  mainTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
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
  vegToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    gap: 6,
  },
  vegToggleContainerCompact: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 3.5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  vegToggleVegBorder: {
    borderColor: "#107C41",
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
    borderColor: "#107C41",
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
    backgroundColor: "#107C41",
  },
  vegInnerDotNonVeg: {
    backgroundColor: "#D32F2F",
  },
  vegToggleText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  vegToggleTextCompact: {
    fontSize: 9.5,
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
    backgroundColor: "#107C41",
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
    marginTop: 2,
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 27,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  screenSubtitle: {
    fontSize: 13.5,
    color: "#4F6B61",
    marginTop: 4,
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
    paddingTop: 2,
  },
  pillsScrollContainer: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 14,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    height: 40,
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
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  pillText: {
    fontSize: 13,
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
    marginBottom: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 205,
    backgroundColor: "#E5ECE8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  cardTopBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    backgroundColor: "rgba(250, 248, 245, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  cardTopBadgeText: {
    color: "#0F382A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  bookmarkButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(11, 38, 29, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  textOverlayContainer: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.4,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#E5ECE8",
    marginTop: 4,
    fontWeight: "500",
    lineHeight: 18,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  detailsContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoRowText: {
    fontSize: 13.5,
    color: "#4F6B61",
    marginLeft: 8,
    fontWeight: "600",
  },
  cardDividerLine: {
    height: 1,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    marginVertical: 12,
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
    fontSize: 18,
    fontWeight: "900",
    color: "#0B261D",
  },
  priceNumber: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0B261D",
    marginLeft: 2,
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontSize: 13,
    color: "#5B756C",
    fontWeight: "600",
    marginLeft: 3,
  },
  savingsText: {
    color: "#0F382A",
    fontSize: 11.5,
    fontWeight: "700",
    marginTop: 2,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  selectButtonText: {
    color: "#FAF8F5",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  buttonArrow: {
    marginLeft: 6,
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
    height: SCREEN_HEIGHT * 0.48,
    backgroundColor: "#FAF8F5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 25,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.08)",
  },
  modalContentSheetExpanded: {
    height: SCREEN_HEIGHT * 0.68, 
  },
  modalHeaderIndicatorRow: {
    alignItems: "center",
    paddingVertical: 12,
  },
  modalPillHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(22, 101, 52, 0.15)",
  },
  modalMetaInfoSection: {
    marginBottom: 16,
    alignItems: "center",
  },
  modalMainTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#5B756C",
    marginTop: 4,
    fontWeight: "500",
    textAlign: "center",
  },
  modalOptionsContainer: {
    gap: 14,
    paddingBottom: 32,
  },
  modalCategoryOptionContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.08)",
    overflow: "hidden",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    position: "relative",
  },
  modalCategoryOptionContainerActive: {
    borderColor: "#166534",
    borderWidth: 1.5,
    shadowOpacity: 0.08,
  },
  modalCategoryOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  modalIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    marginLeft: 14,
  },
  modalOptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalOptionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  modalOptionTitleActive: {
    color: "#166534",
  },
  luxuryMiniBadge: {
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
  },
  luxuryMiniBadgeText: {
    color: "#166534",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  premiumPriceBadgeAbsolute: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#166534",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 16,
    zIndex: 10,
  },
  premiumPriceBadgeIcon: {
    marginRight: 4,
  },
  premiumPriceBadgeText: {
    color: "#FAF8F5",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  modalOptionDescription: {
    fontSize: 12,
    color: "#5B756C",
    marginTop: 4,
    fontWeight: "500",
    lineHeight: 16,
  },
  luxuryArrowStyle: {
    opacity: 0.75,
  },
  expandedCalendarWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(22, 101, 52, 0.06)",
    backgroundColor: "#FFFFFF",
  },
  calendarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  calendarSectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B261D",
  },
  selectedCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  calendarStripScroll: {
    gap: 10,
    paddingRight: 16,
    paddingBottom: 4,
  },
  dateBoxCard: {
    width: 68,
    height: 78,
    borderRadius: 16,
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
    fontSize: 11.5,
    fontWeight: "600",
    marginBottom: 2,
  },
  dateBoxDayNumber: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  dateBoxMonthName: {
    fontSize: 10.5,
    fontWeight: "600",
    marginTop: 2,
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
    borderRadius: 14,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmFlexButtonDisabled: {
    backgroundColor: "#8E9F97",
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmFlexButtonText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
  },
  stepperMainCardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.08)",
    marginTop: 8,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  stepperHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    justifyContent: "center",
  },
  stepperSectionHeading: {
    fontSize: 12.5,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(22, 101, 52, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.1)",
  },
  stepTextLabelTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0B261D",
    textAlign: "center",
  },
  stepTextLabelDesc: {
    fontSize: 10,
    fontWeight: "500",
    color: "#5B756C",
    textAlign: "center",
    marginTop: 2,
    lineHeight: 12,
    paddingHorizontal: 2,
  },
  stepConnectingBarDivider: {
    height: 1,
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    flex: 0.3,
    marginTop: -26,
  },
});