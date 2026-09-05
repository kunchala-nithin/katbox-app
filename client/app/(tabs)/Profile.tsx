import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import {
  getToken,
  getUser,
  refreshUser,
  removeToken,
  saveSession,
  StoredUser,
} from "@/src/lib/authStorage";
import { notifyAuthChanged } from "@/src/lib/authEvents";
import { socket } from "@/src/lib/socket";
import { BASE_URL } from "@/src/lib/api";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // User State
  const [user, setUser] = useState<StoredUser | null>(null);

  // Orders Summary State
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [completedOrders, setCompletedOrders] = useState<number>(0);
  const [latestOrder, setLatestOrder] = useState<any | null>(null);

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>("");
  const [editAddress, setEditAddress] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  const fetchProfileData = async () => {
    try {
      // 1. Get cached user first for immediate display
      const cachedUser = await getUser();
      if (cachedUser) {
        setUser(cachedUser);
      }

      // 2. Refresh user profile from server
      const updatedUser = await refreshUser();
      if (updatedUser) {
        setUser(updatedUser);
      }

      // 3. Fetch latest active order & stats from MongoDB
      const token = await getToken();
      if (token) {
        let targetUrl = `${BASE_URL}/orders/my-orders`;
        if (!BASE_URL.endsWith("/api") && !BASE_URL.includes("/api/")) {
          targetUrl = `${BASE_URL}/api/orders/my-orders`;
        }

        let res = await fetch(targetUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const alternateUrl = `${BASE_URL}/orders/my-orders`;
          res = await fetch(alternateUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
        }

        if (res.ok) {
          const textData = await res.text();
          let data: any = {};
          try {
            data = JSON.parse(textData);
          } catch (e) {
            data = {};
          }

          const orders = data.orders || [];

          setTotalOrders(orders.length);

          const completed = orders.filter((o: any) =>
            ["Completed", "Delivered"].includes(o.orderStatus)
          ).length;
          setCompletedOrders(completed);

          if (orders.length > 0) {
            const activeOrder =
              orders.find((o: any) =>
                ["Placed", "Confirmed", "Active", "Paused", "Processing", "In Progress"].includes(
                  o.orderStatus
                )
              ) || orders[0];

            setLatestOrder(activeOrder);
          } else {
            setLatestOrder(null);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching profile data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  // 🔥 Complete Logout Handler & Navigation to Login
  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              // 1. Remove stored auth credentials
              await removeToken();

              // 2. Disconnect web socket connection
              if (socket && typeof socket.disconnect === "function") {
                socket.disconnect();
              }

              // 3. Notify app auth state listeners
              notifyAuthChanged();

              // 4. Reset navigation stack and navigate directly to Login screen
              router.replace("/login" as any);
            } catch (err) {
              console.error("Logout error:", err);
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Helper formatting routines
  const getUserName = () => {
    if (user?.name && user.name.trim().length > 0) return user.name;
    if (latestOrder?.userName && latestOrder.userName.trim().length > 0)
      return latestOrder.userName;
    return "User";
  };

  const getFirstLetter = () => {
    const name = getUserName();
    return name ? name.trim().charAt(0).toUpperCase() : "U";
  };

  const getPhone = () => {
    if (user?.phone) return user.phone;
    return "Not Provided";
  };

  const getEmail = () => {
    if ((user as any)?.email) return (user as any).email;
    return "No email registered";
  };

  const getAddressText = () => {
    if ((user as any)?.address && (user as any).address.trim().length > 0) {
      return (user as any).address;
    }
    if (latestOrder?.addressDetails && latestOrder.addressDetails.trim().length > 0) {
      return latestOrder.addressDetails;
    }
    return "Manage your saved addresses";
  };

  const getNextDeliveryText = () => {
    if (!latestOrder) return "No active orders";

    if (
      latestOrder.upcomingDeliveries &&
      Array.isArray(latestOrder.upcomingDeliveries) &&
      latestOrder.upcomingDeliveries.length > 0
    ) {
      return latestOrder.upcomingDeliveries[0];
    }

    if (latestOrder.deliveryDate && latestOrder.deliveryDate.trim().length > 0) {
      return latestOrder.deliveryDate;
    }

    return "Scheduled";
  };

  // Open Edit Modal
  const openEditModal = () => {
    setEditName(getUserName());
    setEditAddress(getAddressText() === "Manage your saved addresses" ? "" : getAddressText());
    setEditModalVisible(true);
  };

  // Save Name & Address to MongoDB Safely
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Name cannot be empty");
      return;
    }

    try {
      setSavingProfile(true);
      const token = await getToken();

      if (!token) {
        Alert.alert("Error", "Session expired. Please log in again.");
        return;
      }

      let primaryUrl = `${BASE_URL}/auth/update-profile`;
      if (!BASE_URL.endsWith("/api") && !BASE_URL.includes("/api/")) {
        primaryUrl = `${BASE_URL}/api/auth/update-profile`;
      }

      let response = await fetch(primaryUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          address: editAddress.trim(),
        }),
      });

      // Retry with alternate route if primary URL returns a 404
      if (response.status === 404) {
        const secondaryUrl = `${BASE_URL}/auth/update-profile`;
        response = await fetch(secondaryUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: editName.trim(),
            address: editAddress.trim(),
          }),
        });
      }

      const responseText = await response.text();
      let data: any = {};

      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.log("Server responded with non-JSON content:", responseText);
        Alert.alert("Error", `Server route error (${response.status}). Please verify server backend routes.`);
        return;
      }

      if (response.ok && data.success) {
        const updatedUserObj = data.user || {
          ...user,
          name: editName.trim(),
          address: editAddress.trim(),
        };
        setUser(updatedUserObj);
        await saveSession(token, updatedUserObj);

        setEditModalVisible(false);
        Alert.alert("Success", "Profile updated successfully!");
      } else {
        Alert.alert("Error", data.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Something went wrong while updating profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={22} color="#0F172A" />
            <View style={styles.unreadDotBadge} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2D4A22"]} />
        }
      >
        {/* Profile Card Container */}
        <View style={styles.profileCardWrapper}>
          <View style={styles.profileGreenHeader}>
            <View style={styles.avatarWrapper}>
              <View style={styles.letterAvatarContainer}>
                <Text style={styles.letterAvatarText}>{getFirstLetter()}</Text>
              </View>
              <TouchableOpacity
                style={styles.editAvatarBtn}
                activeOpacity={0.8}
                onPress={openEditModal}
              >
                <Ionicons name="pencil" size={12} color="#2D4A22" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileDetailsCol}>
              <Text style={styles.profileNameText}>{getUserName()}</Text>
              <Text style={styles.profileContactText}>{getPhone()}</Text>
              <Text style={styles.profileContactText}>{getEmail()}</Text>
            </View>

            <TouchableOpacity style={styles.headerEditPill} onPress={openEditModal}>
              <Feather name="edit-3" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Profile Quick Stats Bar */}
          <View style={styles.statsBarContainer}>
            <View style={styles.statItemCol}>
              <View style={[styles.statIconBox, { backgroundColor: "#F0FDF4" }]}>
                <Feather name="shopping-bag" size={18} color="#16A34A" />
              </View>
              <Text style={styles.statNumberText}>{totalOrders}</Text>
              <Text style={styles.statLabelText}>Orders</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItemCol}>
              <View style={[styles.statIconBox, { backgroundColor: "#F0FDF4" }]}>
                <Ionicons name="calendar-outline" size={18} color="#16A34A" />
              </View>
              <Text style={styles.statNumberText}>{completedOrders}</Text>
              <Text style={styles.statLabelText}>Completed</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItemCol}>
              <View style={[styles.statIconBox, { backgroundColor: "#FEFCE8" }]}>
                <Ionicons name="star-outline" size={18} color="#EAB308" />
              </View>
              <Text style={styles.statNumberText}>4.8</Text>
              <Text style={styles.statLabelText}>Rating</Text>
            </View>
          </View>
        </View>

        {/* Active Plan Callout Card */}
        <View style={styles.activePlanCard}>
          <View style={styles.activePlanIconBadge}>
            <Ionicons name="ribbon-outline" size={18} color="#EAB308" />
            <Text style={styles.activePlanTagText}>Active</Text>
            <Text style={styles.activePlanTagText}>Plan</Text>
          </View>

          <View style={styles.activePlanInfoCol}>
            <Text style={styles.activePlanTitle}>
              {latestOrder?.menuName ? latestOrder.menuName : "No Active Plan"}
            </Text>
            <Text style={styles.activePlanSubtext}>
              {latestOrder
                ? `${latestOrder.durationType || "Standard Meal Plan"}${
                    latestOrder.deliveryTimeSlot ? `  •  ${latestOrder.deliveryTimeSlot}` : ""
                  }`
                : "No active subscription plan"}
            </Text>
            <Text style={styles.activePlanNextDateText}>
              Next delivery:{" "}
              <Text style={{ fontWeight: "700" }}>{getNextDeliveryText()}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.viewPlanBtn}
            activeOpacity={0.8}
            onPress={() => router.push("/(tabs)/Orders" as any)}
          >
            <Text style={styles.viewPlanBtnText}>View Plan</Text>
          </TouchableOpacity>
        </View>

        {/* Account Settings Section */}
        <Text style={styles.sectionHeaderTitle}>Account</Text>
        <View style={styles.settingsGroupCard}>
          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={openEditModal}
          >
            <View style={[styles.settingIconBox, { backgroundColor: "#F0FDF4" }]}>
              <Feather name="user" size={18} color="#16A34A" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Personal Information</Text>
              <Text style={styles.settingSubtextText}>
                {getUserName()} • {getPhone()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={openEditModal}
          >
            <View style={[styles.settingIconBox, { backgroundColor: "#F0FDF4" }]}>
              <Ionicons name="location-outline" size={18} color="#16A34A" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Delivery Addresses</Text>
              <Text style={styles.settingSubtextText} numberOfLines={1}>
                {getAddressText()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#F0FDF4" }]}>
              <Ionicons name="card-outline" size={18} color="#16A34A" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Payment Methods</Text>
              <Text style={styles.settingSubtextText}>
                {latestOrder?.paymentMethod
                  ? `Last used: ${latestOrder.paymentMethod.toUpperCase()}`
                  : "UPI, Cards & Wallets"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#FFF7ED" }]}>
              <Ionicons name="notifications-outline" size={18} color="#EA580C" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Notification Preferences</Text>
              <Text style={styles.settingSubtextText}>Manage your alerts and updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#F3E8FF" }]}>
              <Feather name="gift" size={18} color="#9333EA" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Refer & Earn</Text>
              <Text style={styles.settingSubtextText}>Invite friends and earn rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Support & Others Section */}
        <Text style={styles.sectionHeaderTitle}>Support & Others</Text>
        <View style={styles.settingsGroupCard}>
          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#F0F9FF" }]}>
              <Ionicons name="headset-outline" size={18} color="#0284C7" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Help & Support</Text>
              <Text style={styles.settingSubtextText}>FAQs, contact support</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#F5F3FF" }]}>
              <Ionicons name="document-text-outline" size={18} color="#7C3AED" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Terms & Conditions</Text>
              <Text style={styles.settingSubtextText}>Read our terms and policies</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#F0F9FF" }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#0284C7" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Privacy Policy</Text>
              <Text style={styles.settingSubtextText}>Learn how we protect your data</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          {/* Connected Logout Item */}
          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={handleLogout}
          >
            <View style={[styles.settingIconBox, { backgroundColor: "#FEF2F2" }]}>
              <Feather name="log-out" size={18} color="#EF4444" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={[styles.settingTitleText, { color: "#EF4444" }]}>Logout</Text>
              <Text style={styles.settingSubtextText}>Sign out from your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Dynamic Edit Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Edit Profile Details</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Editable Name */}
            <View style={styles.inputGroupContainer}>
              <Text style={styles.inputLabelText}>Full Name</Text>
              <TextInput
                style={styles.textInputField}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter full name"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Uneditable Mobile Number */}
            <View style={styles.inputGroupContainer}>
              <View style={styles.labelWithBadgeRow}>
                <Text style={styles.inputLabelText}>Mobile Number</Text>
                <Text style={styles.uneditableTag}>Uneditable</Text>
              </View>
              <TextInput
                style={[styles.textInputField, styles.uneditableInputField]}
                value={getPhone()}
                editable={false}
              />
            </View>

            {/* Editable Address */}
            <View style={styles.inputGroupContainer}>
              <Text style={styles.inputLabelText}>Delivery Address</Text>
              <TextInput
                style={[styles.textInputField, styles.multilineInputField]}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="Enter complete address"
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={3}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setEditModalVisible(false)}
                disabled={savingProfile}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#FAF9F5",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  unreadDotBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#EF4444",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  profileCardWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  profileGreenHeader: {
    backgroundColor: "#2D4A22",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
  },
  letterAvatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#3A5F2D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#EAB308",
  },
  letterAvatarText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  editAvatarBtn: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#FFFFFF",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  profileDetailsCol: {
    flex: 1,
    marginLeft: 16,
  },
  profileNameText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  profileContactText: {
    fontSize: 12,
    color: "#D1FAE5",
    fontWeight: "500",
    marginTop: 1,
  },
  headerEditPill: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
  },

  statsBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  statItemCol: {
    flex: 1,
    alignItems: "center",
  },
  statIconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statNumberText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  statLabelText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#F1F5F9",
  },

  activePlanCard: {
    backgroundColor: "#F7F5EE",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#EAE8E3",
  },
  activePlanIconBadge: {
    backgroundColor: "#2D4A22",
    width: 52,
    height: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  activePlanTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 11,
    textAlign: "center",
  },
  activePlanInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  activePlanTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  activePlanSubtext: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },
  activePlanNextDateText: {
    fontSize: 12,
    color: "#2D4A22",
    marginTop: 6,
    fontWeight: "500",
  },
  viewPlanBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2D4A22",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  viewPlanBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2D4A22",
  },

  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
    marginLeft: 2,
  },
  settingsGroupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  settingRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  settingIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingTextCol: {
    flex: 1,
    marginLeft: 14,
  },
  settingTitleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  settingSubtextText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  settingRowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginLeft: 52,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContentCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  inputGroupContainer: {
    marginBottom: 14,
  },
  labelWithBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  inputLabelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 6,
  },
  uneditableTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  textInputField: {
    backgroundColor: "#FAF9F5",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  uneditableInputField: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
  multilineInputField: {
    height: 80,
    textAlignVertical: "top",
  },
  modalActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
  },
  cancelModalBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  saveModalBtn: {
    flex: 1,
    backgroundColor: "#2D4A22",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveModalBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});