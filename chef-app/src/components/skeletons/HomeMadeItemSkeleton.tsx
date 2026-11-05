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

export interface HomeMadeItemSkeletonProps {
  /** Number of menu item cards to render. @default 4 */
  itemCount?: number;
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
  bg: "#F9F6F0",
  card: "#FFFFFF",
  cardSoft: "#F4F1EA",
  border: "#E6E2D6",
  borderSoft: "#EFECE6",
  skeleton: "rgba(20, 83, 45, 0.08)",
  skeletonSoft: "rgba(20, 83, 45, 0.06)",
  skeletonLighter: "rgba(20, 83, 45, 0.04)",
  heroFallback: "#EFECE6",
  overlay: "rgba(0, 0, 0, 0.08)",
  shimmer: {
    transparent: "rgba(255, 255, 255, 0)",
    highlight: "rgba(255, 255, 255, 0.6)",
  },
} as const;

const HEADER_HEIGHT = 360;
const SHEET_OVERLAP = 40;
const SHIMMER_LOOP_RANGE = SCREEN_WIDTH * 1.5;

/* -------------------------------------------------------------------------- */
/*                          MEMOIZED SUB-COMPONENTS                           */
/* -------------------------------------------------------------------------- */

const MenuItemCardSkeleton = memo(function MenuItemCardSkeleton() {
  return (
    <View style={styles.menuItemCard}>
      {/* LEFT: text content */}
      <View style={styles.itemDetails}>
        <View style={styles.itemNameRow}>
          <View style={styles.vegIconWrapper} />
          <View style={styles.itemNameLine} />
        </View>

        <View style={styles.itemDescriptionLine1} />
        <View style={styles.itemDescriptionLine2} />

        <View style={styles.priceRow}>
          <View style={styles.itemPriceLine} />
          <View style={styles.qtyButtonSkeleton} />
        </View>
      </View>

      {/* RIGHT: image + add button */}
      <View style={styles.itemImageWrapper}>
        <View style={styles.itemImageContainer} />
        <View style={styles.addButtonSkeleton} />
      </View>
    </View>
  );
});

const SectionBlockSkeleton = memo(function SectionBlockSkeleton({
  itemCount,
}: {
  itemCount: number;
}) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText} />
        <View style={styles.sectionHeadingAccent} />
      </View>

      {Array.from({ length: itemCount }).map((_, i) => (
        <MenuItemCardSkeleton key={i} />
      ))}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const HomeMadeItemSkeleton: FC<HomeMadeItemSkeletonProps> = ({
  itemCount = 4,
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

  const backButtonTop = useMemo(
    () => Math.max(insets.top, 52),
    [insets.top]
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading menu items"
      accessibilityState={{ busy: true }}
      testID="home-made-item-skeleton"
    >
      {/* ---------------------------- PARALLAX HEADER ------------------- */}
      <View style={styles.header}>
        <View style={styles.headerImage} />
        <View style={styles.headerGradientOverlay} />
      </View>

      {/* ------------------------------ BACK BUTTON --------------------- */}
      <View style={[styles.headerControls, { top: backButtonTop }]}>
        <View style={styles.circleBtn} />
      </View>

      {/* --------------------------------- SHEET ------------------------ */}
      <View style={styles.body}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header row: title + rating badge */}
          <View style={styles.headerRow}>
            <View style={styles.chefNameLine} />
            <View style={styles.ratingBadge} />
          </View>

          {/* Crafted by chef row */}
          <View style={styles.chefNameRow}>
            <View style={styles.chefHatIcon} />
            <View style={styles.chefNameText} />
          </View>

          {/* Location row */}
          <View style={styles.locationRow}>
            <View style={styles.locationIcon} />
            <View style={styles.locationText} />
          </View>

          {/* Katbox promise banner */}
          <View style={styles.katboxPromiseBanner}>
            <View style={styles.promiseIcon} />
            <View style={styles.promiseText} />
          </View>

          {/* Menu sections + item cards */}
          <SectionBlockSkeleton itemCount={itemCount} />
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

  /* ------------------------------- HEADER ------------------------------ */
  header: {
    height: HEADER_HEIGHT,
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    backgroundColor: KATBOX.heroFallback,
  },
  headerImage: {
    width: "100%",
    height: "100%",
    backgroundColor: KATBOX.skeleton,
  },
  headerGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: KATBOX.overlay,
  },

  /* --------------------------- HEADER CONTROLS ------------------------- */
  headerControls: {
    position: "absolute",
    left: 18,
    zIndex: 10,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderWidth: 1,
    borderColor: KATBOX.border,
  },

  /* ------------------------------ BODY SHEET --------------------------- */
  body: {
    flex: 1,
    paddingTop: HEADER_HEIGHT - SHEET_OVERLAP,
  },
  sheet: {
    flex: 1,
    backgroundColor: KATBOX.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 22,
    minHeight: 900,
    borderTopWidth: 1,
    borderTopColor: KATBOX.borderSoft,
  },
  handle: {
    width: 40,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: KATBOX.border,
    alignSelf: "center",
    marginBottom: 20,
  },

  /* ------------------------- SHEET HEADER ROW -------------------------- */
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chefNameLine: {
    flex: 1,
    height: 24,
    borderRadius: 8,
    backgroundColor: KATBOX.skeleton,
    marginRight: 10,
  },
  ratingBadge: {
    width: 62,
    height: 26,
    borderRadius: 8,
    backgroundColor: KATBOX.skeleton,
  },

  /* -------------------------- CHEF NAME ROW ---------------------------- */
  chefNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 2,
    gap: 6,
  },
  chefHatIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  chefNameText: {
    width: 160,
    height: 14,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* ---------------------------- LOCATION ROW --------------------------- */
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 12,
    gap: 4,
  },
  locationIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  locationText: {
    width: 180,
    height: 13,
    borderRadius: 5,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* ------------------------- PROMISE BANNER ---------------------------- */
  katboxPromiseBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 24,
  },
  promiseIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
  },
  promiseText: {
    width: 220,
    height: 12,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },

  /* --------------------------- SECTION HEADER -------------------------- */
  sectionHeader: {
    paddingVertical: 12,
    marginBottom: 12,
  },
  sectionHeaderText: {
    width: 160,
    height: 20,
    borderRadius: 6,
    backgroundColor: KATBOX.skeleton,
  },
  sectionHeadingAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: KATBOX.skeletonSoft,
    marginTop: 6,
  },

  /* --------------------------- MENU ITEM CARD -------------------------- */
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: KATBOX.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  itemDetails: {
    flex: 1,
    paddingRight: 14,
    justifyContent: "center",
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  vegIconWrapper: {
    width: 14,
    height: 14,
    borderRadius: 2.5,
    borderWidth: 1.2,
    borderColor: KATBOX.border,
    marginRight: 8,
    backgroundColor: KATBOX.card,
  },
  itemNameLine: {
    flex: 1,
    height: 15,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  itemDescriptionLine1: {
    width: "100%",
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 5,
  },
  itemDescriptionLine2: {
    width: "72%",
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  itemPriceLine: {
    width: 60,
    height: 16,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  qtyButtonSkeleton: {
    width: 62,
    height: 26,
    borderRadius: 8,
    backgroundColor: KATBOX.skeletonSoft,
  },

  /* ------------------------ RIGHT IMAGE + BUTTON ----------------------- */
  itemImageWrapper: {
    width: 110,
    height: 110,
    position: "relative",
  },
  itemImageContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    backgroundColor: KATBOX.skeleton,
  },
  addButtonSkeleton: {
    position: "absolute",
    bottom: -12,
    alignSelf: "center",
    width: "78%",
    height: 28,
    borderRadius: 14,
    backgroundColor: KATBOX.card,
    borderWidth: 1.2,
    borderColor: KATBOX.border,
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

export default memo(HomeMadeItemSkeleton);