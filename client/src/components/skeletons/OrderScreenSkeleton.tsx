// src/skeletons/SkeletonsOrders.tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// ✅ A single animated shimmer block — building brick of all skeletons.
//    Uses native driver so it never blocks the JS thread.
// ─────────────────────────────────────────────────────────────────────────────
export const ShimmerBlock: React.FC<{
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}> = ({ width: w = '100%', height = 12, borderRadius = 6, style }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <Animated.View
      style={[
        {
          width: w as any,
          height,
          borderRadius,
          backgroundColor: '#E2E8F0',
          opacity,
        },
        style,
      ]}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Order Card Skeleton — mirrors the exact structure of `nextDeliveryBanner`
//    + countdown + delivery card. Used for every order-type variant
//    (catering / homemade / quickbites / mealbox) since they all share the
//    same top banner + card footprint.
// ─────────────────────────────────────────────────────────────────────────────
export const OrderCardSkeleton: React.FC = () => {
  return (
    <View style={styles.orderGroupWrapper}>
      {/* ─── Top Next-Delivery Banner (cream card) ─── */}
      <View style={styles.bannerCard}>
        <View style={styles.bannerLeftCol}>
          {/* Header row: calendar icon + order id */}
          <View style={styles.bannerHeaderRow}>
            <ShimmerBlock width={26} height={26} borderRadius={8} />
            <View style={{ width: 8 }} />
            <ShimmerBlock width={110} height={14} borderRadius={4} />
          </View>

          {/* Date • Time */}
          <View style={{ height: 8 }} />
          <ShimmerBlock width={'75%'} height={14} borderRadius={4} />

          {/* Menu / Chef line */}
          <View style={{ height: 6 }} />
          <ShimmerBlock width={'90%'} height={12} borderRadius={4} />

          {/* View Details button */}
          <View style={{ height: 12 }} />
          <ShimmerBlock width={110} height={32} borderRadius={12} />
        </View>

        {/* Right hero image */}
        <ShimmerBlock width={86} height={86} borderRadius={16} />
      </View>

      {/* ─── Compact countdown pill ─── */}
      <View style={styles.timerPillWrap}>
        <ShimmerBlock width={135} height={26} borderRadius={10} />
      </View>

      {/* ─── Delivery Card (white, with badges) ─── */}
      <View style={styles.deliveryCard}>
        {/* Floating top-right badge */}
        <View style={styles.floatingBadgeWrap}>
          <ShimmerBlock width={72} height={20} borderRadius={10} />
        </View>

        {/* Main row: date tile + info + chevron */}
        <View style={styles.deliveryCardMainRow}>
          {/* Date tile */}
          <ShimmerBlock width={58} height={64} borderRadius={14} />

          {/* Info column */}
          <View style={styles.deliveryInfoCol}>
            <ShimmerBlock width={'80%'} height={15} borderRadius={4} />
            <View style={{ height: 6 }} />
            <ShimmerBlock width={'65%'} height={12} borderRadius={4} />
            <View style={{ height: 6 }} />
            <ShimmerBlock width={'55%'} height={11} borderRadius={4} />
          </View>

          {/* Chevron */}
          <ShimmerBlock width={18} height={18} borderRadius={4} />
        </View>

        {/* Actions row */}
        <View style={styles.cardActionsRow}>
          <View style={styles.actionBtnWrap}>
            <ShimmerBlock width={14} height={14} borderRadius={4} />
            <View style={{ width: 6 }} />
            <ShimmerBlock width={44} height={11} borderRadius={4} />
          </View>

          <View style={styles.actionDividerVertical} />

          <View style={styles.actionBtnWrap}>
            <ShimmerBlock width={14} height={14} borderRadius={4} />
            <View style={{ width: 6 }} />
            <ShimmerBlock width={50} height={11} borderRadius={4} />
          </View>

          <View style={styles.actionDividerVertical} />

          <View style={styles.actionBtnWrap}>
            <ShimmerBlock width={14} height={14} borderRadius={4} />
            <View style={{ width: 6 }} />
            <ShimmerBlock width={44} height={11} borderRadius={4} />
          </View>
        </View>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Orders List Skeleton — the full tab content placeholder.
//    Shows a configurable number of order-card skeletons + the bottom
//    "Flexible Management" info card (which also renders while loading
//    in the real screen).
// ─────────────────────────────────────────────────────────────────────────────
export const OrdersListSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => {
  return (
    <View style={styles.listWrapper}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={`order-sk-${i}`}>
          <OrderCardSkeleton />
          {i < count - 1 && <View style={styles.dottedDivider} />}
        </View>
      ))}

      {/* Bottom "Flexible Management" info card skeleton */}
      <View style={styles.bottomControlCard}>
        <ShimmerBlock width={42} height={42} borderRadius={21} />
        <View style={styles.bottomControlTextCol}>
          <ShimmerBlock width={'55%'} height={13} borderRadius={4} />
          <View style={{ height: 6 }} />
          <ShimmerBlock width={'90%'} height={11} borderRadius={4} />
        </View>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────── STYLES ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  listWrapper: {
    width: '100%',
  },
  orderGroupWrapper: {
    marginBottom: 4,
  },

  // ── Next-delivery banner skeleton (mirrors `nextDeliveryBanner`) ──
  bannerCard: {
    backgroundColor: '#FFFBF2',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3E8D3',
  },
  bannerLeftCol: {
    flex: 1,
    paddingRight: 10,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Compact timer pill ──
  timerPillWrap: {
    marginBottom: 12,
  },

  // ── Delivery card skeleton (mirrors `deliveryCard`) ──
  deliveryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    paddingTop: 18,
    borderWidth: 1,
    borderColor: '#EAE8E3',
    position: 'relative',
  },
  floatingBadgeWrap: {
    position: 'absolute',
    top: -1,
    right: 18,
    zIndex: 10,
  },
  deliveryCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deliveryInfoCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 14,
    paddingTop: 10,
  },
  actionBtnWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDividerVertical: {
    width: 1,
    height: 16,
    backgroundColor: '#E2E8F0',
  },

  // ── Dotted divider between orders ──
  dottedDivider: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginVertical: 20,
    borderRadius: 1,
  },

  // ── Bottom info card skeleton ──
  bottomControlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F5ED',
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  bottomControlTextCol: {
    flex: 1,
    marginLeft: 12,
  },
});

export default {
  ShimmerBlock,
  OrderCardSkeleton,
  OrdersListSkeleton,
};