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
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Android LayoutAnimation enable (same pattern as the rest of the app)
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AdminFilterTab = "All" | "Active" | "Blocked" | "Offline";

const FILTER_TABS: AdminFilterTab[] = ["All", "Active", "Blocked", "Offline"];

// ─── Small helper: safe initials for avatar fallback ───
const getInitials = (name: string): string => {
  const clean = (name || "").trim();
  if (!clean) return "C";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ─── Small helper: mask a long FSSAI number for compact display ───
const formatFssai = (value: any): string => {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (s.length <= 8) return s;
  return `${s.substring(0, 4)}…${s.substring(s.length - 4)}`;
};

export default function AdminAllChefsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ─── Data state ───
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [chefs, setChefs] = useState<any[]>([]);
  const [filterTab, setFilterTab] = useState<AdminFilterTab>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ─── Per-chef action loading (block toggle in-flight) ───
  const [togglingChefId, setTogglingChefId] = useState<string | null>(null);

  // ─── Edit modal state ───
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingChef, setEditingChef] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // ─── Edit form fields ───
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

  // ─── Delete in-flight guard ───
  const [deletingChefId, setDeletingChefId] = useState<string | null>(null);

  // ─── Avoid overlapping fetches on rapid focus ───
  const isFetchingRef = useRef<boolean>(false);

  // ============================================================
  // FETCH: ALL CHEFS (ADMIN VIEW)
  // ============================================================
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

  // ─── Initial load + focus reload ───
  useFocusEffect(
    useCallback(() => {
      fetchAllChefs(true);
    }, [])
  );

  useEffect(() => {
    fetchAllChefs();
  }, []);

  // ─── Pull-to-refresh ───
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllChefs(true);
  }, []);

  // ============================================================
  // FILTERS + SEARCH
  // ============================================================
  const filteredChefs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return chefs.filter((chef) => {
      // 1. Tab filter
      const isBlocked = chef.userIsChef === false;
      const isOffline = chef.isAvailable === false;

      if (filterTab === "Active" && isBlocked) return false;
      if (filterTab === "Blocked" && !isBlocked) return false;
      if (filterTab === "Offline" && !isOffline) return false;

      // 2. Search filter
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

  // ============================================================
  // BLOCK / UNBLOCK TOGGLE
  // ============================================================
  const handleToggleBlock = async (chef: any, nextValue: boolean) => {
    const chefId = chef?._id || chef?.id;
    if (!chefId) return;

    if (togglingChefId === chefId) return;

    // Optimistic UI update
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
        // Reconcile with server response
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

      // Roll back on failure
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

  // ============================================================
  // EDIT MODAL
  // ============================================================
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

  // ============================================================
  // DELETE CHEF
  // ============================================================
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

  // ============================================================
  // ADD NEW CHEF
  // ============================================================
  const handleAddNewChef = () => {
    router.push("/chefManagement/add-chefs");
  };

  // ============================================================
  // RENDER: CHEF CARD
  // ============================================================
  const renderChefCard = (chef: any) => {
    const chefId = chef._id || chef.id;
    const isBlocked = chef.userIsChef === false;
    const isOffline = chef.isAvailable === false;
    const isToggling = togglingChefId === chefId;
    const isDeleting = deletingChefId === chefId;

    const avatarUri =
      chef.avatar ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200";

    const couponsCount = Array.isArray(chef.coupons) ? chef.coupons.length : 0;
    const reviewsCount = Number(chef.totalReviews) || 0;
    const rating = Number(chef.averageRating || chef.rating || 0).toFixed(1);

    return (
      <View
        key={chefId}
        style={[
          styles.chefCard,
          isBlocked && styles.chefCardBlocked,
        ]}
      >
        {/* ─── TOP ROW: Avatar + Name + Block Switch ─── */}
        <View style={styles.chefCardTopRow}>
          <View style={styles.avatarWrapper}>
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            {isOffline && !isBlocked && <View style={styles.avatarOfflineDot} />}
          </View>

          <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
            <View style={styles.nameRow}>
              <Text style={styles.chefNameText} numberOfLines={1}>
                {chef.name || "Chef"}
              </Text>
              {isBlocked ? (
                <View style={styles.blockedPill}>
                  <Ionicons name="ban" size={10} color="#DC2626" />
                  <Text style={styles.blockedPillText}>Blocked</Text>
                </View>
              ) : (
                <View style={styles.activePill}>
                  <Ionicons name="checkmark-circle" size={10} color="#2563EB" />
                  <Text style={styles.activePillText}>Active</Text>
                </View>
              )}
            </View>

            <Text style={styles.chefSpecialtyText} numberOfLines={1}>
              {chef.specialty || "Home Chef"}
            </Text>

            <View style={styles.metaInlineRow}>
              <Ionicons name="location-outline" size={11} color="#64748B" />
              <Text style={styles.metaInlineText} numberOfLines={1}>
                {chef.location || "Location not set"}
              </Text>
              <Text style={styles.metaDot}>•</Text>
              <Feather name="award" size={11} color="#64748B" />
              <Text style={styles.metaInlineText} numberOfLines={1}>
                {chef.exp ? `${chef.exp} yrs` : "— yrs"}
              </Text>
            </View>
          </View>

          {/* ─── BLOCK / UNBLOCK SWITCH ─── */}
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

        {/* ─── META GRID ─── */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Feather name="phone" size={12} color="#2563EB" />
            <Text style={styles.metaCellLabel}>Phone</Text>
            <Text style={styles.metaCellValue} numberOfLines={1}>
              {chef.phone || chef.userPhone || "—"}
            </Text>
          </View>

          <View style={styles.metaDivider} />

          <View style={styles.metaCell}>
            <Feather name="mail" size={12} color="#2563EB" />
            <Text style={styles.metaCellLabel}>Email</Text>
            <Text style={styles.metaCellValue} numberOfLines={1}>
              {chef.userEmail || "—"}
            </Text>
          </View>

          <View style={styles.metaDivider} />

          <View style={styles.metaCell}>
            <MaterialIcons name="verified-user" size={13} color="#2563EB" />
            <Text style={styles.metaCellLabel}>FSSAI</Text>
            <Text style={styles.metaCellValue} numberOfLines={1}>
              {chef.fssaiNo ? formatFssai(chef.fssaiNo) : "—"}
            </Text>
          </View>
        </View>

        {/* ─── STATS STRIP ─── */}
        <View style={styles.statsStripRow}>
          <View style={styles.statChip}>
            <Ionicons name="star" size={11} color="#F59E0B" />
            <Text style={styles.statChipText}>{rating}</Text>
          </View>

          <View style={styles.statChip}>
            <Ionicons name="chatbubble-outline" size={11} color="#2563EB" />
            <Text style={styles.statChipText}>
              {reviewsCount} review{reviewsCount === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={styles.statChip}>
            <Ionicons name="pricetag-outline" size={11} color="#2563EB" />
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

        {/* ─── ACTIONS ROW ─── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnEdit]}
            activeOpacity={0.85}
            disabled={isDeleting}
            onPress={() => openEditModal(chef)}
          >
            <Feather name="edit-2" size={13} color="#2563EB" />
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
                <Feather name="trash-2" size={13} color="#DC2626" />
                <Text style={styles.actionBtnDeleteText}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* ─── ADMIN HEADER ─── */}
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
                <Feather name="chevron-left" size={22} color="#FFFFFF" />
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
                <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* ─── STATS STRIP ─── */}
            <View style={styles.statsBanner}>
              <View style={styles.statsBannerItem}>
                <Text style={styles.statsBannerValue}>{stats.total}</Text>
                <Text style={styles.statsBannerLabel}>Total</Text>
              </View>
              <View style={styles.statsBannerDivider} />
              <View style={styles.statsBannerItem}>
                <Text style={styles.statsBannerValue}>{stats.active}</Text>
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

      {/* ─── BODY ─── */}
      <View style={styles.bodyCard}>
        {/* ─── SEARCH ─── */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#2563EB" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, phone, email, FSSAI..."
              placeholderTextColor="#94A3B8"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.addChefBtn}
            activeOpacity={0.85}
            onPress={handleAddNewChef}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addChefBtnText}>Add Chef</Text>
          </TouchableOpacity>
        </View>

        {/* ─── FILTER TABS ─── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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

        {/* ─── LIST ─── */}
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
                  <MaterialCommunityIcons name="chef-hat" size={40} color="#2563EB" />
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
                      <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                      <Text style={styles.editSaveBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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

  /* ─── DARK HEADER ─── */
  darkHeader: { paddingBottom: 16 },
  headerInner: { paddingHorizontal: 18, paddingTop: 6 },

  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginRight: 10,
    marginTop: 4,
  },
  headerBrandCol: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#3B82F6",
    marginRight: 6,
  },
  headerEyebrow: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#93C5FD",
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  headerSubtitleBold: { color: "#60A5FA", fontWeight: "800" },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginLeft: 10,
    marginTop: 4,
  },

  statsBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 10,
  },
  statsBannerItem: { flex: 1, alignItems: "center" },
  statsBannerValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  statsBannerLabel: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.4,
  },
  statsBannerDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  /* ─── BODY ─── */
  bodyCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },

  /* ─── SEARCH + ADD ─── */
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    paddingVertical: 0,
  },
  addChefBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addChefBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  /* ─── FILTER TABS ─── */
  filterTabsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 7,
  },
  filterTabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterTabPillActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },
  filterTabBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 20,
    alignItems: "center",
  },
  filterTabBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  filterTabBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
  },
  filterTabBadgeTextActive: {
    color: "#FFFFFF",
  },

  /* ─── LIST ─── */
  listScroll: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: "#64748B",
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 18,
  },

  /* ─── CHEF CARD ─── */
  chefCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#DBEAFE",
    position: "relative",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
    resizeMode: "cover",
  },
  avatarOfflineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#DC2626",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chefNameText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  blockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  blockedPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#DC2626",
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePillText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#2563EB",
  },

  chefSpecialtyText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    marginTop: 3,
  },
  metaInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    flexShrink: 1,
  },
  metaInlineText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 10,
    color: "#94A3B8",
    marginHorizontal: 2,
  },

  blockSwitchCol: {
    alignItems: "center",
    gap: 3,
  },
  blockSwitchLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  blockSwitchLabelActive: { color: "#2563EB" },
  blockSwitchLabelBlocked: { color: "#DC2626" },
  blockSwitchStyle: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },

  /* ─── META GRID ─── */
  metaGrid: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaCell: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 3,
  },
  metaCellLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  metaCellValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 1,
  },
  metaDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#E2E8F0",
  },

  /* ─── STATS STRIP ─── */
  statsStripRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  statChipOnline: {
    backgroundColor: "#DCFCE7",
  },
  statChipOffline: {
    backgroundColor: "#FEE2E2",
  },
  statChipText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#334155",
  },
  statChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  /* ─── ACTIONS ─── */
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnEdit: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  actionBtnEditText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#2563EB",
  },
  actionBtnDelete: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  actionBtnDeleteText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#DC2626",
  },

  /* ─── EDIT MODAL ─── */
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 25,
  },
  editModalHandle: {
    width: 40,
    height: 4.5,
    backgroundColor: "#CBD5E1",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 14,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  editModalSubtitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  editModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  editFormScroll: {
    maxHeight: 480,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 6,
    marginTop: 4,
    marginLeft: 2,
  },
  fieldInput: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },

  foodTypeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  foodTypeBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
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
    fontSize: 12.5,
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 6,
  },
  availabilityHint: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },

  editFooterRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  editCancelBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
  },
  editSaveBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  editSaveBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});