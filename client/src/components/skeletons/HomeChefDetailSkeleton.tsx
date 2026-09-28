import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");
const HEADER_HEIGHT = 360;

export default function HomeChefDetailSkeleton() {
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
    outputRange: [-width, width],
  });

  return (
    <View style={styles.container}>
      
      {/* 🔥 HEADER (matches real screen) */}
      <View style={styles.header}>
        <View style={styles.headerImage} />

        {/* back button */}
        <View style={styles.headerControls}>
          <View style={styles.circleBtn} />
        </View>
      </View>

      {/* 🔥 BODY (bottom sheet style) */}
      <View style={styles.body}>
        <View style={styles.sheet}>

          {/* handle */}
          <View style={styles.handle} />

          {/* title + rating */}
          <View style={styles.titleRow}>
            <View style={styles.title} />
            <View style={styles.rating} />
          </View>

          {/* location */}
          <View style={styles.sub} />

          {/* categories */}
          <View style={styles.categoriesRow}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={styles.categoryPill} />
            ))}
          </View>

          {/* section title */}
          <View style={styles.sectionTitle} />

          {/* menu cards */}
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.menuCard}>
              <View style={styles.menuImage} />
              <View style={styles.menuText}>
                <View style={styles.menuLine} />
                <View style={styles.menuLineSmall} />
              </View>
            </View>
          ))}

        </View>
      </View>

      {/* 🔥 SHIMMER */}
      <Animated.View
        style={[
          styles.shimmerWrapper,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.35)",
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

const base = "#e5e7eb";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  /* HEADER */
  header: {
    height: HEADER_HEIGHT,
    backgroundColor: base,
  },

  headerImage: {
    width: "100%",
    height: "100%",
    backgroundColor: base,
  },

  headerControls: {
    position: "absolute",
    top: 50,
    left: 16,
  },

  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#d1d5db",
  },

  /* BODY */
  body: {
    flex: 1,
    marginTop: -40,
  },

  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },

  handle: {
    width: 40,
    height: 5,
    backgroundColor: base,
    alignSelf: "center",
    borderRadius: 10,
    marginBottom: 12,
  },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: {
    width: "60%",
    height: 22,
    backgroundColor: base,
    borderRadius: 6,
  },

  rating: {
    width: 60,
    height: 28,
    backgroundColor: base,
    borderRadius: 12,
  },

  sub: {
    width: "50%",
    height: 14,
    backgroundColor: base,
    borderRadius: 6,
    marginTop: 10,
  },

  categoriesRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  categoryPill: {
    width: 110,
    height: 40,
    borderRadius: 20,
    backgroundColor: base,
  },

  sectionTitle: {
    width: 160,
    height: 18,
    backgroundColor: base,
    borderRadius: 6,
    marginTop: 20,
  },

  menuCard: {
    flexDirection: "row",
    marginTop: 16,
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 14,
  },

  menuImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: base,
    marginRight: 10,
  },

  menuText: {
    flex: 1,
    justifyContent: "center",
  },

  menuLine: {
    width: "70%",
    height: 14,
    backgroundColor: base,
    borderRadius: 6,
    marginBottom: 6,
  },

  menuLineSmall: {
    width: "40%",
    height: 12,
    backgroundColor: base,
    borderRadius: 6,
  },

  /* SHIMMER */
  shimmerWrapper: {
    position: "absolute",
    top: 0,
    left: -200,
    width: 200,
    height: "100%",
  },

  shimmer: {
    width: "100%",
    height: "100%",
  },
});