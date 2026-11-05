import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

/* ─── Dark-theme shimmer block ──────────────────────────────────── */
const Shimmer = ({
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
    outputRange: [0.35, 0.7],
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
const AddChefCategorySkeleton = () => {
  return (
    <View style={styles.safe}>
      {/* ── FIXED HEADER SKELETON ── */}
      <View style={styles.globalHeader}>
        <View style={styles.globalHeaderContent}>
          {/* Left: icon ring + title */}
          <View style={styles.headerLeft}>
            <Shimmer width={40} height={40} borderRadius={20} />
            <View style={styles.headerTextWrapper}>
              <Shimmer width={140} height={16} borderRadius={6} />
              <Shimmer
                width={80}
                height={10}
                borderRadius={5}
                style={{ marginTop: 6 }}
              />
            </View>
          </View>

          {/* Right: add button + call button */}
          <View style={styles.headerRight}>
            <Shimmer width={110} height={36} borderRadius={10} />
            <Shimmer
              width={36}
              height={36}
              borderRadius={10}
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>
      </View>

      {/* ── CONTAINER ── */}
      <View style={styles.container}>
        {/* Sub-header row: back button placeholder + add button */}
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }} />
            <Shimmer width={100} height={38} borderRadius={10} />
          </View>

          {/* Filter pills row (Breakfast / Lunch / Dinner / Snacks) */}
          <View style={styles.topRowContainer}>
            <Shimmer
              width={220}
              height={12}
              borderRadius={5}
              style={{ marginBottom: 8, marginLeft: 2 }}
            />
            <View style={styles.pillRowSkeleton}>
              {[70, 58, 62, 66].map((pillW, idx) => (
                <Shimmer
                  key={idx}
                  width={pillW}
                  height={28}
                  borderRadius={16}
                  style={{ marginRight: 6 }}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Section title */}
        <Shimmer
          width={180}
          height={18}
          borderRadius={6}
          style={{ marginTop: 10, marginBottom: 12, marginLeft: 2 }}
        />

        {/* ── SCROLLABLE CARD LIST SKELETON ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentContainer}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.categoryCard}>
                {/* Hero image area */}
                <Shimmer
                  width="100%"
                  height={170}
                  borderRadius={0}
                />

                {/* Content below hero: title + button */}
                <View style={styles.categoryContent}>
                  <Shimmer
                    width={140 + (i % 2) * 40}
                    height={17}
                    borderRadius={6}
                    style={{ marginBottom: 12 }}
                  />
                  <Shimmer
                    width="100%"
                    height={42}
                    borderRadius={10}
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default AddChefCategorySkeleton;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0C130E",
  },

  /* Global fixed header */
  globalHeader: {
    backgroundColor: "#131E16",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(82, 183, 136, 0.15)",
  },
  globalHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  headerTextWrapper: {
    justifyContent: "center",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },

  /* Container */
  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: "#0C130E",
  },
  headerContainer: {
    marginTop: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  topRowContainer: {
    marginBottom: 6,
  },
  pillRowSkeleton: {
    flexDirection: "row",
    alignItems: "center",
  },

  /* Card list */
  contentContainer: {
    paddingBottom: 24,
  },
  categoryCard: {
    backgroundColor: "#131E16",
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(82, 183, 136, 0.16)",
  },
  categoryContent: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
});