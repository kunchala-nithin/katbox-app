import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

export default function MenuItemSkeleton() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 1.5, width * 1.5],
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <View style={styles.title} />
        <View style={styles.subtitle} />

        <View style={styles.menuHighlightCard}>
          <View style={styles.menuTextBlock}>
            <View style={styles.menuTitleLine} />
            <View style={styles.menuSubtitleLine} />
            <View style={styles.itemsRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.circleItem} />
              ))}
            </View>
          </View>
          <View style={styles.priceBox} />
        </View>
      </View>

      {/* SMALL HEADER (faint) */}
      <View style={styles.smallHeaderSkeleton} />

      {/* FILTER */}
      <View style={styles.filterRow}>
        <View style={styles.filterBtn} />
        <View style={styles.filterBtn} />
      </View>

      {/* PROGRESS BAR */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBg} />
      </View>

      {/* BODY */}
      <View style={styles.body}>
        {/* SIDEBAR */}
        <View style={styles.sidebar}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.categoryItem} />
          ))}
        </View>

        {/* PRODUCT GRID */}
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.image} />
              <View style={styles.text} />
              <View style={styles.button} />
            </View>
          ))}
        </View>
      </View>

      {/* SHIMMER OVERLAY */}
      <Animated.View
        style={[styles.shimmerWrapper, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.6)",
            "rgba(255,255,255,0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shimmer}
        />
      </Animated.View>
    </View>
  );
}

const base = "#e2e8f0";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },

  header: {
    backgroundColor: "#fff",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },

  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: base,
    borderRadius: 20,
    marginBottom: 12,
  },

  title: {
    width: "65%",
    height: 26,
    backgroundColor: base,
    borderRadius: 8,
    marginBottom: 8,
  },

  subtitle: {
    width: "45%",
    height: 16,
    backgroundColor: base,
    borderRadius: 6,
    marginBottom: 20,
  },

  menuHighlightCard: {
    flexDirection: "row",
    backgroundColor: base,
    borderRadius: 20,
    padding: 16,
    height: 160,
  },

  menuTextBlock: { flex: 1 },

  menuTitleLine: {
    width: "75%",
    height: 18,
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 10,
  },

  menuSubtitleLine: {
    width: "55%",
    height: 14,
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 12,
  },

  itemsRow: {
    flexDirection: "row",
    gap: 12,
  },

  circleItem: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
  },

  priceBox: {
    width: 85,
    height: 85,
    backgroundColor: "#fff",
    borderRadius: 18,
    alignSelf: "center",
  },

  smallHeaderSkeleton: {
    height: 100,
    backgroundColor: "#fff",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0.6,
  },

  filterRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
    backgroundColor: "#fff",
  },

  filterBtn: {
    width: 130,
    height: 42,
    backgroundColor: base,
    borderRadius: 25,
  },

  progressBarContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },

  progressBarBg: {
    height: 6,
    backgroundColor: base,
    borderRadius: 4,
  },

  body: {
    flexDirection: "row",
    flex: 1,
    backgroundColor: "#fff",
  },

  sidebar: {
    width: 110,
    paddingTop: 12,
    paddingHorizontal: 8,
    gap: 14,
  },

  categoryItem: {
    width: "100%",
    height: 78,
    backgroundColor: base,
    borderRadius: 14,
  },

  grid: {
    flex: 1,
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 10,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    elevation: 2,
  },

  image: {
    height: 130,
    backgroundColor: base,
    borderRadius: 14,
    marginBottom: 12,
  },

  text: {
    height: 16,
    backgroundColor: base,
    borderRadius: 6,
    marginBottom: 12,
  },

  button: {
    height: 38,
    backgroundColor: base,
    borderRadius: 20,
  },

  shimmerWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },

  shimmer: {
    width: "100%",
    height: "100%",
  },
});