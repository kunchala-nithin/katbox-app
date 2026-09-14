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
  Platform,
  StatusBar,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

export interface MealBoxPlansSkeletonProps {
  /** Number of plan cards to render. @default 3 */
  cardCount?: number;
  /** Number of filter pill placeholders. @default 6 */
  pillCount?: number;
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
const STATUS_BAR_PADDING =
  Platform.OS === "ios" ? 48 : StatusBar.currentHeight || 24;

const COLORS = {
  bg: "#FAF8F5",
  card: "#FFFFFF",
  cardSoft: "#E5ECE8",
  border: "rgba(15, 56, 42, 0.08)",
  borderLine: "rgba(15, 56, 42, 0.12)",
  skeleton: "rgba(15, 56, 42, 0.08)",
  skeletonSoft: "rgba(15, 56, 42, 0.06)",
  skeletonLighter: "rgba(15, 56, 42, 0.04)",
  imageFallback: "#E5ECE8",
  overlay: "rgba(0, 0, 0, 0.08)",
  shimmer: {
    transparent: "rgba(255, 255, 255, 0)",
    highlight: "rgba(255, 255, 255, 0.6)",
  },
} as const;

const HEADER_ESTIMATED_HEIGHT = Platform.OS === "ios" ? 220 : 205;
const SHIMMER_LOOP_RANGE = SCREEN_WIDTH * 1.5;

/* -------------------------------------------------------------------------- */
/*                          MEMOIZED SUB-COMPONENTS                           */
/* -------------------------------------------------------------------------- */

const FilterPillSkeleton = memo(function FilterPillSkeleton({
  widthVariant,
}: {
  widthVariant: number;
}) {
  return (
    <View
      style={[
        styles.pillButton,
        { width: widthVariant },
      ]}
    />
  );
});

const PlanCardSkeleton = memo(function PlanCardSkeleton() {
  return (
    <View style={styles.cardShadowWrapper}>
      <View style={styles.cardSurface}>
        {/* Image area */}
        <View style={styles.imageContainer}>
          <View style={styles.cardImage} />

          {/* Top-left badge */}
          <View style={styles.cardTopBadge} />

          {/* Top-right bookmark */}
          <View style={styles.bookmarkButton} />

          {/* Bottom text overlay */}
          <View style={styles.textOverlayContainer}>
            <View style={styles.cardTitle} />
            <View style={styles.cardSubtitleLine1} />
            <View style={styles.cardSubtitleLine2} />
          </View>
        </View>

        {/* Details area */}
        <View style={styles.detailsContainer}>
          {/* Info rows */}
          <View style={styles.infoRow}>
            <View style={styles.infoIcon} />
            <View style={styles.infoRowText} />
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon} />
            <View style={styles.infoRowText} />
          </View>

          {/* Divider */}
          <View style={styles.cardDividerLine} />

          {/* Footer row */}
          <View style={styles.footerRow}>
            <View style={styles.priceContainer}>
              <View style={styles.priceBlock}>
                <View style={styles.priceCurrency} />
                <View style={styles.priceNumber} />
                <View style={styles.pricePeriod} />
              </View>
              <View style={styles.savingsText} />
            </View>

            <View style={styles.selectButton} />
          </View>
        </View>
      </View>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const MealBoxPlansSkeleton: FC<MealBoxPlansSkeletonProps> = ({
  cardCount = 3,
  pillCount = 6,
  shimmerDuration = 1400,
  disableShimmer = false,
  style,
}) => {
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

  /* ---------- Stable pill width variants to look natural ------------- */
  const pillWidths = useMemo(
    () => [90, 96, 82, 84, 88, 110, 100, 92],
    []
  );

  const cardIndices = useMemo(
    () => Array.from({ length: cardCount }, (_, i) => i),
    [cardCount]
  );
  const pillIndices = useMemo(
    () => Array.from({ length: pillCount }, (_, i) => i),
    [pillCount]
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading meal box plans"
      accessibilityState={{ busy: true }}
      testID="meal-box-plans-skeleton"
    >
      {/* ------------------------------ FIXED HEADER --------------------- */}
      <View style={styles.fixedHeaderContainer}>
        <View style={styles.headerShadowOverlay} />

        {/* Main header wrapper */}
        <View style={styles.mainHeaderWrapper}>
          <View style={styles.mainTitleRow}>
            <View style={styles.actionIconButton} />
          </View>

          <View style={styles.heroTextContainer}>
            <View style={styles.screenTitle} />
            <View style={styles.screenSubtitle} />
          </View>
        </View>

        {/* Filter pills */}
        <View style={styles.pillsOuterWrapper}>
          <View style={styles.pillsScrollContainer}>
            {pillIndices.map((i) => (
              <FilterPillSkeleton
                key={i}
                widthVariant={pillWidths[i % pillWidths.length]}
              />
            ))}
          </View>
        </View>
      </View>

      {/* --------------------------- SCROLLABLE BODY --------------------- */}
      <View style={styles.scrollContent}>
        {cardIndices.map((i) => (
          <PlanCardSkeleton key={i} />
        ))}
      </View>

      {/* ------------------------- SHIMMER OVERLAY ---------------------- */}
      {!disableShimmer && !reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmerWrapper, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={[
              COLORS.shimmer.transparent,
              COLORS.shimmer.highlight,
              COLORS.shimmer.transparent,
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
    backgroundColor: COLORS.bg,
  },

  /* ------------------------------ HEADER ------------------------------- */
  fixedHeaderContainer: {
    backgroundColor: COLORS.bg,
    paddingTop: STATUS_BAR_PADDING,
  },
  headerShadowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderLine,
  },
  heroTextContainer: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 12,
  },
  screenTitle: {
    width: 180,
    height: 27,
    borderRadius: 8,
    backgroundColor: COLORS.skeleton,
  },
  screenSubtitle: {
    width: 250,
    height: 13,
    borderRadius: 5,
    backgroundColor: COLORS.skeletonLighter,
    marginTop: 8,
  },

  /* ------------------------------ PILLS -------------------------------- */
  pillsOuterWrapper: {
    width: "100%",
    paddingTop: 2,
  },
  pillsScrollContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 14,
  },
  pillButton: {
    height: 40,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderLine,
  },

  /* --------------------------- SCROLL CONTENT -------------------------- */
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: HEADER_ESTIMATED_HEIGHT + 16,
    paddingBottom: 40,
  },

  /* ------------------------------ CARD --------------------------------- */
  cardShadowWrapper: {
    marginBottom: 20,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardSurface: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    overflow: "hidden",
  },

  /* --------------------------- IMAGE CONTAINER ------------------------- */
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 201,
    backgroundColor: COLORS.imageFallback,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.skeleton,
  },
  cardTopBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 92,
    height: 22,
    borderRadius: 8,
    backgroundColor: "rgba(250, 248, 245, 0.9)",
    borderWidth: 1,
    borderColor: COLORS.borderLine,
  },
  bookmarkButton: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(11, 38, 29, 0.35)",
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
    width: "68%",
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  cardSubtitleLine1: {
    width: "100%",
    height: 12,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginTop: 8,
  },
  cardSubtitleLine2: {
    width: "62%",
    height: 12,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginTop: 6,
  },

  /* ---------------------------- DETAILS AREA --------------------------- */
  detailsContainer: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: COLORS.skeletonSoft,
  },
  infoRowText: {
    width: 120,
    height: 13,
    borderRadius: 4,
    backgroundColor: COLORS.skeleton,
    marginLeft: 8,
  },
  cardDividerLine: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  /* ----------------------------- FOOTER ROW ---------------------------- */
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceContainer: {
    justifyContent: "center",
  },
  priceBlock: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceCurrency: {
    width: 14,
    height: 18,
    borderRadius: 4,
    backgroundColor: COLORS.skeleton,
  },
  priceNumber: {
    width: 44,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORS.skeleton,
    marginLeft: 4,
  },
  pricePeriod: {
    width: 46,
    height: 12,
    borderRadius: 4,
    backgroundColor: COLORS.skeletonLighter,
    marginLeft: 6,
  },
  savingsText: {
    width: 92,
    height: 11,
    borderRadius: 4,
    backgroundColor: COLORS.skeletonLighter,
    marginTop: 6,
  },
  selectButton: {
    width: 128,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.skeleton,
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

export default memo(MealBoxPlansSkeleton);