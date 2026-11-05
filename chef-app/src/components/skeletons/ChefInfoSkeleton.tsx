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

export interface ChefInfoSkeletonProps {
  /** Number of dish cards in the "Signature Categories & Dishes" grid. @default 4 */
  dishCardCount?: number;
  /** Number of specialty chips in "Culinary Expertise". @default 5 */
  specialtyChipCount?: number;
  /** Number of metric columns. @default 3 */
  metricCount?: number;
  /** Number of quality highlight cards. @default 3 */
  highlightCount?: number;
  /** Duration (ms) of one shimmer sweep. @default 1400 */
  shimmerDuration?: number;
  /** Disable the shimmer animation (useful for tests / snapshots). @default false */
  disableShimmer?: boolean;
  /** Optional style override for the outer container. */
  style?: ViewStyle;
}

/* -------------------------------------------------------------------------- */
/*                                CONSTANTS                                   */
/* -------------------------------------------------------------------------- */

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const KATBOX = {
  bg: "#F9F6F0",
  card: "#FFFFFF",
  cardSoft: "#F4F1EA",
  border: "#E6E2D6",
  borderSoft: "#EFECE6",
  skeleton: "rgba(20, 83, 45, 0.08)",
  skeletonSoft: "rgba(20, 83, 45, 0.06)",
  skeletonLighter: "rgba(20, 83, 45, 0.04)",
  heroFallback: "#EFECE6",
  overlay: "rgba(0, 0, 0, 0.06)",
  shimmer: {
    transparent: "rgba(255, 255, 255, 0)",
    highlight: "rgba(255, 255, 255, 0.6)",
  },
} as const;

const HERO_HEIGHT = 320;
const CARD_OVERLAP = -28;
const SHIMMER_LOOP_RANGE = SCREEN_WIDTH * 1.5;

/* -------------------------------------------------------------------------- */
/*                          MEMOIZED SUB-COMPONENTS                           */
/* -------------------------------------------------------------------------- */

const MetricColumn = memo(function MetricColumn({
  showDivider,
}: {
  showDivider: boolean;
}) {
  return (
    <>
      {showDivider && <View style={styles.metricDivider} />}
      <View style={styles.metricItemColumn}>
        <View style={styles.metricIconLabelRow}>
          <View style={styles.metricIconCircle} />
          <View style={styles.metricValueText} />
        </View>
        <View style={styles.metricSubTitleLabel} />
      </View>
    </>
  );
});

const DishCardSkeleton = memo(function DishCardSkeleton() {
  return (
    <View style={styles.dishCompactCard}>
      <View style={styles.dishCardImage} />
      <View style={styles.dishCardContent}>
        <View style={styles.dishCardTitle} />
      </View>
    </View>
  );
});

const SpecialtyChipSkeleton = memo(function SpecialtyChipSkeleton() {
  return (
    <View style={styles.specialtyChipItem}>
      <View style={styles.specialtyChipIcon} />
      <View style={styles.specialtyChipText} />
    </View>
  );
});

const HighlightCardSkeleton = memo(function HighlightCardSkeleton() {
  return (
    <View style={styles.highlightCard}>
      <View style={styles.highlightIconWrap} />
      <View style={styles.highlightTitle} />
      <View style={styles.highlightSub} />
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const ChefInfoSkeleton: FC<ChefInfoSkeletonProps> = ({
  dishCardCount = 4,
  specialtyChipCount = 5,
  metricCount = 3,
  highlightCount = 3,
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

  /* ---------- Pre-computed index arrays (stable across renders) ---------- */
  const metricIndices = useMemo(
    () => Array.from({ length: metricCount }, (_, i) => i),
    [metricCount]
  );
  const dishIndices = useMemo(
    () => Array.from({ length: dishCardCount }, (_, i) => i),
    [dishCardCount]
  );
  const chipIndices = useMemo(
    () => Array.from({ length: specialtyChipCount }, (_, i) => i),
    [specialtyChipCount]
  );
  const highlightIndices = useMemo(
    () => Array.from({ length: highlightCount }, (_, i) => i),
    [highlightCount]
  );

  const heroBackBtnTop = useMemo(
    () => Math.max(insets.top, 44) + 4,
    [insets.top]
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading chef profile"
      accessibilityState={{ busy: true }}
      testID="chef-info-skeleton"
    >
      {/* --------------------------- SCROLLABLE BODY ---------------------- */}
      <View style={styles.scrollContent}>
        {/* -------------------------- HERO BANNER -------------------------- */}
        <View style={styles.heroCoverWrapper}>
          <View style={styles.heroCoverImage} />
          <View style={styles.heroImageGradientOverlay} />
          {/* Pagination dots placeholder */}
          <View style={styles.heroPaginationContainer}>
            <View style={styles.heroPaginationDotActive} />
            <View style={styles.heroPaginationDot} />
            <View style={styles.heroPaginationDot} />
          </View>
        </View>

        {/* ------------------------ MAIN DETAILS CARD ---------------------- */}
        <View style={styles.mainDetailsCard}>
          {/* Top-edge Veg / Non-Veg merged badge */}
          <View style={styles.topEdgeMergedBadge}>
            <View style={styles.dietDotBox} />
            <View style={styles.topChefText} />
          </View>

          {/* Identity header row */}
          <View style={styles.titleRow}>
            <View style={styles.nameBadgeContainer}>
              <View style={styles.profileAvatarWrapper} />

              <View style={styles.nameInfoColumn}>
                <View style={styles.nameWithRatingRow}>
                  <View style={styles.chefNameText} />

                  <View style={styles.ratingAndReviewsColumn}>
                    <View style={styles.ratingBadgeBox} />
                    <View style={styles.viewReviewsLinkText} />
                  </View>
                </View>

                <View style={styles.inlineMetaRow}>
                  <View style={styles.inlineVerifiedIcon} />
                  <View style={styles.inlineVerifiedText} />
                </View>
              </View>
            </View>
          </View>

          {/* Cuisine line */}
          <View style={styles.cuisineTextLine1} />
          <View style={styles.cuisineTextLine2} />

          {/* Metrics grid */}
          <View style={styles.metricGridContainer}>
            {metricIndices.map((i) => (
              <MetricColumn key={i} showDivider={i > 0} />
            ))}
          </View>

          {/* Section divider */}
          <View style={styles.sectionDividerBlock} />

          {/* Signature Categories & Dishes */}
          <View style={styles.popularSectionTitleRow}>
            <View style={styles.sectionLabelHeading} />
            <View style={styles.sectionHeadingAccent} />
          </View>

          <View style={styles.dishesHorizontalContainer}>
            {dishIndices.map((i) => (
              <DishCardSkeleton key={i} />
            ))}
          </View>

          {/* Section divider */}
          <View style={styles.sectionDividerBlock} />

          {/* About The Chef */}
          <View style={styles.sectionLabelHeading} />
          <View style={styles.aboutLine} />
          <View style={styles.aboutLine} />
          <View style={styles.aboutLineShort} />
          <View style={styles.aboutLocationRow}>
            <View style={styles.aboutLocationIcon} />
            <View style={styles.aboutLocationText} />
          </View>

          {/* Section divider */}
          <View style={styles.sectionDividerBlock} />

          {/* Culinary Expertise */}
          <View style={styles.sectionLabelHeading} />
          <View style={styles.specialtiesChipsWrapper}>
            {chipIndices.map((i) => (
              <SpecialtyChipSkeleton key={i} />
            ))}
          </View>

          {/* Section divider */}
          <View style={styles.sectionDividerBlock} />

          {/* Katbox Quality Promise */}
          <View style={styles.sectionLabelHeading} />
          <View style={styles.highlightsWrap}>
            {highlightIndices.map((i) => (
              <HighlightCardSkeleton key={i} />
            ))}
          </View>
        </View>
      </View>

      {/* ------------------------- FLOATING BACK BTN ---------------------- */}
      <View style={[styles.floatingBackButtonWrapper, { top: heroBackBtnTop }]}>
        <View style={styles.floatingBackButton} />
      </View>

      {/* ------------------------- SHIMMER OVERLAY ------------------------ */}
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
    paddingBottom: 48,
  },

  /* ------------------------------ HERO --------------------------------- */
  heroCoverWrapper: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: "relative",
    backgroundColor: KATBOX.heroFallback,
  },
  heroCoverImage: {
    width: "100%",
    height: "100%",
    backgroundColor: KATBOX.skeleton,
  },
  heroImageGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: KATBOX.overlay,
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

  /* -------------------------- FLOATING BACK ---------------------------- */
  floatingBackButtonWrapper: {
    position: "absolute",
    left: 18,
    zIndex: 15,
  },
  floatingBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderWidth: 1,
    borderColor: KATBOX.border,
  },

  /* --------------------------- MAIN CARD ------------------------------- */
  mainDetailsCard: {
    flex: 1,
    backgroundColor: KATBOX.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: CARD_OVERLAP,
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
    paddingVertical: 6,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: KATBOX.skeletonSoft,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: KATBOX.border,
    gap: 5,
  },
  dietDotBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.3,
    borderColor: KATBOX.border,
    backgroundColor: KATBOX.card,
  },
  topChefText: {
    width: 62,
    height: 10,
    borderRadius: 4,
    backgroundColor: KATBOX.skeleton,
  },

  /* ------------------------- IDENTITY ROW ------------------------------ */
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
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
    backgroundColor: KATBOX.skeleton,
    borderWidth: 2,
    borderColor: KATBOX.card,
  },
  nameInfoColumn: {
    flex: 1,
  },
  nameWithRatingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  chefNameText: {
    width: 150,
    height: 20,
    borderRadius: 6,
    backgroundColor: KATBOX.skeleton,
    marginRight: 6,
  },
  ratingAndReviewsColumn: {
    alignItems: "flex-end",
    gap: 5,
  },
  ratingBadgeBox: {
    width: 62,
    height: 20,
    borderRadius: 6,
    backgroundColor: KATBOX.skeleton,
  },
  viewReviewsLinkText: {
    width: 74,
    height: 10,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },
  inlineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  inlineVerifiedIcon: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: KATBOX.skeletonSoft,
  },
  inlineVerifiedText: {
    width: 130,
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* -------------------------- CUISINE LINES ---------------------------- */
  cuisineTextLine1: {
    width: "88%",
    height: 13,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 14,
  },
  cuisineTextLine2: {
    width: "62%",
    height: 13,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 6,
  },

  /* --------------------------- METRIC GRID ----------------------------- */
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
  metricIconCircle: {
    width: 15,
    height: 15,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  metricValueText: {
    width: 52,
    height: 14,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  metricSubTitleLabel: {
    width: 58,
    height: 10,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 7,
  },

  /* ------------------------ SECTION HEADINGS --------------------------- */
  sectionDividerBlock: {
    height: 1,
    backgroundColor: KATBOX.borderSoft,
    marginVertical: 22,
  },
  sectionLabelHeading: {
    width: 180,
    height: 17,
    borderRadius: 6,
    backgroundColor: KATBOX.skeleton,
    marginBottom: 14,
  },
  sectionHeadingAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: KATBOX.skeletonSoft,
    marginTop: -10,
    marginBottom: 16,
  },
  popularSectionTitleRow: {
    marginBottom: 4,
  },

  /* -------------------------- DISH CARD GRID --------------------------- */
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
  },
  dishCardImage: {
    width: "100%",
    height: 124,
    backgroundColor: KATBOX.skeleton,
  },
  dishCardContent: {
    padding: 11,
  },
  dishCardTitle: {
    width: "72%",
    height: 14,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },

  /* ---------------------------- ABOUT BLOCK ---------------------------- */
  aboutLine: {
    width: "100%",
    height: 12,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 7,
  },
  aboutLineShort: {
    width: "68%",
    height: 12,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 7,
  },
  aboutLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  aboutLocationIcon: {
    width: 15,
    height: 15,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  aboutLocationText: {
    width: 140,
    height: 13,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* --------------------------- SPECIALTY CHIPS ------------------------- */
  specialtiesChipsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  specialtyChipItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 6,
  },
  specialtyChipIcon: {
    width: 13,
    height: 13,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  specialtyChipText: {
    width: 68,
    height: 12,
    borderRadius: 4,
    backgroundColor: KATBOX.skeleton,
  },

  /* ------------------------ QUALITY HIGHLIGHTS ------------------------- */
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
  },
  highlightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: KATBOX.skeletonSoft,
    marginBottom: 8,
  },
  highlightTitle: {
    width: "82%",
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeleton,
  },
  highlightSub: {
    width: "62%",
    height: 9,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 5,
  },

  /* ----------------------------- SHIMMER ------------------------------- */
  shimmerWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  shimmer: {
    width: "100%",
    height: "100%",
  },
});

export default memo(ChefInfoSkeleton);