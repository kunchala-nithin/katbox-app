import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

/* ─── Shimmer primitive ─────────────────────────────────────────── */
const ShimmerBlock = ({
  width: w,
  height: h,
  borderRadius = 8,
  style,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.9],
  });

  return (
    <Animated.View
      style={[
        {
          width: w as any,
          height: h,
          borderRadius,
          backgroundColor: "#E2E8F0",
          opacity,
        },
        style,
      ]}
    />
  );
};

/* Dark-theme shimmer for the header */
const DarkShimmerBlock = ({
  width: w,
  height: h,
  borderRadius = 8,
  style,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.65],
  });

  return (
    <Animated.View
      style={[
        {
          width: w as any,
          height: h,
          borderRadius,
          backgroundColor: "#26362A",
          opacity,
        },
        style,
      ]}
    />
  );
};

/* ─── Main skeleton ─────────────────────────────────────────────── */
const AddChefsSkeleton = () => {
  return (
    <View style={styles.root}>
      {/* HEADER SKELETON */}
      <LinearGradient
        colors={["#0B140F", "#132117", "#1A241D"]}
        style={styles.darkHeader}
      >
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerInner}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerBrandCol}>
                <DarkShimmerBlock width={120} height={10} borderRadius={4} />
                <DarkShimmerBlock
                  width={width * 0.62}
                  height={22}
                  borderRadius={8}
                  style={{ marginTop: 10 }}
                />
                <DarkShimmerBlock
                  width={width * 0.75}
                  height={12}
                  borderRadius={6}
                  style={{ marginTop: 10 }}
                />
              </View>

              <View style={styles.headerToggleContainer}>
                <DarkShimmerBlock width={42} height={9} borderRadius={4} />
                <DarkShimmerBlock
                  width={38}
                  height={20}
                  borderRadius={12}
                  style={{ marginTop: 6 }}
                />
              </View>
            </View>

            {/* Stats strip */}
            <View style={styles.statsStrip}>
              {[0, 1, 2].map((i) => (
                <React.Fragment key={i}>
                  <View style={styles.statItem}>
                    <DarkShimmerBlock width={28} height={28} borderRadius={10} />
                    <DarkShimmerBlock
                      width={44}
                      height={13}
                      borderRadius={5}
                      style={{ marginTop: 6 }}
                    />
                    <DarkShimmerBlock
                      width={36}
                      height={9}
                      borderRadius={4}
                      style={{ marginTop: 5 }}
                    />
                  </View>
                  {i < 2 && <View style={styles.statDivider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* BODY SKELETON */}
      <View style={styles.bodyCard}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Photo section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <ShimmerBlock width={34} height={34} borderRadius={12} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ShimmerBlock width={110} height={14} borderRadius={6} />
                <ShimmerBlock
                  width={160}
                  height={11}
                  borderRadius={5}
                  style={{ marginTop: 6 }}
                />
              </View>
            </View>
            <View style={styles.avatarRowContainer}>
              <ShimmerBlock width={128} height={128} borderRadius={64} />
            </View>
          </View>

          {/* Banners section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <ShimmerBlock width={170} height={15} borderRadius={6} />
            </View>
            <View style={styles.bannerRowSkeleton}>
              {[0, 1, 2].map((i) => (
                <ShimmerBlock
                  key={i}
                  width={96}
                  height={84}
                  borderRadius={14}
                  style={{ marginRight: 10 }}
                />
              ))}
            </View>
          </View>

          {/* Profile details section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <ShimmerBlock width={34} height={34} borderRadius={12} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ShimmerBlock width={120} height={14} borderRadius={6} />
                <ShimmerBlock
                  width={180}
                  height={11}
                  borderRadius={5}
                  style={{ marginTop: 6 }}
                />
              </View>
            </View>

            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} style={{ marginTop: i === 0 ? 4 : 4 }}>
                <ShimmerBlock
                  width={90 + (i % 3) * 20}
                  height={12}
                  borderRadius={5}
                  style={{ marginBottom: 8, marginLeft: 2 }}
                />
                <ShimmerBlock
                  width="100%"
                  height={48}
                  borderRadius={14}
                  style={{ marginBottom: 14 }}
                />
              </View>
            ))}

            {/* Food type buttons */}
            <ShimmerBlock
              width={80}
              height={12}
              borderRadius={5}
              style={{ marginBottom: 8, marginLeft: 2 }}
            />
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              {[0, 1, 2].map((i) => (
                <ShimmerBlock
                  key={i}
                  width={(width - 32 - 32 - 20) / 3}
                  height={44}
                  borderRadius={12}
                />
              ))}
            </View>
          </View>

          {/* Coupons section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <ShimmerBlock width={34} height={34} borderRadius={12} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ShimmerBlock width={150} height={14} borderRadius={6} />
                <ShimmerBlock
                  width={200}
                  height={11}
                  borderRadius={5}
                  style={{ marginTop: 6 }}
                />
              </View>
              <ShimmerBlock width={70} height={32} borderRadius={12} />
            </View>

            {[0, 1].map((i) => (
              <ShimmerBlock
                key={i}
                width="100%"
                height={78}
                borderRadius={16}
                style={{ marginTop: 8 }}
              />
            ))}
          </View>

          {/* Submit button */}
          <ShimmerBlock
            width="100%"
            height={54}
            borderRadius={16}
            style={{ marginTop: 4 }}
          />

          <View style={{ height: Platform.OS === "ios" ? 100 : 88 }} />
        </ScrollView>
      </View>
    </View>
  );
};

export default AddChefsSkeleton;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B140F",
  },
  darkHeader: {
    paddingBottom: 20,
  },
  headerInner: {
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerBrandCol: {
    flex: 1,
    paddingRight: 12,
  },
  headerToggleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: "rgba(26, 36, 29, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(38, 54, 42, 0.9)",
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(26, 36, 29, 0.95)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(38, 54, 42, 0.9)",
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(38, 54, 42, 0.95)",
  },
  bodyCard: {
    flex: 1,
    backgroundColor: "#F4F7F5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8EEE9",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarRowContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  bannerRowSkeleton: {
    flexDirection: "row",
    marginTop: 4,
  },
});