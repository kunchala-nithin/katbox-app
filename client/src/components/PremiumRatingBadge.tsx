import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  rating?: string | number;
  size?: "small" | "large";
  style?: any;
};

export default function PremiumRatingBadge({
  rating,
  size = "small",
  style,
}: Props) {
  if (rating === undefined || rating === null || rating === "") return null;

  const isLarge = size === "large";

  return (
    <View
      style={[
        styles.container,
        isLarge && styles.largeContainer,
        style,
      ]}
    >
      <Ionicons
        name="star"
        size={isLarge ? 18 : 14}
        color="#FFD700"
      />
      <Text
        style={[
          styles.text,
          isLarge && styles.largeText,
        ]}
      >
        {rating}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  largeContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
  largeText: {
    fontSize: 16,
  },
});