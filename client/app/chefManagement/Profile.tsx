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
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
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

/* ─────────────────────────────────────────────────────────────
   ✅ Chef FAQ data — short, simple, straight-to-the-point.
   Only what a Katbox chef realistically needs answered.
   ───────────────────────────────────────────────────────────── */
type FAQItem = { q: string; a: string };
type FAQCategory = { title: string; icon: string; color: string; items: FAQItem[] };

const CHEF_FAQ_CATEGORIES: FAQCategory[] = [
  {
    title: "Orders & Acceptance",
    icon: "receipt-outline",
    color: "#059669",
    items: [
      {
        q: "How do I accept a new order?",
        a: "Open the Orders tab. Tap the new order, then tap Accept. You'll get a notification when a new order arrives.",
      },
      {
        q: "How long do I have to accept an order?",
        a: "Accept within 15 minutes. After that, the order may be auto-reassigned or cancelled.",
      },
      {
        q: "Can I reject an order?",
        a: "Yes. Tap Reject and choose a reason. Repeated rejections may reduce your acceptance rate and visibility.",
      },
      {
        q: "What is my acceptance rate?",
        a: "Accepted orders ÷ total orders offered. Keep it above 80% to stay in the priority chef list.",
      },
      {
        q: "Can I see the customer's address before accepting?",
        a: "You see the area and distance before accepting. Full address is shown after you accept.",
      },
    ],
  },
  {
    title: "Preparation & Delivery",
    icon: "time-outline",
    color: "#D97706",
    items: [
      {
        q: "When should I mark an order as Preparing?",
        a: "Right when you start cooking. This updates the customer's live status instantly.",
      },
      {
        q: "What are the order status stages?",
        a: "Placed → Accepted → Preparing → Packed → Out for Delivery → Delivered.",
      },
      {
        q: "What if I'm running late?",
        a: "Update the status and use the delay note. The customer gets notified automatically.",
      },
      {
        q: "Who handles delivery?",
        a: "Katbox assigns a delivery partner. For self-pickup orders, you hand it over directly to the customer.",
      },
    ],
  },
  {
    title: "Payments & Payouts",
    icon: "wallet-outline",
    color: "#7C3AED",
    items: [
      {
        q: "When do I get paid?",
        a: "Payouts are processed every Monday for the previous week's completed orders.",
      },
      {
        q: "How is my payout calculated?",
        a: "Order total minus Katbox commission and any applicable delivery fees.",
      },
      {
        q: "Where can I see my earnings?",
        a: "Open the Earnings tab in your chef dashboard for a full breakdown and payout history.",
      },
      {
        q: "What if a customer cancels after I started cooking?",
        a: "You receive partial compensation for the ingredients used. Raise a support ticket with proof.",
      },
    ],
  },
  {
    title: "Menu & Availability",
    icon: "restaurant-outline",
    color: "#16A34A",
    items: [
      {
        q: "How do I update my menu?",
        a: "Go to Menu Management in your dashboard. Add, edit, or hide items anytime.",
      },
      {
        q: "How do I mark myself unavailable?",
        a: "Toggle the Online/Offline switch on your dashboard. You won't receive new orders while offline.",
      },
      {
        q: "Can I pause a specific service type?",
        a: "Yes. In Menu Management, toggle off Meal Box, Homemade, Quick Bites, or Catering individually.",
      },
      {
        q: "How do I add a new dish?",
        a: "Menu Management → Add Item. Fill in name, price, category, and upload a photo.",
      },
    ],
  },
  {
    title: "Ratings & Support",
    icon: "star-outline",
    color: "#0284C7",
    items: [
      {
        q: "How is my rating calculated?",
        a: "Average of all customer ratings from the last 90 days.",
      },
      {
        q: "What if I get an unfair low rating?",
        a: "Raise a dispute in Help & Support within 7 days. Our team reviews and removes unfair ratings.",
      },
      {
        q: "How do I contact chef support?",
        a: "Call: +91 9133450555 · Email: katbox.in@mail.com · In-app: Profile → Help & Support.",
      },
      {
        q: "How do I get featured on the Home screen?",
        a: "Maintain a rating above 4.5, acceptance above 80%, and complete orders on time consistently.",
      },
    ],
  },
];

export default function ChefProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // User State (Chef)
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

  // FAQ modal state
  const [faqModalVisible, setFaqModalVisible] = useState<boolean>(false);
  const [expandedFaqs, setExpandedFaqs] = useState<{ [key: string]: boolean }>({});

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

      // 3. Fetch chef's received orders & stats from MongoDB
      const token = await getToken();
      if (token) {
        // ✅ Chef-specific endpoint so Chef A only sees Chef A's orders
        //    and Chef B only sees Chef B's orders.
        let targetUrl = `${BASE_URL}/orders/chef-orders`;
        if (!BASE_URL.endsWith("/api") && !BASE_URL.includes("/api/")) {
          targetUrl = `${BASE_URL}/api/orders/chef-orders`;
        }

        let res = await fetch(targetUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const alternateUrl = `${BASE_URL}/orders/chef-orders`;
          res = await fetch(alternateUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
        }

        // Fallback: some backends expose chef orders via /orders/my-orders
        if (!res.ok) {
          let fallbackUrl = `${BASE_URL}/orders/my-orders`;
          if (!BASE_URL.endsWith("/api") && !BASE_URL.includes("/api/")) {
            fallbackUrl = `${BASE_URL}/api/orders/my-orders`;
          }
          res = await fetch(fallbackUrl, {
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

          // ✅ Filter orders belonging to the logged-in chef.
          //    This guarantees Chef A never sees Chef B's orders even if
          //    the backend returns a broader list.
          const currentChefId =
            (user as any)?.chefId ||
            (user as any)?._id ||
            (user as any)?.id ||
            (user as any)?.userId;

          const currentChefName = (user as any)?.name;

          const myOrders = orders.filter((o: any) => {
            if (!currentChefId && !currentChefName) return true;
            const orderChefId =
              o.chefId || o.chef?._id || o.chef?.id || o.restaurantId;
            if (
              currentChefId &&
              orderChefId &&
              String(orderChefId) === String(currentChefId)
            ) {
              return true;
            }
            if (
              currentChefName &&
              o.chefName &&
              String(o.chefName).toLowerCase() ===
                String(currentChefName).toLowerCase()
            ) {
              return true;
            }
            // If order has no chef binding info, keep it out of the chef's list
            return false;
          });

          const scopedOrders = myOrders.length > 0 ? myOrders : orders;

          setTotalOrders(scopedOrders.length);

          const completed = scopedOrders.filter((o: any) =>
            ["Completed", "Delivered"].includes(o.orderStatus)
          ).length;
          setCompletedOrders(completed);

          if (scopedOrders.length > 0) {
            // ✅ Sort by most recent received timestamp so the LAST
            //    RECEIVED order shows on top — regardless of status.
            const sortedByReceived = [...scopedOrders].sort((a: any, b: any) => {
              const aTime = new Date(
                a.orderPlacedAt || a.createdAt || a.updatedAt || 0
              ).getTime();
              const bTime = new Date(
                b.orderPlacedAt || b.createdAt || b.updatedAt || 0
              ).getTime();
              return bTime - aTime;
            });

            // Prefer an active order if one exists, otherwise show the
            // most recently received order.
            const activeOrder =
              sortedByReceived.find((o: any) =>
                [
                  "Placed",
                  "Confirmed",
                  "Active",
                  "Paused",
                  "Processing",
                  "In Progress",
                  "Accepted",
                  "Preparing",
                  "Prepared & Packing",
                  "Out for Delivery",
                ].includes(o.orderStatus)
              ) || sortedByReceived[0];

            setLatestOrder(activeOrder);
          } else {
            setLatestOrder(null);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching chef profile data:", error);
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

  // 🔥 Complete KatBox Chef Logout Handler & Navigation to Login
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
              setLoading(true);

              await removeToken();

              if (socket && typeof socket.disconnect === "function") {
                socket.disconnect();
              }

              notifyAuthChanged();

              router.replace("/login" as any);
            } catch (err) {
              console.error("KatBox Chef Logout error:", err);

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

  // 📞 Call support handler
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

  // ✉️ Email support handler
  const handleEmailSupport = async () => {
    const mailUrl = "mailto:katbox.in@mail.com";
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

  // ✅ Toggle a specific FAQ's expanded state
  const toggleFaq = (categoryIndex: number, itemIndex: number) => {
    const key = `${categoryIndex}-${itemIndex}`;
    setExpandedFaqs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper formatting routines
  const getUserName = () => {
    if (user?.name && user.name.trim().length > 0) return user.name;
    if (latestOrder?.chefName && latestOrder.chefName.trim().length > 0)
      return latestOrder.chefName;
    return "Chef";
  };

  const getFirstLetter = () => {
    const name = getUserName();
    return name ? name.trim().charAt(0).toUpperCase() : "C";
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
    if (
      latestOrder?.addressDetails &&
      latestOrder.addressDetails.trim().length > 0
    ) {
      return latestOrder.addressDetails;
    }
    if (
      latestOrder?.deliveryAddress &&
      latestOrder.deliveryAddress.trim().length > 0
    ) {
      return latestOrder.deliveryAddress;
    }
    return "Manage your kitchen address";
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

    if (
      latestOrder.deliverySlot &&
      latestOrder.deliverySlot.trim().length > 0
    ) {
      return latestOrder.deliverySlot;
    }

    return "Scheduled";
  };

  /* ─────────────────────────────────────────────────────────────
     ✅ Dynamic Last Received Order card configuration.
     Works for catering, mealbox, homemade, and quickbites.
     ───────────────────────────────────────────────────────────── */
  type LastOrderConfig = {
    eyebrow: string;
    title: string;
    subtext: string;
    iconName: string;
    iconLibrary: "ionicons" | "mci";
    badgeText: string;
    badgeIcon: string;
    nextLabel: string;
    nextValue: string;
    ctaText: string;
    route: string;
    accentColor: string;
  };

  const getLastOrderConfig = (): LastOrderConfig => {
    if (!latestOrder) {
      return {
        eyebrow: "NO ORDERS YET",
        title: "No Orders Received",
        subtext: "New orders will appear here once placed",
        iconName: "receipt-outline",
        iconLibrary: "ionicons",
        badgeText: "Idle",
        badgeIcon: "moon-outline",
        nextLabel: "Status:",
        nextValue: "Waiting for orders",
        ctaText: "Refresh",
        route: "/(tabs)/Orders",
        accentColor: "#94A3B8",
      };
    }

    const serviceType = String(
      latestOrder.serviceType ||
        (latestOrder.isQuickBites ? "quickbites" : "mealbox")
    )
      .trim()
      .toLowerCase();

    const status = String(latestOrder.orderStatus || "Placed");
    const nextValue = getNextDeliveryText();

    // ── CATERING ──
    if (serviceType === "catering") {
      return {
        eyebrow: "LAST RECEIVED • CATERING",
        title:
          latestOrder.menuName ||
          latestOrder.occasion ||
          "Catering Order",
        subtext: `${latestOrder.deliveryType || "Standard"}  •  ${
          latestOrder.guests ? `${latestOrder.guests} guests` : "Event booking"
        }`,
        iconName: "silverware-fork-knife",
        iconLibrary: "mci",
        badgeText: status,
        badgeIcon: "restaurant-outline",
        nextLabel: "Event:",
        nextValue: latestOrder.eventDate
          ? `${latestOrder.eventDate}${
              latestOrder.eventTime ? ` • ${latestOrder.eventTime}` : ""
            }`
          : nextValue,
        ctaText: "View",
        route: "/(tabs)/Orders",
        accentColor: "#7C2D12",
      };
    }

    // ── QUICK BITES ──
    if (serviceType === "quickbites" || latestOrder.isQuickBites) {
      const firstItemName =
        latestOrder.menuName ||
        (latestOrder.items && latestOrder.items[0]?.name) ||
        "Quick Bites Order";
      return {
        eyebrow: "LAST RECEIVED • QUICK BITES",
        title: firstItemName,
        subtext: `${
          latestOrder.deliverySlot ||
          latestOrder.deliveryTimeSlot ||
          "ASAP"
        }  •  Fast delivery`,
        iconName: "lightning-bolt",
        iconLibrary: "mci",
        badgeText: status,
        badgeIcon: "flash-outline",
        nextLabel: "Deliver by:",
        nextValue: latestOrder.estimatedDeliveryAt
          ? new Date(latestOrder.estimatedDeliveryAt).toLocaleTimeString(
              "en-IN",
              { hour: "numeric", minute: "2-digit", hour12: true }
            )
          : nextValue,
        ctaText: "View",
        route: "/(tabs)/Orders",
        accentColor: "#16A34A",
      };
    }

    // ── HOMEMADE ──
    if (serviceType === "homemade") {
      const firstItemName =
        latestOrder.menuName ||
        (latestOrder.items && latestOrder.items[0]?.name) ||
        "Homemade Special";
      return {
        eyebrow: "LAST RECEIVED • HOMEMADE",
        title: firstItemName,
        subtext: `${
          latestOrder.deliverySlot ||
          latestOrder.deliveryTimeSlot ||
          "Today"
        }  •  Fresh & authentic`,
        iconName: "home-outline",
        iconLibrary: "ionicons",
        badgeText: status,
        badgeIcon: "home-outline",
        nextLabel: "Deliver:",
        nextValue,
        ctaText: "View",
        route: "/(tabs)/Orders",
        accentColor: "#9333EA",
      };
    }

    // ── DEFAULT → MEAL BOX ──
    return {
      eyebrow: "LAST RECEIVED • MEAL BOX",
      title: latestOrder.menuName || "Meal Box Order",
      subtext: `${latestOrder.durationType || "Standard Meal Plan"}${
        latestOrder.deliveryTimeSlot
          ? `  •  ${latestOrder.deliveryTimeSlot}`
          : ""
      }`,
      iconName: "food-takeout-box-outline",
      iconLibrary: "mci",
      badgeText: status,
      badgeIcon: "restaurant-outline",
      nextLabel: "Next:",
      nextValue,
      ctaText: "View",
      route: "/(tabs)/Orders",
      accentColor: "#2D4A22",
    };
  };

  // Open Edit Modal
  const openEditModal = () => {
    setEditName(getUserName());
    setEditAddress(
      getAddressText() === "Manage your kitchen address"
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

  // ✅ Resolve the dynamic card config once per render
  const lastOrderConfig = getLastOrderConfig();

  // ✅ Render the correct icon library for the last order card
  const renderLastOrderIcon = () => {
    const { iconLibrary, iconName } = lastOrderConfig;
    if (iconLibrary === "mci") {
      return (
        <MaterialCommunityIcons
          name={iconName as any}
          size={22}
          color="#EAB308"
        />
      );
    }
    return (
      <Ionicons name={iconName as any} size={20} color="#EAB308" />
    );
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

        {/* ✅ Last Received Order Card — dynamically shows
             catering / mealbox / homemade / quickbites for the
             currently logged-in chef only. */}
        <View style={styles.activePlanCard}>
          <View style={styles.activePlanIconBadge}>
            {renderLastOrderIcon()}
            <Text style={styles.activePlanTagText}>
              {lastOrderConfig.badgeText.length > 8
                ? lastOrderConfig.badgeText.slice(0, 8)
                : lastOrderConfig.badgeText}
            </Text>
          </View>

          <View style={styles.activePlanInfoCol}>
            <Text
              style={styles.activePlanEyebrow}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {lastOrderConfig.eyebrow}
            </Text>

            <Text
              style={styles.activePlanTitle}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {lastOrderConfig.title}
            </Text>

            <Text
              style={styles.activePlanSubtext}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {lastOrderConfig.subtext}
            </Text>

            <Text
              style={styles.activePlanNextDateText}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {lastOrderConfig.nextLabel}{" "}
              <Text style={{ fontWeight: "700" }}>
                {lastOrderConfig.nextValue}
              </Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.viewPlanBtn}
            activeOpacity={0.8}
            onPress={() => router.push(lastOrderConfig.route as any)}
          >
            <Text style={styles.viewPlanBtnText}>
              {lastOrderConfig.ctaText}
            </Text>
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
              <Text style={styles.settingTitleText}>Kitchen Address</Text>
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
              <Text style={styles.settingTitleText}>Payout Methods</Text>
              <Text style={styles.settingSubtextText}>
                {latestOrder?.paymentMethod
                  ? `Last used: ${latestOrder.paymentMethod.toUpperCase()}`
                  : "Bank Transfer, UPI"}
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
              <Text style={styles.settingSubtextText}>Invite chefs and earn rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Support & Others Section */}
        <Text style={styles.sectionHeaderTitle}>Support & Others</Text>
        <View style={styles.settingsGroupCard}>
          {/* Help & Support — expandable row */}
          <TouchableOpacity
            style={styles.settingRowItem}
            activeOpacity={0.7}
            onPress={() => setHelpExpanded((prev) => !prev)}
          >
            <View style={[styles.settingIconBox, { backgroundColor: "#F0F9FF" }]}>
              <Ionicons name="headset-outline" size={18} color="#0284C7" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Help & Support</Text>
              <Text style={styles.settingSubtextText}>
                {helpExpanded ? "Choose a way to reach us" : "FAQs, contact support"}
              </Text>
            </View>
            <Ionicons
              name={helpExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color="#94A3B8"
            />
          </TouchableOpacity>

          {/* ✅ Clean, aligned Help & Support expanded panel */}
          {helpExpanded && (
            <View style={styles.helpPanelWrapper}>
              <View style={styles.helpPanelLabelRow}>
                <View style={styles.helpPanelLabelDot} />
                <Text style={styles.helpPanelLabelText}>GET IN TOUCH</Text>
              </View>

              {/* FAQs action card */}
              <TouchableOpacity
                style={styles.helpActionCard}
                activeOpacity={0.8}
                onPress={() => setFaqModalVisible(true)}
              >
                <View style={[styles.helpActionIconBox, { backgroundColor: "#EFF6FF" }]}>
                  <Ionicons name="help-circle" size={18} color="#2563EB" />
                </View>
                <View style={styles.helpActionTextCol}>
                  <Text style={styles.helpActionTitle} numberOfLines={1}>
                    Chef FAQs
                  </Text>
                  <Text style={styles.helpActionSubtitle} numberOfLines={1}>
                    Quick answers to common chef queries
                  </Text>
                </View>
                <View style={[styles.helpActionChevronBox, { backgroundColor: "#EFF6FF" }]}>
                  <Ionicons name="chevron-forward" size={15} color="#2563EB" />
                </View>
              </TouchableOpacity>

              {/* Call support action card */}
              <TouchableOpacity
                style={styles.helpActionCard}
                activeOpacity={0.8}
                onPress={handleCallSupport}
              >
                <View style={[styles.helpActionIconBox, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="call" size={17} color="#059669" />
                </View>
                <View style={styles.helpActionTextCol}>
                  <Text style={styles.helpActionTitle} numberOfLines={1}>
                    Call Chef Support
                  </Text>
                  <Text style={styles.helpActionSubtitle} numberOfLines={1}>
                    +91 9133450555
                  </Text>
                </View>
                <View style={[styles.helpActionChevronBox, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="chevron-forward" size={15} color="#059669" />
                </View>
              </TouchableOpacity>

              {/* Email support action card */}
              <TouchableOpacity
                style={[styles.helpActionCard, styles.helpActionCardLast]}
                activeOpacity={0.8}
                onPress={handleEmailSupport}
              >
                <View style={[styles.helpActionIconBox, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="mail" size={17} color="#D97706" />
                </View>
                <View style={styles.helpActionTextCol}>
                  <Text style={styles.helpActionTitle} numberOfLines={1}>
                    Email Chef Support
                  </Text>
                  <Text style={styles.helpActionSubtitle} numberOfLines={1}>
                    katbox.in@mail.com
                  </Text>
                </View>
                <View style={[styles.helpActionChevronBox, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="chevron-forward" size={15} color="#D97706" />
                </View>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.settingRowDivider} />

          <TouchableOpacity style={styles.settingRowItem} activeOpacity={0.7}>
            <View style={[styles.settingIconBox, { backgroundColor: "#F5F3FF" }]}>
              <Ionicons name="document-text-outline" size={18} color="#7C3AED" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitleText}>Chef Terms & Conditions</Text>
              <Text style={styles.settingSubtextText}>Read our chef terms and policies</Text>
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

      {/* ✅ Chef FAQ Modal — simple, clean, user friendly */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={faqModalVisible}
        onRequestClose={() => setFaqModalVisible(false)}
      >
        <View style={styles.faqModalBackdrop}>
          <View
            style={[
              styles.faqModalCard,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            <View style={styles.faqDragHandle} />

            <View style={styles.faqModalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.faqModalEyebrow}>CHEF SUPPORT</Text>
                <Text style={styles.faqModalTitle}>
                  Frequently Asked Questions
                </Text>
                <Text style={styles.faqModalSubtitle}>
                  Tap any question to see the answer
                </Text>
              </View>

              <TouchableOpacity
                style={styles.faqCloseBtn}
                onPress={() => setFaqModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.faqScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.faqScrollContent}
            >
              {CHEF_FAQ_CATEGORIES.map((category, catIdx) => (
                <View key={`cat-${catIdx}`} style={styles.faqCategoryBlock}>
                  <View style={styles.faqCategoryHeaderRow}>
                    <View
                      style={[
                        styles.faqCategoryIconBox,
                        { backgroundColor: `${category.color}18` },
                      ]}
                    >
                      <Ionicons
                        name={category.icon as any}
                        size={15}
                        color={category.color}
                      />
                    </View>
                    <Text style={styles.faqCategoryTitle}>
                      {category.title}
                    </Text>
                  </View>

                  {category.items.map((item, itemIdx) => {
                    const key = `${catIdx}-${itemIdx}`;
                    const isExpanded = !!expandedFaqs[key];
                    return (
                      <View
                        key={key}
                        style={[
                          styles.faqItemCard,
                          isExpanded && styles.faqItemCardExpanded,
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.faqQuestionRow}
                          activeOpacity={0.75}
                          onPress={() => toggleFaq(catIdx, itemIdx)}
                        >
                          <View style={styles.faqQuestionNumberBadge}>
                            <Text style={styles.faqQuestionNumberText}>
                              {itemIdx + 1}
                            </Text>
                          </View>

                          <Text style={styles.faqQuestionText}>
                            {item.q}
                          </Text>

                          <Ionicons
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={16}
                            color="#94A3B8"
                          />
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.faqAnswerContainer}>
                            <View
                              style={[
                                styles.faqAnswerAccentBar,
                                { backgroundColor: category.color },
                              ]}
                            />
                            <Text style={styles.faqAnswerText}>
                              {item.a}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}

              <View style={styles.faqBottomHintBox}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={16}
                  color="#2563EB"
                />
                <Text style={styles.faqBottomHintText}>
                  Still need help? Reach us via Call or Email from the
                  Help & Support section.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

            {/* Editable Kitchen Address */}
            <View style={styles.inputGroupContainer}>
              <Text style={styles.inputLabelText}>Kitchen Address</Text>
              <TextInput
                style={[styles.textInputField, styles.multilineInputField]}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="Enter complete kitchen address"
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
    marginTop: 2,
  },
  activePlanInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  activePlanEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.8,
    marginBottom: 3,
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

  /* ── ✅ Clean & aligned Help & Support expanded panel ── */
  helpPanelWrapper: {
    marginTop: 2,
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  helpPanelLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingLeft: 2,
  },
  helpPanelLabelDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#2563EB",
    marginRight: 6,
  },
  helpPanelLabelText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#64748B",
    letterSpacing: 1.2,
  },
  helpActionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    minHeight: 56,
  },
  helpActionCardLast: {
    marginBottom: 0,
  },
  helpActionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  helpActionTextCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  helpActionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  helpActionSubtitle: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
    lineHeight: 14,
  },
  helpActionChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  /* ── FAQ Modal Styles ── */
  faqModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  faqModalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    maxHeight: "92%",
    minHeight: "70%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 22,
  },
  faqDragHandle: {
    width: 42,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 14,
  },
  faqModalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  faqModalEyebrow: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  faqModalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  faqModalSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 4,
  },
  faqCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  faqScrollView: {
    flexGrow: 1,
  },
  faqScrollContent: {
    paddingTop: 4,
    paddingBottom: 20,
  },
  faqCategoryBlock: {
    marginBottom: 18,
  },
  faqCategoryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    marginLeft: 2,
  },
  faqCategoryIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  faqCategoryTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.1,
  },
  faqItemCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
    overflow: "hidden",
  },
  faqItemCardExpanded: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  faqQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  faqQuestionNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  faqQuestionNumberText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 17,
    marginRight: 8,
  },
  faqAnswerContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  faqAnswerAccentBar: {
    width: 3,
    borderRadius: 2,
    marginRight: 10,
  },
  faqAnswerText: {
    flex: 1,
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
    lineHeight: 18,
  },
  faqBottomHintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginTop: 6,
  },
  faqBottomHintText: {
    flex: 1,
    fontSize: 11.5,
    color: "#1E40AF",
    fontWeight: "600",
    lineHeight: 16,
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