// components/NetworkStatusBanner.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "@/src/lib/api"; // 👈 same path as add-chefs.tsx uses

type NetState = "online" | "slow" | "offline";

interface Props {
  slowThresholdMs?: number;
  checkIntervalMs?: number;
  pingUrl?: string;
  onChange?: (state: NetState) => void;
}

const NetworkStatusBanner: React.FC<Props> = ({
  slowThresholdMs = 3500,
  checkIntervalMs = 12000,
  pingUrl = "/api/chefs/my-chef",
  onChange,
}) => {
  const [state, setState] = useState<NetState>("online");
  const slideAnim = useRef(new Animated.Value(-120)).current;

  const checkNetwork = async () => {
    try {
      const start = Date.now();
      await api.get(pingUrl, {
        timeout: slowThresholdMs + 2000,
      });
      const elapsed = Date.now() - start;
      const next: NetState = elapsed > slowThresholdMs ? "slow" : "online";
      setState(next);
      onChange?.(next);
    } catch (err: any) {
      const isTimeout =
        err?.code === "ECONNABORTED" ||
        err?.message?.toLowerCase().includes("timeout") ||
        err?.name === "AbortError";
      const next: NetState = isTimeout ? "slow" : "offline";
      setState(next);
      onChange?.(next);
    }
  };

  useEffect(() => {
    checkNetwork();
    const id = setInterval(checkNetwork, checkIntervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: state === "online" ? -120 : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [state, slideAnim]);

  const config =
    state === "offline"
      ? {
          bg: "#7F1D1D",
          border: "#991B1B",
          icon: "cloud-offline-outline" as const,
          title: "You're offline",
          sub: "Check your internet connection. We'll retry automatically.",
        }
      : state === "slow"
      ? {
          bg: "#78350F",
          border: "#92400E",
          icon: "wifi-outline" as const,
          title: "Network is slow",
          sub: "Uploads & saves may take longer than usual.",
        }
      : null;

  if (!config) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          backgroundColor: config.bg,
          borderBottomColor: config.border,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={config.icon} size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {config.sub}
          </Text>
        </View>
        <TouchableOpacity onPress={checkNetwork} style={styles.retryBtn}>
          <Ionicons name="refresh" size={14} color="#FFFFFF" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default NetworkStatusBanner;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingTop: Platform.OS === "ios" ? 48 : 30,
    paddingBottom: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  sub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11.5,
    fontWeight: "500",
    marginTop: 1,
    lineHeight: 15,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});