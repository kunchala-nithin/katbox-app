// orderconfirmationscreen.tsx
import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Easing,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Occasion Emoji Resolver Helper
const getOccasionEmoji = (occasionName: string) => {
  if (!occasionName) return "🎉";
  const occ = occasionName.toLowerCase();
  if (occ.includes("birthday")) return "🎂";
  if (occ.includes("puja") || occ.includes("pooja")) return "🪔";
  if (occ.includes("house") || occ.includes("warming")) return "🏠";
  if (occ.includes("corporate") || occ.includes("office")) return "🏢";
  if (occ.includes("wedding") || occ.includes("marriage")) return "💍";
  if (occ.includes("family") || occ.includes("gathering")) return "👨‍👩‍👧‍👦";
  if (occ.includes("kitty") || occ.includes("party")) return "🥂";
  if (occ.includes("farm") || occ.includes("resort")) return "🌿";
  if (occ.includes("workshop") || occ.includes("conference")) return "🛠️";
  return "🎉";
};

// Helper function to extract short day name and date number for the reference image tile UI
const parseDateParts = (dateStr: string) => {
  if (!dateStr) return { dayName: "MON", dayNumber: "17", fullString: dateStr };

  const cleanedStr = dateStr.includes("–") ? dateStr.split("–")[0].trim() : dateStr.trim();
  const parts = cleanedStr.replace(",", "").split(" ");

  if (parts.length >= 2) {
    const dayName = parts[0].substring(0, 3).toUpperCase();
    const dayNumber = parts[1];
    return { dayName, dayNumber, fullString: cleanedStr };
  }

  return { dayName: "DAY", dayNumber: "1", fullString: cleanedStr };
};

// ✅ Format an absolute Date into "4:30 PM"
const formatTimeShortLocal = (d: Date | null): string => {
  if (!d) return "";
  try {
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

// ✅ Format an absolute Date into "17 Sep"
const formatDateShortLocal = (d: Date | null): string => {
  if (!d) return "";
  try {
    const day = d.getDate();
    const month = d.toLocaleDateString("en-US", { month: "short" });
    return `${day} ${month}`;
  } catch {
    return "";
  }
};

// Heavy Ribbon & Confetti Particle Definitions (Matching luxury palette accents)
const PREMIUM_COLORS = [
  "#0F382A",
  "#107C41",
  "#D4AF37",
  "#2E7D32",
  "#E5ECE8",
  "#C49A2D",
  "#34D399",
  "#FAF8F5",
  "#052E16",
];

const HEAVY_BLAST_PARTICLES = Array.from({ length: 60 }).map((_, i) => {
  const angle = (i * 360) / 60 + (Math.random() * 20 - 10);
  const distance = Math.random() * (SCREEN_WIDTH * 0.95) + 60;
  const isRibbon = i % 2 === 0;
  return {
    id: i,
    angle,
    distance,
    color: PREMIUM_COLORS[i % PREMIUM_COLORS.length],
    width: isRibbon ? Math.random() * 8 + 14 : Math.random() * 5 + 6,
    height: isRibbon ? Math.random() * 4 + 6 : Math.random() * 5 + 6,
    borderRadius: isRibbon ? 2 : Math.random() > 0.5 ? 10 : 2,
    rotation: `${Math.floor(Math.random() * 360)}deg`,
    targetRotation: `${Math.floor(Math.random() * 1440 + 720)}deg`,
  };
});

export default function OrderConfirmationScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [dbOrder, setDbOrder] = useState<any>(null);

  const initialOrderId = (params.orderId as string) || "DW2405200001";

  // Fetch Order details directly from MongoDB via API
  useEffect(() => {
    let isMounted = true;

    const fetchOrderFromDb = async () => {
      if (!initialOrderId) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get(`/api/orders/${initialOrderId}`);
        if (res.data && res.data.success && isMounted) {
          setDbOrder(res.data.order);
        }
      } catch (err) {
        console.log("Order fetch error, falling back to params:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrderFromDb();

    return () => {
      isMounted = false;
    };
  }, [initialOrderId]);

  // Determine Service Flow dynamically.
  const serviceType = dbOrder?.serviceType || (params.serviceType as string) || "mealbox";
  const isQuickBitesFlow = serviceType === "quickbites";
  const isCateringFlow = serviceType === "catering";
  const isHomemadeFlow = serviceType === "homemade" || isQuickBitesFlow;
  // ✅ Advance-based services: catering & mealbox (require Cashfree advance)
  const isAdvanceBasedFlow = isCateringFlow || (!isHomemadeFlow && serviceType === "mealbox");

  // Dynamic fallback values if loading direct route params or MongoDB document
  const orderId = dbOrder?.orderId || initialOrderId;
  const restaurantName = dbOrder?.restaurantName || (params.restaurantName as string) || dbOrder?.chefName || (params.chefName as string) || "Premium Caterer";
  const chefName = dbOrder?.chefName || (params.chefName as string) || "Chef Partner";
  const occasion = dbOrder?.occasion || (params.occasion as string) || "Grand Celebration";
  const guests = dbOrder?.guests || Number(params.guests) || 50;
  const eventDate = dbOrder?.eventDate || dbOrder?.deliveryDate || (params.eventDate as string) || (params.deliveryDate as string) || "18 March";
  const eventTime = dbOrder?.eventTime || dbOrder?.deliveryTimeSlot || (params.eventTime as string) || (params.deliveryTimeSlot as string) || "08:30 PM";
  const deliveryType = dbOrder?.deliveryType || (params.deliveryType as string) || "Standard";
  const pricePerPlate = dbOrder?.pricePerPlate || Number(params.pricePerPlate) || 0;
  const addressDetails = dbOrder?.addressDetails || dbOrder?.deliveryAddress || (params.addressDetails as string) || "Address on File";

  const menuName = dbOrder?.menuName || (params.menuName as string) || (isCateringFlow ? "Royal Banquet Platter" : (isHomemadeFlow ? "Homemade Dishes Order" : "Classic Lunch"));
  const menuImage = (() => {
    if (dbOrder?.menuImage) return dbOrder.menuImage;
    if (dbOrder?.restaurantImage) return dbOrder.restaurantImage;
    const v = params.menuImage || params.restaurantImage;
    if (Array.isArray(v)) return v[0];
    return (
      (v as string) ||
      (isCateringFlow
        ? "https://images.unsplash.com/photo-1555244162-803834f70033?w=500&auto=format&fit=crop"
        : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop")
    );
  })();

  const rawDurationType = dbOrder?.durationType || (params.durationType as string) || "Flexible Days (2 Days Running)";

  // ✅ HOMEMADE / QUICKBITES ONLY: resolve the persisted delivery date & slot
  const homemadeDeliveryDateResolved = useMemo(() => {
    if (!isHomemadeFlow) return "";
    return String(
      dbOrder?.deliveryDate ||
      (params.deliveryDate as string) ||
      ""
    ).trim();
  }, [dbOrder, params.deliveryDate, isHomemadeFlow]);

  const homemadeDeliverySlotResolved = useMemo(() => {
    if (!isHomemadeFlow) return "";
    return String(
      dbOrder?.deliverySlot ||
      dbOrder?.deliveryTimeSlot ||
      (params.deliverySlot as string) ||
      (params.deliveryTimeSlot as string) ||
      ""
    ).trim();
  }, [dbOrder, params.deliverySlot, params.deliveryTimeSlot, isHomemadeFlow]);

  // ✅ Resolve the absolute estimated delivery time from the persisted order.
  const orderPlacedAtResolved: Date | null = useMemo(() => {
    const raw = dbOrder?.orderPlacedAt;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }, [dbOrder]);

  const estimatedDeliveryAtResolved: Date | null = useMemo(() => {
    const raw = dbOrder?.estimatedDeliveryAt;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }, [dbOrder]);

  // ✅ QuickBites detection
  const isQuickBitesOrder = Boolean(dbOrder?.isQuickBites) || isQuickBitesFlow;

  // ✅ Compute a friendly label for the estimated delivery time
  const estimatedDeliveryLabel = useMemo(() => {
    if (!estimatedDeliveryAtResolved) return "";
    const time = formatTimeShortLocal(estimatedDeliveryAtResolved);
    const date = formatDateShortLocal(orderPlacedAtResolved || new Date());
    if (isQuickBitesOrder) {
      return `Today by ${time} (within ${dbOrder?.deliveryWindowMinutes || 75} min incl. cooking & delivery)`;
    }
    return `By ${time} • ${date}`;
  }, [estimatedDeliveryAtResolved, orderPlacedAtResolved, isQuickBitesOrder, dbOrder]);

  const rawDeliveryDate = isCateringFlow
    ? eventDate
    : isHomemadeFlow
    ? (homemadeDeliveryDateResolved || "Today")
    : (dbOrder?.deliveryDate || (params.deliveryDate as string) || "Mon, 17 Jun");

  const totalAmount = dbOrder ? String(dbOrder.totalAmount) : ((params.totalAmount as string) || "687");
  const numericTotal = Number(totalAmount) || 0;

  // ✅ fallback ratio 45% to match Mealbox/Catering advance rule.
  const advancePaidAmount = dbOrder?.advancePaidAmount !== undefined ? dbOrder.advancePaidAmount : Math.round(numericTotal * 0.45 * 100) / 100;
  const balanceAmountToCollect = dbOrder?.balanceAmountToCollect !== undefined ? dbOrder.balanceAmountToCollect : Math.round((numericTotal - advancePaidAmount) * 100) / 100;

  // UTR number — COMMENTED OUT. Cashfree flow does not use UTRs.
  const utrNumber = dbOrder?.utrNumber || "";

  const subtotal = dbOrder ? dbOrder.subtotal : Number(params.subtotal) || Number(totalAmount);
  const deliveryPrice = dbOrder ? dbOrder.deliveryPrice : Number(params.deliveryPrice) || 0;
  const discount = dbOrder ? dbOrder.discount : Number(params.discount) || 0;
  const paymentMethod = dbOrder?.paymentMethod || (params.paymentMethod as string) || "cod";

  // ==================================================================
  // ✅ Resolve the current order status & payment status. These drive
  // the header subtitle and the "What's Next" timeline.
  //
  // ✅ REVISED: With the new auto-accept behaviour, Cashfree-paid orders
  // immediately land with orderStatus = "Accepted". The admin does not
  // need to intervene. COD orders remain "Placed" and wait for admin.
  // ==================================================================
  const currentOrderStatus = String(dbOrder?.orderStatus || "Placed");
  const currentPaymentStatus = String(dbOrder?.paymentStatus || "");
  const isAdminAccepted = Boolean(dbOrder?.adminAcceptedAt);

  // ✅ Whether the customer paid the FULL amount online at placement
  //    (this is true for Homemade/QuickBites online orders).
  const isFullAmountPaidOnline =
    isHomemadeFlow &&
    String(paymentMethod).toLowerCase() === "online" &&
    Number(advancePaidAmount) > 0 &&
    Number(balanceAmountToCollect) <= 0;

  // ✅ Whether an advance was paid online (Catering/Mealbox Cashfree)
  const isAdvancePaidOnline =
    isAdvanceBasedFlow &&
    Number(advancePaidAmount) > 0 &&
    (currentPaymentStatus.toLowerCase().includes("advance paid") ||
      currentOrderStatus.toLowerCase() === "accepted");

  // ✅ Whether this is a COD order still waiting for admin acceptance
  const isCodAwaitingAdmin =
    String(paymentMethod).toLowerCase() === "cod" && !isAdminAccepted;

  /* ─────────────────────────────────────────────────────────
     Defensive parsing for selections / items / addons.
     ───────────────────────────────────────────────────────── */
  const parsedSelections = useMemo(() => {
    const raw = dbOrder?.selections ?? params.selections;
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  }, [dbOrder, params.selections]);

  const parsedItems = useMemo(() => {
    const raw = dbOrder?.items ?? params.items;
    if (!raw) return [];
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return [];
    }
  }, [dbOrder, params.items]);

  const parsedAddons = useMemo(() => {
    const raw = dbOrder?.addons ?? params.addons;
    if (!raw) return [];
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return [];
    }
  }, [dbOrder, params.addons]);

  const isMealBoxFlow = serviceType === "mealbox" || (!isCateringFlow && !isHomemadeFlow && parsedSelections && !Array.isArray(parsedSelections));

  // Selected Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewActiveDay, setPreviewActiveDay] = useState<string>("");

  useEffect(() => {
    if (parsedSelections && typeof parsedSelections === "object" && !Array.isArray(parsedSelections)) {
      const keys = Object.keys(parsedSelections);
      if (keys.length > 0) {
        setPreviewActiveDay(keys[0]);
      }
    }
  }, [parsedSelections]);

  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const openSheet = () => {
    sheetAnim.setValue(SCREEN_HEIGHT);
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowPreviewModal(false);
    });
  };

  // Parse scheduled dates array dynamically for MealBox flows
  const scheduledDatesArray: string[] = useMemo(() => {
    if (isCateringFlow || isHomemadeFlow) return [];

    if (dbOrder?.upcomingDeliveries && Array.isArray(dbOrder.upcomingDeliveries) && dbOrder.upcomingDeliveries.length > 0) {
      return dbOrder.upcomingDeliveries;
    }

    const scheduledDatesListParam = params.scheduledDatesList || params.scheduledDatesFormatted || "";

    if (!scheduledDatesListParam) return [rawDeliveryDate];
    if (Array.isArray(scheduledDatesListParam)) return scheduledDatesListParam as string[];

    try {
      const parsed = JSON.parse(scheduledDatesListParam as string);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => {
          if (typeof item === "string") return item;
          if (item && item.dayName && item.dayNumber) {
            return `${item.dayName}, ${item.dayNumber} ${item.monthName || ""}`.trim();
          }
          return String(item);
        });
      }
    } catch (e) {
      if (typeof scheduledDatesListParam === "string" && scheduledDatesListParam.includes(",")) {
        return scheduledDatesListParam.split(",").map((s) => s.trim());
      }
    }
    return [rawDeliveryDate];
  }, [dbOrder, params.scheduledDatesList, params.scheduledDatesFormatted, rawDeliveryDate, isCateringFlow, isHomemadeFlow]);

  const isCod = String(paymentMethod).toLowerCase() === "cod";

  // ✅ Whether the order actually has an advance paid
  const hasAdvancePaid = Number(advancePaidAmount) > 0;

  // ✅ Whether the order is fully settled
  const isFullySettled =
    currentPaymentStatus.toLowerCase().includes("fully paid") ||
    currentOrderStatus.toLowerCase() === "completed";

  // ==================================================================
  // ✅ PAYMENT BADGE — single source of truth for the top-right badge
  // displayed on the summary card. Shows ONLY the payment state, never
  // the order status.
  //
  //   • Online + fully paid (HomeMade/QuickBites) → "Payment Settled"
  //   • Online + advance paid (Catering/Mealbox)  → "Advance Paid ₹X"
  //   • COD + before delivered                    → "COD ₹X"
  //   • COD + after delivered                     → "Cash Collected ₹X"
  // ==================================================================
  const paymentBadgeText = useMemo(() => {
    const paymentLower = String(paymentMethod).toLowerCase();
    const statusLower = currentOrderStatus.toLowerCase();

    if (paymentLower === "cod") {
      const isDelivered =
        statusLower === "delivered" ||
        statusLower === "completed" ||
        statusLower === "cash collected" ||
        currentPaymentStatus.toLowerCase().includes("fully paid") ||
        currentPaymentStatus.toLowerCase().includes("collected");
      if (isDelivered) {
        return `Cash Collected ₹${numericTotal}`;
      }
      return `COD ₹${numericTotal}`;
    }

    // Online payment
    if (isAdvanceBasedFlow && Number(balanceAmountToCollect) > 0) {
      return `Advance Paid ₹${advancePaidAmount}`;
    }
    return "Payment Settled";
  }, [
    paymentMethod,
    currentOrderStatus,
    currentPaymentStatus,
    isAdvanceBasedFlow,
    balanceAmountToCollect,
    advancePaidAmount,
    numericTotal,
  ]);

  // ✅ Determines the badge theme colour (green = settled, amber = pending)
  const paymentBadgeIsSettled = useMemo(() => {
    const paymentLower = String(paymentMethod).toLowerCase();
    const statusLower = currentOrderStatus.toLowerCase();
    if (paymentLower === "cod") {
      return (
        statusLower === "delivered" ||
        statusLower === "completed" ||
        statusLower === "cash collected" ||
        currentPaymentStatus.toLowerCase().includes("fully paid") ||
        currentPaymentStatus.toLowerCase().includes("collected")
      );
    }
    return true;
  }, [paymentMethod, currentOrderStatus, currentPaymentStatus]);

  // Dynamic Date Display Resolvers
  const confirmedFirstDeliveryDate = isCateringFlow
    ? `${eventDate} • ${eventTime}`
    : isHomemadeFlow
    ? (estimatedDeliveryLabel
        ? estimatedDeliveryLabel
        : (homemadeDeliveryDateResolved && homemadeDeliverySlotResolved
            ? `${homemadeDeliveryDateResolved} • ${homemadeDeliverySlotResolved}`
            : (homemadeDeliveryDateResolved
                ? homemadeDeliveryDateResolved
                : "Today (within 30–45 min)")))
    : (scheduledDatesArray.length > 0 ? scheduledDatesArray[0] : rawDeliveryDate);

  // Animated Values
  const checkmarkZoomAnim = useRef(new Animated.Value(1)).current;
  const screenBlastAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenBlastAnim, {
      toValue: 1,
      duration: 4000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const zoomPulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(checkmarkZoomAnim, {
          toValue: 1.25,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(checkmarkZoomAnim, {
          toValue: 1.0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { iterations: 3 }
    );

    zoomPulseLoop.start();

    return () => zoomPulseLoop.stop();
  }, []);

  const handleCopyPress = () => {};

  const getGroupedMealBoxItemsBySection = (items: any[]) => {
    const map: Record<string, any[]> = { STARTERS: [], MAINS: [], "ADD ON'S": [] };
    if (!Array.isArray(items)) return map;

    items.forEach((item) => {
      const sect = String(item.section || "").toUpperCase();
      if (sect.includes("STARTER")) map["STARTERS"].push(item);
      else if (sect.includes("ADDON") || sect.includes("ADD ON") || item.type === "addon") map["ADD ON'S"].push(item);
      else map["MAINS"].push(item);
    });
    return map;
  };

  const currentDaySelectionsArray =
    (parsedSelections && previewActiveDay && !Array.isArray(parsedSelections))
      ? parsedSelections[previewActiveDay] || []
      : [];
  const groupedPreviewDayItemsMap = getGroupedMealBoxItemsBySection(currentDaySelectionsArray);

  const handleNavigateToMyOrders = () => {
    router.push({
      pathname: "/(tabs)/Orders",
      params: {
        orderId,
        menuName,
        menuImage,
        deliveryDate: rawDeliveryDate,
        totalAmount,
        serviceType,
        scheduledDatesList: (isCateringFlow || isHomemadeFlow) ? undefined : JSON.stringify(scheduledDatesArray),
        selections: parsedSelections ? JSON.stringify(parsedSelections) : undefined,
        items: parsedItems ? JSON.stringify(parsedItems) : undefined,
        addons: parsedAddons ? JSON.stringify(parsedAddons) : undefined,
        deliverySlot: isHomemadeFlow ? (homemadeDeliverySlotResolved || undefined) : undefined,
        deliveryTimeSlot: isHomemadeFlow ? (homemadeDeliverySlotResolved || undefined) : undefined,
        isQuickBites: isQuickBitesFlow ? "true" : "false",
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.mainContainer, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#0F382A" />
        <Text style={{ marginTop: 12, fontSize: 13.5, color: "#5B756C", fontWeight: "700" }}>
          Loading order confirmation...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      {/* HEAVY FULL-SCREEN RIBBON & CONFETTI BLAST OVERLAY */}
      <View style={styles.fullScreenOverlayCanvas} pointerEvents="none">
        {HEAVY_BLAST_PARTICLES.map((particle) => {
          const rad = (particle.angle * Math.PI) / 180;

          const translateX = screenBlastAnim.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0, Math.cos(rad) * particle.distance, Math.cos(rad) * (particle.distance + 80)],
          });

          const translateY = screenBlastAnim.interpolate({
            inputRange: [0, 0.3, 1],
            outputRange: [0, Math.sin(rad) * particle.distance, Math.sin(rad) * particle.distance + 280],
          });

          const rotate = screenBlastAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [particle.rotation, particle.targetRotation],
          });

          const scale = screenBlastAnim.interpolate({
            inputRange: [0, 0.15, 0.85, 1],
            outputRange: [0, 1.4, 1, 0],
          });

          const opacity = screenBlastAnim.interpolate({
            inputRange: [0, 0.1, 0.8, 1],
            outputRange: [0, 1, 0.85, 0],
          });

          return (
            <Animated.View
              key={`heavy-ribbon-${particle.id}`}
              style={[
                styles.screenRibbonParticle,
                {
                  width: particle.width,
                  height: particle.height,
                  borderRadius: particle.borderRadius,
                  backgroundColor: particle.color,
                  top: insets.top + 80,
                  transform: [
                    { translateX },
                    { translateY },
                    { rotate },
                    { scale },
                  ],
                  opacity,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Clean Top Dark Forest Green Header Area */}
      <View style={[styles.topBannerBackground, { paddingTop: insets.top + 20 }]}>
        <View style={styles.checkmarkWrapperContainer}>
          <Animated.View
            style={[
              styles.checkmarkOuterCircle,
              { transform: [{ scale: checkmarkZoomAnim }] },
            ]}
          >
            <Ionicons name="checkmark" size={38} color="#FAF8F5" />
          </Animated.View>
        </View>

        <View style={{ alignItems: "center", width: "100%" }}>
          <Text style={styles.orderConfirmedTitle}>
            {isCateringFlow
              ? "Catering Order Confirmed!"
              : isQuickBitesFlow
              ? "Quick Bites Order Confirmed!"
              : isHomemadeFlow
              ? "Homemade Order Confirmed!"
              : "Order Confirmed!"}
          </Text>

          {/* ==================================================================
              ✅ HEADER SUBTITLE — Auto-accept aware
              ================================================================== */}
          {isAdvanceBasedFlow ? (
            <View style={styles.headerAdvanceBalanceBlock}>
              <Text style={styles.headerAdvanceLine}>
                ✓ Advance collected:{" "}
                <Text style={styles.headerAdvanceValue}>₹{advancePaidAmount}</Text>
              </Text>
              <Text style={styles.headerBalanceLine}>
                Balance payable on delivery:{" "}
                <Text style={styles.headerBalanceValue}>₹{balanceAmountToCollect}</Text>
              </Text>
              <Text style={styles.headerPaymentNote}>
                {isAdminAccepted
                  ? "✓ Order accepted. Chef is preparing your order."
                  : "Awaiting admin acceptance. You'll be notified once confirmed."}
              </Text>
            </View>
          ) : isFullAmountPaidOnline ? (
            <View style={styles.headerFullPaidBlock}>
              <Text style={styles.headerFullPaidLine}>
                ✓ Full amount paid:{" "}
                <Text style={styles.headerFullPaidValue}>₹{totalAmount}</Text>
              </Text>
              <Text style={styles.headerFullPaidNote}>
                {isAdminAccepted
                  ? "✓ Order accepted. Chef is preparing your order."
                  : "Awaiting admin acceptance. You'll be notified once confirmed."}
              </Text>
            </View>
          ) : (
            <Text style={styles.orderConfirmedSubtitle}>
              {isCod
                ? (hasAdvancePaid
                    ? `Advance (₹${advancePaidAmount}) paid successfully.\nPlease keep ₹${balanceAmountToCollect} ready for delivery.\n${isAdminAccepted ? "Order accepted by admin." : "Awaiting admin acceptance."}`
                    : `Pay ₹${balanceAmountToCollect} in cash upon delivery.\nNo online payment required right now.\n${isAdminAccepted ? "Order accepted by admin." : "Awaiting admin acceptance."}`)
                : `Yay! Your payment was successful and\nyour ${isCateringFlow ? "catering event booking" : (isHomemadeFlow ? "homemade order" : "order")} is confirmed.`}
            </Text>
          )}

          {/* Order ID & UTR Pill */}
          <View style={styles.orderIdBadgePill}>
            <Text style={styles.orderIdLabelText}>Order ID</Text>
            <Text style={styles.orderIdValueText}>{orderId}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCopyPress}
              style={{ marginLeft: 6 }}
            >
              <View>
                <Ionicons name="copy-outline" size={16} color="#D4AF37" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Content Scroll Area */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
      >
        <View>
          {/* ==================================================================
              1. DYNAMIC ORDER SUMMARY CARD
              ✅ REVISED: Payment badge is now rendered on the TOP-RIGHT
              of the primary summary card (Option A). The badge shows
              ONLY the payment state (Payment Settled / COD ₹X / Cash
              Collected ₹X / Advance Paid ₹X) — never the order status.
              ================================================================== */}
          {isHomemadeFlow ? (
            <View style={styles.cateringMainSummaryCard}>
              <View
                style={[
                  styles.paymentBadgeTopRight,
                  paymentBadgeIsSettled
                    ? styles.paymentBadgeTopRightSettled
                    : styles.paymentBadgeTopRightPending,
                ]}
              >
                <Ionicons
                  name={
                    paymentBadgeIsSettled
                      ? "checkmark-circle"
                      : String(paymentMethod).toLowerCase() === "cod"
                      ? "cash-outline"
                      : "time-outline"
                  }
                  size={12}
                  color={paymentBadgeIsSettled ? "#166348" : "#92400E"}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.paymentBadgeTopRightText,
                    paymentBadgeIsSettled
                      ? styles.paymentBadgeTopRightTextSettled
                      : styles.paymentBadgeTopRightTextPending,
                  ]}
                >
                  {paymentBadgeText}
                </Text>
              </View>

              <View style={[styles.cateringOccasionTopStrip, { backgroundColor: "rgba(22, 99, 72, 0.08)", borderColor: "rgba(22, 99, 72, 0.16)" }]}>
                <Ionicons name="restaurant" size={15} color="#166348" style={{ marginRight: 6 }} />
                <Text style={[styles.cateringOccasionText, { color: "#166348" }]}>
                  {isQuickBitesFlow ? "Fresh Quick Bites Dishes" : "Fresh Homemade Dishes"}
                </Text>
                <View style={[styles.cateringGuestPill, { backgroundColor: "#166348" }]}>
                  <Text style={[styles.cateringGuestPillText, { color: "#FAF8F5" }]}>{parsedItems.length} Dishes</Text>
                </View>
              </View>

              <View style={styles.homemadeChefBadgeRow}>
                <View style={styles.chefHatIconCircle}>
                  <MaterialCommunityIcons name="chef-hat" size={15} color="#FFFFFF" />
                </View>
                <Text style={styles.homemadeChefBadgeText}>Cooked by {chefName}</Text>
              </View>

              {/* HOMEMADE / QUICKBITES DELIVERY DATE & SLOT STRIP */}
              {(estimatedDeliveryAtResolved || homemadeDeliveryDateResolved || homemadeDeliverySlotResolved) ? (
                <View style={styles.homemadeConfirmedDeliveryStripContainer}>
                  {!!homemadeDeliveryDateResolved && (
                    <View style={styles.homemadeConfirmedDeliveryCell}>
                      <View style={styles.homemadeConfirmedDeliveryIconCircle}>
                        <Ionicons name="calendar-outline" size={13} color="#166348" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.homemadeConfirmedDeliveryLabel}>DELIVERY DATE</Text>
                        <Text style={styles.homemadeConfirmedDeliveryValue} numberOfLines={1}>
                          {homemadeDeliveryDateResolved}
                        </Text>
                      </View>
                    </View>
                  )}

                  {!!homemadeDeliveryDateResolved && !!(homemadeDeliverySlotResolved || estimatedDeliveryLabel) && (
                    <View style={styles.homemadeConfirmedDeliveryDivider} />
                  )}

                  {!!(homemadeDeliverySlotResolved || estimatedDeliveryLabel) && (
                    <View style={styles.homemadeConfirmedDeliveryCell}>
                      <View style={styles.homemadeConfirmedDeliveryIconCircle}>
                        <Ionicons name="time-outline" size={13} color="#166348" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.homemadeConfirmedDeliveryLabel}>DELIVERY SLOT</Text>
                        <Text style={styles.homemadeConfirmedDeliveryValue} numberOfLines={2}>
                          {estimatedDeliveryLabel || homemadeDeliverySlotResolved}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              <View style={styles.homemadeDishesContainer}>
                {parsedItems.map((dishItem: any, idx: number) => {
                  const isLastDish = idx === parsedItems.length - 1;
                  const itemTotal = (Number(dishItem.price) || 0) * (Number(dishItem.quantity) || 1);

                  return (
                    <View
                      key={`conf-dish-${idx}`}
                      style={[
                        styles.homemadePremiumCard,
                        !isLastDish && { marginBottom: 12 },
                      ]}
                    >
                      <View style={styles.homemadeThumbnailWrapper}>
                        <Image
                          source={{ uri: dishItem.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&auto=format&fit=crop" }}
                          style={styles.homemadeThumbnailImg}
                        />
                      </View>

                      <View style={styles.homemadeCardContentBlock}>
                        <View style={styles.dishTitlePriceRow}>
                          <Text style={styles.homemadeDishNameText} numberOfLines={2}>
                            {dishItem.name}
                          </Text>
                          <Text style={styles.homemadeDishPriceHighlight}>
                            ₹{itemTotal}
                          </Text>
                        </View>

                        <View style={styles.dishDetailsPortionRow}>
                          <View style={styles.servingPortionPill}>
                            <Ionicons name="layers-outline" size={11} color="#166348" style={{ marginRight: 4 }} />
                            <Text style={styles.servingPortionPillText} numberOfLines={1}>
                              {dishItem.selectedQtyConfig || "Standard Serving"}
                            </Text>
                          </View>

                          <View style={styles.quantityCountBadge}>
                            <Text style={styles.quantityCountBadgeLabel}>Qty:</Text>
                            <Text style={styles.quantityCountBadgeNumber}>{dishItem.quantity || 1}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.dashedDivider} />

              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Dishes Subtotal</Text>
                <Text style={styles.breakdownValueText}>₹{subtotal}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Delivery & Handling</Text>
                <Text style={[styles.breakdownValueText, deliveryPrice === 0 && { color: "#166348", fontWeight: "800" }]}>
                  {deliveryPrice === 0 ? "FREE" : `₹${deliveryPrice}`}
                </Text>
              </View>
              {discount > 0 && (
                <View style={styles.priceBreakdownRow}>
                  <Text style={styles.breakdownLabelText}>Coupon Discount</Text>
                  <Text style={[styles.breakdownValueText, { color: "#166348", fontWeight: "800" }]}>
                    -₹{discount}
                  </Text>
                </View>
              )}

              <View style={styles.solidDivider} />

              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>
                  {hasAdvancePaid ? "Paid Online (Full)" : "Paid Online"}
                </Text>
                <Text style={[styles.breakdownValueText, { color: "#166348" }]}>
                  ₹{hasAdvancePaid ? numericTotal : 0}
                </Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>
                  {hasAdvancePaid ? "Pay on Delivery" : "Pay on Delivery"}
                </Text>
                <Text style={styles.breakdownValueText}>
                  ₹{hasAdvancePaid ? 0 : numericTotal}
                </Text>
              </View>

              <View style={styles.solidDivider} />

              <View style={styles.totalPaidRow}>
                <Text style={styles.totalPaidLabelText}>Total Amount</Text>
                <Text style={styles.cateringTotalAmountText}>₹{totalAmount}</Text>
              </View>
            </View>
          ) : isCateringFlow ? (
            <View style={styles.cateringMainSummaryCard}>
              <View
                style={[
                  styles.paymentBadgeTopRight,
                  paymentBadgeIsSettled
                    ? styles.paymentBadgeTopRightSettled
                    : styles.paymentBadgeTopRightPending,
                ]}
              >
                <Ionicons
                  name={
                    paymentBadgeIsSettled
                      ? "checkmark-circle"
                      : "time-outline"
                  }
                  size={12}
                  color={paymentBadgeIsSettled ? "#166348" : "#92400E"}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.paymentBadgeTopRightText,
                    paymentBadgeIsSettled
                      ? styles.paymentBadgeTopRightTextSettled
                      : styles.paymentBadgeTopRightTextPending,
                  ]}
                >
                  {paymentBadgeText}
                </Text>
              </View>

              <View style={styles.cateringOccasionTopStrip}>
                <Text style={styles.cateringOccasionEmoji}>{getOccasionEmoji(occasion)}</Text>
                <Text style={styles.cateringOccasionText}>{occasion} Catering</Text>
                <View style={styles.cateringGuestPill}>
                  <Ionicons name="people" size={12} color="#0F382A" style={{ marginRight: 4 }} />
                  <Text style={styles.cateringGuestPillText}>{guests} Guests</Text>
                </View>
              </View>

              <View style={styles.cateringContentRow}>
                <Image source={{ uri: menuImage }} style={styles.cateringThumbImage} />
                <View style={{ flex: 1, marginLeft: 14, justifyContent: "center" }}>
                  <Text style={styles.cateringRestaurantTag}>👨‍🍳 {restaurantName}</Text>
                  <Text style={styles.cateringMenuTitle} numberOfLines={1}>{menuName}</Text>

                  <View style={styles.cateringMetaRow}>
                    <Ionicons name="calendar" size={13} color="#0F382A" />
                    <Text style={styles.cateringMetaTextHighlight}>
                      {eventDate} • {eventTime}
                    </Text>
                  </View>

                  <View style={styles.cateringMetaRow}>
                    <Ionicons name="location-outline" size={13} color="#5B756C" />
                    <Text style={styles.cateringMetaText} numberOfLines={1}>
                      {addressDetails}
                    </Text>
                  </View>

                  <View style={styles.cateringDeliveryBadge}>
                    <Text style={styles.cateringDeliveryBadgeText}>🚚 {deliveryType} Setup</Text>
                  </View>
                </View>
              </View>

              {(parsedSelections || parsedItems.length > 0 || parsedAddons.length > 0) && (
                <TouchableOpacity
                  style={styles.cateringViewMenuCTA}
                  activeOpacity={0.85}
                  onPress={() => {
                    setShowPreviewModal(true);
                    setTimeout(openSheet, 50);
                  }}
                >
                  <Ionicons name="restaurant-outline" size={15} color="#0F382A" style={{ marginRight: 6 }} />
                  <Text style={styles.cateringViewMenuCTAText}>View Confirmed Menu & Add-ons</Text>
                </TouchableOpacity>
              )}

              <View style={styles.dashedDivider} />

              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Price per plate</Text>
                <Text style={styles.breakdownValueText}>₹{pricePerPlate}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Guests</Text>
                <Text style={styles.breakdownValueText}>× {guests}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Platter Subtotal</Text>
                <Text style={styles.breakdownValueText}>₹{subtotal}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Delivery & Handling ({deliveryType})</Text>
                <Text style={[styles.breakdownValueText, deliveryPrice === 0 && { color: "#107C41", fontWeight: "800" }]}>
                  {deliveryPrice === 0 ? "FREE" : `₹${deliveryPrice}`}
                </Text>
              </View>

              {discount > 0 && (
                <View style={styles.priceBreakdownRow}>
                  <Text style={styles.breakdownLabelText}>Coupon Discount</Text>
                  <Text style={[styles.breakdownValueText, { color: "#0F382A", fontWeight: "800" }]}>
                    -₹{discount}
                  </Text>
                </View>
              )}

              <View style={styles.solidDivider} />

              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Advance Paid (45%)</Text>
                <Text style={[styles.breakdownValueText, { color: "#166538" }]}>₹{advancePaidAmount}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Balance to Collect upon Delivery (55%)</Text>
                <Text style={styles.breakdownValueText}>₹{balanceAmountToCollect}</Text>
              </View>

              <View style={styles.solidDivider} />

              <View style={styles.totalPaidRow}>
                <Text style={styles.totalPaidLabelText}>Total Amount</Text>
                <Text style={styles.cateringTotalAmountText}>₹{totalAmount}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.summaryCard}>
              <View
                style={[
                  styles.paymentBadgeTopRight,
                  paymentBadgeIsSettled
                    ? styles.paymentBadgeTopRightSettled
                    : styles.paymentBadgeTopRightPending,
                ]}
              >
                <Ionicons
                  name={
                    paymentBadgeIsSettled
                      ? "checkmark-circle"
                      : "time-outline"
                  }
                  size={12}
                  color={paymentBadgeIsSettled ? "#166348" : "#92400E"}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.paymentBadgeTopRightText,
                    paymentBadgeIsSettled
                      ? styles.paymentBadgeTopRightTextSettled
                      : styles.paymentBadgeTopRightTextPending,
                  ]}
                >
                  {paymentBadgeText}
                </Text>
              </View>

              <Text style={styles.cardHeaderTitle}>Order Summary</Text>

              <View style={styles.itemRowContainer}>
                <Image source={{ uri: menuImage }} style={styles.summaryItemImage} />
                <View style={{ flex: 1, marginLeft: 12, justifyContent: "center" }}>
                  <Text style={styles.summaryMenuTitle}>{menuName}</Text>
                  <Text style={styles.summaryMetaText}>{rawDurationType}</Text>
                  <Text style={styles.summaryMetaText}>Starts: {confirmedFirstDeliveryDate}</Text>
                </View>
                <Text style={styles.summaryPriceText}>₹{totalAmount}</Text>
              </View>

              {(parsedSelections || parsedItems.length > 0) && (
                <TouchableOpacity
                  style={styles.viewItemsContainer}
                  onPress={() => {
                    setShowPreviewModal(true);
                    setTimeout(openSheet, 50);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.viewItems}>View Selected Items</Text>
                </TouchableOpacity>
              )}

              <View style={styles.dashedDivider} />

              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Subtotal</Text>
                <Text style={styles.breakdownValueText}>₹{subtotal}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Delivery & Kitchen Charges</Text>
                <Text style={[styles.breakdownValueText, deliveryPrice === 0 && { color: "#107C41", fontWeight: "800" }]}>
                  {deliveryPrice === 0 ? "FREE" : `₹${deliveryPrice}`}
                </Text>
              </View>
              {discount > 0 && (
                <View style={styles.priceBreakdownRow}>
                  <Text style={styles.breakdownLabelText}>Coupon Discount</Text>
                  <Text style={[styles.breakdownValueText, { color: "#0F382A", fontWeight: "800" }]}>
                    -₹{discount}
                  </Text>
                </View>
              )}

              <View style={styles.solidDivider} />

              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Advance Paid (45%)</Text>
                <Text style={[styles.breakdownValueText, { color: "#166538" }]}>₹{advancePaidAmount}</Text>
              </View>
              <View style={styles.priceBreakdownRow}>
                <Text style={styles.breakdownLabelText}>Balance to Collect on Delivery (55%)</Text>
                <Text style={styles.breakdownValueText}>₹{balanceAmountToCollect}</Text>
              </View>

              <View style={styles.solidDivider} />

              <View style={styles.totalPaidRow}>
                <Text style={styles.totalPaidLabelText}>Total Amount</Text>
                <Text style={styles.totalPaidValueText}>₹{totalAmount}</Text>
              </View>
            </View>
          )}

          {/* 2. Upcoming Deliveries Section Card (MEALBOX FLOW EXCLUSIVE) */}
          {!isCateringFlow && !isHomemadeFlow && scheduledDatesArray.length > 0 && (
            <View style={styles.refUpcomingContainerCard}>
              <View style={styles.refUpcomingHeaderRow}>
                <Text style={styles.refUpcomingTitleText}>Upcoming Deliveries</Text>
                <TouchableOpacity style={styles.refManageAllBtn} activeOpacity={0.7} onPress={handleNavigateToMyOrders}>
                  <Text style={styles.refManageAllBtnText}>Manage All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.refDeliveriesListContainer}>
                {scheduledDatesArray.map((dateItem: string, idx: number) => {
                  const { dayName, dayNumber, fullString } = parseDateParts(dateItem);
                  return (
                    <View key={`conf-upcoming-item-${idx}`} style={styles.refDeliveryCardRow}>
                      <View style={styles.refDateTile}>
                        <View style={styles.refDateTileHeader}>
                          <Text style={styles.refDateTileHeaderText}>{dayName}</Text>
                        </View>
                        <View style={styles.refDateTileBody}>
                          <Text style={styles.refDateTileNumberText}>{dayNumber}</Text>
                        </View>
                      </View>

                      <View style={styles.refDeliveryInfoCol}>
                        <Text style={styles.refDeliveryDateTitle}>{fullString}</Text>
                        <Text style={styles.refDeliveryStatusSubtext}>Scheduled</Text>
                      </View>

                      <TouchableOpacity style={styles.refPauseBtn} activeOpacity={0.7}>
                        <Text style={styles.refPauseBtnText}>Pause</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <View style={styles.refControlCard}>
                <View style={styles.refControlIconBox}>
                  <Ionicons name="leaf-outline" size={20} color="#0F382A" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.refControlTitle}>You're in control!</Text>
                  <Text style={styles.refControlSubtitle}>
                    Change your schedule anytime. We're here to make healthy eating simple for you.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ==================================================================
              3. What's Next Tracker Card
              ✅ REVISED (Q6): The timeline is now exactly 5 delivery steps:
                 1. Accepted
                 2. Preparing
                 3. Prepared & Packing
                 4. Out for Delivery
                 5. Delivered
              The previous "Balance Collection & Feast" / "Payment Settled"
              step has been REMOVED from the delivery flow. Payment state
              is communicated ONLY through the top-right badge on the
              summary card.
              ================================================================== */}
          <View style={styles.whatsNextCard}>
            <View style={styles.whatsNextHeaderRow}>
              <Text style={styles.cardHeaderTitle}>What's Next?</Text>
              <View style={[styles.groceryBagIllustration, (isCateringFlow || isHomemadeFlow) && { backgroundColor: "rgba(15, 56, 42, 0.08)" }]}>
                {isCateringFlow ? (
                  <Ionicons name="restaurant" size={22} color="#0F382A" />
                ) : isHomemadeFlow ? (
                  <Ionicons name="fast-food-outline" size={22} color="#166348" />
                ) : (
                  <Ionicons name="bag-handle-outline" size={24} color="#0F382A" />
                )}
              </View>
            </View>

            <View style={styles.timelineContainer}>
              {/* STEP 1 — Accepted */}
              <View style={styles.timelineStepRow}>
                <View style={styles.timelineLeftColumn}>
                  <View style={isAdminAccepted ? styles.completedStepCircle : styles.currentStepCircle}>
                    {isAdminAccepted ? (
                      <Ionicons name="checkmark" size={13} color="#FAF8F5" />
                    ) : (
                      <Ionicons name="shield-checkmark-outline" size={14} color="#15803D" />
                    )}
                  </View>
                  <View style={isAdminAccepted ? styles.activeTimelineLine : styles.inactiveTimelineLine} />
                </View>
                <View style={styles.timelineContentRight}>
                  <Text style={isAdminAccepted ? styles.activeStepTitle : styles.currentStepTitle}>
                    {isAdminAccepted ? "Accepted" : "Awaiting Acceptance"}
                  </Text>
                  <Text style={styles.stepSubtitleText}>
                    {isAdminAccepted
                      ? (isAdvanceBasedFlow
                          ? `Advance ₹${advancePaidAmount} received • Balance ₹${balanceAmountToCollect} due on delivery`
                          : isFullAmountPaidOnline
                          ? `Full amount ₹${totalAmount} received — order confirmed and forwarded to the kitchen.`
                          : `Order accepted and forwarded to the kitchen.`)
                      : "Our team is reviewing your order. You'll be notified as soon as it's accepted."}
                  </Text>
                </View>
              </View>

              {/* STEP 2 — Preparing */}
              <View style={styles.timelineStepRow}>
                <View style={styles.timelineLeftColumn}>
                  <View style={styles.inactiveStepCircle}>
                    <MaterialCommunityIcons name="chef-hat" size={16} color="#9EA8A3" />
                  </View>
                  <View style={styles.inactiveTimelineLine} />
                </View>
                <View style={styles.timelineContentRight}>
                  <Text style={styles.inactiveStepTitle}>
                    Preparing
                  </Text>
                  <Text style={styles.stepSubtitleText}>
                    {isCateringFlow
                      ? "Fresh ingredients are sourced and kitchen staff prepares dishes right on schedule."
                      : (isHomemadeFlow ? `Chef ${chefName} will freshly prepare your dishes.` : "We will notify you once your meals are being prepared.")}
                  </Text>
                </View>
              </View>

              {/* STEP 3 — Prepared & Packing */}
              <View style={styles.timelineStepRow}>
                <View style={styles.timelineLeftColumn}>
                  <View style={styles.inactiveStepCircle}>
                    <Ionicons name="cube-outline" size={16} color="#9EA8A3" />
                  </View>
                  <View style={styles.inactiveTimelineLine} />
                </View>
                <View style={styles.timelineContentRight}>
                  <Text style={styles.inactiveStepTitle}>
                    Prepared & Packing
                  </Text>
                  <Text style={styles.stepSubtitleText}>
                    Your meal will be hygienically packed and sealed for delivery.
                  </Text>
                </View>
              </View>

              {/* STEP 4 — Out for Delivery */}
              <View style={styles.timelineStepRow}>
                <View style={styles.timelineLeftColumn}>
                  <View style={styles.inactiveStepCircle}>
                    <MaterialCommunityIcons name="truck-delivery-outline" size={16} color="#9EA8A3" />
                  </View>
                  <View style={styles.inactiveTimelineLine} />
                </View>
                <View style={styles.timelineContentRight}>
                  <Text style={styles.inactiveStepTitle}>
                    {isCateringFlow ? "Transport & Venue Setup" : "Out for Delivery"}
                  </Text>
                  <Text style={styles.stepSubtitleText}>
                    {isCateringFlow
                      ? `Our delivery crew arrives with warmers & food trays at ${addressDetails}.`
                      : `A delivery partner will bring your fresh food hot to ${addressDetails}.`}
                  </Text>
                </View>
              </View>

              {/* STEP 5 — Delivered */}
              <View style={styles.timelineStepRow}>
                <View style={styles.timelineLeftColumn}>
                  <View style={styles.inactiveStepCircle}>
                    <Ionicons name="checkmark-done-outline" size={16} color="#9EA8A3" />
                  </View>
                </View>
                <View style={styles.timelineContentRight}>
                  <Text style={styles.inactiveStepTitle}>
                    Delivered
                  </Text>
                  <Text style={styles.stepSubtitleText}>
                    Your order will be safely handed over. Enjoy your fresh meal!
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.viewOrdersButton}
            onPress={handleNavigateToMyOrders}
          >
            <Text style={styles.viewOrdersButtonText}>View My Orders</Text>
            <Feather name="arrow-right" size={18} color="#FAF8F5" style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.backHomeButton}
            onPress={() => router.dismissAll()}
          >
            <Ionicons name="home-outline" size={18} color="#0F382A" style={{ marginRight: 6 }} />
            <Text style={styles.backHomeButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Dynamic Selections Preview Modal */}
      <Modal
        visible={showPreviewModal}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSheet} />

          <Animated.View
            style={[
              styles.previewModalContent,
              {
                transform: [{ translateY: sheetAnim }],
                maxHeight: SCREEN_HEIGHT * 0.92,
                paddingBottom: Math.max(insets.bottom, 20) + 100,
              },
            ]}
          >
            <View style={styles.drawerHandle} />
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closeSheet} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color="#FAF8F5" />
            </TouchableOpacity>

            <View style={styles.previewHeaderRow}>
              <View>
                <Text style={[styles.previewTitle, { marginBottom: 2, fontSize: 20, color: "#0B261D" }]}>
                  Selections Summary
                </Text>
                <Text style={{ fontSize: 12.5, color: "#5B756C", marginLeft: 2, fontWeight: "500" }}>
                  {isCateringFlow
                    ? "Confirmed catering dishes & add-ons"
                    : (isHomemadeFlow ? "Confirmed homemade items" : "Inspecting confirmed choices")}
                </Text>
              </View>
            </View>

            {isMealBoxFlow && parsedSelections && !Array.isArray(parsedSelections) && (
              <View style={styles.pillTabsWrapperBlock}>
                {Object.keys(parsedSelections).map((dayKey) => {
                  const dayItemsCount = parsedSelections[dayKey]?.length || 0;
                  const isTabPillSelected = previewActiveDay === dayKey;
                  return (
                    <TouchableOpacity
                      key={`conf-tab-pill-${dayKey}`}
                      activeOpacity={0.85}
                      onPress={() => setPreviewActiveDay(dayKey)}
                      style={[
                        styles.tabPillContainerItem,
                        isTabPillSelected
                          ? styles.tabPillContainerItemActive
                          : styles.tabPillContainerItemInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabPillTextString,
                          isTabPillSelected
                            ? styles.tabPillTextStringActive
                            : styles.tabPillTextStringInactive,
                        ]}
                      >
                        {dayKey}
                      </Text>
                      <View
                        style={[
                          styles.tabPillCounterBadgeGlow,
                          isTabPillSelected
                            ? styles.tabPillCounterBadgeGlowActive
                            : styles.tabPillCounterBadgeGlowInactive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabPillCounterBadgeText,
                            isTabPillSelected
                              ? styles.tabPillCounterBadgeTextActive
                              : styles.tabPillCounterBadgeTextInactive,
                          ]}
                        >
                          {dayItemsCount}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <ScrollView
              style={{ width: "100%", flex: 1 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {isCateringFlow ? (
                <>
                  {Array.isArray(parsedSelections) &&
                    parsedSelections.map((cat: any, index: number) => {
                      const allSelected = [
                        ...(cat.selected || []),
                        ...(cat.extraSelected || []),
                      ];
                      if (!allSelected.length) return null;

                      return (
                        <View key={`conf-cat-${index}`} style={styles.previewCategoryCard}>
                          <View style={styles.previewCategoryHeader}>
                            <Text style={styles.previewCategoryTitle}>{cat.category}</Text>
                          </View>

                          {allSelected.map((item: any, i: number) => {
                            const isExtra = cat.max ? i >= cat.max : false;
                            return (
                              <View key={`conf-cat-item-${i}`} style={styles.previewItemCard}>
                                <Image
                                  source={{ uri: item.imageUrl || item.image || "https://images.unsplash.com/photo-1544025162-d76694265947?w=120&auto=format&fit=crop" }}
                                  style={styles.previewItemImage}
                                />
                                <Text style={styles.previewItemName}>{item.name}</Text>
                                {isExtra && (
                                  <View style={styles.extraTag}>
                                    <Text style={styles.extraTagText}>+₹{item.price || 0}/plate</Text>
                                  </View>
                                )}
                                <Ionicons
                                  name="checkmark-circle"
                                  size={17}
                                  color={isExtra ? "#0F382A" : "#107C41"}
                                  style={{ marginLeft: "auto" }}
                                />
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}

                  {parsedAddons && parsedAddons.length > 0 && (
                    <View style={styles.previewCategoryCard}>
                      <View style={styles.previewCategoryHeader}>
                        <Text style={styles.previewCategoryTitle}>Add-ons</Text>
                      </View>
                      {parsedAddons.map((addon: any, idx: number) => (
                        <View key={`conf-addon-item-${idx}`} style={styles.previewItemCard}>
                          <Image
                            source={{ uri: addon.imageUrl || addon.image || "https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=120&auto=format&fit=crop" }}
                            style={styles.previewItemImage}
                          />
                          <Text style={styles.previewItemName}>
                            {addon.name} × {addon.count}
                          </Text>
                          <View style={styles.extraTag}>
                            <Text style={styles.extraTagText}>+₹{addon.price * addon.count}/plate</Text>
                          </View>
                          <Ionicons
                            name="checkmark-circle"
                            size={17}
                            color="#107C41"
                            style={{ marginLeft: "auto" }}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : isHomemadeFlow ? (
                <View style={styles.previewCategoryCard}>
                  <View style={styles.previewCategoryHeader}>
                    <Text style={styles.previewCategoryTitle}>Confirmed Items ({parsedItems.length})</Text>
                  </View>
                  {parsedItems.map((dishItem: any, idx: number) => (
                    <View key={`conf-homemade-modal-item-${idx}`} style={styles.previewItemCard}>
                      <Image
                        source={{ uri: dishItem.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop" }}
                        style={styles.previewItemImage}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewItemName}>{dishItem.name}</Text>
                        <Text style={styles.servingPortionPillText}>
                          {dishItem.selectedQtyConfig || "Standard"} • Qty: {dishItem.quantity || 1}
                        </Text>
                      </View>
                      <Text style={styles.homemadeDishPriceHighlight}>
                        ₹{(Number(dishItem.price) || 0) * (Number(dishItem.quantity) || 1)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : isMealBoxFlow && parsedSelections && !Array.isArray(parsedSelections) ? (
                <View style={styles.premiumMealBoxContentCardFrame}>
                  <View style={styles.subCardHeaderStripLabel}>
                    <Text style={styles.subCardHeaderStripLabelText}>
                      {previewActiveDay} MENU PREFERENCE
                    </Text>
                  </View>

                  {currentDaySelectionsArray.length === 0 ? (
                    <Text
                      style={{
                        textAlign: "center",
                        color: "#5B756C",
                        fontStyle: "italic",
                        paddingVertical: 30,
                      }}
                    >
                      No items configured for this weekday.
                    </Text>
                  ) : (
                    Object.entries(groupedPreviewDayItemsMap).map(([sectionTitle, dishesGroupArray]) => {
                      if (!dishesGroupArray || dishesGroupArray.length === 0) return null;
                      return (
                        <View key={`conf-preview-section-${sectionTitle}`} style={{ marginTop: 14 }}>
                          <View style={styles.sectionHeaderLabelContainerTag}>
                            <Text style={styles.sectionHeaderLabelContainerTagText}>{sectionTitle}</Text>
                          </View>

                          {dishesGroupArray.map((dishItem: any, idx: number) => {
                            const isExtraItemAddon = sectionTitle === "ADD ON'S" || dishItem.type === "addon";
                            return (
                              <View
                                key={`conf-dish-item-${idx}`}
                                style={styles.previewSelectionRowItemBlock}
                              >
                                <Image
                                  source={{
                                    uri: dishItem.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop",
                                  }}
                                  style={styles.modalCircularFoodThumbGraphic}
                                />
                                <View style={{ flex: 1, paddingLeft: 12 }}>
                                  <Text style={styles.modalItemNameTextString}>{dishItem.name}</Text>
                                </View>
                                <View
                                  style={[
                                    styles.includedBadgePillBox,
                                    isExtraItemAddon
                                      ? styles.includedBadgePillBoxExtra
                                      : styles.includedBadgePillBoxStandard,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.includedBadgePillBoxText,
                                      isExtraItemAddon
                                        ? styles.includedBadgePillBoxTextExtra
                                        : styles.includedBadgePillBoxTextStandard,
                                    ]}
                                  >
                                    {isExtraItemAddon
                                      ? `Extra ×${dishItem.qty || dishItem.quantity || 1}`
                                      : "Included"}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : (
                parsedItems.map((item: any, idx: number) => (
                  <View key={`conf-item-${idx}`} style={styles.previewSelectionRowItemBlock}>
                    <Image
                      source={{
                        uri: item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop",
                      }}
                      style={styles.modalCircularFoodThumbGraphic}
                    />
                    <View style={{ flex: 1, paddingLeft: 12 }}>
                      <Text style={styles.modalItemNameTextString}>{item.name}</Text>
                    </View>
                    <View style={styles.includedBadgePillBoxStandard}>
                      <Text style={styles.includedBadgePillBoxTextStandard}>
                        Qty: {item.quantity || 1}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalAbsoluteFooterCTAWrapper}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={closeSheet}
                style={styles.modalAbsoluteFooterCTAButtonSolid}
              >
                <Text style={styles.modalAbsoluteFooterCTAButtonSolidText}>
                  Close Summary
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#FAF8F5",
  },
  fullScreenOverlayCanvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  screenRibbonParticle: {
    position: "absolute",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  topBannerBackground: {
    backgroundColor: "#0F382A",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 32,
    position: "relative",
  },
  checkmarkWrapperContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  checkmarkOuterCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  orderConfirmedTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FAF8F5",
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: "center",
    width: "100%",
    alignSelf: "center",
  },
  orderConfirmedSubtitle: {
    fontSize: 13,
    color: "#E5ECE8",
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "500",
    marginBottom: 18,
  },
  /* ✅ Advance / Balance header block — Catering & Mealbox */
  headerAdvanceBalanceBlock: {
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(250, 248, 245, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(250, 248, 245, 0.15)",
    alignSelf: "stretch",
  },
  headerAdvanceLine: {
    fontSize: 13,
    fontWeight: "700",
    color: "#A7F3D0",
    textAlign: "center",
    marginBottom: 4,
  },
  headerAdvanceValue: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  headerBalanceLine: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FDE68A",
    textAlign: "center",
    marginBottom: 6,
  },
  headerBalanceValue: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  headerPaymentNote: {
    fontSize: 11.5,
    color: "#D1FAE5",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 15,
    fontStyle: "italic",
  },
  /* ✅ Full-payment header block — Homemade/QuickBites online */
  headerFullPaidBlock: {
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(16, 124, 65, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(167, 243, 208, 0.35)",
    alignSelf: "stretch",
  },
  headerFullPaidLine: {
    fontSize: 14,
    fontWeight: "800",
    color: "#A7F3D0",
    textAlign: "center",
    marginBottom: 6,
  },
  headerFullPaidValue: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  headerFullPaidNote: {
    fontSize: 11.5,
    color: "#D1FAE5",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 15,
    fontStyle: "italic",
  },
  orderIdBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(250, 248, 245, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.4)",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  orderIdLabelText: {
    fontSize: 13,
    color: "#D4AF37",
    fontWeight: "800",
    marginRight: 10,
    letterSpacing: 0.4,
  },
  orderIdValueText: {
    fontSize: 14.5,
    color: "#FAF8F5",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  /* ✅ PAYMENT BADGE — Merged on the top-right of the summary card */
  paymentBadgeTopRight: {
    position: "absolute",
    top: -1,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    zIndex: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  paymentBadgeTopRightSettled: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  paymentBadgeTopRightPending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  paymentBadgeTopRightText: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  paymentBadgeTopRightTextSettled: {
    color: "#166348",
  },
  paymentBadgeTopRightTextPending: {
    color: "#92400E",
  },

  /* Dedicated Premium Catering Card Styling */
  cateringMainSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    paddingTop: 26,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 4,
    position: "relative",
    overflow: "hidden",
  },
  cateringOccasionTopStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  cateringOccasionEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  cateringOccasionText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F382A",
    flex: 1,
    letterSpacing: 0.2,
  },
  cateringGuestPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  cateringGuestPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F382A",
  },
  cateringContentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: 14,
  },
  cateringThumbImage: {
    width: 86,
    height: 86,
    borderRadius: 18,
    backgroundColor: "#E5ECE8",
  },
  cateringRestaurantTag: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F382A",
    marginBottom: 2,
  },
  cateringMenuTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0B261D",
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  cateringMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  cateringMetaTextHighlight: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0B261D",
    marginLeft: 6,
  },
  cateringMetaText: {
    fontSize: 12,
    color: "#5B756C",
    marginLeft: 6,
    fontWeight: "500",
  },
  cateringDeliveryBadge: {
    marginTop: 6,
    backgroundColor: "#FAF8F5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  cateringDeliveryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0B261D",
  },
  cateringViewMenuCTA: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  cateringViewMenuCTAText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F382A",
  },
  cateringTotalAmountText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F382A",
    letterSpacing: -0.5,
  },

  /* Homemade / QuickBites Header & Chef Badge */
  homemadeChefBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 2,
    gap: 8,
  },
  chefHatIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#166348",
    alignItems: "center",
    justifyContent: "center",
  },
  homemadeChefBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0B261D",
  },

  /* HOMEMADE / QUICKBITES CONFIRMED DELIVERY DATE & SLOT STRIP */
  homemadeConfirmedDeliveryStripContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2FBF4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  homemadeConfirmedDeliveryCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  homemadeConfirmedDeliveryIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(22, 101, 52, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  homemadeConfirmedDeliveryLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#5B756C",
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  homemadeConfirmedDeliveryValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  homemadeConfirmedDeliveryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(22, 101, 52, 0.15)",
    marginHorizontal: 10,
  },

  /* Premium Clean User-Friendly Dishes Container */
  homemadeDishesContainer: {
    marginVertical: 4,
  },
  homemadePremiumCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF8F5",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(22, 99, 72, 0.12)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
  },
  homemadeThumbnailWrapper: {
    position: "relative",
  },
  homemadeThumbnailImg: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: "#E5ECE8",
  },
  homemadeCardContentBlock: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  dishTitlePriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  homemadeDishNameText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  homemadeDishPriceHighlight: {
    fontSize: 15.5,
    fontWeight: "900",
    color: "#166348",
    letterSpacing: -0.2,
  },
  dishDetailsPortionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  servingPortionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 99, 72, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "rgba(22, 99, 72, 0.16)",
    flexShrink: 1,
    marginRight: 6,
  },
  servingPortionPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166348",
  },
  quantityCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quantityCountBadgeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginRight: 4,
  },
  quantityCountBadgeNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0B261D",
  },

  /* Standard Summary Card */
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    paddingTop: 26,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
    position: "relative",
    overflow: "hidden",
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B261D",
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  itemRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  summaryItemImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#E5ECE8",
  },
  summaryMenuTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B261D",
    marginBottom: 4,
  },
  summaryMetaText: {
    fontSize: 12,
    color: "#5B756C",
    fontWeight: "500",
    marginBottom: 2,
  },
  summaryPriceText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B261D",
  },
  viewItemsContainer: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  viewItems: {
    color: "#0F382A",
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingVertical: 12,
    fontSize: 13
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
    borderStyle: "dashed",
    marginVertical: 14,
  },
  priceBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  breakdownLabelText: {
    fontSize: 13,
    color: "#5B756C",
    fontWeight: "500",
  },
  breakdownValueText: {
    fontSize: 13,
    color: "#0B261D",
    fontWeight: "700",
  },
  solidDivider: {
    height: 1,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    marginVertical: 12,
  },
  totalPaidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalPaidLabelText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B261D",
  },
  totalPaidValueText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F382A",
  },

  /* Reference Image Style Upcoming Deliveries Container */
  refUpcomingContainerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  refUpcomingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  refUpcomingTitleText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  refManageAllBtn: {
    backgroundColor: "#166534",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  refManageAllBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FAF8F5",
  },
  refDeliveriesListContainer: {
    gap: 10,
  },
  refDeliveryCardRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    borderRadius: 16,
    padding: 10,
    backgroundColor: "#FFFFFF",
  },
  refDateTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FAF8F5",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    overflow: "hidden",
    alignItems: "center",
  },
  refDateTileHeader: {
    width: "100%",
    backgroundColor: "#0F382A",
    paddingVertical: 2,
    alignItems: "center",
  },
  refDateTileHeaderText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FAF8F5",
  },
  refDateTileBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  refDateTileNumberText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B261D",
  },
  refDeliveryInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  refDeliveryDateTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0B261D",
  },
  refDeliveryStatusSubtext: {
    fontSize: 12,
    color: "#5B756C",
    marginTop: 2,
    fontWeight: "500",
  },
  refPauseBtn: {
    backgroundColor: "#166534",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  refPauseBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FAF8F5",
  },
  refControlCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF8F5",
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  refControlIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  refControlTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B261D",
  },
  refControlSubtitle: {
    fontSize: 11,
    color: "#5B756C",
    marginTop: 2,
    lineHeight: 15,
    fontWeight: "500",
  },

  /* What's Next Tracker */
  whatsNextCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  whatsNextHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groceryBagIllustration: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineContainer: {
    marginTop: 8,
  },
  timelineStepRow: {
    flexDirection: "row",
  },
  timelineLeftColumn: {
    alignItems: "center",
    width: 32,
  },
  completedStepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
  },
  activeTimelineLine: {
    width: 2,
    height: 32,
    backgroundColor: "#15803D",
    marginVertical: 2,
  },
  currentStepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(21, 128, 61, 0.12)",
    borderWidth: 1.5,
    borderColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveStepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FAF8F5",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveTimelineLine: {
    width: 2,
    height: 36,
    backgroundColor: "rgba(15, 56, 42, 0.12)",
    marginVertical: 2,
  },
  timelineContentRight: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
  },
  activeStepTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F382A",
  },
  stepTimestampText: {
    fontSize: 12,
    color: "#5B756C",
    marginTop: 2,
    fontWeight: "500",
  },
  currentStepTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0B261D",
  },
  stepSubtitleText: {
    fontSize: 12,
    color: "#5B756C",
    marginTop: 2,
    fontWeight: "500",
    lineHeight: 16,
  },
  inactiveStepTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5B756C",
  },

  /* Action Buttons */
  viewOrdersButton: {
    backgroundColor: "#15803D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: "#15803D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  viewOrdersButtonText: {
    color: "#FAF8F5",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  backHomeButton: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  backHomeButtonText: {
    color: "#0F382A",
    fontSize: 15,
    fontWeight: "800",
  },

  /* Selections Preview Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11, 38, 29, 0.45)",
    justifyContent: "flex-end",
  },
  previewModalContent: {
    width: "100%",
    backgroundColor: "#FAF8F5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  drawerHandle: { width: 40, height: 4.5, backgroundColor: "rgba(15, 56, 42, 0.15)", borderRadius: 2.5, alignSelf: "center", marginBottom: 16 },
  previewCloseBtn: {
    position: "absolute",
    top: -22,
    alignSelf: "center",
    backgroundColor: "#166534",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  previewHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  previewTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0B261D",
    marginBottom: 14,
    marginLeft: 2,
    letterSpacing: -0.3,
  },
  pillTabsWrapperBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    padding: 4,
    borderRadius: 18,
    marginBottom: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  tabPillContainerItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 14,
    gap: 6,
  },
  tabPillContainerItemActive: {
    backgroundColor: "#166534",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  tabPillContainerItemInactive: {
    backgroundColor: "transparent",
  },
  tabPillTextString: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  tabPillTextStringActive: {
    color: "#FAF8F5",
    fontWeight: "800",
  },
  tabPillTextStringInactive: {
    color: "#4F6B61",
  },
  tabPillCounterBadgeGlow: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillCounterBadgeGlowActive: {
    backgroundColor: "rgba(250, 248, 245, 0.25)",
  },
  tabPillCounterBadgeGlowInactive: {
    backgroundColor: "#FAF8F5",
  },
  tabPillCounterBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  tabPillCounterBadgeTextActive: {
    color: "#FAF8F5",
  },
  tabPillCounterBadgeTextInactive: {
    color: "#0F382A",
  },
  premiumMealBoxContentCardFrame: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    padding: 16,
    marginBottom: 80,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  subCardHeaderStripLabel: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 56, 42, 0.06)",
    paddingBottom: 10,
    marginBottom: 6,
  },
  subCardHeaderStripLabelText: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#0F382A",
    letterSpacing: 0.4,
  },
  sectionHeaderLabelContainerTag: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F382A",
    letterSpacing: 0.3,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  sectionHeaderLabelContainerTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F382A",
    letterSpacing: 0.3,
  },
  previewSelectionRowItemBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 56, 42, 0.05)",
  },
  modalCircularFoodThumbGraphic: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#E5ECE8",
  },
  modalItemNameTextString: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B261D",
  },
  includedBadgePillBox: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  includedBadgePillBoxStandard: {
    backgroundColor: "rgba(16, 124, 65, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(16, 124, 65, 0.15)",
  },
  includedBadgePillBoxExtra: {
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.15)",
  },
  includedBadgePillBoxText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  includedBadgePillBoxTextStandard: {
    color: "#107C41",
  },
  includedBadgePillBoxTextExtra: {
    color: "#0F382A",
  },
  previewCategoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  previewCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  previewCategoryTitle: { fontSize: 14.5, fontWeight: "800", color: "#0B261D", letterSpacing: -0.2 },
  previewItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF8F5",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.06)",
  },
  previewItemImage: { width: 40, height: 40, borderRadius: 10, marginRight: 12, backgroundColor: "#E5ECE8" },
  previewItemName: { fontSize: 13.5, fontWeight: "700", color: "#0B261D", flex: 1 },
  extraTag: { backgroundColor: "rgba(15, 56, 42, 0.08)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.12)" },
  extraTagText: { fontSize: 10.5, fontWeight: "800", color: "#0F382A" },
  modalAbsoluteFooterCTAWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 99,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 56, 42, 0.08)",
  },
  modalAbsoluteFooterCTAButtonSolid: {
    backgroundColor: "#166534",
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  modalAbsoluteFooterCTAButtonSolidText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});