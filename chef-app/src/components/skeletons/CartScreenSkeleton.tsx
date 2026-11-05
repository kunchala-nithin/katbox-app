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

export interface CartScreenSkeletonProps {
  /** Number of info pills in the meta grid. @default 2 */
  infoCellCount?: number;
  /** Number of coupon card placeholders. @default 2 */
  couponCount?: number;
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
  cardSoft: "#FAF8F5",
  border: "rgba(15, 56, 42, 0.08)",
  borderLine: "rgba(15, 56, 42, 0.12)",
  borderSoft: "rgba(15, 56, 42, 0.06)",
  skeleton: "rgba(15, 56, 42, 0.08)",
  skeletonSoft: "rgba(15, 56, 42, 0.06)",
  skeletonLighter: "rgba(15, 56, 42, 0.04)",
  imageFallback: "#E5ECE8",
  shimmer: {
    transparent: "rgba(255, 255, 255, 0)",
    highlight: "rgba(255, 255, 255, 0.6)",
  },
} as const;

const SHIMMER_LOOP_RANGE = SCREEN_WIDTH * 1.5;
const HEADER_ESTIMATED_HEIGHT = 110;

/* -------------------------------------------------------------------------- */
/*                          MEMOIZED SUB-COMPONENTS                           */
/* -------------------------------------------------------------------------- */

const CouponCardSkeleton = memo(function CouponCardSkeleton() {
  return (
    <View style={styles.couponCard}>
      <View style={styles.couponAccentLine} />
      <View style={styles.couponBody}>
        {/* Top row: code pill + apply button */}
        <View style={styles.couponTopRow}>
          <View style={styles.couponCodePill} />
          <View style={styles.couponApplyBtn} />
        </View>

        {/* Description line */}
        <View style={styles.couponDescLine} />

        {/* Mini divider */}
        <View style={styles.couponDivider} />

        {/* Meta row */}
        <View style={styles.couponMetaRow}>
          <View style={styles.couponMetaIcon} />
          <View style={styles.couponMetaText} />
        </View>
      </View>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/*                             MAIN COMPONENT                                 */
/* -------------------------------------------------------------------------- */

const CartScreenSkeleton: FC<CartScreenSkeletonProps> = ({
  infoCellCount = 2,
  couponCount = 1,
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

  const infoCellIndices = useMemo(
    () => Array.from({ length: infoCellCount }, (_, i) => i),
    [infoCellCount]
  );

  const couponIndices = useMemo(
    () => Array.from({ length: couponCount }, (_, i) => i),
    [couponCount]
  );

  const headerHeight = useMemo(
    () => insets.top + 60,
    [insets.top]
  );

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading cart"
      accessibilityState={{ busy: true }}
      testID="cart-screen-skeleton"
    >
      {/* ------------------------------ HEADER -------------------------- */}
      <View
        style={[
          styles.header,
          { height: headerHeight, paddingTop: insets.top },
        ]}
      >
        <View style={styles.headerEditButton} />
        <View style={styles.headerTitle} />
        <View style={styles.headerIconBtn} />
      </View>

      {/* ------------------------------ BODY ---------------------------- */}
      <View
        style={[
          styles.scrollContent,
          { paddingTop: headerHeight + 20 },
        ]}
      >
        {/* -------------------- MAIN CARD (MEALBOX STYLE) --------------- */}
        <View style={styles.mainCardModern}>
          <View style={styles.modernTagPillEdge} />
          <View style={styles.removeFromCartBtnModern} />

          {/* Header row: image + title block */}
          <View style={styles.modernHeaderRow}>
            <View style={styles.modernHeroImage} />
            <View style={styles.modernTitleBlock}>
              <View style={styles.modernMainTitleLine1} />
              <View style={styles.modernMainTitleLine2} />
              <View style={styles.modernChefSubtitle} />
            </View>
          </View>

          {/* Meta info grid */}
          <View style={styles.groupedMetaSectionContainer}>
            <View style={styles.modernInfoGrid}>
              {infoCellIndices.map((i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={styles.separatorVerticalDotted} />}
                  <View style={styles.modernInfoCell}>
                    <View style={styles.modernCellLabel} />
                    <View style={styles.modernCellValue} />
                  </View>
                </React.Fragment>
              ))}
            </View>

            <View style={styles.separatorHorizontalDotted} />

            <View style={styles.modernAddressBlockNested}>
              <View style={styles.addressIcon} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <View style={styles.modernAddressLabel} />
                <View style={styles.modernAddressText} />
              </View>
            </View>
          </View>

          {/* Start date banner */}
          <View style={styles.modernStartDateBanner} />

          {/* Divider */}
          <View style={styles.divider} />

          {/* Price row */}
          <View style={styles.priceRow}>
            <View style={styles.priceLabel} />
            <View style={styles.priceValue} />
          </View>

          {/* CTA button */}
          <View style={styles.modernViewItemsBtn} />
        </View>

        {/* ----------------------- COUPONS SECTION ---------------------- */}
        <View style={styles.premiumSectionCard}>
          {/* Header */}
          <View style={styles.premiumSectionHeaderContainer}>
            <View style={styles.premiumHeaderTitleRow}>
              <View style={styles.premiumCrownCircle} />
              <View>
                <View style={styles.premiumSectionMainHeading} />
                <View style={styles.premiumSectionSubHeading} />
              </View>
            </View>
          </View>

          {/* Coupon cards */}
          {couponIndices.map((i) => (
            <CouponCardSkeleton key={i} />
          ))}
        </View>
      </View>

      {/* --------------------------- BOTTOM BAR ------------------------- */}
      <View style={styles.bottomContainer}>
        <View style={styles.bottomBarRow}>
          <View style={styles.bottomBarPriceBlock}>
            <View style={styles.bottomBarAmountRow}>
              <View style={styles.bottomBarTotalLabel} />
              <View style={styles.bottomBarTotalAmount} />
            </View>
            <View style={styles.viewDetailsUnderlineText} />
          </View>
          <View style={styles.placeOrderBtn} />
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: KATBOX.bg,
    borderBottomWidth: 1,
    borderBottomColor: KATBOX.border,
  },
  headerEditButton: {
    width: 88,
    height: 38,
    borderRadius: 19,
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
  },
  headerTitle: {
    width: 60,
    height: 18,
    borderRadius: 6,
    backgroundColor: KATBOX.skeleton,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
  },

  /* --------------------------- SCROLL CONTENT -------------------------- */
  scrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 220,
  },

  /* ------------------------- MAIN CARD (MEALBOX) ----------------------- */
  mainCardModern: {
    backgroundColor: KATBOX.card,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    paddingTop: 26,
    borderWidth: 1,
    borderColor: KATBOX.border,
    position: "relative",
    overflow: "hidden",
  },
  modernTagPillEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 110,
    height: 24,
    backgroundColor: KATBOX.skeletonSoft,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderColor: KATBOX.borderLine,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  removeFromCartBtnModern: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: KATBOX.skeletonSoft,
  },
  modernHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingRight: 32,
    marginTop: 6,
    marginBottom: 16,
  },
  modernHeroImage: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: KATBOX.skeleton,
  },
  modernTitleBlock: {
    flex: 1,
    marginLeft: 14,
  },
  modernMainTitleLine1: {
    width: "92%",
    height: 16,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
    marginBottom: 6,
  },
  modernMainTitleLine2: {
    width: "62%",
    height: 16,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
    marginBottom: 10,
  },
  modernChefSubtitle: {
    width: "55%",
    height: 12,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* --------------------------- META SECTION ---------------------------- */
  groupedMetaSectionContainer: {
    backgroundColor: KATBOX.cardSoft,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  modernInfoGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  modernInfoCell: {
    flex: 1,
    alignItems: "flex-start",
  },
  separatorVerticalDotted: {
    width: 1,
    height: 32,
    borderStyle: "dashed",
    borderRightWidth: 1,
    borderColor: KATBOX.borderLine,
    marginHorizontal: 10,
  },
  separatorHorizontalDotted: {
    height: 1,
    borderStyle: "dashed",
    borderBottomWidth: 1,
    borderColor: KATBOX.borderLine,
    marginVertical: 12,
  },
  modernCellLabel: {
    width: 68,
    height: 10,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 6,
  },
  modernCellValue: {
    width: 82,
    height: 13,
    borderRadius: 4,
    backgroundColor: KATBOX.skeleton,
  },
  modernAddressBlockNested: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  addressIcon: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
    marginTop: 2,
  },
  modernAddressLabel: {
    width: 96,
    height: 10,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginBottom: 5,
  },
  modernAddressText: {
    width: "78%",
    height: 12,
    borderRadius: 4,
    backgroundColor: KATBOX.skeleton,
  },

  /* -------------------------- START DATE BANNER ------------------------ */
  modernStartDateBanner: {
    height: 40,
    backgroundColor: KATBOX.cardSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
    marginBottom: 4,
  },

  /* ------------------------------ DIVIDER ------------------------------ */
  divider: {
    height: 1,
    backgroundColor: KATBOX.border,
    marginVertical: 16,
  },

  /* ----------------------------- PRICE ROW ----------------------------- */
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    width: 90,
    height: 13.5,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },
  priceValue: {
    width: 72,
    height: 20,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },

  /* ---------------------------- CTA BUTTON ----------------------------- */
  modernViewItemsBtn: {
    marginTop: 16,
    height: 46,
    borderRadius: 18,
    backgroundColor: KATBOX.skeleton,
  },

  /* --------------------------- COUPONS SECTION ------------------------- */
  premiumSectionCard: {
    backgroundColor: KATBOX.card,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  premiumSectionHeaderContainer: {
    marginBottom: 14,
  },
  premiumHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  premiumCrownCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: KATBOX.skeletonSoft,
    marginRight: 12,
  },
  premiumSectionMainHeading: {
    width: 150,
    height: 15,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
    marginBottom: 6,
  },
  premiumSectionSubHeading: {
    width: 200,
    height: 12,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* ---------------------------- COUPON CARD ---------------------------- */
  couponCard: {
    backgroundColor: KATBOX.card,
    borderRadius: 18,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: KATBOX.border,
    marginVertical: 4,
  },
  couponAccentLine: {
    width: 5,
    backgroundColor: KATBOX.skeleton,
  },
  couponBody: {
    flex: 1,
    padding: 14,
  },
  couponTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  couponCodePill: {
    width: 86,
    height: 26,
    borderRadius: 8,
    backgroundColor: KATBOX.skeleton,
  },
  couponApplyBtn: {
    width: 84,
    height: 30,
    borderRadius: 12,
    backgroundColor: KATBOX.skeleton,
  },
  couponDescLine: {
    width: "72%",
    height: 14,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
    marginTop: 12,
  },
  couponDivider: {
    height: 1,
    backgroundColor: KATBOX.borderSoft,
    marginVertical: 10,
  },
  couponMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  couponMetaIcon: {
    width: 13,
    height: 13,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonSoft,
    marginRight: 5,
  },
  couponMetaText: {
    width: 180,
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },

  /* --------------------------- BOTTOM BAR ------------------------------ */
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: KATBOX.card,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: KATBOX.border,
  },
  bottomBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomBarPriceBlock: {
    flexDirection: "column",
    justifyContent: "center",
  },
  bottomBarAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  bottomBarTotalLabel: {
    width: 46,
    height: 11,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
  },
  bottomBarTotalAmount: {
    width: 72,
    height: 22,
    borderRadius: 5,
    backgroundColor: KATBOX.skeleton,
  },
  viewDetailsUnderlineText: {
    width: 78,
    height: 12,
    borderRadius: 4,
    backgroundColor: KATBOX.skeletonLighter,
    marginTop: 8,
  },
  placeOrderBtn: {
    flex: 1,
    height: 50,
    marginLeft: 24,
    borderRadius: 20,
    backgroundColor: KATBOX.skeleton,
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

export default memo(CartScreenSkeleton);