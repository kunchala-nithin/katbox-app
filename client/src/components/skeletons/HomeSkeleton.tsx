// src/skeletons/SkeletonsHome.tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';

const { width } = Dimensions.get('window');
const HOME_CARD_WIDTH = 220;

// ─────────────────────────────────────────────────────────────────────────────
// ✅ A single animated shimmer block — the building brick of all skeletons.
//    Uses the native driver so it never blocks the JS thread.
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
// ✅ Banner skeleton — mirrors the exact 200-tall half-info/half-image card.
// ─────────────────────────────────────────────────────────────────────────────
export const BannerSkeleton: React.FC = () => {
  return (
    <View style={bannerSkeletonStyles.card}>
      {/* Left: info column */}
      <View style={bannerSkeletonStyles.left}>
        <ShimmerBlock width={90} height={16} borderRadius={12} />
        <View style={{ height: 8 }} />
        <ShimmerBlock width={'90%'} height={16} borderRadius={4} />
        <View style={{ height: 6 }} />
        <ShimmerBlock width={'70%'} height={16} borderRadius={4} />
        <View style={{ height: 10 }} />
        <ShimmerBlock width={'95%'} height={10} borderRadius={4} />
        <View style={{ height: 5 }} />
        <ShimmerBlock width={'80%'} height={10} borderRadius={4} />
        <View style={{ height: 14 }} />
        <ShimmerBlock width={110} height={28} borderRadius={18} />
      </View>

      {/* Right: image block */}
      <View style={bannerSkeletonStyles.right}>
        <ShimmerBlock width={'100%'} height={200} borderRadius={0} />
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Category pill skeleton — 6 icon circles + labels
// ─────────────────────────────────────────────────────────────────────────────
export const CategoryRowSkeleton: React.FC = () => {
  return (
    <View style={categorySkeletonStyles.row}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={categorySkeletonStyles.item}>
          <ShimmerBlock width={54} height={54} borderRadius={19} />
          <View style={{ height: 7 }} />
          <ShimmerBlock width={40} height={9} borderRadius={4} />
        </View>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Coupon banner skeleton
// ─────────────────────────────────────────────────────────────────────────────
export const CouponSkeleton: React.FC = () => {
  return (
    <View style={couponSkeletonStyles.wrap}>
      <View style={couponSkeletonStyles.card}>
        <ShimmerBlock width={40} height={40} borderRadius={9} />
        <View style={{ width: 10 }} />
        <View style={{ flex: 1 }}>
          <ShimmerBlock width={'85%'} height={12} borderRadius={4} />
          <View style={{ height: 6 }} />
          <ShimmerBlock width={140} height={10} borderRadius={4} />
        </View>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Filter pills skeleton
// ─────────────────────────────────────────────────────────────────────────────
export const FilterPillsSkeleton: React.FC = () => {
  const pills = [60, 70, 80, 65, 95];
  return (
    <View style={filterPillsSkeletonStyles.row}>
      {pills.map((w, i) => (
        <View key={i} style={{ marginRight: 8 }}>
          <ShimmerBlock width={w} height={28} borderRadius={16} />
        </View>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ A single chef card skeleton — exact dimensions of the real card
//    (220 wide × ~265 tall including image + body)
// ─────────────────────────────────────────────────────────────────────────────
export const ChefCardSkeleton: React.FC = () => {
  return (
    <View style={chefCardSkeletonStyles.card}>
      {/* Image area */}
      <View style={chefCardSkeletonStyles.imageWrap}>
        <ShimmerBlock width={'100%'} height={120} borderRadius={0} />
        {/* Verified pill */}
        <View style={chefCardSkeletonStyles.badgeTopLeft}>
          <ShimmerBlock width={58} height={14} borderRadius={8} />
        </View>
        {/* Fav button */}
        <View style={chefCardSkeletonStyles.badgeTopRight}>
          <ShimmerBlock width={26} height={26} borderRadius={13} />
        </View>
        {/* Avatar */}
        <View style={chefCardSkeletonStyles.avatarWrap}>
          <ShimmerBlock width={36} height={36} borderRadius={18} />
        </View>
      </View>

      {/* Body */}
      <View style={chefCardSkeletonStyles.body}>
        <ShimmerBlock width={'75%'} height={14} borderRadius={4} />
        <View style={{ height: 8 }} />
        <ShimmerBlock width={'55%'} height={10} borderRadius={4} />
        <View style={{ height: 8 }} />
        <ShimmerBlock width={'85%'} height={10} borderRadius={4} />
        <View style={{ height: 12 }} />
        <View style={chefCardSkeletonStyles.footerRow}>
          <ShimmerBlock width={70} height={14} borderRadius={4} />
          <ShimmerBlock width={32} height={14} borderRadius={3} />
        </View>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Row of chef card skeletons — for the horizontal chefs ScrollView.
// ─────────────────────────────────────────────────────────────────────────────
export const ChefDeckSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <View style={chefDeckSkeletonStyles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <ChefCardSkeleton key={i} />
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ Whole "Top Home Made Caterers" section skeleton (header + pills + cards).
//    This is the big one used while chefs are still loading.
// ─────────────────────────────────────────────────────────────────────────────
export const CaterersSectionSkeleton: React.FC = () => {
  return (
    <View style={caterersSectionSkeletonStyles.wrap}>
      {/* Section header */}
      <View style={caterersSectionSkeletonStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <ShimmerBlock width={190} height={15} borderRadius={5} />
          <View style={{ height: 6 }} />
          <ShimmerBlock width={220} height={11} borderRadius={4} />
        </View>
        <ShimmerBlock width={58} height={14} borderRadius={5} />
      </View>

      {/* Filter pills */}
      <View style={caterersSectionSkeletonStyles.pillsWrap}>
        <FilterPillsSkeleton />
      </View>

      {/* Chef cards row */}
      <View style={caterersSectionSkeletonStyles.deckWrap}>
        <ChefDeckSkeleton count={3} />
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────── STYLES ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const bannerSkeletonStyles = StyleSheet.create({
  card: {
    width: width - 32,
    height: 200,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#132117',
    borderWidth: 1,
    borderColor: '#223628',
  },
  left: {
    flex: 1.15,
    paddingTop: 14,
    paddingBottom: 20,
    paddingLeft: 16,
    paddingRight: 6,
    justifyContent: 'center',
  },
  right: {
    flex: 1,
    height: '100%',
    backgroundColor: '#1F2E24',
  },
});

const categorySkeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  item: {
    width: (width - 20) / 5,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
});

const couponSkeletonStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F3EC',
    borderRadius: 15,
    padding: 10,
    paddingRight: 12,
  },
});

const filterPillsSkeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
});

const chefCardSkeletonStyles = StyleSheet.create({
  card: {
    width: HOME_CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    height: 120,
    backgroundColor: '#F1F5F9',
    position: 'relative',
  },
  badgeTopLeft: {
    position: 'absolute',
    top: 7,
    left: 7,
  },
  badgeTopRight: {
    position: 'absolute',
    top: 7,
    right: 7,
  },
  avatarWrap: {
    position: 'absolute',
    bottom: -11,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  body: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    marginTop: 4,
  },
});

const chefDeckSkeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});

const caterersSectionSkeletonStyles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  pillsWrap: {
    marginBottom: 0,
  },
  deckWrap: {
    marginTop: 0,
  },
});

export default {
  ShimmerBlock,
  BannerSkeleton,
  CategoryRowSkeleton,
  CouponSkeleton,
  FilterPillsSkeleton,
  ChefCardSkeleton,
  ChefDeckSkeleton,
  CaterersSectionSkeleton,
};