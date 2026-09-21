import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  Pressable,
  Switch,
  Dimensions,
  LayoutAnimation,
  UIManager,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Ionicons,
  Feather,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AdminFilterTab = "All" | "Active" | "Blocked" | "Offline";

const FILTER_TABS: AdminFilterTab[] = ["All", "Active", "Blocked", "Offline"];

type CouponServiceType = "catering" | "mealbox" | "homemade" | "quickbites";

const SERVICE_TYPE_LABEL: Record<CouponServiceType, string> = {
  catering: "Catering",
  mealbox: "MealBox",
  homemade: "Homemade",
  quickbites: "Quick Bites",
};

const SERVICE_TYPE_OPTIONS: CouponServiceType[] = [
  "catering",
  "mealbox",
  "homemade",
  "quickbites",
];

const ORDER_SERVICE_ICON: Record<string, any> = {
  catering: "silverware-fork-knife",
  mealbox: "food-takeout-box-outline",
  homemade: "home-outline",
  quickbites: "flash-outline",
};

const ORDER_SERVICE_LABEL: Record<string, string> = {
  catering: "Catering",
  mealbox: "MealBox",
  homemade: "Homemade",
  quickbites: "Quick Bites",
};

const orderStatusTone = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s.includes("delivered") || s.includes("completed") || s.includes("collected")) {
    return { bg: "rgba(34, 197, 94, 0.14)", fg: "#22C55E", label: "Delivered" };
  }
  if (s.includes("cancel")) {
    return { bg: "rgba(239, 68, 68, 0.14)", fg: "#EF4444", label: status };
  }
  if (s.includes("prep") || s.includes("pack")) {
    return { bg: "rgba(37, 99, 235, 0.14)", fg: "#2563EB", label: status };
  }
  if (s.includes("out") || s.includes("delivery")) {
    return { bg: "rgba(217, 119, 6, 0.14)", fg: "#D97706", label: status };
  }
  return { bg: "rgba(100, 116, 139, 0.14)", fg: "#64748B", label: status || "Placed" };
};

const formatOrderDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

export default function AdminAllChefsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [chefs, setChefs] = useState<any[]>([]);
  const [filterTab, setFilterTab] = useState<AdminFilterTab>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [togglingChefId, setTogglingChefId] = useState<string | null>(null);

  // ─── Edit modal state ───
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingChef, setEditingChef] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [editName, setEditName] = useState<string>("");
  const [editExp, setEditExp] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editAadhar, setEditAadhar] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");
  const [editSpecialty, setEditSpecialty] = useState<string>("");
  const [editPrice, setEditPrice] = useState<string>("");
  const [editFoodType, setEditFoodType] = useState<"VEG" | "NONVEG" | "BOTH">("BOTH");
  const [editFssaiNo, setEditFssaiNo] = useState<string>("");
  const [editIsAvailable, setEditIsAvailable] = useState<boolean>(true);

  const [deletingChefId, setDeletingChefId] = useState<string | null>(null);

  // ─── Coupon management state ───
  const [expandedCouponsChefId, setExpandedCouponsChefId] = useState<string | null>(null);
  const [addingCouponToChefId, setAddingCouponToChefId] = useState<string | null>(null);
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponType, setNewCouponType] = useState<"percent" | "flat">("percent");
  const [newCouponValue, setNewCouponValue] = useState("");
  const [newCouponDescription, setNewCouponDescription] = useState("");
  const [newCouponServiceType, setNewCouponServiceType] =
    useState<CouponServiceType>("catering");
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);

  // ─── Order-history modal state ───
  const [showOrdersModal, setShowOrdersModal] = useState<boolean>(false);
  const [ordersChef, setOrdersChef] = useState<any>(null);

  const isFetchingRef = useRef<boolean>(false);

  const fetchAllChefs = async (silent: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!silent) setLoading(true);
      const res = await api.get("/api/chefs/admin/all");

      if (res.data && res.data.success && Array.isArray(res.data.chefs)) {
        setChefs(res.data.chefs);
      } else {
        setChefs([]);
      }
    } catch (err: any) {
      console.log("Admin fetch chefs error:", err?.response?.data || err?.message || err);
      if (!silent) {
        Alert.alert(
          "Error",
          err?.response?.data?.message || "Failed to load chefs."
        );
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAllChefs(true);
    }, [])
  );

  useEffect(() => {
    fetchAllChefs();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllChefs(true);
  }, []);

  const filteredChefs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return chefs.filter((chef) => {
      const isBlocked = chef.userIsChef === false;
      const isOffline = chef.isAvailable === false;

      if (filterTab === "Active" && isBlocked) return false;
      if (filterTab === "Blocked" && !isBlocked) return false;
      if (filterTab === "Offline" && !isOffline) return false;

      if (q) {
        const haystack = [
          chef.name,
          chef.location,
          chef.specialty,
          chef.phone,
          chef.userEmail,
          chef.userPhone,
          chef.fssaiNo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [chefs, filterTab, searchQuery]);

  const stats = useMemo(() => {
    const total = chefs.length;
    const blocked = chefs.filter((c) => c.userIsChef === false).length;
    const offline = chefs.filter((c) => c.isAvailable === false).length;
    const active = total - blocked;
    return { total, active, blocked, offline };
  }, [chefs]);

  const handleToggleBlock = async (chef: any, nextValue: boolean) => {
    const chefId = chef?._id || chef?.id;
    if (!chefId) return;

    if (togglingChefId === chefId) return;

    const previousValue = chef.userIsChef !== false;
    setTogglingChefId(chefId);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setChefs((prev) =>
      prev.map((c) =>
        (c._id || c.id) === chefId ? { ...c, userIsChef: nextValue } : c
      )
    );

    try {
      const res = await api.patch(`/api/chefs/admin/${chefId}/toggle-block`, {
        isChef: nextValue,
      });

      if (res.data && res.data.success) {
        const serverValue = res.data.isChef !== false;
        setChefs((prev) =>
          prev.map((c) =>
            (c._id || c.id) === chefId ? { ...c, userIsChef: serverValue } : c
          )
        );
      } else {
        throw new Error(res.data?.message || "Toggle failed");
      }
    } catch (err: any) {
      console.log("Toggle block error:", err?.response?.data || err?.message || err);

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setChefs((prev) =>
        prev.map((c) =>
          (c._id || c.id) === chefId ? { ...c, userIsChef: previousValue } : c
        )
      );

      Alert.alert(
        "Error",
        err?.response?.data?.message ||
          "Failed to update chef status. Please try again."
      );
    } finally {
      setTogglingChefId(null);
    }
  };

  const openEditModal = (chef: any) => {
    setEditingChef(chef);
    setEditName(chef.name || "");
    setEditExp(chef.exp || "");
    setEditPhone(chef.phone || "");
    setEditAadhar(chef.aadhar || "");
    setEditLocation(chef.location || "");
    setEditSpecialty(chef.specialty || "");
    setEditPrice(chef.price || "");
    setEditFoodType(chef.foodType || "BOTH");
    setEditFssaiNo(chef.fssaiNo || "");
    setEditIsAvailable(chef.isAvailable !== false);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setShowEditModal(false);
    setEditingChef(null);
  };

  const openOrdersModal = (chef: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOrdersChef(chef);
    setShowOrdersModal(true);
  };

  const closeOrdersModal = () => {
    setShowOrdersModal(false);
    setOrdersChef(null);
  };

  const handleSaveEdit = async () => {
    if (!editingChef) return;
    const chefId = editingChef._id || editingChef.id;

    if (!editName.trim() || !editExp.trim() || !editLocation.trim() || !editSpecialty.trim() || !editPrice.trim()) {
      Alert.alert("Missing fields", "Please fill name, experience, location, specialty and price.");
      return;
    }
    if (editPhone && editPhone.length !== 10) {
      Alert.alert("Invalid phone", "Phone number must be exactly 10 digits.");
      return;
    }
    if (editAadhar && editAadhar.length !== 12) {
      Alert.alert("Invalid Aadhar", "Aadhar number must be exactly 12 digits.");
      return;
    }

    setSavingEdit(true);
    try {
      const res = await api.patch(`/api/chefs/admin/${chefId}`, {
        name: editName.trim(),
        exp: editExp.trim(),
        phone: editPhone.trim(),
        aadhar: editAadhar.trim(),
        location: editLocation.trim(),
        specialty: editSpecialty.trim(),
        price: editPrice.trim(),
        foodType: editFoodType,
        fssaiNo: editFssaiNo.trim(),
        isAvailable: editIsAvailable,
      });

      if (res.data && res.data.success && res.data.chef) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setChefs((prev) =>
          prev.map((c) =>
            (c._id || c.id) === chefId
              ? { ...c, ...res.data.chef }
              : c
          )
        );
        Alert.alert("Success", "Chef profile updated successfully.");
        closeEditModal();
      } else {
        throw new Error(res.data?.message || "Update failed");
      }
    } catch (err: any) {
      console.log("Admin edit chef error:", err?.response?.data || err?.message || err);
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Failed to update chef profile."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteChef = (chef: any) => {
    const chefId = chef?._id || chef?.id;
    if (!chefId) return;

    Alert.alert(
      "Delete Chef",
      `Are you sure you want to permanently delete "${chef.name}"?\n\nThis will remove:\n• Chef profile\n• All menus & categories\n• All Cloudinary images\n• Linked user's isChef flag will be reset`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            setDeletingChefId(chefId);
            try {
              const res = await api.delete(`/api/chefs/admin/${chefId}`);

              if (res.data && res.data.success) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setChefs((prev) => prev.filter((c) => (c._id || c.id) !== chefId));
                Alert.alert("Deleted", "Chef and all related data removed permanently.");
              } else {
                throw new Error(res.data?.message || "Delete failed");
              }
            } catch (err: any) {
              console.log("Admin delete chef error:", err?.response?.data || err?.message || err);
              Alert.alert(
                "Error",
                err?.response?.data?.message || "Failed to delete chef."
              );
            } finally {
              setDeletingChefId(null);
            }
          },
        },
      ]
    );
  };

  // ─── Coupon form helpers ───
  const resetCouponForm = () => {
    setNewCouponCode("");
    setNewCouponType("percent");
    setNewCouponValue("");
    setNewCouponDescription("");
    setNewCouponServiceType("catering");
  };

  const handleToggleCouponsSection = (chefId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedCouponsChefId === chefId) {
      setExpandedCouponsChefId(null);
      setAddingCouponToChefId(null);
      resetCouponForm();
    } else {
      setExpandedCouponsChefId(chefId);
      setAddingCouponToChefId(null);
      resetCouponForm();
    }
  };

  const handleOpenAddCouponForm = (chefId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAddingCouponToChefId(chefId);
    resetCouponForm();
  };

  const handleCancelAddCoupon = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAddingCouponToChefId(null);
    resetCouponForm();
  };

  const handleSaveNewCoupon = async (chefId: string) => {
    const code = newCouponCode.trim().toUpperCase();
    const value = newCouponValue.trim();

    if (!code) {
      Alert.alert("Missing code", "Enter a coupon code (e.g. WELCOME10).");
      return;
    }
    if (!value || isNaN(Number(value)) || Number(value) <= 0) {
      Alert.alert("Invalid value", "Enter a valid discount number.");
      return;
    }
    if (newCouponType === "percent" && Number(value) > 100) {
      Alert.alert("Invalid %", "Percent discount cannot exceed 100.");
      return;
    }

    setSavingCoupon(true);
    try {
      const res = await api.post(`/api/chefs/admin/${chefId}/coupons`, {
        code,
        type: newCouponType,
        value,
        description: newCouponDescription.trim(),
        serviceType: newCouponServiceType,
      });

      if (res.data && res.data.success) {
        const updatedCoupons = Array.isArray(res.data.coupons) ? res.data.coupons : [];
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setChefs((prev) =>
          prev.map((c) =>
            (c._id || c.id) === chefId ? { ...c, coupons: updatedCoupons } : c
          )
        );
        setAddingCouponToChefId(null);
        resetCouponForm();
        Alert.alert("Success", "Coupon added successfully.");
      } else {
        throw new Error(res.data?.message || "Add failed");
      }
    } catch (err: any) {
      console.log("Add coupon error:", err?.response?.data || err?.message || err);
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Failed to add coupon."
      );
    } finally {
      setSavingCoupon(false);
    }
  };

  const handleDeleteCoupon = (chefId: string, couponId: string, couponCode: string) => {
    if (!couponId) {
      Alert.alert("Error", "This coupon cannot be deleted (missing ID).");
      return;
    }
    Alert.alert(
      "Delete Coupon",
      `Are you sure you want to delete coupon "${couponCode}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingCouponId(couponId);
            try {
              const res = await api.delete(
                `/api/chefs/admin/${chefId}/coupons/${couponId}`
              );
              if (res.data && res.data.success) {
                const updatedCoupons = Array.isArray(res.data.coupons)
                  ? res.data.coupons
                  : [];
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setChefs((prev) =>
                  prev.map((c) =>
                    (c._id || c.id) === chefId ? { ...c, coupons: updatedCoupons } : c
                  )
                );
              } else {
                throw new Error(res.data?.message || "Delete failed");
              }
            } catch (err: any) {
              console.log("Delete coupon error:", err?.response?.data || err?.message || err);
              Alert.alert(
                "Error",
                err?.response?.data?.message || "Failed to delete coupon."
              );
            } finally {
              setDeletingCouponId(null);
            }
          },
        },
      ]
    );
  };

  const renderChefCard = (chef: any) => {
    const chefId = chef._id || chef.id;
    const isBlocked = chef.userIsChef === false;
    const isOffline = chef.isAvailable === false;
    const isToggling = togglingChefId === chefId;
    const isDeleting = deletingChefId === chefId;

    const avatarUri =
      chef.avatar ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200";

    const coupons: any[] = Array.isArray(chef.coupons) ? chef.coupons : [];
    const couponsCount = coupons.length;
    const reviewsCount = Number(chef.totalReviews) || 0;
    const rating = Number(chef.averageRating || chef.rating || 0).toFixed(1);

    const orderCount = Number(chef.orderCount) || 0;
    const deliveredCount = Number(chef.deliveredCount) || 0;
    const totalEarned = Number(chef.totalEarned) || 0;

    const isCouponsExpanded = expandedCouponsChefId === chefId;
    const isAddingCoupon = addingCouponToChefId === chefId;

    return (
      <View
        key={chefId}
        style={[
          styles.chefCard,
          isBlocked && styles.chefCardBlocked,
        ]}
      >
        <View style={styles.chefCardTopRow}>
          <View style={styles.avatarWrapper}>
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            {isOffline && !isBlocked && <View style={styles.avatarOfflineDot} />}
          </View>

          <View style={styles.identityCol}>
            <View style={styles.nameRow}>
              <Text style={styles.chefNameText} numberOfLines={1}>
                {chef.name || "Chef"}
              </Text>
              {isBlocked ? (
                <View style={styles.blockedPill}>
                  <Ionicons name="ban" size={9} color="#DC2626" />
                  <Text style={styles.blockedPillText}>Blocked</Text>
                </View>
              ) : (
                <View style={styles.activePill}>
                  <Ionicons name="checkmark-circle" size={9} color="#2563EB" />
                  <Text style={styles.activePillText}>Active</Text>
                </View>
              )}
            </View>

            <Text style={styles.chefSpecialtyText} numberOfLines={1}>
              {chef.specialty || "Home Chef"}
            </Text>

            <View style={styles.metaInlineRow}>
              <Ionicons name="location-outline" size={10} color="#64748B" />
              <Text style={styles.metaInlineText} numberOfLines={1}>
                {chef.location || "Location not set"}
              </Text>
              <Text style={styles.metaDot}>•</Text>
              <Feather name="award" size={10} color="#64748B" />
              <Text style={styles.metaInlineText} numberOfLines={1}>
                {chef.exp ? `${chef.exp} yrs` : "— yrs"}
              </Text>
            </View>
          </View>

          <View style={styles.blockSwitchCol}>
            <Text
              style={[
                styles.blockSwitchLabel,
                isBlocked ? styles.blockSwitchLabelBlocked : styles.blockSwitchLabelActive,
              ]}
            >
              {isToggling ? "…" : isBlocked ? "Blocked" : "Active"}
            </Text>
            <Switch
              value={!isBlocked}
              disabled={isToggling || isDeleting}
              onValueChange={(val) => handleToggleBlock(chef, val)}
              trackColor={{
                false: "rgba(220, 38, 38, 0.35)",
                true: "rgba(37, 99, 235, 0.55)",
              }}
              thumbColor={isBlocked ? "#DC2626" : "#2563EB"}
              ios_backgroundColor="rgba(220, 38, 38, 0.25)"
              style={styles.blockSwitchStyle}
            />
          </View>
        </View>

        {/* ─── CONTACT DETAILS ─── */}
        <View style={styles.metaRowsContainer}>
          <View style={styles.metaRow}>
            <View style={styles.metaRowIconWrap}>
              <Feather name="phone" size={11} color="#2563EB" />
            </View>
            <Text style={styles.metaRowLabel}>PHONE</Text>
            <Text style={styles.metaRowValue} numberOfLines={1}>
              {chef.phone || chef.userPhone || "—"}
            </Text>
          </View>

          <View style={styles.metaRowDivider} />

          <View style={styles.metaRow}>
            <View style={styles.metaRowIconWrap}>
              <Feather name="mail" size={11} color="#2563EB" />
            </View>
            <Text style={styles.metaRowLabel}>EMAIL</Text>
            <Text style={styles.metaRowValue} numberOfLines={1}>
              {chef.userEmail || "—"}
            </Text>
          </View>

          <View style={styles.metaRowDivider} />

          {/* ✅ FSSAI: full number shown — no truncation, wraps if needed */}
          <View style={styles.metaRow}>
            <View style={styles.metaRowIconWrap}>
              <MaterialIcons name="verified-user" size={12} color="#2563EB" />
            </View>
            <Text style={styles.metaRowLabel}>FSSAI</Text>
            <Text style={styles.metaRowValueFssai} numberOfLines={2}>
              {chef.fssaiNo ? String(chef.fssaiNo) : "—"}
            </Text>
          </View>
        </View>

        {/* ─── STATS STRIP ─── */}
        <View style={styles.statsStripRow}>
          <View style={styles.statChip}>
            <Ionicons name="star" size={10} color="#F59E0B" />
            <Text style={styles.statChipText}>{rating}</Text>
          </View>

          <View style={styles.statChip}>
            <Ionicons name="chatbubble-outline" size={10} color="#2563EB" />
            <Text style={styles.statChipText}>
              {reviewsCount} review{reviewsCount === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={styles.statChip}>
            <Ionicons name="pricetag-outline" size={10} color="#2563EB" />
            <Text style={styles.statChipText}>
              {couponsCount} coupon{couponsCount === 1 ? "" : "s"}
            </Text>
          </View>

          <View
            style={[
              styles.statChip,
              isOffline ? styles.statChipOffline : styles.statChipOnline,
            ]}
          >
            <View
              style={[
                styles.statChipDot,
                { backgroundColor: isOffline ? "#DC2626" : "#16A34A" },
              ]}
            />
            <Text
              style={[
                styles.statChipText,
                { color: isOffline ? "#B91C1C" : "#15803D" },
              ]}
            >
              {isOffline ? "Closed" : "Open"}
            </Text>
          </View>
        </View>

        {/* ─── ORDERS SUMMARY STRIP ─── */}
        <TouchableOpacity
          style={styles.ordersSummaryRow}
          activeOpacity={0.85}
          onPress={() => openOrdersModal(chef)}
        >
          <View style={styles.ordersSummaryLeft}>
            <View style={styles.ordersSummaryIconCircle}>
              <MaterialCommunityIcons name="receipt" size={12} color="#16A34A" />
            </View>
            <View>
              <Text style={styles.ordersSummaryTitle}>
                {orderCount === 0
                  ? "No orders received yet"
                  : `${orderCount} order${orderCount === 1 ? "" : "s"} received`}
              </Text>
              {orderCount > 0 && (
                <Text style={styles.ordersSummarySubtitle}>
                  {deliveredCount} delivered
                </Text>
              )}
            </View>
          </View>

          <View style={styles.ordersSummaryRight}>
            {orderCount > 0 && (
              <View style={styles.earnedChip}>
                <Text style={styles.earnedChipText}>
                  ₹{totalEarned.toLocaleString("en-IN")}
                </Text>
              </View>
            )}
            <Feather name="chevron-right" size={14} color="#64748B" />
          </View>
        </TouchableOpacity>

        {/* ─── COUPONS MANAGEMENT SECTION ─── */}
        <TouchableOpacity
          style={styles.couponsToggleRow}
          activeOpacity={0.85}
          onPress={() => handleToggleCouponsSection(chefId)}
        >
          <View style={styles.couponsToggleLeft}>
            <View style={styles.couponsToggleIconWrap}>
              <Ionicons name="pricetag" size={12} color="#D97706" />
            </View>
            <Text style={styles.couponsToggleText}>
              Coupons ({couponsCount})
            </Text>
          </View>
          <Ionicons
            name={isCouponsExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#64748B"
          />
        </TouchableOpacity>

        {isCouponsExpanded && (
          <View style={styles.couponsExpandedContainer}>
            {coupons.length > 0 ? (
              <View style={styles.couponListContainer}>
                {coupons.map((coupon: any, idx: number) => {
                  const couponId = String(coupon._id || "");
                  const isDeletingCoupon = deletingCouponId === couponId;
                  const serviceLabel =
                    SERVICE_TYPE_LABEL[
                      (coupon.serviceType as CouponServiceType) || "catering"
                    ] || "Catering";
                  const valueLabel =
                    coupon.type === "percent"
                      ? `${coupon.value}% OFF`
                      : `₹${coupon.value} OFF`;

                  return (
                    <View key={couponId || `cp-${idx}`} style={styles.couponRow}>
                      <View style={styles.couponRowLeft}>
                        <View style={styles.couponCodeBadge}>
                          <Text style={styles.couponCodeBadgeText}>
                            {coupon.code}
                          </Text>
                        </View>
                        <Text style={styles.couponValueText}>{valueLabel}</Text>
                        <View style={styles.couponServiceChip}>
                          <Text style={styles.couponServiceChipText}>
                            {serviceLabel}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.couponDeleteBtn}
                        activeOpacity={0.85}
                        disabled={isDeletingCoupon}
                        onPress={() =>
                          handleDeleteCoupon(chefId, couponId, coupon.code)
                        }
                      >
                        {isDeletingCoupon ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <Feather name="trash-2" size={13} color="#DC2626" />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.couponsEmptyBox}>
                <Ionicons name="ticket-outline" size={20} color="#94A3B8" />
                <Text style={styles.couponsEmptyText}>
                  No coupons yet for this chef
                </Text>
              </View>
            )}

            {!isAddingCoupon ? (
              <TouchableOpacity
                style={styles.addCouponBtn}
                activeOpacity={0.85}
                onPress={() => handleOpenAddCouponForm(chefId)}
              >
                <Ionicons name="add" size={14} color="#FFFFFF" />
                <Text style={styles.addCouponBtnText}>Add Coupon</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.newCouponForm}>
                <Text style={styles.newCouponFormTitle}>New Coupon</Text>

                <Text style={styles.newCouponFieldLabel}>Coupon Code</Text>
                <TextInput
                  style={styles.newCouponInput}
                  value={newCouponCode}
                  onChangeText={setNewCouponCode}
                  placeholder="e.g. WELCOME10"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />

                <Text style={styles.newCouponFieldLabel}>Discount Type</Text>
                <View style={styles.newCouponTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.newCouponTypeBtn,
                      newCouponType === "percent" && styles.newCouponTypeBtnActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setNewCouponType("percent")}
                  >
                    <Text
                      style={[
                        styles.newCouponTypeText,
                        newCouponType === "percent" && styles.newCouponTypeTextActive,
                      ]}
                    >
                      % Off
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.newCouponTypeBtn,
                      newCouponType === "flat" && styles.newCouponTypeBtnActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setNewCouponType("flat")}
                  >
                    <Text
                      style={[
                        styles.newCouponTypeText,
                        newCouponType === "flat" && styles.newCouponTypeTextActive,
                      ]}
                    >
                      ₹ Flat
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.newCouponFieldLabel}>
                  {newCouponType === "percent" ? "Percent Value" : "Amount (₹)"}
                </Text>
                <TextInput
                  style={styles.newCouponInput}
                  value={newCouponValue}
                  onChangeText={(t) => setNewCouponValue(t.replace(/[^0-9]/g, ""))}
                  placeholder={newCouponType === "percent" ? "e.g. 10" : "e.g. 50"}
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />

                <Text style={styles.newCouponFieldLabel}>Service Type</Text>
                <View style={styles.newCouponServiceRow}>
                  {SERVICE_TYPE_OPTIONS.map((st) => {
                    const isSelected = newCouponServiceType === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.newCouponServiceBtn,
                          isSelected && styles.newCouponServiceBtnActive,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => setNewCouponServiceType(st)}
                      >
                        <Text
                          style={[
                            styles.newCouponServiceText,
                            isSelected && styles.newCouponServiceTextActive,
                          ]}
                        >
                          {SERVICE_TYPE_LABEL[st]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.newCouponFieldLabel}>
                  Description (optional)
                </Text>
                <TextInput
                  style={styles.newCouponInput}
                  value={newCouponDescription}
                  onChangeText={setNewCouponDescription}
                  placeholder="e.g. First order only"
                  placeholderTextColor="#94A3B8"
                />

                <View style={styles.newCouponActionsRow}>
                  <TouchableOpacity
                    style={styles.newCouponCancelBtn}
                    activeOpacity={0.85}
                    disabled={savingCoupon}
                    onPress={handleCancelAddCoupon}
                  >
                    <Text style={styles.newCouponCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.newCouponSaveBtn}
                    activeOpacity={0.9}
                    disabled={savingCoupon}
                    onPress={() => handleSaveNewCoupon(chefId)}
                  >
                    {savingCoupon ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                        <Text style={styles.newCouponSaveBtnText}>Save Coupon</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnEdit]}
            activeOpacity={0.85}
            disabled={isDeleting}
            onPress={() => openEditModal(chef)}
          >
            <Feather name="edit-2" size={12} color="#2563EB" />
            <Text style={styles.actionBtnEditText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDelete]}
            activeOpacity={0.85}
            disabled={isDeleting}
            onPress={() => handleDeleteChef(chef)}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <>
                <Feather name="trash-2" size={12} color="#DC2626" />
                <Text style={styles.actionBtnDeleteText}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      <LinearGradient colors={["#0F172A", "#1E293B", "#0F172A"]} style={styles.darkHeader}>
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerInner}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.headerBackBtn}
                activeOpacity={0.75}
                onPress={() => router.back()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="chevron-left" size={20} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.headerBrandCol}>
                <View style={styles.eyebrowRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.headerEyebrow}>ADMIN · CHEF MANAGEMENT</Text>
                </View>
                <Text style={styles.headerTitle}>All Chefs</Text>
                <Text style={styles.headerSubtitle}>
                  Manage <Text style={styles.headerSubtitleBold}>{stats.total}</Text> chef
                  {stats.total === 1 ? "" : "s"} on the platform
                </Text>
              </View>

              <TouchableOpacity
                style={styles.headerIconButton}
                activeOpacity={0.8}
                onPress={() => fetchAllChefs()}
              >
                <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.statsBanner}>
              <View style={styles.statsBannerItem}>
                <Text style={styles.statsBannerValue}>{stats.total}</Text>
                <Text style={styles.statsBannerLabel}>Total</Text>
              </View>
              <View style={styles.statsBannerDivider} />
              <View style={styles.statsBannerItem}>
                <Text style={[styles.statsBannerValue, { color: "#60A5FA" }]}>
                  {stats.active}
                </Text>
                <Text style={styles.statsBannerLabel}>Active</Text>
              </View>
              <View style={styles.statsBannerDivider} />
              <View style={styles.statsBannerItem}>
                <Text style={[styles.statsBannerValue, { color: "#F87171" }]}>
                  {stats.blocked}
                </Text>
                <Text style={styles.statsBannerLabel}>Blocked</Text>
              </View>
              <View style={styles.statsBannerDivider} />
              <View style={styles.statsBannerItem}>
                <Text style={[styles.statsBannerValue, { color: "#FBBF24" }]}>
                  {stats.offline}
                </Text>
                <Text style={styles.statsBannerLabel}>Offline</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.bodyCard}>
        {/* ─── SEARCH (full width) ─── */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={15} color="#2563EB" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search name, phone, email..."
              placeholderTextColor="#94A3B8"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={15} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.filterTabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterTabsScrollView}
            contentContainerStyle={styles.filterTabsScroll}
          >
            {FILTER_TABS.map((tab) => {
              const isActive = filterTab === tab;
              const countForTab =
                tab === "All"
                  ? stats.total
                  : tab === "Active"
                  ? stats.active
                  : tab === "Blocked"
                  ? stats.blocked
                  : stats.offline;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.filterTabPill, isActive && styles.filterTabPillActive]}
                  activeOpacity={0.85}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setFilterTab(tab);
                  }}
                >
                  <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                    {tab}
                  </Text>
                  <View style={[styles.filterTabBadge, isActive && styles.filterTabBadgeActive]}>
                    <Text style={[styles.filterTabBadgeText, isActive && styles.filterTabBadgeTextActive]}>
                      {countForTab}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Loading chefs...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 100 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#2563EB"
              />
            }
          >
            {filteredChefs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <MaterialCommunityIcons name="chef-hat" size={36} color="#2563EB" />
                </View>
                <Text style={styles.emptyTitle}>
                  {searchQuery.trim() || filterTab !== "All"
                    ? "No Matching Chefs"
                    : "No Chefs Yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery.trim() || filterTab !== "All"
                    ? "Try adjusting your search or filter."
                    : "Once chefs create their profiles, they will appear here."}
                </Text>
              </View>
            ) : (
              filteredChefs.map(renderChefCard)
            )}
          </ScrollView>
        )}
      </View>

      {/* ─── EDIT CHEF MODAL ─── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalRoot}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

          <Pressable style={styles.modalBackdrop} onPress={closeEditModal} />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboardWrap}
          >
            <View style={styles.editModalSheet}>
              <View style={styles.editModalHandle} />

              <View style={styles.editModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editModalTitle}>Edit Chef Profile</Text>
                  <Text style={styles.editModalSubtitle} numberOfLines={1}>
                    {editingChef?.name || ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editModalCloseBtn}
                  onPress={closeEditModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.editFormScroll}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.fieldLabel}>Chef Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Chef name"
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.fieldLabel}>Experience (years)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editExp}
                  onChangeText={setEditExp}
                  placeholder="e.g. 12"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />

                <Text style={styles.fieldLabel}>Phone Number</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editPhone}
                  onChangeText={(t) => setEditPhone(t.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit phone"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={10}
                />

                <Text style={styles.fieldLabel}>Aadhar Number</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editAadhar}
                  onChangeText={(t) => setEditAadhar(t.replace(/\D/g, "").slice(0, 12))}
                  placeholder="12-digit Aadhar"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={12}
                />

                <Text style={styles.fieldLabel}>Location</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="e.g. Miyapur, Hyderabad"
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.fieldLabel}>Specialty</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editSpecialty}
                  onChangeText={setEditSpecialty}
                  placeholder="e.g. Andhra Meals • Biryani"
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.fieldLabel}>Starting Price (₹)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editPrice}
                  onChangeText={setEditPrice}
                  placeholder="e.g. 450"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />

                <Text style={styles.fieldLabel}>FSSAI Number</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editFssaiNo}
                  onChangeText={setEditFssaiNo}
                  placeholder="e.g. 12345678901234"
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.fieldLabel}>Food Type</Text>
                <View style={styles.foodTypeRow}>
                  {(["VEG", "NONVEG", "BOTH"] as const).map((ft) => {
                    const isSelected = editFoodType === ft;
                    return (
                      <TouchableOpacity
                        key={ft}
                        style={[
                          styles.foodTypeBtn,
                          isSelected && styles.foodTypeBtnSelected,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => setEditFoodType(ft)}
                      >
                        <Text
                          style={[
                            styles.foodTypeBtnText,
                            isSelected && styles.foodTypeBtnTextSelected,
                          ]}
                        >
                          {ft}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.availabilityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Kitchen Availability</Text>
                    <Text style={styles.availabilityHint}>
                      {editIsAvailable
                        ? "Chef is currently OPEN for orders"
                        : "Chef is currently CLOSED for orders"}
                    </Text>
                  </View>
                  <Switch
                    value={editIsAvailable}
                    onValueChange={setEditIsAvailable}
                    trackColor={{
                      false: "rgba(220, 38, 38, 0.35)",
                      true: "rgba(37, 99, 235, 0.55)",
                    }}
                    thumbColor={editIsAvailable ? "#2563EB" : "#DC2626"}
                  />
                </View>
              </ScrollView>

              <View style={styles.editFooterRow}>
                <TouchableOpacity
                  style={styles.editCancelBtn}
                  activeOpacity={0.85}
                  onPress={closeEditModal}
                  disabled={savingEdit}
                >
                  <Text style={styles.editCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.editSaveBtn}
                  activeOpacity={0.9}
                  onPress={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
                      <Text style={styles.editSaveBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ─── ORDER HISTORY MODAL ─── */}
      <Modal
        visible={showOrdersModal}
        transparent
        animationType="fade"
        onRequestClose={closeOrdersModal}
      >
        <View style={styles.modalRoot}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

          <Pressable style={styles.modalBackdrop} onPress={closeOrdersModal} />

          <View style={styles.ordersModalSheet}>
            <View style={styles.editModalHandle} />

            <View style={styles.ordersModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ordersModalTitle}>Order History</Text>
                <Text style={styles.ordersModalSubtitle} numberOfLines={1}>
                  {ordersChef?.name || ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.editModalCloseBtn}
                onPress={closeOrdersModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.ordersModalSummary}>
              <View style={styles.ordersModalSummaryCell}>
                <Text style={styles.ordersModalSummaryLabel}>RECEIVED</Text>
                <Text style={styles.ordersModalSummaryValue}>
                  {Number(ordersChef?.orderCount) || 0}
                </Text>
              </View>
              <View style={styles.ordersModalSummarySep} />
              <View style={styles.ordersModalSummaryCell}>
                <Text style={styles.ordersModalSummaryLabel}>DELIVERED</Text>
                <Text
                  style={[
                    styles.ordersModalSummaryValue,
                    { color: "#22C55E" },
                  ]}
                >
                  {Number(ordersChef?.deliveredCount) || 0}
                </Text>
              </View>
              <View style={styles.ordersModalSummarySep} />
              <View style={styles.ordersModalSummaryCell}>
                <Text style={styles.ordersModalSummaryLabel}>EARNED</Text>
                <Text
                  style={[
                    styles.ordersModalSummaryValue,
                    { color: "#16A34A", fontSize: 18 },
                  ]}
                >
                  ₹{(Number(ordersChef?.totalEarned) || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.ordersModalScroll}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {!ordersChef?.receivedOrders || ordersChef.receivedOrders.length === 0 ? (
                <View style={styles.ordersModalEmpty}>
                  <View style={styles.ordersModalEmptyIconCircle}>
                    <MaterialCommunityIcons
                      name="receipt"
                      size={28}
                      color="#2563EB"
                    />
                  </View>
                  <Text style={styles.ordersModalEmptyTitle}>
                    No orders received yet
                  </Text>
                  <Text style={styles.ordersModalEmptyText}>
                    Once customers place orders to this chef, they will appear here.
                  </Text>
                </View>
              ) : (
                ordersChef.receivedOrders.map((o: any, idx: number) => {
                  const tone = orderStatusTone(o.orderStatus);
                  const svcKey = String(o.serviceType || "").toLowerCase();
                  const svcLabel =
                    ORDER_SERVICE_LABEL[svcKey] || o.serviceType || "—";
                  const svcIcon =
                    ORDER_SERVICE_ICON[svcKey] || "silverware-fork-knife";

                  return (
                    <View key={o._id || `order-${idx}`} style={styles.orderCard}>
                      <View style={styles.orderCardTopRow}>
                        <View style={styles.orderIdBadge}>
                          <MaterialCommunityIcons
                            name="receipt"
                            size={11}
                            color="#16A34A"
                          />
                          <Text
                            style={styles.orderIdBadgeText}
                            numberOfLines={1}
                          >
                            #{o.orderId || "——"}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.orderStatusPill,
                            { backgroundColor: tone.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.orderStatusPillText,
                              { color: tone.fg },
                            ]}
                            numberOfLines={1}
                          >
                            {tone.label}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.orderCardMiddleRow}>
                        <View style={styles.orderServiceChip}>
                          <MaterialCommunityIcons
                            name={svcIcon}
                            size={11}
                            color="#475569"
                          />
                          <Text style={styles.orderServiceChipText}>
                            {svcLabel}
                          </Text>
                        </View>

                        <View style={styles.orderDateRow}>
                          <Feather name="calendar" size={10} color="#64748B" />
                          <Text style={styles.orderDateText}>
                            {formatOrderDate(o.createdAt)}
                          </Text>
                        </View>
                      </View>

                      {(o.userName || o.userPhone) && (
                        <View style={styles.orderCustomerRow}>
                          <Ionicons
                            name="person-outline"
                            size={11}
                            color="#64748B"
                          />
                          <Text
                            style={styles.orderCustomerText}
                            numberOfLines={1}
                          >
                            {o.userName || "Customer"}
                            {o.userPhone ? ` • ${o.userPhone}` : ""}
                          </Text>
                        </View>
                      )}

                      <View style={styles.orderCardBottomRow}>
                        <Text style={styles.orderAmountLabel}>
                          Order Value
                        </Text>
                        <Text style={styles.orderAmountText}>
                          ₹{(Number(o.totalAmount) || 0).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.ordersModalDoneBtn}
              activeOpacity={0.9}
              onPress={closeOrdersModal}
            >
              <Text style={styles.ordersModalDoneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F172A",
  },

  darkHeader: { paddingBottom: 12 },
  headerInner: { paddingHorizontal: 16, paddingTop: 4 },

  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginRight: 10,
  },
  headerBrandCol: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3B82F6",
    marginRight: 5,
  },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: "#93C5FD",
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  headerSubtitleBold: { color: "#60A5FA", fontWeight: "800" },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginLeft: 8,
  },

  statsBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 8,
  },
  statsBannerItem: { flex: 1, alignItems: "center" },
  statsBannerValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  statsBannerLabel: {
    fontSize: 9.5,
    color: "#94A3B8",
    fontWeight: "700",
    marginTop: 1,
    letterSpacing: 0.3,
  },
  statsBannerDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  bodyCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },

  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 11,
    height: 40,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 7,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F172A",
    paddingVertical: 0,
  },

  filterTabsWrapper: {
    height: 42,
    justifyContent: "center",
  },
  filterTabsScrollView: {
    flexGrow: 0,
  },
  filterTabsScroll: {
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 6,
  },
  filterTabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    height: 32,
  },
  filterTabPillActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterTabText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
    lineHeight: 14,
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },
  filterTabBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 5,
    borderRadius: 6,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterTabBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  filterTabBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#475569",
    lineHeight: 11,
  },
  filterTabBadgeTextActive: {
    color: "#FFFFFF",
  },

  listScroll: { flex: 1 },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#475569",
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 5,
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 17,
  },

  chefCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  chefCardBlocked: {
    borderColor: "#FECACA",
    backgroundColor: "#FFF5F5",
  },

  chefCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#DBEAFE",
    position: "relative",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 23,
    resizeMode: "cover",
  },
  avatarOfflineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#DC2626",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  identityCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  chefNameText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  blockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  blockedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#DC2626",
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#2563EB",
  },

  chefSpecialtyText: {
    fontSize: 11.5,
    color: "#475569",
    fontWeight: "600",
    marginTop: 2,
  },
  metaInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
    flexShrink: 1,
  },
  metaInlineText: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "600",
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 10,
    color: "#94A3B8",
    marginHorizontal: 1,
  },

  blockSwitchCol: {
    alignItems: "center",
    gap: 2,
    minWidth: 56,
  },
  blockSwitchLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  blockSwitchLabelActive: { color: "#2563EB" },
  blockSwitchLabelBlocked: { color: "#DC2626" },
  blockSwitchStyle: {
    transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }],
    marginVertical: -4,
  },

  metaRowsContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    marginTop: 10,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaRowIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  metaRowLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
    width: 44,
  },
  metaRowValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.1,
  },
  /* ✅ NEW: Dedicated FSSAI value style — no truncation, slightly smaller,
     wraps to 2 lines only if the number is longer than the row width. */
  metaRowValueFssai: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  metaRowDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 10,
  },

  statsStripRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 8,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: "#F1F5F9",
  },
  statChipOnline: {
    backgroundColor: "#DCFCE7",
  },
  statChipOffline: {
    backgroundColor: "#FEE2E2",
  },
  statChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
  },
  statChipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  ordersSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  ordersSummaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 6,
  },
  ordersSummaryIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  ordersSummaryTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#14532D",
    letterSpacing: -0.1,
  },
  ordersSummarySubtitle: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#16A34A",
    marginTop: 1,
  },
  ordersSummaryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  earnedChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  earnedChipText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#14532D",
    letterSpacing: -0.1,
  },

  couponsToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  couponsToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  couponsToggleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  couponsToggleText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
  },

  couponsExpandedContainer: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  couponListContainer: {
    gap: 6,
  },
  couponRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  couponRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  couponCodeBadge: {
    backgroundColor: "#166534",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  couponCodeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  couponValueText: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#0F172A",
  },
  couponServiceChip: {
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  couponServiceChipText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#166534",
  },
  couponDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginLeft: 6,
  },

  couponsEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 6,
  },
  couponsEmptyText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#94A3B8",
  },

  addCouponBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#166534",
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  addCouponBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  newCouponForm: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  newCouponFormTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
  },
  newCouponFieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 4,
    marginTop: 2,
  },
  newCouponInput: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  newCouponTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  newCouponTypeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  newCouponTypeBtnActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  newCouponTypeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  newCouponTypeTextActive: {
    color: "#FFFFFF",
  },
  newCouponServiceRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  newCouponServiceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  newCouponServiceBtnActive: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  newCouponServiceText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  newCouponServiceTextActive: {
    color: "#FFFFFF",
  },
  newCouponActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  newCouponCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  newCouponCancelBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#475569",
  },
  newCouponSaveBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#166534",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  newCouponSaveBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnEdit: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  actionBtnEditText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2563EB",
  },
  actionBtnDelete: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  actionBtnDeleteText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#DC2626",
  },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalKeyboardWrap: {
    width: "100%",
  },
  editModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 25,
  },
  editModalHandle: {
    width: 38,
    height: 4,
    backgroundColor: "#CBD5E1",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 12,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  editModalSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 1,
  },
  editModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  editFormScroll: {
    maxHeight: 480,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 5,
    marginTop: 2,
    marginLeft: 2,
  },
  fieldInput: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 11,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    fontSize: 13.5,
    color: "#0F172A",
    fontWeight: "600",
  },

  foodTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  foodTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  foodTypeBtnSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  foodTypeBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  foodTypeBtnTextSelected: {
    color: "#FFFFFF",
  },

  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 6,
  },
  availabilityHint: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },

  editFooterRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  editCancelBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#475569",
  },
  editSaveBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  editSaveBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  ordersModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 25,
  },
  ordersModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  ordersModalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  ordersModalSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 1,
  },
  ordersModalSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginBottom: 12,
  },
  ordersModalSummaryCell: {
    flex: 1,
    alignItems: "center",
  },
  ordersModalSummaryLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#14532D",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  ordersModalSummaryValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  ordersModalSummarySep: {
    width: 1,
    height: 34,
    backgroundColor: "#86EFAC",
    marginHorizontal: 8,
  },
  ordersModalScroll: {
    maxHeight: 380,
  },
  ordersModalEmpty: {
    alignItems: "center",
    paddingVertical: 34,
    gap: 8,
  },
  ordersModalEmptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  ordersModalEmptyTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  ordersModalEmptyText: {
    color: "#64748B",
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 16,
  },

  orderCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  orderCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  orderIdBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    flexShrink: 1,
  },
  orderIdBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#14532D",
    letterSpacing: 0.2,
  },
  orderStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    marginLeft: 6,
  },
  orderStatusPillText: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  orderCardMiddleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  orderServiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  orderServiceChipText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#334155",
  },
  orderDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  orderDateText: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "600",
  },
  orderCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  orderCustomerText: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "600",
    flexShrink: 1,
  },
  orderCardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  orderAmountLabel: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  orderAmountText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },

  ordersModalDoneBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#166534",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  ordersModalDoneBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});