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
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useClerk } from "@clerk/clerk-expo";
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

  // Clerk authentication
  const { signOut } = useClerk();

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

  // Help & Support expansion state
  const [helpExpanded, setHelpExpanded] = useState<boolean>(false);

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
                [
                  "Placed",
                  "Confirmed",
                  "Active",
                  "Paused",
                  "Processing",
                  "In Progress",
                ].includes(o.orderStatus)
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

  // 🔥 Complete Clerk + KatBox Logout Handler & Navigation to Login
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
              // Prevent multiple logout actions
              setLoading(true);

              // 1. Sign out from Clerk
              // This clears the active Clerk session.
              await signOut();

              // 2. Remove stored KatBox backend auth credentials
              await removeToken();

              // 3. Disconnect web socket connection
              if (socket && typeof socket.disconnect === "function") {
                socket.disconnect();
              }

              // 4. Notify app auth state listeners
              notifyAuthChanged();

              // 5. Reset navigation stack and navigate directly to Login screen
              router.replace("/login" as any);
            } catch (err) {
              console.error("Clerk/KatBox Logout error:", err);

              // Even if Clerk sign-out encounters an issue,
              // clear the local KatBox session so the user
              // cannot remain authenticated locally.
              try {
                await removeToken();
              } catch (storageError) {
                console.error(
                  "Failed to clear local auth storage:",
                  storageError
                );
              }

              try {
                if (socket && typeof socket.disconnect === "function") {
                  socket.disconnect();
                }
              } catch (socketError) {
                console.error(
                  "Failed to disconnect socket:",
                  socketError
                );
              }

              notifyAuthChanged();

              Alert.alert(
                "Logout",
                "Your local session has been cleared. Please sign in again."
              );

              router.replace("/login" as any);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 📞 Call support handler — opens the phone dialer
  const handleCallSupport = async () => {
    const phoneUrl = "tel:+9133450555";
    try {
      const supported = await Linking.canOpenURL(phoneUrl);
      if (supported) {
        await Linking.openURL(phoneUrl);
      } else {
        Alert.alert("Error", "Unable to open dialer on this device.");
      }
    } catch (err) {
      console.error("Call support error:", err);
      Alert.alert("Error", "Unable to open dialer.");
    }
  };

  // ✉️ Email support handler — opens the default mail app
  const handleEmailSupport = async () => {
    const mailUrl = "mailto:katbox.in@gmail.com";
    try {
      const supported = await Linking.canOpenURL(mailUrl);
      if (supported) {
        await Linking.openURL(mailUrl);
      } else {
        Alert.alert("Error", "Unable to open mail app on this device.");
      }
    } catch (err) {
      console.error("Email support error:", err);
      Alert.alert("Error", "Unable to open mail app.");
    }
  };

  // Helper formatting routines
  const getUserName = () => {
    if (user?.name && user.name.trim().length > 0) return user.name;
    if (
      latestOrder?.userName &&
      latestOrder.userName.trim().length > 0
    )
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
    if (
      (user as any)?.address &&
      (user as any).address.trim().length > 0
    ) {
      return (user as any).address;
    }

    if (
      latestOrder?.addressDetails &&
      latestOrder.addressDetails.trim().length > 0
    ) {
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

    if (
      latestOrder.deliveryDate &&
      latestOrder.deliveryDate.trim().length > 0
    ) {
      return latestOrder.deliveryDate;
    }

    return "Scheduled";
  };

  // Open Edit Modal
  const openEditModal = () => {
    setEditName(getUserName());
    setEditAddress(
      getAddressText() === "Manage your saved addresses"
        ? ""
        : getAddressText()
    );
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
        console.log(
          "Server responded with non-JSON content:",
          responseText
        );
        Alert.alert(
          "Error",
          `Server route error (${response.status}). Please verify server backend routes.`
        );
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

        Alert.alert(
          "Success",
          "Profile updated successfully!"
        );
      } else {
        Alert.alert(
          "Error",
          data.message || "Failed to update profile"
        );
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert(
        "Error",
        "Something went wrong while updating profile."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <View
      style={[
        styles.mainContainer,
        { paddingTop: insets.top },
      ]}
    >
      {/* Premium Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerEyebrow}>KATBOX</Text>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color="#0F172A"
            />
            <View style={styles.unreadDotBadge} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Math.max(insets.bottom, 24) + 20,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#1B4332"]}
            tintColor="#1B4332"
          />
        }
      >
        {/* Premium Hero Profile Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroCardInner}>
            {/* Decorative layered circles */}
            <View style={styles.heroDecorCircleOne} />
            <View style={styles.heroDecorCircleTwo} />
            <View style={styles.heroDecorCircleThree} />

            {/* Top label strip */}
            <View style={styles.heroTopStrip}>
              <View style={styles.heroTopLeftGroup}>
                <View style={styles.heroTopDot} />
                <Text style={styles.heroTopLabel}>
                  VERIFIED MEMBER
                </Text>
              </View>

              <TouchableOpacity
                style={styles.heroEditPill}
                onPress={openEditModal}
                activeOpacity={0.8}
              >
                <Feather
                  name="edit-3"
                  size={13}
                  color="#1B4332"
                />
                <Text style={styles.heroEditPillText}>
                  Edit
                </Text>
              </TouchableOpacity>
            </View>

            {/* Avatar + name block */}
            <View style={styles.heroProfileRow}>
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarOuterRing}>
                  <View style={styles.letterAvatarContainer}>
                    <Text style={styles.letterAvatarText}>
                      {getFirstLetter()}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.editAvatarBtn}
                  activeOpacity={0.8}
                  onPress={openEditModal}
                >
                  <Ionicons
                    name="pencil"
                    size={11}
                    color="#1B4332"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.profileDetailsCol}>
                <Text style={styles.profileNameText}>
                  {getUserName()}
                </Text>

                <View style={styles.contactInfoRow}>
                  <Ionicons
                    name="call-outline"
                    size={12}
                    color="rgba(255,255,255,0.75)"
                  />
                  <Text style={styles.profileContactText}>
                    {getPhone()}
                  </Text>
                </View>

                <View style={styles.contactInfoRow}>
                  <Ionicons
                    name="mail-outline"
                    size={12}
                    color="rgba(255,255,255,0.75)"
                  />
                  <Text
                    style={styles.profileContactText}
                    numberOfLines={1}
                  >
                    {getEmail()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Premium Stats Bar */}
          <View style={styles.statsBarContainer}>
            <View style={styles.statItemCol}>
              <Text style={styles.statNumberText}>
                {totalOrders}
              </Text>
              <Text style={styles.statLabelText}>
                Total Orders
              </Text>
              <View style={styles.statAccentLine} />
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItemCol}>
              <Text style={styles.statNumberText}>
                {completedOrders}
              </Text>
              <Text style={styles.statLabelText}>
                Completed
              </Text>
              <View style={styles.statAccentLine} />
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItemCol}>
              <View style={styles.ratingInlineRow}>
                <Text style={styles.statNumberText}>
                  4.8
                </Text>
                <Ionicons
                  name="star"
                  size={13}
                  color="#D97706"
                  style={{
                    marginLeft: 3,
                    marginTop: 1,
                  }}
                />
              </View>

              <Text style={styles.statLabelText}>
                Rating
              </Text>

              <View style={styles.statAccentLine} />
            </View>
          </View>
        </View>

        {/* Premium Active Plan Card */}
        <View style={styles.activePlanCard}>
          <View style={styles.activePlanAccentBar} />

          <View style={styles.activePlanIconBadge}>
            <Ionicons
              name="sparkles"
              size={20}
              color="#FCD34D"
            />
          </View>

          <View style={styles.activePlanInfoCol}>
            <View style={styles.activePlanTopRow}>
              <Text style={styles.activePlanEyebrow}>
                ACTIVE SUBSCRIPTION
              </Text>
              <View style={styles.activePlanLiveDot} />
            </View>

            <Text
              style={styles.activePlanTitle}
              numberOfLines={1}
            >
              {latestOrder?.menuName
                ? latestOrder.menuName
                : "No Active Plan"}
            </Text>

            <Text
              style={styles.activePlanSubtext}
              numberOfLines={1}
            >
              {latestOrder
                ? `${latestOrder.durationType || "Standard Meal Plan"}${
                    latestOrder.deliveryTimeSlot
                      ? `  •  ${latestOrder.deliveryTimeSlot}`
                      : ""
                  }`
                : "Subscribe to a plan to get started"}
            </Text>

            <View style={styles.activePlanFooterRow}>
              <Ionicons
                name="time-outline"
                size={12}
                color="#1B4332"
              />

              <Text
                style={styles.activePlanNextDateText}
                numberOfLines={1}
              >
                Next:{" "}
                <Text style={{ fontWeight: "800" }}>
                  {getNextDeliveryText()}
                </Text>
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.viewPlanBtn}
            activeOpacity={0.85}
            onPress={() =>
              router.push("/(tabs)/Orders" as any)
            }
          >
            <Text style={styles.viewPlanBtnText}>
              View
            </Text>

            <Ionicons
              name="arrow-forward"
              size={13}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>
            Account
          </Text>
          <View style={styles.sectionHeaderLine} />
        </View>

        <View style={styles.settingsGroupCard}>
          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={openEditModal}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#ECFDF5" },
              ]}
            >
              <Feather
                name="user"
                size={17}
                color="#059669"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Personal Information
              </Text>

              <Text
                style={styles.settingSubtextText}
                numberOfLines={1}
              >
                {getUserName()} • {getPhone()}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={openEditModal}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#ECFDF5" },
              ]}
            >
              <Ionicons
                name="location-outline"
                size={17}
                color="#059669"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Delivery Addresses
              </Text>

              <Text
                style={styles.settingSubtextText}
                numberOfLines={1}
              >
                {getAddressText()}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#ECFDF5" },
              ]}
            >
              <Ionicons
                name="card-outline"
                size={17}
                color="#059669"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Payment Methods
              </Text>

              <Text
                style={styles.settingSubtextText}
                numberOfLines={1}
              >
                {latestOrder?.paymentMethod
                  ? `Last used: ${latestOrder.paymentMethod.toUpperCase()}`
                  : "UPI, Cards & Wallets"}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#FFF7ED" },
              ]}
            >
              <Ionicons
                name="notifications-outline"
                size={17}
                color="#EA580C"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Notification Preferences
              </Text>

              <Text style={styles.settingSubtextText}>
                Manage your alerts and updates
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#FAF5FF" },
              ]}
            >
              <Feather
                name="gift"
                size={17}
                color="#9333EA"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Refer & Earn
              </Text>

              <Text style={styles.settingSubtextText}>
                Invite friends and earn rewards
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>
        </View>

        {/* Support & Others Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>
            Support & Others
          </Text>
          <View style={styles.sectionHeaderLine} />
        </View>

        <View style={styles.settingsGroupCard}>
          {/* Help & Support — expandable row */}
          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={() =>
              setHelpExpanded((prev) => !prev)
            }
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#EFF6FF" },
              ]}
            >
              <Ionicons
                name="headset-outline"
                size={17}
                color="#2563EB"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Help & Support
              </Text>

              <Text style={styles.settingSubtextText}>
                {helpExpanded
                  ? "Tap a contact below to reach us"
                  : "FAQs, contact support"}
              </Text>
            </View>

            <Ionicons
              name={
                helpExpanded
                  ? "chevron-up"
                  : "chevron-down"
              }
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          {helpExpanded && (
            <View style={styles.helpExpandedWrapper}>
              {/* Phone contact row */}
              <TouchableOpacity
                style={styles.contactRowItem}
                activeOpacity={0.75}
                onPress={handleCallSupport}
              >
                <View
                  style={[
                    styles.contactIconBox,
                    { backgroundColor: "#ECFDF5" },
                  ]}
                >
                  <Ionicons
                    name="call"
                    size={15}
                    color="#059669"
                  />
                </View>

                <View style={styles.contactTextCol}>
                  <Text style={styles.contactLabelText}>
                    CALL SUPPORT
                  </Text>

                  <Text style={styles.contactValueText}>
                    +91 9133450555
                  </Text>
                </View>

                <View style={styles.contactActionPill}>
                  <Text
                    style={styles.contactActionPillText}
                  >
                    Call
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={12}
                    color="#FFFFFF"
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.contactRowDivider} />

              {/* Email contact row */}
              <TouchableOpacity
                style={styles.contactRowItem}
                activeOpacity={0.75}
                onPress={handleEmailSupport}
              >
                <View
                  style={[
                    styles.contactIconBox,
                    { backgroundColor: "#FEF3C7" },
                  ]}
                >
                  <Ionicons
                    name="mail"
                    size={15}
                    color="#D97706"
                  />
                </View>

                <View style={styles.contactTextCol}>
                  <Text style={styles.contactLabelText}>
                    EMAIL SUPPORT
                  </Text>

                  <Text style={styles.contactValueText}>
                    katbox.in@gmail.com
                  </Text>
                </View>

                <View style={styles.contactActionPill}>
                  <Text
                    style={styles.contactActionPillText}
                  >
                    Mail
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={12}
                    color="#FFFFFF"
                  />
                </View>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#F5F3FF" },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={17}
                color="#7C3AED"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Terms & Conditions
              </Text>

              <Text style={styles.settingSubtextText}>
                Read our terms and policies
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#EFF6FF" },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={17}
                color="#2563EB"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>
                Privacy Policy
              </Text>

              <Text style={styles.settingSubtextText}>
                Learn how we protect your data
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>

          <View style={styles.settingRowDivider} />

          {/* Connected Logout Item */}
          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={handleLogout}
          >
            <View
              style={[
                styles.settingIconBox,
                { backgroundColor: "#FEF2F2" },
              ]}
            >
              <Feather
                name="log-out"
                size={17}
                color="#DC2626"
              />
            </View>

            <View style={styles.settingTextCol}>
              <Text
                style={[
                  styles.settingTitleText,
                  { color: "#DC2626" },
                ]}
              >
                Logout
              </Text>

              <Text style={styles.settingSubtextText}>
                Sign out from your account
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={17}
              color="#CBD5E1"
            />
          </TouchableOpacity>
        </View>

        {/* Premium Footer Branding */}
        <View style={styles.brandFooter}>
          <View style={styles.brandFooterLine} />

          <Text style={styles.brandFooterText}>
            KATBOX • Premium Kitchen Experience
          </Text>

          <Text style={styles.brandFooterSubText}>
            v1.0.0
          </Text>
        </View>
      </ScrollView>

      {/* Premium Edit Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() =>
          setEditModalVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalEyebrow}>
                  PROFILE
                </Text>

                <Text style={styles.modalHeaderTitle}>
                  Edit Details
                </Text>
              </View>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() =>
                  setEditModalVisible(false)
                }
              >
                <Ionicons
                  name="close"
                  size={18}
                  color="#0F172A"
                />
              </TouchableOpacity>
            </View>

            {/* Editable Name */}
            <View style={styles.inputGroupContainer}>
              <Text style={styles.inputLabelText}>
                Full Name
              </Text>

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
                <Text style={styles.inputLabelText}>
                  Mobile Number
                </Text>

                <View style={styles.uneditableTagWrap}>
                  <Ionicons
                    name="lock-closed"
                    size={9}
                    color="#DC2626"
                  />

                  <Text style={styles.uneditableTag}>
                    LOCKED
                  </Text>
                </View>
              </View>

              <TextInput
                style={[
                  styles.textInputField,
                  styles.uneditableInputField,
                ]}
                value={getPhone()}
                editable={false}
              />
            </View>

            {/* Editable Address */}
            <View style={styles.inputGroupContainer}>
              <Text style={styles.inputLabelText}>
                Delivery Address
              </Text>

              <TextInput
                style={[
                  styles.textInputField,
                  styles.multilineInputField,
                ]}
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
                onPress={() =>
                  setEditModalVisible(false)
                }
                disabled={savingProfile}
              >
                <Text style={styles.cancelModalBtnText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                    size="small"
                  />
                ) : (
                  <>
                    <Text style={styles.saveModalBtnText}>
                      Save Changes
                    </Text>

                    <Ionicons
                      name="checkmark"
                      size={16}
                      color="#FFFFFF"
                    />
                  </>
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

  /* ── Premium Header ── */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EAE8E3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  unreadDotBadge: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  /* ── Premium Hero Card ── */
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    overflow: "hidden",
    marginBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  heroCardInner: {
    backgroundColor: "#1B4332",
    padding: 22,
    paddingTop: 20,
    paddingBottom: 28,
    position: "relative",
    overflow: "hidden",
  },
  heroDecorCircleOne: {
    position: "absolute",
    top: -50,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255, 255, 255, 0.045)",
  },
  heroDecorCircleTwo: {
    position: "absolute",
    top: 20,
    right: -60,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(252, 211, 77, 0.08)",
  },
  heroDecorCircleThree: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  heroTopStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  heroTopLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(252, 211, 77, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(252, 211, 77, 0.35)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  heroTopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FCD34D",
  },
  heroTopLabel: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#FCD34D",
    letterSpacing: 1.2,
  },
  heroEditPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  heroEditPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1B4332",
  },
  heroProfileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarOuterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    padding: 3,
    backgroundColor: "rgba(252, 211, 77, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  letterAvatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#2D6A4F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FCD34D",
  },
  letterAvatarText: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  editAvatarBtn: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: "#FCD34D",
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1B4332",
  },
  profileDetailsCol: {
    flex: 1,
    marginLeft: 16,
  },
  profileNameText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  contactInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  profileContactText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.82)",
    fontWeight: "500",
    flexShrink: 1,
  },

  /* ── Premium Stats Bar ── */
  statsBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
    backgroundColor: "#FFFFFF",
  },
  statItemCol: {
    flex: 1,
    alignItems: "center",
  },
  statNumberText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.6,
  },
  statLabelText: {
    fontSize: 10.5,
    color: "#94A3B8",
    fontWeight: "700",
    marginTop: 3,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statAccentLine: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1B4332",
    marginTop: 8,
    opacity: 0.85,
  },
  statDivider: {
    width: 1,
    height: 46,
    backgroundColor: "#F1F5F9",
  },
  ratingInlineRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  /* ── Premium Active Plan Card ── */
  activePlanCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  activePlanAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: "#1B4332",
  },
  activePlanIconBadge: {
    backgroundColor: "#1B4332",
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    shadowColor: "#1B4332",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  activePlanInfoCol: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 4,
  },
  activePlanTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  activePlanEyebrow: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 1.1,
  },
  activePlanLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#16A34A",
  },
  activePlanTitle: {
    fontSize: 15.5,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  activePlanSubtext: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 3,
  },
  activePlanFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  activePlanNextDateText: {
    fontSize: 11.5,
    color: "#1B4332",
    fontWeight: "600",
    flexShrink: 1,
  },
  viewPlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1B4332",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: "#1B4332",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  viewPlanBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  /* ── Section Headers ── */
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    marginLeft: 4,
    paddingRight: 4,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#EAE8E3",
  },

  /* ── Premium Settings Group Card ── */
  settingsGroupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  settingRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
  },
  settingIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  settingTextCol: {
    flex: 1,
    marginLeft: 14,
  },
  settingTitleText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.1,
  },
  settingSubtextText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  settingRowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginLeft: 54,
  },

  /* ── Premium Help & Support expandable ── */
  helpExpandedWrapper: {
    marginTop: 6,
    marginBottom: 10,
    marginLeft: 54,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  contactRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
  },
  contactIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  contactTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  contactLabelText: {
    fontSize: 9.5,
    color: "#94A3B8",
    fontWeight: "900",
    letterSpacing: 1,
  },
  contactValueText: {
    fontSize: 13.5,
    color: "#0F172A",
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.1,
  },
  contactActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1B4332",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: "#1B4332",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  contactActionPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  contactRowDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
  },

  /* ── Premium Brand Footer ── */
  brandFooter: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  brandFooterLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1B4332",
    opacity: 0.3,
    marginBottom: 12,
  },
  brandFooterText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  brandFooterSubText: {
    fontSize: 10,
    color: "#CBD5E1",
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.5,
  },

  /* ── Premium Edit Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContentCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 22,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalEyebrow: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  inputGroupContainer: {
    marginBottom: 16,
  },
  labelWithBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  inputLabelText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#64748B",
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  uneditableTagWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  uneditableTag: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#DC2626",
    letterSpacing: 0.6,
  },
  textInputField: {
    backgroundColor: "#FAF9F5",
    borderWidth: 1.2,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: "#0F172A",
    fontWeight: "600",
  },
  uneditableInputField: {
    backgroundColor: "#F1F5F9",
    color: "#94A3B8",
    borderColor: "#E2E8F0",
  },
  multilineInputField: {
    height: 88,
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
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: "#E2E8F0",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelModalBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748B",
  },
  saveModalBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1B4332",
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: "#1B4332",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  saveModalBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});