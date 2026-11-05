import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

export default function HomeChefSkeleton() {
  const shimmer = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 🔥 Shimmer animation
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    ).start();

    // 🔥 Fade-in effect
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {Array.from({ length: 5 }).map((_, index) => (
          <View key={index} style={styles.card}>
            
            {/* COVER */}
            <View style={styles.cover} />

            {/* AVATAR */}
            <View style={styles.avatarWrapper}>
              <View style={styles.avatar} />
            </View>

            {/* RATING */}
            <View style={styles.rating} />

            {/* CONTENT */}
            <View style={styles.content}>
              
              {/* TITLE ROW */}
              <View style={styles.titleRow}>
                <View style={styles.nameBlock} />
                <View style={styles.price} />
              </View>

              {/* EXP */}
              <View style={styles.exp} />

              {/* DIVIDER */}
              <View style={styles.separator} />

              {/* SPECIAL */}
              <View style={styles.special} />

              {/* BADGES */}
              <View style={styles.badgeRow}>
                <View style={styles.badge} />
                <View style={styles.badge} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 🔥 SHIMMER EFFECT */}
      <Animated.View
        style={[
          styles.shimmerWrapper,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.45)",
            "rgba(255,255,255,0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shimmer}
        />
      </Animated.View>
    </Animated.View>
  );
}

const base = "#E5E7EB";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    paddingTop: 10,
  },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 22,
    overflow: "hidden",
  },

  cover: {
    width: "100%",
    height: 140,
    backgroundColor: base,
  },

  avatarWrapper: {
    position: "absolute",
    top: 95,
    left: 16,
    borderRadius: 40,
    padding: 3,
    backgroundColor: "#fff",
  },

  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: base,
  },

  rating: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 50,
    height: 20,
    borderRadius: 10,
    backgroundColor: base,
  },

  content: {
    paddingTop: 36,
    padding: 16,
  },

  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  nameBlock: {
    width: "60%",
    height: 16,
    borderRadius: 6,
    backgroundColor: base,
  },

  price: {
    width: 70,
    height: 14,
    borderRadius: 6,
    backgroundColor: base,
  },

  exp: {
    width: "70%",
    height: 12,
    borderRadius: 6,
    backgroundColor: base,
    marginTop: 8,
  },

  separator: {
    height: 1,
    backgroundColor: "#EEF2F7",
    marginVertical: 10,
  },

  special: {
    width: "80%",
    height: 12,
    borderRadius: 6,
    backgroundColor: base,
  },

  badgeRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
  },

  badge: {
    width: 100,
    height: 28,
    borderRadius: 10,
    backgroundColor: base,
  },

  shimmerWrapper: {
    position: "absolute",
    top: 0,
    left: -width,
    width: width,
    height: "100%",
  },

  shimmer: {
    width: "100%",
    height: "100%",
  },
});