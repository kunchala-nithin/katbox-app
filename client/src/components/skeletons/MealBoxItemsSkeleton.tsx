import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

export interface MealBoxItemsSkeletonProps {
  /** Number of meal sections (Lunch / Dinner) to render. @default 2 */
  mealCount?: number;
  /** Number of customization boxes per meal. @default 2 */
  sectionsPerMeal?: number;
  /** Number of item rows per section. @default 3 */
  itemsPerSection?: number;
  /** Duration (ms) of one shimmer sweep. @default 1400 */
  shimmerDuration?: number;
  /** Disable the shimmer animation. @default false */
  disableShimmer?: boolean;
  /** Optional style override for the outer container. */
  style?: ViewStyle;
}

/* -------------------------------------------------------------------------- */
/*                                CONSTANTS                                   */
/* -------------------------------------------------------------------------- */

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const KATBOX = {
  bg: "#FAF8F5",
  card: "#FFFFFF",
  cardSoft: "#F4F1EA",
  border: "rgba(15, 56, 42, 0.08)",
  borderLine: "rgba(15, 56, 42, 0.12)",
  borderSoft: "rgba(15, 56, 42, 0.05)",
  skeleton: "rgba(15, 56, 42, 0.08)",
  skeletonSoft: "rgba(15, 56, 42, 0.06)",
  skeletonLighter: "rgba(15, 56, 42, 0.04)",
  heroFallback: "#E5ECE8",
  overlay: "rgba(0, 0, 0, 0.04)",
  shimmer: {
    transparent: "rgba(255, 255, 255, 0)",
    highlight: "rgba(255, 255, 255, 0.6)",
  },
} as const;

const HERO_HEIGHT = 270;
const SHIMMER_LOOP_RANGE = SCREEN_WIDTH * 1.5;

/* -------------------------------------------------------------------------- */
/*                          MEMOIZED SUB-COMPONENTS                           */
/* -------------------------------------------------------------------------- */

const SummaryColumnSkeleton = memo(function SummaryColumnSkeleton({
  showDivider,
}: {
  showDivider: boolean;
}) {
  return (
    <>
      {showDivider && <View style={styles.summaryDividerLine} />}
      <View style={styles.summaryColumn}>
        <View style={styles.summaryIconCircle} />
        <View style={styles.summaryValueText} />
        <View style={styles.summaryLabelText} />
      </View>
    </>
  );
});

const FeatureItemSkeleton = memo(function FeatureItemSkeleton() {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon} />
      <View style={styles.featureTitle} />
    </View>
  );
});

const CustomizationItemRowSkeleton = memo(
  function CustomizationItemRowSkeleton({ isLast }: { isLast: boolean }) {
    return (
      <View>
        <View style={styles.interactiveRow}>
          <View style={styles.foodItemLeft}>
            <View style={styles.circularFoodThumb} />
            <View style={{ flex: 1 }}>
              <View style={styles.foodItemNameLine} />
              <View style={styles.foodItemSubLine} />
            </View>
          </View>
          <View style={styles.radioCircle} />
        </View>
        {!isLast && <View style={styles.innerRowDivider} />}
      </View>
    );
  }
);

const CustomizationBoxSkeleton = memo(function CustomizationBoxSkeleton({
  itemCount,
}: {
  itemCount: number;
}) {
  return (
    <View style={styles.customizationBox}>
      <View style={styles.headerStepContainer}>
        <View style={styles.sectionStepTitle} />
        <View style={styles.badgeContainer} />
      </View>

      {Array.from({ length: itemCount }).map((_, i) => (
        <CustomizationItemRowSkeleton key={i} isLast={i === itemCount - 1} />
      ))}
    </View>
  );
});

const DayTabSkeleton = memo(function DayTabSkeleton() {
  return <View style={styles.dayTab} />;
});

const MealCardSkeleton = memo(function MealCardSkeleton({
  isFirst,
  sectionCount,
  itemsPerSection,
}: {
  isFirst: boolean;
  sectionCount: number;
  itemsPerSection: number;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.unifiedDayAndMealCard}>
        {/* Collapsible meal header row */}
        <View style={styles.integratedMealSubRow}>
          <View style={styles.integratedMealTextLeft}>
            <View style={styles.mealTitleWithIcon}>
              <View style={styles.mealBadgeDot} />
              <View style={styles.customMealTypeLabel} />
            </View>
            <View style={styles.mealActionSubtitle} />
          </View>
          <View style={styles.bannerMealImage} />
        </View>

        {/* Divider + day selector only on first meal card */}
        {isFirst && (
          <>
            <View style={styles.integratedDividerLine} />

            <View style={styles.integratedDaySelectorRow}>
              <View style={styles.embeddedDayTabsWrapper}>
                <View style={styles.dayTabs}>
                  <DayTabSkeleton />
                  <DayTabSkeleton />
                  <DayTabSkeleton />
                  <DayTabSkeleton />
                  <DayTabSkeleton />
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {Array.from({ length: sectionCount }).map((_, i) => (
        <CustomizationBoxSkeleton key={i} itemCount={itemsPerSection} />
      ))}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const MealBoxItemsSkeleton: FC<MealBoxItemsSkeletonProps> = ({
  mealCount = 2,
  sectionsPerMeal = 2,
  itemsPerSection = 3,
  shimmerDuration = 1400,
  disableShimmer = false,
  style,
}) => {
  const insets = useSafeAreaInsets();
  const shimmer = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  /* ---------- Accessibility: respect OS reduced-motion preference -------- */
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        if (mounted) setReduceMotion(enabled);
      }
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  /* ------------------------ Shimmer animation loop ----------------------- */
  useEffect(() => {
    if (disableShimmer || reduceMotion) return;

    const animation = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: shimmerDuration,
        useNativeDriver: true,
        isInteraction: false,
      })
    );
    animation.start();

    return () => {
      animation.stop();
      shimmer.setValue(0);
    };
  }, [disableShimmer, reduceMotion, shimmer, shimmerDuration]);

  const translateX = useMemo(
    () =>
      shimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [-SHIMMER_LOOP_RANGE, SHIMMER_LOOP_RANGE],
      }),
    [shimmer]
  );

  const summaryIndices = useMemo(
    () => [0, 1, 2],
    []
  );
  const featureIndices = useMemo(
    () => [0, 1, 2],
    []
  );
  const mealIndices = useMemo(
    () => Array.from({ length: mealCount }, (_, i) => i),
    [mealCount]
  );

  const heroBackBtnTop = useMemo(
    () => Math.max(insets.top, 16) + 8,
    [insets.top]
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading meal box"
      accessibilityState={{ busy: true }}
      testID="meal-box-items-skeleton"
    >
      {/* ---------------------------- SCROLLABLE BODY ---------------------- */}
      <View style={styles.scrollContent}>
        {/* -------------------------- HERO IMAGE ------------------------- */}
        <View style={styles.heroContainer}>
          <View style={styles.heroImage} />
          <View style={styles.heroImageOverlay} />
          <View
            style={[styles.floatingImageBackBtn, { top: heroBackBtnTop }]}
          >
            <View style={styles.backBtnCircle} />
          </View>
        </View>

        {/* ----------------------- MAIN DETAILS CARD --------------------- */}
        <View style={styles.mainCardView}>
          {/* Title + badge */}
          <View style={styles.titleRow}>
            <View style={styles.planTitle} />
            <View style={styles.popularBadge} />
          </View>

          {/* Subtitle */}
          <View style={styles.planSubtitleLine1} />
          <View style={styles.planSubtitleLine2} />

          {/* Summary stat box */}
          <View style={styles.summaryContainerBox}>
            {summaryIndices.map((i) => (
              <SummaryColumnSkeleton key={i} showDivider={i > 0} />
            ))}
          </View>

          {/* Features row */}
          <View style={styles.featuresRow}>
            {featureIndices.map((i) => (
              <FeatureItemSkeleton key={i} />
            ))}
          </View>

          {/* Sample menu header */}
          <View style={styles.sampleMenuHeader}>
            <View style={styles.sampleMenuTitle} />
            <View style={styles.sampleMenuSubtitle} />
          </View>
        </View>

        {/* -------------------- MENU SCROLLABLE CONTAINER ---------------- */}
        <View style={styles.menuScrollableContainer}>
          {mealIndices.map((i) => (
            <MealCardSkeleton
              key={i}
              isFirst={i === 0}
              sectionCount={sectionsPerMeal}
              itemsPerSection={itemsPerSection}
            />
          ))}
        </View>
      </View>

      {/* ------------------------- SHIMMER OVERLAY ---------------------- */}
      {!disableShimmer && !reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmerWrapper, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={[
              KATBOX.shimmer.transparent,
              KATBOX.shimmer.highlight,
              KATBOX.shimmer.transparent,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmer}
          />
        </Animated.View>
      )}
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  STYLES                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: KATBOX.bg,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  /* ------------------------------ HERO --------------------------------- */
  heroContainer: {
    position: "relative",
    width: "100%",
    height: HERO_HEIGHT,
    backgroundColor: KATBOX.heroFallback,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    backgroundColor: KATBOX.skeleton,
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: KATBOX.overlay,
  },
  floatingImageBackBtn: {
    position: "absolute",
    left: 18,
    zIndex: 10,
  },
  backBtnCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
  },

  /* --------------------------- MAIN CARD ------------------------------- */
  mainCardView: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: KATBOX.bg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  planTitle: {
    flex: 1,
    height: 24,
    borderRadius: 8,
    backgroundColor: KATBOX.skeleton,
    marginRight: 12,
  },
  popularBadge: {
    width: 96,
    height: 24,
    borderRadius: 14,
    backgroundColor: KATBOX.skeletonSoft,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
  },
  planSubtitleLine1: {
    width: "100%",
    height: 12,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 6,
  },
  planSubtitleLine2: {
    width: "68%",
    height: 12,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 18,
  },

  /* --------------------------- SUMMARY BOX ----------------------------- */
  summaryContainerBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.border,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  summaryColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: KATBOX.skeletonSoft,
    marginBottom: 6,
  },
  summaryValueText: {
    width: 58,
    height: 11,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  summaryLabelText: {
    width: 46,
    height: 9,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 5,
  },
  summaryDividerLine: {
    width: 1,
    height: 36,
    backgroundColor: KATBOX.border,
  },

  /* --------------------------- FEATURES ROW ---------------------------- */
  featuresRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: KATBOX.skeletonLighter,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: KATBOX.border,
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featureIcon: {
    width: 13,
    height: 13,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  featureTitle: {
    width: 62,
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeleton,
  },

  /* -------------------------- SAMPLE MENU HEADER ----------------------- */
  sampleMenuHeader: {
    marginBottom: 8,
  },
  sampleMenuTitle: {
    width: 220,
    height: 18,
    borderRadius: 6,
    backgroundColor: KATBOX.skeleton,
  },
  sampleMenuSubtitle: {
    width: 260,
    height: 12,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 6,
  },

  /* ---------------------------- MENU CONTAINER ------------------------- */
  menuScrollableContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  /* --------------------------- MEAL CARD ------------------------------- */
  unifiedDayAndMealCard: {
    backgroundColor: KATBOX.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  integratedMealSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  integratedMealTextLeft: {
    flex: 1,
    paddingRight: 10,
  },
  mealTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  customMealTypeLabel: {
    width: 130,
    height: 15,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  mealActionSubtitle: {
    width: 190,
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 6,
  },
  bannerMealImage: {
    width: 76,
    height: 52,
    borderRadius: 12,
    backgroundColor: KATBOX.skeleton,
  },
  integratedDividerLine: {
    height: 1,
    backgroundColor: KATBOX.borderSoft,
    marginTop: 12,
    marginBottom: 12,
  },
  integratedDaySelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  embeddedDayTabsWrapper: {
    flex: 1,
  },
  dayTabs: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.card,
    padding: 4,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
    gap: 4,
  },
  dayTab: {
    width: 44,
    height: 30,
    borderRadius: 18,
    backgroundColor: KATBOX.skeleton,
  },

  /* ------------------------ CUSTOMIZATION BOX -------------------------- */
  customizationBox: {
    backgroundColor: KATBOX.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  headerStepContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionStepTitle: {
    width: 110,
    height: 15,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  badgeContainer: {
    width: 76,
    height: 22,
    borderRadius: 10,
    backgroundColor: KATBOX.skeletonSoft,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
  },

  /* ------------------------- ITEM ROW --------------------------------- */
  interactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  foodItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  circularFoodThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: KATBOX.skeleton,
  },
  foodItemNameLine: {
    width: "72%",
    height: 13,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  foodItemSubLine: {
    width: "48%",
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 6,
  },
  innerRowDivider: {
    height: 1,
    backgroundColor: KATBOX.borderSoft,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: KATBOX.borderLine,
    backgroundColor: KATBOX.card,
  },

  /* ------------------------------ SHIMMER ------------------------------ */
  shimmerWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  shimmer: {
    width: "100%",
    height: "100%",
  },
});

export default memo(MealBoxItemsSkeleton);