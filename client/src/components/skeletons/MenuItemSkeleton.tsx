import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
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

export interface MenuItemSkeletonProps {
  /** Number of category cards to render in the customizer body. @default 2 */
  categoryCount?: number;
  /** Number of item rows rendered inside each category card. @default 3 */
  itemsPerCategory?: number;
  /** Number of dish circles rendered in "What's in the platter". @default 4 */
  platterItemCount?: number;
  /** Number of summary stat columns. @default 4 */
  summaryColumnCount?: number;
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

const COLORS = {
  background: "#FAF8F5",
  surface: "#FFFFFF",
  heroFallback: "#E5ECE8",
  border: "rgba(15, 56, 42, 0.08)",
  borderSoft: "rgba(15, 56, 42, 0.06)",
  borderLine: "rgba(15, 56, 42, 0.12)",
  skeleton: "rgba(15, 56, 42, 0.08)",
  skeletonSoft: "rgba(15, 56, 42, 0.06)",
  skeletonLighter: "rgba(15, 56, 42, 0.04)",
  overlay: "rgba(11, 38, 29, 0.08)",
  shimmer: {
    transparent: "rgba(255, 255, 255, 0)",
    highlight: "rgba(255, 255, 255, 0.6)",
  },
} as const;

const HERO_HEIGHT = 270;
const FOOTER_HEIGHT = 84;
const SHIMMER_LOOP_RANGE = SCREEN_WIDTH * 1.5;

/* -------------------------------------------------------------------------- */
/*                          MEMOIZED SUB-COMPONENTS                           */
/* -------------------------------------------------------------------------- */

const SummaryColumn = memo(function SummaryColumn({
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

const PlatterItem = memo(function PlatterItem() {
  return (
    <View style={styles.dishCardItem}>
      <View style={styles.dishOuterCircle} />
      <View style={styles.dishItemLabel} />
    </View>
  );
});

const ItemRow = memo(function ItemRow({ isLast }: { isLast: boolean }) {
  return (
    <View style={[styles.itemRowWrapper, isLast && styles.itemRowWrapperLast]}>
      <View style={styles.itemThumbImage} />
      <View style={styles.itemMetaMiddle}>
        <View style={styles.rowItemNameTitle} />
        <View style={styles.rowItemPriceText} />
      </View>
      <View style={styles.addButtonWrapper}>
        <View style={styles.radioButtonCircle} />
      </View>
    </View>
  );
});

const CategoryCard = memo(function CategoryCard({
  itemCount,
}: {
  itemCount: number;
}) {
  return (
    <View style={styles.categoryCardBlock}>
      {/* header */}
      <View style={styles.categoryHeaderRow}>
        <View style={styles.titleWithBadgeGroup}>
          <View style={styles.numberBadgeCircle} />
          <View style={styles.categoryHeaderTitleText} />
        </View>
        <View style={styles.chooseTagBadge} />
      </View>

      {/* items */}
      <View style={styles.itemListGroup}>
        {Array.from({ length: itemCount }).map((_, i) => (
          <ItemRow key={i} isLast={i === itemCount - 1} />
        ))}
      </View>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const MenuItemSkeleton: FC<MenuItemSkeletonProps> = ({
  categoryCount = 2,
  itemsPerCategory = 3,
  platterItemCount = 4,
  summaryColumnCount = 4,
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
  const summaryIndices = useMemo(
    () => Array.from({ length: summaryColumnCount }, (_, i) => i),
    [summaryColumnCount]
  );
  const platterIndices = useMemo(
    () => Array.from({ length: platterItemCount }, (_, i) => i),
    [platterItemCount]
  );
  const categoryIndices = useMemo(
    () => Array.from({ length: categoryCount }, (_, i) => i),
    [categoryCount]
  );

  const heroBackBtnTop = useMemo(
    () => Math.max(insets.top, 16) + 8,
    [insets.top]
  );

  const renderSummaryColumn = useCallback(
    (i: number) => <SummaryColumn key={i} showDivider={i > 0} />,
    []
  );

  const renderPlatterItem = useCallback(
    (i: number) => <PlatterItem key={i} />,
    []
  );

  const renderCategoryCard = useCallback(
    (i: number) => <CategoryCard key={i} itemCount={itemsPerCategory} />,
    [itemsPerCategory]
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading menu items"
      accessibilityState={{ busy: true }}
      testID="menu-item-skeleton"
    >
      {/* ---------------------------- SCROLLABLE BODY ---------------------- */}
      <View style={styles.scrollContent}>
        {/* -------------------------- HERO SECTION ------------------------ */}
        <View style={styles.heroContainer}>
          <View style={styles.heroImage} />
          <View style={styles.heroImageOverlay} />
          <View style={[styles.floatingImageBackBtn, { top: heroBackBtnTop }]}>
            <View style={styles.backBtnCircle} />
          </View>
        </View>

        {/* ------------------------ MAIN DETAILS CARD --------------------- */}
        <View style={styles.mainCardView}>
          {/* Title + Popular badge */}
          <View style={styles.titleRow}>
            <View style={styles.planTitle} />
            <View style={styles.popularBadge} />
          </View>

          {/* Price row */}
          <View style={styles.priceRow}>
            <View style={styles.priceMetaLeft}>
              <View style={styles.priceLabel} />
              <View style={styles.priceSubHint} />
            </View>
            <View style={styles.priceValue} />
          </View>

          {/* Summary stat box */}
          <View style={styles.summaryContainerBox}>
            {summaryIndices.map(renderSummaryColumn)}
          </View>

          {/* What's in the platter */}
          <View style={styles.whatsInPlateSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitle} />
              <View style={styles.sectionHeaderLine} />
            </View>
            <View style={styles.dishesHorizontalScroll}>
              {platterIndices.map(renderPlatterItem)}
            </View>
          </View>

          {/* Customize header */}
          <View style={styles.customizeCateringSection}>
            <View style={styles.customizeCateringTitle} />
            <View style={styles.customizeCateringSubtitle} />
          </View>
        </View>

        {/* -------------------- CUSTOMIZER CATEGORY CARDS ----------------- */}
        <View style={styles.mainCustomizerBody}>
          {categoryIndices.map(renderCategoryCard)}
        </View>
      </View>

      {/* --------------------------- FIXED FOOTER ------------------------ */}
      <View style={styles.fixedBottomControlBar}>
        <View style={styles.footerPriceMetaColumn}>
          <View style={styles.footerFinalPriceText} />
          <View style={styles.viewDetailsLinkText} />
        </View>
        <View style={styles.footerActionSubmitBtn} />
      </View>

      {/* ------------------------- SHIMMER OVERLAY ----------------------- */}
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
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: FOOTER_HEIGHT + 56, // clearance for fixed footer + safety
  },

  /* ------------------------------- HERO -------------------------------- */
  heroContainer: {
    position: "relative",
    width: "100%",
    height: HERO_HEIGHT,
    backgroundColor: COLORS.heroFallback,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.skeleton,
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLine,
  },

  /* --------------------------- MAIN CARD ------------------------------- */
  mainCardView: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: COLORS.background,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  planTitle: {
    flex: 1,
    height: 26,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: COLORS.skeleton,
  },
  popularBadge: {
    width: 82,
    height: 24,
    borderRadius: 14,
    backgroundColor: COLORS.skeletonSoft,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  priceMetaLeft: {
    justifyContent: "center",
  },
  priceLabel: {
    width: 110,
    height: 13,
    borderRadius: 6,
    backgroundColor: COLORS.skeleton,
  },
  priceSubHint: {
    width: 150,
    height: 11,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: COLORS.skeletonLighter,
  },
  priceValue: {
    width: 68,
    height: 22,
    borderRadius: 8,
    backgroundColor: COLORS.skeleton,
  },

  summaryContainerBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 6,
    marginBottom: 24,
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
    backgroundColor: COLORS.skeletonSoft,
    marginBottom: 6,
  },
  summaryValueText: {
    width: 42,
    height: 11,
    borderRadius: 5,
    backgroundColor: COLORS.skeleton,
  },
  summaryLabelText: {
    width: 34,
    height: 9,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: COLORS.skeletonLighter,
  },
  summaryDividerLine: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },

  /* ---------------------- WHAT'S IN THE PLATTER ------------------------ */
  whatsInPlateSection: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionHeaderTitle: {
    width: 150,
    height: 11,
    borderRadius: 5,
    marginRight: 10,
    backgroundColor: COLORS.skeleton,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderLine,
  },
  dishesHorizontalScroll: {
    flexDirection: "row",
    gap: 14,
    paddingRight: 16,
  },
  dishCardItem: {
    width: 66,
    alignItems: "center",
  },
  dishOuterCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.skeleton,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
    marginBottom: 6,
  },
  dishItemLabel: {
    width: 50,
    height: 10,
    borderRadius: 4,
    backgroundColor: COLORS.skeletonLighter,
  },

  /* ------------------------ CUSTOMIZE HEADER --------------------------- */
  customizeCateringSection: {
    marginBottom: 14,
  },
  customizeCateringTitle: {
    width: 210,
    height: 18,
    borderRadius: 6,
    backgroundColor: COLORS.skeleton,
  },
  customizeCateringSubtitle: {
    width: 260,
    height: 12,
    borderRadius: 5,
    marginTop: 8,
    backgroundColor: COLORS.skeletonLighter,
  },

  /* --------------------- CUSTOMIZER CATEGORY CARDS --------------------- */
  mainCustomizerBody: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  categoryCardBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  titleWithBadgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  numberBadgeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.skeleton,
    marginRight: 10,
  },
  categoryHeaderTitleText: {
    width: 110,
    height: 16,
    borderRadius: 6,
    backgroundColor: COLORS.skeleton,
  },
  chooseTagBadge: {
    width: 88,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.skeletonSoft,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  itemListGroup: {
    flexDirection: "column",
  },
  itemRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  itemRowWrapperLast: {
    borderBottomWidth: 0,
  },
  itemThumbImage: {
    width: 48,
    height: 48,
    borderRadius: 14,
    marginRight: 14,
    backgroundColor: COLORS.skeleton,
  },
  itemMetaMiddle: {
    flex: 1,
    justifyContent: "center",
  },
  rowItemNameTitle: {
    width: "70%",
    height: 14,
    borderRadius: 6,
    backgroundColor: COLORS.skeleton,
  },
  rowItemPriceText: {
    width: 70,
    height: 10,
    borderRadius: 5,
    marginTop: 7,
    backgroundColor: COLORS.skeletonLighter,
  },
  addButtonWrapper: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  radioButtonCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(15, 56, 42, 0.18)",
    backgroundColor: COLORS.surface,
  },

  /* --------------------------- FIXED FOOTER ---------------------------- */
  fixedBottomControlBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FOOTER_HEIGHT,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 999,
  },
  footerPriceMetaColumn: {
    flexDirection: "column",
    justifyContent: "center",
  },
  footerFinalPriceText: {
    width: 110,
    height: 20,
    borderRadius: 6,
    backgroundColor: COLORS.skeleton,
  },
  viewDetailsLinkText: {
    width: 78,
    height: 12,
    borderRadius: 5,
    marginTop: 7,
    backgroundColor: COLORS.skeletonLighter,
  },
  footerActionSubmitBtn: {
    width: 160,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.skeleton,
  },

  /* ---------------------------- SHIMMER -------------------------------- */
  shimmerWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  shimmer: {
    width: "100%",
    height: "100%",
  },
});

export default memo(MenuItemSkeleton);