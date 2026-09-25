import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Animated,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Easing,
  TextInput,
  Share,
  RefreshControl,
  Linking,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Ionicons,
  Octicons,
  MaterialCommunityIcons,
  Feather,
} from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import api from "@/src/lib/api";
import { socket } from "@/src/lib/socket";
import { getUser } from "@/src/lib/authStorage";

const BOTTOM_TAB_BAR_HEIGHT = 60;

// ✅ Static customer support phone number used by the Support card.
const SUPPORT_PHONE_NUMBER = "+919133450555";
const SUPPORT_PHONE_DISPLAY = "+91-9133450555";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTHS_MAP: { [key: string]: number } = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

// ✅ NEW HELPER — Normalizes the service type so QuickBites is treated
// as a sibling of Homemade everywhere in this screen. This mirrors the
// backend behaviour where both serviceTypes share the same schema but
// use different discriminators.
const isHomemadeService = (sType?: string): boolean => {
  const t = String(sType || "").toLowerCase();
  return t === "homemade" || t === "quickbites";
};

const getOccasionIcon = (occasionName: string): keyof typeof Ionicons.glyphMap => {
  if (!occasionName) return "sparkles-outline";
  const occ = occasionName.toLowerCase();
  if (occ.includes("birthday")) return "gift-outline";
  if (occ.includes("puja") || occ.includes("pooja")) return "flame-outline";
  if (occ.includes("house") || occ.includes("warming")) return "home-outline";
  if (occ.includes("corporate") || occ.includes("office")) return "business-outline";
  if (occ.includes("wedding") || occ.includes("marriage")) return "heart-outline";
  if (occ.includes("family") || occ.includes("gathering")) return "people-outline";
  if (occ.includes("kitty") || occ.includes("party")) return "wine-outline";
  if (occ.includes("farm") || occ.includes("resort")) return "leaf-outline";
  if (occ.includes("workshop") || occ.includes("conference")) return "briefcase-outline";
  return "sparkles-outline";
};

const parseDateParts = (dateStr: string) => {
  if (!dateStr) return { dayName: "MON", dayNumber: "17", month: "JUN", fullString: "Mon, 17 Jun" };

  const cleanedStr = dateStr.includes("–") ? dateStr.split("–")[0].trim() : dateStr.trim();
  const parts = cleanedStr.replace(",", "").split(" ");

  if (parts.length >= 2) {
    const dayName = parts[0].substring(0, 3).toUpperCase();
    const dayNumber = parts[1];
    const month = parts[2] ? parts[2].substring(0, 3).toUpperCase() : "JUN";
    return { dayName, dayNumber, month, fullString: cleanedStr };
  }

  return { dayName: "DAY", dayNumber: "1", month: "JUN", fullString: cleanedStr };
};

const sortDatesAscending = (dates: string[]) => {
  if (!Array.isArray(dates) || dates.length <= 1) return dates;
  return [...dates].sort((a, b) => {
    const pA = parseDateParts(a);
    const pB = parseDateParts(b);
    const monthA = MONTHS_MAP[pA.month.toUpperCase()] ?? 0;
    const monthB = MONTHS_MAP[pB.month.toUpperCase()] ?? 0;
    const numA = parseInt(pA.dayNumber, 10) || 0;
    const numB = parseInt(pB.dayNumber, 10) || 0;
    if (monthA !== monthB) return monthA - monthB;
    return numA - numB;
  });
};

const generateFutureDateOptions = () => {
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const dayNumber = d.getDate();
    const monthName = d.toLocaleDateString("en-US", { month: "short" });
    dates.push(`${dayName}, ${dayNumber} ${monthName}`);
  }
  return dates;
};

const resolveEffectiveDeliveryTime = (order: any): string | undefined => {
  if (!order) return undefined;

  if (order.estimatedDeliveryAt) {
    const ms = new Date(order.estimatedDeliveryAt).getTime();
    if (Number.isFinite(ms)) return order.estimatedDeliveryAt;
  }

  const sType = (order.serviceType || "").toLowerCase();
  // ✅ Also treat quickbites as homemade for the estimated-time fallback.
  if ((sType === "homemade" || sType === "quickbites") && order.createdAt) {
    const windowMin = Number(order.deliveryWindowMinutes) || 55;
    const createdMs = new Date(order.createdAt).getTime();
    if (Number.isFinite(createdMs)) {
      return new Date(createdMs + windowMin * 60 * 1000).toISOString();
    }
  }

  return undefined;
};

// ==================================================================
// ✅ NEW SHARED HELPER — Determine whether an order is TRULY fully
// settled (i.e., the FULL amount has been collected — not just the
// 45% advance). This is used to drive the payment badge on the card
// and to decide whether the stepper should be considered complete.
//
// Business rules:
//   • Mealbox/Catering (advance-based):
//       fully settled only when balanceAmountToCollect <= 0 AND
//       paymentStatus contains "Fully Paid"/"Balance Collected".
//       A verified advance ALONE must NOT flip this to true.
//   • Homemade/QuickBites:
//       - ONLINE: full amount captured → fully settled.
//       - COD: settled only after status becomes Delivered/Completed/
//         Cash Collected.
// ==================================================================
const computeIsFullySettled = (order: any): boolean => {
  if (!order) return false;

  const pStatus = String(order.paymentStatus || "").toLowerCase().trim();
  const oStatus = String(order.orderStatus || "").toLowerCase().trim();
  const serviceType = String(order.serviceType || "").toLowerCase();
  const advAmt = Number(order.advancePaidAmount || 0);
  const balAmt = Number(order.balanceAmountToCollect || 0);
  const total = Number(order.totalAmount || 0);

  const isHomemadeLike =
    serviceType === "homemade" || serviceType === "quickbites";
  const isAdvanceBased =
    serviceType === "catering" || serviceType === "mealbox";

  const isFullyPaidStatus =
    pStatus.includes("fully paid") ||
    pStatus.includes("balance collected");

  const isFullyPaidOrderStatus =
    oStatus === "completed" ||
    oStatus.includes("cash collected") ||
    oStatus.includes("amount collected") ||
    oStatus === "delivered";

  const isHomemadeOnlineFullyPaid =
    isHomemadeLike &&
    advAmt > 0 &&
    balAmt <= 0 &&
    Math.abs(advAmt - total) < 0.01;

  const isBalanceCleared =
    isAdvanceBased &&
    balAmt <= 0 &&
    (pStatus.includes("fully paid") || pStatus.includes("balance collected"));

  return (
    isFullyPaidStatus ||
    isFullyPaidOrderStatus ||
    isHomemadeOnlineFullyPaid ||
    isBalanceCleared
  );
};

function DeliverySlotCountdownWidget({
  deliveryDate,
  timeSlot,
  isDelivered,
  isHomemade = false,
  estimatedDeliveryAt,
}: {
  deliveryDate: string;
  timeSlot: string;
  isDelivered: boolean;
  isHomemade?: boolean;
  estimatedDeliveryAt?: string;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(isHomemade ? 55 * 60 : 0);

  const tickAnim = useRef(new Animated.Value(0)).current;
  const tickLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isDelivered) return;
    tickLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(tickAnim, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tickAnim, {
          toValue: 0,
          duration: 120,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(760),
      ])
    );
    tickLoopRef.current.start();
    return () => {
      tickLoopRef.current?.stop();
    };
  }, [isDelivered, tickAnim]);

  const clockRotation = tickAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "18deg"],
  });

  const calculateRemainingSeconds = useCallback(() => {
    if (estimatedDeliveryAt) {
      const targetMs = new Date(estimatedDeliveryAt).getTime();
      if (Number.isFinite(targetMs)) {
        const diffSecs = Math.floor((targetMs - Date.now()) / 1000);
        if (diffSecs > 0) {
          return diffSecs;
        }
        return 10 * 60;
      }
    }

    if (isHomemade) {
      return 55 * 60;
    }

    try {
      const now = new Date();
      let targetYear = now.getFullYear();
      let targetMonth = now.getMonth();
      let targetDay = now.getDate();

      if (deliveryDate) {
        const cleanedDate = deliveryDate.includes("–") ? deliveryDate.split("–")[0].trim() : deliveryDate.trim();
        const dateParts = cleanedDate.replace(/,/g, "").split(/\s+/);

        let foundDay = -1;
        let foundMonth = -1;
        let foundYear = -1;

        dateParts.forEach((part) => {
          const num = parseInt(part, 10);
          if (!isNaN(num) && num > 1900) {
            foundYear = num;
          } else if (!isNaN(num) && num >= 1 && num <= 31 && foundDay === -1) {
            foundDay = num;
          } else {
            const mKey = part.substring(0, 3).toUpperCase();
            if (MONTHS_MAP[mKey] !== undefined) {
              foundMonth = MONTHS_MAP[mKey];
            }
          }
        });

        if (foundMonth !== -1) targetMonth = foundMonth;
        if (foundDay !== -1) targetDay = foundDay;
        if (foundYear !== -1) targetYear = foundYear;
      }

      let hour = 21;
      let minute = 0;

      if (timeSlot) {
        const slotToParse = timeSlot.includes("-") ? timeSlot.split("-")[1].trim() : timeSlot.trim();
        const timeMatch = slotToParse.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);

        if (timeMatch) {
          hour = parseInt(timeMatch[1], 10);
          minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          const meridiem = timeMatch[3] ? timeMatch[3].toUpperCase() : null;

          if (meridiem === "PM" && hour < 12) hour += 12;
          if (meridiem === "AM" && hour === 12) hour = 0;
        }
      }

      const targetDate = new Date(targetYear, targetMonth, targetDay, hour, minute, 0, 0);
      const diffSecs = Math.floor((targetDate.getTime() - now.getTime()) / 1000);

      if (diffSecs > 0) {
        return diffSecs;
      } else {
        return 10 * 60;
      }
    } catch {
      return 1800;
    }
  }, [deliveryDate, timeSlot, isHomemade, estimatedDeliveryAt]);

  useEffect(() => {
    if (isDelivered) return;
    setSecondsRemaining(calculateRemainingSeconds());
  }, [calculateRemainingSeconds, isDelivered]);

  useEffect(() => {
    if (isDelivered) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          return 10 * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isDelivered]);

  const formatTimerDisplay = (totalSecs: number) => {
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
    if (hours > 0)
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (isDelivered) {
    return (
      <View style={styles.compactTimerRowDelivered}>
        <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
        <Text style={styles.compactTimerDeliveredText}>Delivered on time</Text>
      </View>
    );
  }

  return (
    <View style={styles.compactTimerRow}>
      <Animated.View style={{ transform: [{ rotate: clockRotation }] }}>
        <Ionicons name="time-outline" size={13} color="#15803D" />
      </Animated.View>
      <Text style={styles.compactTimerText} numberOfLines={1}>
        Arriving in <Text style={styles.compactTimerBold}>{formatTimerDisplay(secondsRemaining)}</Text>
      </Text>
    </View>
  );
}

// ==================================================================
// ✅ REVISED — WhatsNextStepperCard
//
// Only 5 delivery steps are shown:
//   0. Accepted
//   1. Preparing
//   2. Prepared & Packing
//   3. Out for Delivery
//   4. Delivered
//
// The previous 5th step ("Payment Settled" / "Cash Amount Collected")
// has been REMOVED from the delivery flow. Payment state is instead
// communicated via the top-right badge on the order card.
// ==================================================================
function WhatsNextStepperCard({
  order,
  targetStatus,
}: {
  order: any;
  targetStatus?: string;
}) {
  const resolvedStatus = (targetStatus || order?.orderStatus || "Placed").toLowerCase();
  const isAdminAccepted = Boolean(order?.adminAcceptedAt) ||
    (resolvedStatus !== "placed" && resolvedStatus !== "cancelled");

  // Compute which step index is currently active based on the status.
  // 0 = Accepted (or awaiting acceptance)
  // 1 = Preparing
  // 2 = Prepared & Packing
  // 3 = Out for Delivery
  // 4 = Delivered
  let activeStep = 0;
  if (!isAdminAccepted) {
    activeStep = 0;
  } else if (resolvedStatus === "delivered" || resolvedStatus === "completed" || resolvedStatus.includes("cash collected")) {
    activeStep = 4;
  } else if (resolvedStatus.includes("out") || resolvedStatus.includes("delivery") || resolvedStatus.includes("out for delivery") || resolvedStatus.includes("dispatched")) {
    activeStep = 3;
  } else if (resolvedStatus.includes("pack") || resolvedStatus.includes("prepared & packing") || resolvedStatus.includes("prepared and packing") || resolvedStatus.includes("packed")) {
    activeStep = 2;
  } else if (resolvedStatus.includes("prep") || resolvedStatus.includes("preparing")) {
    activeStep = 1;
  } else {
    activeStep = 0;
  }

  const heartbeatAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(heartbeatAnim, {
          toValue: 1.15,
          duration: 350,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1.0,
          duration: 250,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1.1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1.0,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [activeStep]);

  const firstDeliveryDate = order?.deliveryDate || order?.eventDate || "Today";
  const dynamicChefName = order?.chefName || order?.restaurantName || "Kitchen Team";

  const stepsConfig = [
    {
      index: 0,
      title: "Accepted",
      iconName: "checkmark-circle-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return "Order was accepted and forwarded to the kitchen.";
        if (isCurrent) return "Order accepted. Awaiting kitchen start.";
        return "Awaiting order acceptance.";
      },
    },
    {
      index: 1,
      title: `Preparing by Chef ${dynamicChefName}`,
      iconName: "restaurant-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return `Chef ${dynamicChefName} has finished cooking your authentic dish.`;
        if (isCurrent) return `Chef ${dynamicChefName} is actively preparing your fresh meal.`;
        return `Meal preparation starts for ${firstDeliveryDate}.`;
      },
    },
    {
      index: 2,
      title: "Prepared & Packing",
      iconName: "cube-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return "Packaging completed with hygiene seal verified.";
        if (isCurrent) return "Dishes are ready and our team is carefully packing your order.";
        return "Hygiene packing begins right after cooking is finished.";
      },
    },
    {
      index: 3,
      title: "Out for Delivery",
      iconName: "bicycle-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return "Delivery completed to your designated venue.";
        if (isCurrent) return "Rider has picked up your order and is on the way.";
        return "Rider tracking and delivery partner details will appear here.";
      },
    },
    {
      index: 4,
      title: "Delivered",
      iconName: "checkmark-circle-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast || isCurrent) return "Order safely delivered. Enjoy your hot, fresh meal!";
        return "Dishes will be handed over at your doorstep.";
      },
    },
  ];

  return (
    <View style={styles.whatsNextCard}>
      <View style={styles.whatsNextHeader}>
        <View style={styles.whatsNextHeaderLeft}>
          <Text style={styles.whatsNextTitle}>Order Status</Text>
          <Text style={styles.whatsNextSubtitle}>Live fulfillment and dispatch progression</Text>
        </View>
        <View style={styles.whatsNextBagIconBox}>
          <Feather name="shopping-bag" size={18} color="#166534" />
        </View>
      </View>

      <View style={styles.stepperContainer}>
        {stepsConfig.map((step, idx) => {
          const isPast = activeStep > step.index;
          const isCurrent = activeStep === step.index;
          const isUpcoming = activeStep < step.index;
          const isLast = idx === stepsConfig.length - 1;

          return (
            <View key={`stepper-step-${step.index}`} style={[styles.stepRow, isLast && { marginBottom: 0 }]}>
              <View style={styles.stepIndicatorCol}>
                {isPast ? (
                  <View style={[styles.stepCircle, styles.stepCircleGreenFilled]}>
                    <Ionicons name="checkmark-sharp" size={13} color="#FFFFFF" />
                  </View>
                ) : isCurrent ? (
                  <Animated.View
                    style={[
                      styles.stepCircle,
                      styles.stepCircleActivePulse,
                      { transform: [{ scale: heartbeatAnim }] },
                    ]}
                  >
                    <Ionicons name={step.iconName as any} size={14} color="#FFFFFF" />
                  </Animated.View>
                ) : (
                  <View style={[styles.stepCircle, styles.stepCircleInactive]}>
                    <Ionicons name={step.iconName as any} size={13} color="#94A3B8" />
                  </View>
                )}

                {!isLast && (
                  <View style={[styles.stepLine, isPast ? styles.stepLineGreen : styles.stepLineInactive]} />
                )}
              </View>

              <View style={styles.stepContentCol}>
                <View style={styles.stepTitleRow}>
                  <Text
                    style={[
                      styles.stepHeading,
                      isPast && styles.stepHeadingGreen,
                      isCurrent && styles.stepHeadingActiveDark,
                      isUpcoming && styles.stepHeadingInactive,
                    ]}
                    numberOfLines={1}
                  >
                    {step.title}
                  </Text>
                  {isCurrent && (
                    <View style={styles.liveActiveIndicatorPill}>
                      <Text style={styles.liveActiveIndicatorPillText}>IN PROGRESS</Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.stepSubtext,
                    isCurrent && { color: "#334155", fontWeight: "600" },
                  ]}
                >
                  {step.getDescription(isPast, isCurrent)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function MyOrdersScreen() {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<"Upcoming" | "Active" | "Completed" | "Cancelled">("Upcoming");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userOrders, setUserOrders] = useState<any[]>([]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [isDetailScreenOpen, setIsDetailScreenOpen] = useState(false);
  const [isInvoiceScreenOpen, setIsInvoiceScreenOpen] = useState(false);

  const [showSupportCard, setShowSupportCard] = useState(false);

  const [feedbackRatings, setFeedbackRatings] = useState<{ [orderId: string]: number }>({});
  const [feedbackComments, setFeedbackComments] = useState<{ [orderId: string]: string }>({});
  const [feedbackImages, setFeedbackImages] = useState<{ [orderId: string]: string[] }>({});
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<{ [orderId: string]: boolean }>({});

  const [selectedDatesPerOrder, setSelectedDatesPerOrder] = useState<{ [orderId: string]: string }>({});
  const [expandedSteppers, setExpandedSteppers] = useState<{ [cardKey: string]: boolean }>({});

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
  const [modalActiveDay, setModalActiveDay] = useState<string>("");

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<any>(null);
  const [previewActiveDay, setPreviewActiveDay] = useState<string>("");

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTargetOrder, setRescheduleTargetOrder] = useState<any>(null);
  const [rescheduleOldDate, setRescheduleOldDate] = useState<string>("");
  const [selectedNewDate, setSelectedNewDate] = useState<string>("");
  const [rescheduleNewAddress, setRescheduleNewAddress] = useState<string>("");
  const [reschedulingLoading, setReschedulingLoading] = useState(false);

  const [pausedDates, setPausedDates] = useState<{ [key: string]: boolean }>({});

  const previewSheetAnim = useRef(new Animated.Value(400)).current;
  const rescheduleSheetAnim = useRef(new Animated.Value(400)).current;

  const availableDateOptions = useMemo(() => generateFutureDateOptions(), []);

  const handleCallSupport = () => {
    const cleanNumber = SUPPORT_PHONE_NUMBER.replace(/[^0-9+]/g, "");
    const url = `tel:${cleanNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert("Dialer Error", `Cannot dial ${SUPPORT_PHONE_DISPLAY} from this device.`);
        }
      })
      .catch((err) => Alert.alert("Error", err.message || "Unable to open dialer."));
  };

  const handlePickFeedbackImages = async (orderId: string) => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Gallery permission is required to attach images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const uris = result.assets.map((a) => a.uri);
        setFeedbackImages((prev) => ({
          ...prev,
          [orderId]: [...(prev[orderId] || []), ...uris].slice(0, 5),
        }));
      }
    } catch (err) {
      console.log("Image picker error:", err);
    }
  };

  const handleRemoveFeedbackImage = (orderId: string, indexToRemove: number) => {
    setFeedbackImages((prev) => ({
      ...prev,
      [orderId]: (prev[orderId] || []).filter((_, i) => i !== indexToRemove),
    }));
  };

  const handleSubmitOrderFeedback = async (order: any) => {
    const orderId = order.orderId;
    const rating = feedbackRatings[orderId] || 0;
    const comment = feedbackComments[orderId] || "";
    const images = feedbackImages[orderId] || [];

    if (!rating || rating < 1) {
      Alert.alert("Rating Required", "Please select star rating before submitting your feedback.");
      return;
    }

    try {
      setFeedbackSubmitting((prev) => ({ ...prev, [orderId]: true }));

      const formData = new FormData();
      formData.append("rating", String(rating));
      formData.append("comment", comment);

      images.forEach((uri, idx) => {
        const ext = uri.split(".").pop() || "jpg";
        formData.append("images", {
          uri,
          name: `review_${orderId}_${idx}.${ext}`,
          type: `image/${ext}`,
        } as any);
      });

      const response = await api.post(`/api/orders/${orderId}/feedback`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data && response.data.success) {
        Alert.alert("Success", "Thank you! Your feedback has been submitted.");
        setUserOrders((prev) =>
          prev.map((o) => (o.orderId === orderId ? response.data.order : o))
        );
        if (selectedOrderDetails && selectedOrderDetails.orderId === orderId) {
          setSelectedOrderDetails(response.data.order);
        }
      } else {
        Alert.alert("Notice", "Failed to submit feedback.");
      }
    } catch (err: any) {
      console.log("Feedback submission error:", err);
      Alert.alert("Error", err.response?.data?.message || err.message || "Failed to submit feedback.");
    } finally {
      setFeedbackSubmitting((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleOrderStepper = (cardKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSteppers((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }));
  };

  const fetchMyOrders = async (isMounted = true) => {
    try {
      const res = await api.get("/api/orders/my-orders");
      if (res.data && res.data.success && isMounted) {
        const fetchedOrders = res.data.orders || [];
        setUserOrders(fetchedOrders);

        const initialSelectedMap: { [orderId: string]: string } = {};
        const initialPausedMap: { [key: string]: boolean } = {};

        fetchedOrders.forEach((ord: any) => {
          const sType = (ord.serviceType || "").toLowerCase();
          const isCatering = sType === "catering";
          // ✅ Use the normalized helper so QuickBites is treated as homemade.
          const isHomemade = isHomemadeService(sType);
          const defaultEventDate = ord.eventDate || ord.deliveryDate || (isHomemade ? "Today" : "Mon, 17 Jun");

          const sortedUpcoming = (isCatering || isHomemade)
            ? [defaultEventDate]
            : Array.isArray(ord.upcomingDeliveries) && ord.upcomingDeliveries.length > 0
            ? sortDatesAscending(ord.upcomingDeliveries)
            : [ord.deliveryDate || "Mon, 17 Jun"];

          ord.upcomingDeliveries = sortedUpcoming;

          const firstDate = sortedUpcoming[0];
          initialSelectedMap[ord.orderId] = firstDate;

          if (Array.isArray(ord.pausedDates)) {
            ord.pausedDates.forEach((pDate: string) => {
              initialPausedMap[`${ord.orderId}-${pDate}`] = true;
            });
          } else if ((ord.orderStatus || "").toLowerCase() === "paused") {
            initialPausedMap[`${ord.orderId}-${firstDate}`] = true;
          }
        });

        setSelectedDatesPerOrder(initialSelectedMap);
        setPausedDates(initialPausedMap);
      }
    } catch (err) {
      console.log("Error fetching user order history:", err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchMyOrders(true);
    } catch (err) {
      console.log("Error during pull-to-refresh:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchMyOrders(isMounted);

    getUser().then((user) => {
      const uId = user?.id || user?._id;
      if (socket && uId) {
        socket.emit("join_room", String(uId));
      }
    });

    const handleOrderUpdated = (updatedOrder: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserOrders((prev) =>
        prev.map((o) => (o.orderId === updatedOrder.orderId ? { ...o, ...updatedOrder } : o))
      );
      setSelectedOrderDetails((prev: any) => {
        if (prev && prev.orderId === updatedOrder.orderId) {
          return { ...prev, ...updatedOrder };
        }
        return prev;
      });
    };

    const handleOrderStatusUpdated = (updatedOrder: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserOrders((prev) =>
        prev.map((o) => (o.orderId === updatedOrder.orderId ? { ...o, ...updatedOrder } : o))
      );
      setSelectedOrderDetails((prev: any) => {
        if (prev && prev.orderId === updatedOrder.orderId) {
          return { ...prev, ...updatedOrder };
        }
        return prev;
      });
    };

    const handleScheduleStatusUpdated = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
      setSelectedOrderDetails((prev: any) => {
        if (prev && prev.orderId === data.orderId) {
          return { ...prev, ...data.order };
        }
        return prev;
      });
    };

    const handleOrderDeliveryPaused = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
      setPausedDates((prev) => ({ ...prev, [`${data.orderId}-${data.dateStr}`]: true }));
      setSelectedOrderDetails((prev: any) => {
        if (prev && prev.orderId === data.orderId) {
          return { ...prev, ...data.order };
        }
        return prev;
      });
    };

    const handleOrderDeliveryUnpaused = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
      setPausedDates((prev) => ({ ...prev, [`${data.orderId}-${data.dateStr}`]: false }));
      setSelectedOrderDetails((prev: any) => {
        if (prev && prev.orderId === data.orderId) {
          return { ...prev, ...data.order };
        }
        return prev;
      });
    };

    const handleOrderDeliveryRescheduled = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
      setSelectedOrderDetails((prev: any) => {
        if (prev && prev.orderId === data.orderId) {
          return { ...prev, ...data.order };
        }
        return prev;
      });
    };

    const handleCashCollectedPrompt = (data: any) => {
      Alert.alert(
        "Give Feedback",
        data?.message || "Cash collected! Please give a feedback for your order.",
        [
          {
            text: "Rate Now",
            onPress: () => {
              setActiveTab("Completed");
              if (data?.order) {
                openOrderDetails(data.order);
              }
            },
          },
        ]
      );
    };

    if (socket) {
      socket.on("order_updated", handleOrderUpdated);
      socket.on("order_status_updated", handleOrderStatusUpdated);
      socket.on("schedule_status_updated", handleScheduleStatusUpdated);
      socket.on("order_delivery_paused", handleOrderDeliveryPaused);
      socket.on("order_delivery_unpaused", handleOrderDeliveryUnpaused);
      socket.on("order_delivery_rescheduled", handleOrderDeliveryRescheduled);
      socket.on("cash_collected_feedback_prompt", handleCashCollectedPrompt);
    }

    return () => {
      isMounted = false;
      if (socket) {
        socket.off("order_updated", handleOrderUpdated);
        socket.off("order_status_updated", handleOrderStatusUpdated);
        socket.off("schedule_status_updated", handleScheduleStatusUpdated);
        socket.off("order_delivery_paused", handleOrderDeliveryPaused);
        socket.off("order_delivery_unpaused", handleOrderDeliveryUnpaused);
        socket.off("order_delivery_rescheduled", handleOrderDeliveryRescheduled);
        socket.off("cash_collected_feedback_prompt", handleCashCollectedPrompt);
      }
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (!userOrders || userOrders.length === 0) return [];

    const q = searchQuery.trim().toLowerCase();

    return userOrders.filter((order) => {
      if (q) {
        const haystack = [
          order.orderId,
          order.menuName,
          order.chefName,
          order.restaurantName,
          order.occasion,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      const status = (order.orderStatus || "Placed").toLowerCase();
      const paymentStatus = String(order.paymentStatus || "").toLowerCase();
      const isPaymentCollected =
        paymentStatus === "collected" ||
        paymentStatus === "paid" ||
        paymentStatus === "cash collected" ||
        order.paymentCaptured === true;

      const isCompletedState =
        status === "completed" ||
        status === "delivered" ||
        status === "cash collected" ||
        status === "collected" ||
        isPaymentCollected;

      if (activeTab === "Upcoming") {
        if (isCompletedState) return false;
        return (
          status === "placed" ||
          status === "accepted" ||
          status === "scheduled" ||
          status === "upcoming" ||
          status === "preparing" ||
          status === "prepared & packing" ||
          status === "prepared and packing" ||
          status === "paused" ||
          status === "confirmed"
        );
      } else if (activeTab === "Active") {
        if (isCompletedState) return false;
        return (
          status === "active" ||
          status === "preparing" ||
          status === "prepared & packing" ||
          status === "prepared and packing" ||
          status === "out for delivery" ||
          status === "in progress"
        );
      } else if (activeTab === "Completed") {
        return isCompletedState;
      } else if (activeTab === "Cancelled") {
        return status === "cancelled";
      }
      return true;
    });
  }, [userOrders, activeTab, searchQuery]);

  const handleSelectDateForOrder = (orderId: string, selectedDate: string) => {
    setSelectedDatesPerOrder((prev) => ({
      ...prev,
      [orderId]: selectedDate,
    }));
  };

  const handlePauseClick = (order: any, itemDate: string) => {
    Alert.alert(
      "Pause Delivery",
      `Would you like to pause delivery for ${itemDate}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pause Date",
          onPress: () => confirmPauseInMongoDB(order, itemDate),
        },
      ],
      { cancelable: true }
    );
  };

  const confirmPauseInMongoDB = async (order: any, itemDate: string) => {
    try {
      const orderId = order.orderId;
      const response = await api.patch(`/api/orders/${orderId}/pause`, { dateStr: itemDate });

      if (response.data && response.data.success) {
        setUserOrders((prevOrders) =>
          prevOrders.map((ord) => (ord.orderId === orderId ? response.data.order : ord))
        );

        setPausedDates((prev) => ({
          ...prev,
          [`${orderId}-${itemDate}`]: true,
        }));
      } else {
        Alert.alert("Notice", "Unable to update pause status at this time.");
      }
    } catch (err: any) {
      console.log("Error pausing order in MongoDB:", err);
      Alert.alert("Notice", err.message || "Failed to pause delivery.");
    }
  };

  const handleUnpauseClick = async (order: any, itemDate: string) => {
    try {
      const orderId = order.orderId;
      const response = await api.patch(`/api/orders/${orderId}/unpause`, { dateStr: itemDate });

      if (response.data && response.data.success) {
        setUserOrders((prevOrders) =>
          prevOrders.map((ord) => (ord.orderId === orderId ? response.data.order : ord))
        );

        setPausedDates((prev) => ({
          ...prev,
          [`${orderId}-${itemDate}`]: false,
        }));
      } else {
        Alert.alert("Notice", "Unable to resume order delivery.");
      }
    } catch (err: any) {
      console.log("Error unpausing order in MongoDB:", err);
      Alert.alert("Notice", err.message || "Failed to unpause delivery.");
    }
  };

  const openRescheduleModal = (order: any, oldDate: string) => {
    setRescheduleTargetOrder(order);
    setRescheduleOldDate(oldDate);

    const currentList = order.upcomingDeliveries || [];
    const firstValidOption = availableDateOptions.find((d) => !currentList.includes(d)) || availableDateOptions[0];
    setSelectedNewDate(firstValidOption);

    const existingSched = (order.deliverySchedules || []).find((s: any) => s.date === oldDate);
    setRescheduleNewAddress(existingSched?.address || order.addressDetails || order.deliveryAddress || "");

    setShowRescheduleModal(true);
    rescheduleSheetAnim.setValue(400);
    Animated.timing(rescheduleSheetAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeRescheduleModal = () => {
    Animated.timing(rescheduleSheetAnim, {
      toValue: 400,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowRescheduleModal(false);
      setRescheduleTargetOrder(null);
      setRescheduleOldDate("");
      setSelectedNewDate("");
      setRescheduleNewAddress("");
    });
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleTargetOrder || !rescheduleOldDate || !selectedNewDate) return;

    try {
      setReschedulingLoading(true);

      const orderId = rescheduleTargetOrder.orderId;
      const currentDeliveries: string[] = rescheduleTargetOrder.upcomingDeliveries || [];
      const updatedDeliveries = sortDatesAscending(
        currentDeliveries.map((d: string) => (d === rescheduleOldDate ? selectedNewDate : d))
      );

      const response = await api.patch(`/api/orders/${orderId}/reschedule`, {
        oldDate: rescheduleOldDate,
        newDate: selectedNewDate,
        upcomingDeliveries: updatedDeliveries,
        address: rescheduleNewAddress.trim(),
      });

      if (response.data && response.data.success) {
        setUserOrders((prevOrders) =>
          prevOrders.map((ord) => (ord.orderId === orderId ? response.data.order : ord))
        );

        setSelectedDatesPerOrder((prev) => ({
          ...prev,
          [orderId]: selectedNewDate,
        }));

        setPausedDates((prev) => ({
          ...prev,
          [`${orderId}-${rescheduleOldDate}`]: false,
          [`${orderId}-${selectedNewDate}`]: false,
        }));

        closeRescheduleModal();
      } else {
        Alert.alert("Notice", "Failed to update delivery date.");
      }
    } catch (err: any) {
      console.log("Error updating order date in MongoDB:", err);
      Alert.alert("Notice", err.message || "Failed to update delivery date.");
    } finally {
      setReschedulingLoading(false);
    }
  };

  const openPreviewModal = (order: any, defaultDate?: string) => {
    setPreviewOrder(order);

    const sType = (order?.serviceType || "").toLowerCase();
    const isCatering = sType === "catering";
    // ✅ Use the normalized helper so QuickBites behaves like Homemade.
    const isHomemade = isHomemadeService(sType);
    const activeDateToUse = defaultDate || selectedDatesPerOrder[order.orderId] || order.eventDate || order.deliveryDate;

    if (!isCatering && !isHomemade && order?.selections && typeof order.selections === "object" && !Array.isArray(order.selections)) {
      const keys = Object.keys(order.selections).filter((k) => k !== "pausedDates");
      const { dayName } = parseDateParts(activeDateToUse);
      const matchedKey = keys.find((k) => k.toLowerCase().includes(dayName.toLowerCase()));
      if (matchedKey) {
        setPreviewActiveDay(matchedKey);
      } else if (keys.length > 0) {
        setPreviewActiveDay(keys[0]);
      }
    }

    setShowPreviewModal(true);
    previewSheetAnim.setValue(400);
    Animated.timing(previewSheetAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closePreviewModal = () => {
    Animated.timing(previewSheetAnim, {
      toValue: 400,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowPreviewModal(false);
      setPreviewOrder(null);
    });
  };

  const openOrderDetails = (order: any, activeDate?: string) => {
    const sType = (order?.serviceType || "").toLowerCase();
    const isCatering = sType === "catering";
    // ✅ Use the normalized helper so QuickBites behaves like Homemade.
    const isHomemade = isHomemadeService(sType);
    const dateToInspect = activeDate || selectedDatesPerOrder[order.orderId] || order.eventDate || order.deliveryDate;

    setSelectedOrderDetails({
      ...order,
      selectedDeliveryDate: dateToInspect,
    });

    if (!isCatering && !isHomemade && order?.selections && typeof order.selections === "object" && !Array.isArray(order.selections)) {
      const keys = Object.keys(order.selections).filter((k) => k !== "pausedDates");
      const { dayName } = parseDateParts(dateToInspect);
      const matchedKey = keys.find((k) => k.toLowerCase().includes(dayName.toLowerCase()));
      if (matchedKey) {
        setModalActiveDay(matchedKey);
      } else if (keys.length > 0) {
        setModalActiveDay(keys[0]);
      }
    }

    setIsDetailScreenOpen(true);
  };

  const closeOrderDetails = () => {
    setIsDetailScreenOpen(false);
  };

  const openInvoiceScreen = () => {
    setIsInvoiceScreenOpen(true);
  };

  const closeInvoiceScreen = () => {
    setIsInvoiceScreenOpen(false);
  };

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

  const currentPreviewDaySelections =
    previewOrder?.selections && previewActiveDay && !Array.isArray(previewOrder.selections)
      ? previewOrder.selections[previewActiveDay] || []
      : [];
  const groupedPreviewItemsMap = getGroupedMealBoxItemsBySection(currentPreviewDaySelections);

  const handleCopyOrderId = () => {
    Alert.alert("Copied", "Order ID copied to clipboard.");
  };

  const handleDownloadInvoice = async () => {
    if (!selectedOrderDetails) return;

    try {
      const sType = (selectedOrderDetails.serviceType || "").toLowerCase();
      const isCatering = sType === "catering";
      const isHomemade = isHomemadeService(sType);
      const orderId = selectedOrderDetails.orderId || "DW12345678";
      const chefName = selectedOrderDetails.chefName || selectedOrderDetails.restaurantName || "Partner Chef";
      const menuName = selectedOrderDetails.menuName || (isCatering ? "Royal Catering Platter" : (isHomemade ? "Homemade Dishes" : "Classic Lunch"));
      const total = selectedOrderDetails.totalAmount || 0;
      const subtotal = selectedOrderDetails.subtotal || total;
      const deliveryPrice = selectedOrderDetails.deliveryPrice ?? 0;
      const discount = selectedOrderDetails.discount || 0;
      const paymentMethod = (selectedOrderDetails.paymentMethod || "UPI / Online").toUpperCase();
      const paymentStatus = selectedOrderDetails.paymentStatus || "PAID";
      const customerName = selectedOrderDetails.userName || selectedOrderDetails.customerName || "Valued Customer";
      const customerPhone = selectedOrderDetails.phone || selectedOrderDetails.userPhone || "+91 98765 43210";
      const customerAddress = selectedOrderDetails.addressDetails || selectedOrderDetails.deliveryAddress || "Primary Delivery Address";

      let deliveryDates: string[] = [];
      if (isCatering) {
        deliveryDates = [selectedOrderDetails.eventDate || selectedOrderDetails.deliveryDate || "18 March"];
      } else if (isHomemade) {
        deliveryDates = [selectedOrderDetails.deliveryDate || "Today"];
      } else {
        deliveryDates = Array.isArray(selectedOrderDetails.upcomingDeliveries) ? selectedOrderDetails.upcomingDeliveries : [selectedOrderDetails.deliveryDate || "Mon, 17 Jun"];
      }

      const lineItems = getInvoiceLineItems(selectedOrderDetails);

      let invoiceText = `TAX INVOICE\n\n`;
      invoiceText += `${chefName.toUpperCase()}\n`;
      invoiceText += `${isCatering ? "Grand Event Catering" : isHomemade ? "Fresh Homemade Kitchen" : "Fresh Daily Subscriptions"}\n`;
      invoiceText += `Status: ${paymentStatus}\n\n`;
      invoiceText += `Invoice #: INV-${orderId}\n`;
      invoiceText += `Date: ${deliveryDates[0] || new Date().toLocaleDateString()}\n\n`;
      invoiceText += `Customer: ${customerName}\n`;
      invoiceText += `Phone: ${customerPhone}\n`;
      invoiceText += `Address: ${customerAddress}\n\n`;
      invoiceText += `Delivery Dates:\n`;
      deliveryDates.forEach((d, i) => {
        invoiceText += `  ${i+1}. ${d}\n`;
      });
      invoiceText += `\nItems:\n`;
      lineItems.forEach((item: any) => {
        const name = item.name || menuName;
        const qty = item.qty || item.quantity || 1;
        const price = item.price ? `₹${(Number(item.price) * qty)}` : "Included";
        invoiceText += `  ${name} (Qty: ${qty}) - ${price}\n`;
      });
      invoiceText += `\nSubtotal: ₹${subtotal}\n`;
      invoiceText += `Delivery: ${deliveryPrice === 0 ? "FREE" : `₹${deliveryPrice}`}\n`;
      if (discount > 0) invoiceText += `Discount: -₹${discount}\n`;
      invoiceText += `Taxes (GST Included): ₹0.00\n`;
      invoiceText += `TOTAL: ₹${total}\n`;
      invoiceText += `\nPaid via: ${paymentMethod}\n`;
      invoiceText += `\nThank you for your order!`;

      const fileUri = FileSystem.documentDirectory + `invoice-${orderId}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, invoiceText, { encoding: FileSystem.EncodingType.UTF8 });

      await Share.share({
        url: fileUri,
        title: "Download Invoice",
        message: invoiceText,
      });
    } catch (err) {
      console.log("Download error:", err);
      Alert.alert("Error", "Failed to download invoice. Please try again.");
    }
  };

  const getInvoiceLineItems = (order: any) => {
    if (!order) return [];
    if (Array.isArray(order.items) && order.items.length > 0) {
      return order.items;
    }
    if (Array.isArray(order.selections) && order.selections.length > 0) {
      const flatList: any[] = [];
      order.selections.forEach((cat: any) => {
        const allSel = [...(cat.selected || []), ...(cat.extraSelected || [])];
        allSel.forEach((itm: any) => {
          if (itm && itm.name) flatList.push(itm);
        });
      });
      if (flatList.length > 0) return flatList;
    }
    if (order.selections && typeof order.selections === "object" && !Array.isArray(order.selections)) {
      const allSelected: any[] = [];
      Object.keys(order.selections).forEach((key) => {
        if (key !== "pausedDates" && Array.isArray(order.selections[key])) {
          order.selections[key].forEach((itm: any) => {
            if (itm && itm.name && !allSelected.some((s) => s.name === itm.name)) {
              allSelected.push(itm);
            }
          });
        }
      });
      if (allSelected.length > 0) return allSelected;
    }
    return [{ name: order.menuName || "Delicious Homemade Order", qty: 1, price: order.subtotal || order.totalAmount }];
  };

  if (isInvoiceScreenOpen && selectedOrderDetails) {
    const sType = (selectedOrderDetails.serviceType || "").toLowerCase();
    const isCatering = sType === "catering";
    const isHomemade = isHomemadeService(sType);
    const invOrderId = selectedOrderDetails.orderId || "DW12345678";
    const invMenuName = selectedOrderDetails.menuName || (isCatering ? "Royal Catering Platter" : (isHomemade ? "Homemade Dishes Order" : "Classic Lunch"));
    const invChefName = selectedOrderDetails.chefName || selectedOrderDetails.restaurantName || "Partner Chef";
    const invTotal = selectedOrderDetails.totalAmount || 1014;
    const invSubtotal = selectedOrderDetails.subtotal || invTotal;
    const invDiscount = selectedOrderDetails.discount || 0;
    const invDeliveryPrice = selectedOrderDetails.deliveryPrice ?? 0;
    const invPaymentMethod = (selectedOrderDetails.paymentMethod || "UPI / Online").toUpperCase();
    const invPaymentStatus = selectedOrderDetails.paymentStatus || "PAID";
    const invDate = isCatering
      ? (selectedOrderDetails.eventDate || selectedOrderDetails.deliveryDate || "18 March")
      : (isHomemade ? (selectedOrderDetails.deliveryDate || "Today") : (selectedOrderDetails.deliveryDate || "Mon, 17 Jun 2024"));
    const invCustomerName = selectedOrderDetails.userName || selectedOrderDetails.customerName || "Valued Customer";
    const invCustomerPhone = selectedOrderDetails.phone || selectedOrderDetails.userPhone || "+91 98765 43210";
    const invCustomerAddress = selectedOrderDetails.addressDetails || selectedOrderDetails.deliveryAddress || "Primary Delivery Address";
    const invCouponCode = selectedOrderDetails.appliedCoupon || selectedOrderDetails.couponCode || null;

    let invDeliveryDates: string[] = [];
    if (isCatering) {
      invDeliveryDates = [selectedOrderDetails.eventDate || selectedOrderDetails.deliveryDate || "18 March"];
    } else if (isHomemade) {
      invDeliveryDates = [selectedOrderDetails.deliveryDate || "Today"];
    } else {
      invDeliveryDates = Array.isArray(selectedOrderDetails.upcomingDeliveries) ? selectedOrderDetails.upcomingDeliveries : [selectedOrderDetails.deliveryDate || "Mon, 17 Jun"];
    }

    const dynamicInvoiceItems = getInvoiceLineItems(selectedOrderDetails);

    return (
      <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
        <View style={styles.detailsHeaderRow}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={closeInvoiceScreen}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.detailsHeaderTitle}>Tax Invoice</Text>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleDownloadInvoice}>
            <Ionicons name="download-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#2D4A22"
              colors={["#2D4A22"]}
            />
          }
          contentContainerStyle={[
            styles.detailsScrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 80 + BOTTOM_TAB_BAR_HEIGHT },
          ]}
        >
          <View style={styles.invoicePaperCard}>
            <View style={styles.invoiceStatusBadge}>
              <Text style={styles.invoiceStatusBadgeText}>{invPaymentStatus}</Text>
            </View>

            <View style={styles.invoiceHeaderBlock}>
              <View style={styles.invoiceBrandRow}>
                <View style={[styles.brandIconBox, (isCatering || isHomemade) && { backgroundColor: "#15803D" }]}>
                  <Ionicons name={isCatering ? "restaurant-outline" : isHomemade ? "fast-food-outline" : "leaf-outline"} size={22} color="#FFFFFF" />
                </View>
                <View style={styles.brandTextGroup}>
                  <Text style={[styles.brandTitleText, (isCatering || isHomemade) && { color: "#15803D" }]}>
                    {invChefName.toUpperCase()}
                  </Text>
                  <Text style={styles.brandSubtext}>
                    {isCatering ? "Grand Event Catering" : isHomemade ? "Fresh Homemade Kitchen" : "Fresh Daily Subscriptions"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.invoiceMetaRow}>
              <View style={styles.invoiceMetaLeftCol}>
                <Text style={styles.invoiceMetaLabel}>CUSTOMER</Text>
                <Text style={styles.invoiceMetaValueText}>{invCustomerName}</Text>
                <Text style={styles.invoiceMetaSubtext}>{invCustomerPhone}</Text>
                <Text style={styles.invoiceMetaSubtext}>{invCustomerAddress}</Text>
                {isCatering && selectedOrderDetails.occasion && (
                  <Text style={styles.invoiceMetaAccentText}>
                    {selectedOrderDetails.occasion} • {selectedOrderDetails.guests || 50} Guests
                  </Text>
                )}
                {isHomemade && (
                  <Text style={styles.invoiceMetaAccentText}>
                    Chef: {invChefName}
                  </Text>
                )}
              </View>

              <View style={styles.invoiceMetaRightCol}>
                <Text style={styles.invoiceMetaLabel}>INVOICE #</Text>
                <Text style={styles.invoiceMetaValueText}>INV-{invOrderId}</Text>
                <Text style={[styles.invoiceMetaLabel, { marginTop: 6 }]}>DATE</Text>
                <Text style={styles.invoiceMetaSubtext}>{invDate}</Text>
                {selectedOrderDetails.eventTime && (
                  <Text style={styles.invoiceMetaSubtext}>{selectedOrderDetails.eventTime}</Text>
                )}
              </View>
            </View>

            <View style={styles.invoiceDeliveryDatesRow}>
              <Text style={styles.invoiceMetaLabel}>DELIVERY DATES</Text>
              <View style={styles.invoiceDatesList}>
                {invDeliveryDates.map((d, i) => (
                  <Text key={`inv-date-${i}`} style={styles.invoiceDateItem}>{i+1}. {d}</Text>
                ))}
              </View>
            </View>

            <View style={styles.invoiceTableDivider} />

            <Text style={styles.invoiceSectionTitle}>
              {isCatering ? "MENU ITEMS & SELECTIONS" : isHomemade ? "HOMEMADE ITEMS ORDERED" : "ORDERED ITEMS"}
            </Text>

            {dynamicInvoiceItems.map((itm: any, idx: number) => {
              const itemName = itm.name || invMenuName;
              const itemQty = itm.qty || itm.quantity || 1;
              const itemPrice = itm.price ? `₹${(Number(itm.price) || 0) * (Number(itemQty) || 1)}` : "Included";

              return (
                <View key={`inv-item-${idx}`} style={styles.invoiceItemRow}>
                  <View style={styles.invoiceItemInfoCol}>
                    <Text style={styles.invoiceItemNameText}>{itemName}</Text>
                    <Text style={styles.invoiceItemDescText}>
                      Qty: {itemQty} {itm.selectedQtyConfig ? `• ${itm.selectedQtyConfig}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.invoiceItemPriceText}>{itemPrice}</Text>
                </View>
              );
            })}

            {isCatering && Array.isArray(selectedOrderDetails.addons) && selectedOrderDetails.addons.length > 0 && (
              <>
                <Text style={[styles.invoiceSectionTitle, { marginTop: 12 }]}>ADD-ONS</Text>
                {selectedOrderDetails.addons.map((addon: any, idx: number) => (
                  <View key={`inv-addon-${idx}`} style={styles.invoiceItemRow}>
                    <View style={styles.invoiceItemInfoCol}>
                      <Text style={styles.invoiceItemNameText}>{addon.name} × {addon.count || 1}</Text>
                      <Text style={styles.invoiceItemDescText}>Custom Extra</Text>
                    </View>
                    <Text style={styles.invoiceItemPriceText}>+₹{(addon.price || 0) * (addon.count || 1)}</Text>
                  </View>
                ))}
              </>
            )}

            <View style={styles.invoiceTableDivider} />

            <View style={styles.invoiceCalcRow}>
              <Text style={styles.invoiceCalcLabel}>Subtotal</Text>
              <Text style={styles.invoiceCalcValue}>₹{invSubtotal}</Text>
            </View>

            <View style={styles.invoiceCalcRow}>
              <Text style={styles.invoiceCalcLabel}>
                {isCatering ? `Delivery & Setup (${selectedOrderDetails.deliveryType || "Standard"})` : "Delivery Charges"}
              </Text>
              <Text style={[styles.invoiceCalcValue, invDeliveryPrice === 0 && { color: "#16A34A" }]}>
                {invDeliveryPrice === 0 ? "FREE" : `₹${invDeliveryPrice}`}
              </Text>
            </View>

            {invDiscount > 0 && (
              <View style={styles.invoiceCalcRow}>
                <Text style={styles.invoiceCalcLabel}>
                  Discount {invCouponCode ? `(${invCouponCode})` : ""}
                </Text>
                <Text style={[styles.invoiceCalcValue, { color: "#16A34A" }]}>-₹{invDiscount}</Text>
              </View>
            )}

            <View style={styles.invoiceCalcRow}>
              <Text style={styles.invoiceCalcLabel}>Taxes (GST Included)</Text>
              <Text style={styles.invoiceCalcValue}>₹0.00</Text>
            </View>

            <View style={styles.invoiceTotalDivider} />

            <View style={styles.invoiceTotalRow}>
              <Text style={styles.invoiceTotalLabel}>Total Paid</Text>
              <Text style={styles.invoiceTotalValue}>₹{invTotal}</Text>
            </View>

            <View style={styles.paymentMethodInfoCard}>
              <Ionicons name="checkmark-circle-outline" size={22} color="#16A34A" />
              <View style={styles.paymentMethodTextCol}>
                <Text style={styles.paymentMethodTitle}>Paid via {invPaymentMethod}</Text>
                <Text style={styles.paymentMethodSubtext}>Payment captured & receipt generated</Text>
              </View>
            </View>

            <View style={styles.invoiceWatermarkFooter}>
              <Text style={styles.invoiceWatermarkText}>
                {isCatering
                  ? "Thank you for choosing Daawath & Co.!"
                  : isHomemade
                  ? `Thank you for ordering with Chef ${invChefName}!`
                  : "Thank you for subscribing to Katbox Meals!"}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.stickyFooterWrapper, { paddingBottom: Math.max(insets.bottom, 16) + BOTTOM_TAB_BAR_HEIGHT }]}>
          <TouchableOpacity style={styles.viewInvoiceDarkBtn} activeOpacity={0.88} onPress={handleDownloadInvoice}>
            <Text style={styles.viewInvoiceDarkBtnText}>Download PDF Invoice</Text>
            <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isDetailScreenOpen && selectedOrderDetails) {
    const sType = (selectedOrderDetails.serviceType || "").toLowerCase();
    const isCatering = sType === "catering";
    // ✅ Use the normalized helper so QuickBites behaves like Homemade.
    const isHomemade = isHomemadeService(sType);
    const isMealBox = !isCatering && !isHomemade;
    const detailOrderId = selectedOrderDetails.orderId || "DW12345678";
    const detailChefName = selectedOrderDetails.chefName || selectedOrderDetails.restaurantName || "Expert Chef";
    const detailMenuName = selectedOrderDetails.menuName || (isCatering ? "Catering Platter" : (isHomemade ? "Homemade Dishes Order" : "Classic Lunch"));
    const detailMenuImage = selectedOrderDetails.menuImage || selectedOrderDetails.restaurantImage || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";
    const detailTotal = selectedOrderDetails.totalAmount || 1014;

    const activeDateTarget = selectedOrderDetails.selectedDeliveryDate || selectedDatesPerOrder[selectedOrderDetails.orderId] || selectedOrderDetails.deliveryDate || "Today";
    const matchedSchedule = isMealBox
      ? (selectedOrderDetails.deliverySchedules || []).find((s: any) => s.date === activeDateTarget)
      : null;

    const detailStartDate = isCatering
      ? (selectedOrderDetails.eventDate || selectedOrderDetails.deliveryDate || "18 March")
      : isHomemade
      ? (selectedOrderDetails.deliveryDate || "Today")
      : activeDateTarget;

    const detailTimeSlot = matchedSchedule?.timeSlot
      || (isCatering ? (selectedOrderDetails.eventTime || selectedOrderDetails.deliveryTimeSlot || "08:30 PM")
      : isHomemade ? (selectedOrderDetails.deliverySlot || selectedOrderDetails.deliveryTimeSlot || "45-60 min")
      : (selectedOrderDetails.deliveryTimeSlot || "7:00 PM - 9:00 PM"));

    const detailAddress = matchedSchedule?.address
      || selectedOrderDetails.addressDetails
      || selectedOrderDetails.deliveryAddress
      || "Primary Venue Address";

    const detailStatus = matchedSchedule?.status || selectedOrderDetails.orderStatus || "Placed";
    const detailPaymentStatusString = String(selectedOrderDetails.paymentStatus || "").toLowerCase();
    const isDeliveredCurrent =
      detailStatus.toLowerCase() === "delivered" ||
      detailStatus.toLowerCase() === "completed" ||
      detailStatus.toLowerCase() === "cash collected" ||
      detailPaymentStatusString === "collected" ||
      detailPaymentStatusString === "paid" ||
      selectedOrderDetails.paymentCaptured === true;

    const { dayName: schedDayName, dayNumber: schedDayNum, month: schedMonth } = parseDateParts(detailStartDate);

    return (
      <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
        <View style={styles.detailsHeaderRow}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={closeOrderDetails}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.detailsHeaderTitle}>
            {isCatering ? "Catering Event Details" : isHomemade ? "Homemade Order Details" : "Delivery Schedule Details"}
          </Text>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowSupportCard(true)}>
            <Ionicons name="headset-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#2D4A22"
              colors={["#2D4A22"]}
            />
          }
          contentContainerStyle={[
            styles.detailsScrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + (isHomemade ? 30 : 80) + BOTTOM_TAB_BAR_HEIGHT },
          ]}
        >
          <View style={styles.greenHeroBanner}>
            <View style={styles.greenHeroLeftCol}>
              <View style={styles.orderIdPillRow}>
                <Text style={styles.orderIdPillText}>Order ID: #{detailOrderId}</Text>
                <TouchableOpacity style={styles.copyPillBtn} activeOpacity={0.8} onPress={handleCopyOrderId}>
                  <Text style={styles.copyPillBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.scheduledStatusRow}>
                <View style={styles.greenStatusDotDot} />
                <Text style={styles.scheduledStatusText}>{detailStatus}</Text>
              </View>

              <Text style={styles.heroConfirmedHeading}>
                {isCatering
                  ? `Catering Booking Confirmed for ${selectedOrderDetails.occasion || "Event"}`
                  : isHomemade
                  ? `Chef ${detailChefName} is cooking your fresh order`
                  : `Delivery Scheduled for ${detailStartDate}`}
              </Text>
              <Text style={styles.heroConfirmedSubheading}>
                {isCatering
                  ? `Our culinary team will set up the buffet at your venue on ${detailStartDate}.`
                  : isHomemade
                  ? "Fresh, hygienic home cooking in progress."
                  : `Track cooking, packing, and courier delivery for ${detailStartDate}.`}
              </Text>
            </View>

            <Image
              source={{
                uri: "https://cdn-icons-png.flaticon.com/512/2830/2830312.png",
              }}
              style={styles.scooterMascotGraphic}
            />
          </View>

          <DeliverySlotCountdownWidget
            deliveryDate={detailStartDate}
            timeSlot={detailTimeSlot}
            isDelivered={isDeliveredCurrent}
            isHomemade={isHomemade}
            estimatedDeliveryAt={resolveEffectiveDeliveryTime(selectedOrderDetails)}
          />

          {!isHomemade && (
            <View style={styles.mealSpecCard}>
              <View style={styles.mealSpecMainRow}>
                <Image source={{ uri: detailMenuImage }} style={styles.mealSpecImage} />
                <View style={styles.mealSpecTextCol}>
                  <Text style={styles.mealSpecTitle}>{detailMenuName}</Text>
                  <Text style={styles.mealSpecSubtext}>
                    Chef: {detailChefName}
                  </Text>
                  <Text style={styles.mealSpecPriceText}>
                    ₹{detailTotal} <Text style={styles.perWeekSpan}>{isCatering ? "total" : "/ week"}</Text>
                  </Text>
                </View>
              </View>

              {isCatering && (
                <View style={styles.mealSpecFooterRow}>
                  <View style={styles.specFooterCol}>
                    <Text style={styles.specFooterLabel}>Event Date</Text>
                    <Text style={styles.specFooterValue}>{detailStartDate}</Text>
                  </View>
                  <View style={styles.specFooterDivider} />
                  <View style={styles.specFooterCol}>
                    <Text style={styles.specFooterLabel}>Time Slot</Text>
                    <Text style={styles.specFooterValue}>{detailTimeSlot}</Text>
                  </View>
                  <View style={styles.specFooterDivider} />
                  <View style={styles.specFooterCol}>
                    <Text style={styles.specFooterLabel}>Guests</Text>
                    <Text style={styles.specFooterValue}>{selectedOrderDetails.guests || 50}</Text>
                  </View>
                </View>
              )}

              {isMealBox && (
                <View style={styles.mergedScheduleSectionBlock}>
                  <View style={styles.mergedScheduleHeaderRow}>
                    <View style={styles.mergedHeaderLabelGroup}>
                      <Ionicons name="calendar-outline" size={16} color="#166534" />
                      <Text style={styles.mergedScheduleHeaderTitle}>Delivery Schedule</Text>
                    </View>
                    <View style={[
                      styles.selectedScheduleStatusBadge,
                      detailStatus.toLowerCase() === 'delivered' && styles.floatingBadgeDelivered,
                      detailStatus.toLowerCase().includes('prep') && styles.floatingBadgePreparing,
                      detailStatus.toLowerCase() === 'paused' && styles.floatingBadgePaused,
                    ]}>
                      <Text style={[
                        styles.selectedScheduleStatusBadgeText,
                        detailStatus.toLowerCase() === 'delivered' && styles.floatingBadgeTextDelivered,
                        detailStatus.toLowerCase().includes('prep') && styles.floatingBadgeTextPreparing,
                        detailStatus.toLowerCase() === 'paused' && styles.floatingBadgeTextPaused,
                      ]}>
                        {detailStatus}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.selectedScheduleCardContent}>
                    <View style={styles.selectedScheduleDateTile}>
                      <Text style={styles.dateTileDay}>{schedDayName}</Text>
                      <Text style={styles.dateTileNumber}>{schedDayNum}</Text>
                      <Text style={styles.dateTileMonth}>{schedMonth}</Text>
                    </View>

                    <View style={styles.selectedScheduleInfoCol}>
                      <Text style={styles.selectedScheduleMenuTitle}>{detailMenuName}</Text>
                      <View style={styles.metaIconTextRow}>
                        <Ionicons name="time-outline" size={13} color="#64748B" style={{ marginRight: 5 }} />
                        <Text style={styles.selectedScheduleSlotText}>
                          Time Slot: <Text style={{ fontWeight: "700", color: "#0F172A" }}>{detailTimeSlot}</Text>
                        </Text>
                      </View>
                      <View style={[styles.metaIconTextRow, { marginTop: 4 }]}>
                        <Ionicons name="location-outline" size={13} color="#166538" style={{ marginRight: 5 }} />
                        <Text style={styles.selectedScheduleAddressText} numberOfLines={2}>
                          {detailAddress}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {isDeliveredCurrent && (
            <View style={styles.feedbackCardContainer}>
              <View style={styles.feedbackHeaderRow}>
                <Ionicons name="star" size={18} color="#2D4A22" />
                <Text style={styles.feedbackCardTitle}>Chef Feedback & Rating</Text>
              </View>

              {selectedOrderDetails.feedback?.isSubmitted ? (
                <View style={styles.feedbackSubmittedView}>
                  <View style={styles.submittedStarsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={`sub-star-${s}`}
                        name={s <= (selectedOrderDetails.feedback?.rating || 0) ? "star" : "star-outline"}
                        size={18}
                        color="#2D4A22"
                      />
                    ))}
                    <Text style={styles.submittedRatingText}>{selectedOrderDetails.feedback?.rating}/5</Text>
                  </View>
                  {selectedOrderDetails.feedback?.comment ? (
                    <Text style={styles.submittedCommentText}>"{selectedOrderDetails.feedback.comment}"</Text>
                  ) : null}

                  {Array.isArray(selectedOrderDetails.feedback?.images) && selectedOrderDetails.feedback.images.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {selectedOrderDetails.feedback.images.map((imgObj: any, i: number) => (
                          <Image key={`sub-img-${i}`} source={{ uri: imgObj.url }} style={styles.feedbackThumbImage} />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  <Text style={styles.feedbackSubmittedSuccessLabel}>✓ Review submitted successfully</Text>
                </View>
              ) : (
                <View style={styles.feedbackFormView}>
                  <Text style={styles.feedbackInstructionText}>Rate your experience with Chef {detailChefName}:</Text>
                  <View style={styles.starPickerRow}>
                    {[1, 2, 3, 4, 5].map((starNum) => {
                      const currentRating = feedbackRatings[detailOrderId] || 0;
                      const isFilled = starNum <= currentRating;
                      return (
                        <TouchableOpacity
                          key={`star-${starNum}`}
                          onPress={() => setFeedbackRatings((prev) => ({ ...prev, [detailOrderId]: starNum }))}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={isFilled ? "star" : "star-outline"}
                            size={28}
                            color={isFilled ? "#2D4A22" : "#CBD5E1"}
                            style={{ marginHorizontal: 4 }}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TextInput
                    style={styles.feedbackCommentInput}
                    placeholder="Write a review about the food quality, taste, packing..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    value={feedbackComments[detailOrderId] || ""}
                    onChangeText={(val) => setFeedbackComments((prev) => ({ ...prev, [detailOrderId]: val }))}
                  />

                  {Array.isArray(feedbackImages[detailOrderId]) && feedbackImages[detailOrderId].length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {feedbackImages[detailOrderId].map((uri, imgIdx) => (
                          <View key={`picked-img-${imgIdx}`} style={{ position: "relative" }}>
                            <Image source={{ uri }} style={styles.feedbackThumbImage} />
                            <TouchableOpacity
                              style={styles.removeThumbBtn}
                              onPress={() => handleRemoveFeedbackImage(detailOrderId, imgIdx)}
                            >
                              <Ionicons name="close-circle" size={18} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}

                  <View style={styles.feedbackFormActionsRow}>
                    <TouchableOpacity
                      style={styles.attachImageBtn}
                      activeOpacity={0.8}
                      onPress={() => handlePickFeedbackImages(detailOrderId)}
                    >
                      <Ionicons name="camera-outline" size={16} color="#2D4A22" />
                      <Text style={styles.attachImageBtnText}>Add Photos</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.submitReviewBtn}
                      activeOpacity={0.85}
                      onPress={() => handleSubmitOrderFeedback(selectedOrderDetails)}
                      disabled={feedbackSubmitting[detailOrderId]}
                    >
                      {feedbackSubmitting[detailOrderId] ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.submitReviewBtnText}>Submit Review</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.detailsSectionHeaderRow}>
            <Text style={styles.detailsSectionTitle}>Order Status</Text>
          </View>

          <View style={{ marginBottom: 20 }}>
            <WhatsNextStepperCard order={selectedOrderDetails} targetStatus={detailStatus} />
          </View>

          <View style={[styles.orderSummaryCardBlock, isHomemade && { marginBottom: 16 }]}>
            <Text style={styles.orderSummaryCardTitle}>Bill Summary</Text>

            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>{isCatering ? "Catering Platter" : isHomemade ? "Homemade Dishes" : "Plan"}</Text>
              <Text style={styles.orderSummaryValue}>{detailMenuName}</Text>
            </View>

            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>Chef</Text>
              <Text style={[styles.orderSummaryValue, { color: "#166538", fontWeight: "800" }]}>{detailChefName}</Text>
            </View>

            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>Subtotal</Text>
              <Text style={styles.orderSummaryValue}>₹{selectedOrderDetails.subtotal || detailTotal}</Text>
            </View>

            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>Delivery Charges</Text>
              <Text style={[styles.orderSummaryValue, { color: "#16A34A", fontWeight: "800" }]}>
                {selectedOrderDetails.deliveryPrice ? `₹${selectedOrderDetails.deliveryPrice}` : "FREE"}
              </Text>
            </View>

            <View style={styles.orderSummaryDivider} />

            <View style={styles.orderSummaryTotalRow}>
              <Text style={styles.orderSummaryTotalLabel}>Total Amount</Text>
              <Text style={styles.orderSummaryTotalValue}>
                ₹{detailTotal} <Text style={{ fontSize: 13, color: "#64748B", fontWeight: "500" }}>{isCatering || isHomemade ? "total" : "/ week"}</Text>
              </Text>
            </View>
          </View>

          {isHomemade && (
            <TouchableOpacity
              style={[styles.viewInvoiceDarkBtn, { marginBottom: 20, borderRadius: 16 }]}
              activeOpacity={0.88}
              onPress={openInvoiceScreen}
            >
              <Text style={styles.viewInvoiceDarkBtnText}>View Invoice</Text>
              <Octicons name="file-badge" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </ScrollView>

        {!isHomemade && (
          <View style={[styles.stickyFooterWrapper, { paddingBottom: Math.max(insets.bottom, 16) + BOTTOM_TAB_BAR_HEIGHT }]}>
            <TouchableOpacity style={styles.viewInvoiceDarkBtn} activeOpacity={0.88} onPress={openInvoiceScreen}>
              <Text style={styles.viewInvoiceDarkBtnText}>View Invoice</Text>
              <Octicons name="file-badge" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={showRescheduleModal} transparent animationType="none" onRequestClose={closeRescheduleModal}>
          <BlurView intensity={30} tint="dark" style={styles.modalOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeRescheduleModal} />
            <Animated.View style={[styles.rescheduleModalContent, { transform: [{ translateY: rescheduleSheetAnim }] }]}>
              <View style={styles.drawerHandle} />
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closeRescheduleModal}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Shift Date</Text>
              <Text style={styles.modalOrderIdText}>
                Order #{rescheduleTargetOrder?.orderId} • Currently set to {rescheduleOldDate}
              </Text>
              <Text style={styles.selectDateSectionTitle}>Select New Date:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 14 }}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {availableDateOptions.map((dateOpt) => {
                    const isSelected = selectedNewDate === dateOpt;
                    return (
                      <TouchableOpacity
                        key={`opt-${dateOpt}`}
                        activeOpacity={0.8}
                        onPress={() => setSelectedNewDate(dateOpt)}
                        style={[styles.dateOptionPill, isSelected && styles.dateOptionPillSelected]}
                      >
                        <Ionicons name="calendar-clear-outline" size={16} color={isSelected ? "#FFFFFF" : "#2D4A22"} />
                        <Text style={[styles.dateOptionPillText, isSelected && styles.dateOptionPillTextSelected]}>
                          {dateOpt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={[styles.selectDateSectionTitle, { marginTop: 4, marginBottom: 6 }]}>Delivery Address for this Date:</Text>
              <TextInput
                style={styles.rescheduleAddressInput}
                placeholder="Enter specific delivery address for shifted date"
                placeholderTextColor="#94A3B8"
                value={rescheduleNewAddress}
                onChangeText={setRescheduleNewAddress}
              />

              <View style={styles.shiftSummaryNotice}>
                <Ionicons name="information-circle-outline" size={18} color="#D97706" />
                <Text style={styles.shiftSummaryNoticeText}>
                  Your menu from {rescheduleOldDate} will now be delivered on <Text style={{ fontWeight: "800", color: "#0F172A" }}>{selectedNewDate}</Text>.
                </Text>
              </View>
              <TouchableOpacity style={styles.confirmShiftCtaButton} activeOpacity={0.88} onPress={handleConfirmReschedule} disabled={reschedulingLoading}>
                {reschedulingLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmShiftCtaButtonText}>Confirm Date Shift</Text>}
              </TouchableOpacity>
            </Animated.View>
          </BlurView>
        </Modal>

        <Modal
          visible={showSupportCard}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSupportCard(false)}
        >
          <View style={styles.supportCardOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setShowSupportCard(false)}
            />
            <View style={styles.supportCardBox}>
              <View style={styles.supportCardHeader}>
                <View style={styles.supportCardIconCircle}>
                  <Ionicons name="headset" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.supportCardTitle}>Customer Support</Text>
                <Text style={styles.supportCardSub}>
                  We are here to help you with your order
                </Text>
              </View>

              <TouchableOpacity
                style={styles.supportPhoneRow}
                activeOpacity={0.85}
                onPress={handleCallSupport}
              >
                <View style={styles.supportPhoneIconCircle}>
                  <Ionicons name="call" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.supportPhoneNumber}>{SUPPORT_PHONE_DISPLAY}</Text>
                  <Text style={styles.supportPhoneSub}>Tap to call our support team</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.supportCallBtn}
                activeOpacity={0.88}
                onPress={handleCallSupport}
              >
                <Ionicons name="call-outline" size={17} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.supportCallBtnText}>Call Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.supportCancelBtn}
                activeOpacity={0.8}
                onPress={() => setShowSupportCard(false)}
              >
                <Text style={styles.supportCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const isPreviewCatering = (previewOrder?.serviceType || "").toLowerCase() === "catering";
  // ✅ Use the normalized helper so QuickBites uses the homemade preview layout.
  const isPreviewHomemade = isHomemadeService(previewOrder?.serviceType);

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        {isSearchOpen ? (
          <>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <Ionicons name="chevron-back" size={24} color="#0F172A" />
            </TouchableOpacity>

            <TextInput
              style={styles.searchInput}
              placeholder="Search order ID, chef, menu…"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />

            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => setSearchQuery("")}
              >
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Orders</Text>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setIsSearchOpen(true)}
            >
              <Ionicons name="search-outline" size={22} color="#0F172A" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.tabsContainer}>
        {(["Upcoming", "Active", "Completed", "Cancelled"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#2D4A22"
            colors={["#2D4A22"]}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 + BOTTOM_TAB_BAR_HEIGHT },
        ]}
      >
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#2D4A22" />
            <Text style={{ marginTop: 10, fontSize: 13, color: "#64748B", fontWeight: "600" }}>
              Loading orders...
            </Text>
          </View>
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map((order, orderIndex) => {
            const sType = (order.serviceType || "").toLowerCase();
            const isCatering = sType === "catering";
            // ✅ Use the normalized helper so QuickBites uses the homemade card layout.
            const isHomemade = isHomemadeService(sType);
            const orderId = order.orderId;
            const isNotLastOrder = orderIndex < filteredOrders.length - 1;
            const orderStatusString = order.orderStatus || "Placed";
            const orderPaymentStatusString = String(order.paymentStatus || "").toLowerCase();
            const isDeliveredState =
              orderStatusString.toLowerCase() === "delivered" ||
              orderStatusString.toLowerCase() === "completed" ||
              orderStatusString.toLowerCase() === "cash collected" ||
              orderPaymentStatusString === "collected" ||
              orderPaymentStatusString === "paid" ||
              order.paymentCaptured === true;
            const dynamicChefName = order.chefName || order.restaurantName || "Partner Chef";

            const displayBadgeStatus = isDeliveredState
              ? (orderStatusString.toLowerCase() === "cash collected" ||
                 orderPaymentStatusString === "collected"
                  ? "Cash Collected"
                  : orderStatusString.toLowerCase() === "delivered"
                  ? "Delivered"
                  : "Completed")
              : orderStatusString;

            // ==================================================================
            // ✅ PAYMENT BADGE — computed per order card. Shows ONLY the
            // payment state, never the order status.
            //   • Online + fully paid       → "Payment Settled"
            //   • Online + advance paid     → "Advance Paid ₹X"
            //   • COD + before delivered    → "COD ₹X"
            //   • COD + after delivered     → "Cash Collected ₹X"
            // ==================================================================
            const cardPaymentMethod = String(order.paymentMethod || "").toLowerCase();
            const cardStatusLower = orderStatusString.toLowerCase();
            const cardIsCod = cardPaymentMethod === "cod";
            const cardIsDelivered =
              cardStatusLower === "delivered" ||
              cardStatusLower === "completed" ||
              cardStatusLower === "cash collected" ||
              orderPaymentStatusString.includes("fully paid") ||
              orderPaymentStatusString.includes("collected");
            const cardTotal = Number(order.totalAmount || 0);
            const cardAdvance = Number(order.advancePaidAmount || 0);
            const cardBalance = Number(order.balanceAmountToCollect || 0);
            const cardIsAdvanceBased = isCatering || (!isHomemade && !isCatering);

            let cardPaymentBadgeText = "Payment Settled";
            let cardPaymentBadgeSettled = true;
            if (cardIsCod) {
              if (cardIsDelivered) {
                cardPaymentBadgeText = `Cash Collected ₹${cardTotal}`;
                cardPaymentBadgeSettled = true;
              } else {
                cardPaymentBadgeText = `COD ₹${cardTotal}`;
                cardPaymentBadgeSettled = false;
              }
            } else if (cardIsAdvanceBased && cardBalance > 0) {
              cardPaymentBadgeText = `Advance Paid ₹${cardAdvance}`;
              cardPaymentBadgeSettled = false;
            } else {
              cardPaymentBadgeText = "Payment Settled";
              cardPaymentBadgeSettled = true;
            }

            if (isHomemade) {
              const homemadeItems = Array.isArray(order.items) ? order.items : [];
              const firstDishImage = homemadeItems[0]?.image || order.menuImage || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";
              const homemadeTotal = order.totalAmount || 0;
              const deliveryAddressString = order.deliveryAddress || order.addressDetails || "Doorstep Delivery";
              const isHomemadeStepperOpen = !!expandedSteppers[orderId];

              const homemadeIsQuickBites =
                order?.isQuickBites === true ||
                String(order?.isQuickBites).toLowerCase() === "true" ||
                !!order?.estimatedDeliveryAt;

              let homemadeDateDisplay = order?.deliveryDate || "Today";
              let homemadeSlotDisplay =
                order?.deliverySlot ||
                order?.deliveryTimeSlot ||
                "within 45-60 min";

              const homemadeEstimatedIso = resolveEffectiveDeliveryTime(order);
              if (homemadeEstimatedIso) {
                const d = new Date(homemadeEstimatedIso);
                if (!isNaN(d.getTime())) {
                  const dayNum = d.getDate();
                  const monthShort = d.toLocaleDateString("en-US", { month: "short" });
                  const timeStr = d.toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  if (homemadeIsQuickBites) {
                    homemadeDateDisplay = `Today, ${dayNum} ${monthShort}`;
                    homemadeSlotDisplay = `By ${timeStr}`;
                  } else {
                    if (!order?.deliveryDate) homemadeDateDisplay = `Today, ${dayNum} ${monthShort}`;
                    if (!order?.deliverySlot && !order?.deliveryTimeSlot) homemadeSlotDisplay = timeStr;
                  }
                }
              }

              return (
                <View key={`homemade-order-${orderId || orderIndex}`}>
                  <View style={styles.orderGroupContainer}>
                    <View style={styles.nextDeliveryBanner}>
                      <View style={styles.nextDeliveryContentLeft}>
                        <View style={styles.nextDeliveryHeaderRow}>
                          <View style={[styles.calendarIconBox, { backgroundColor: "#15803D" }]}>
                            <Ionicons name="restaurant-outline" size={16} color="#FFFFFF" />
                          </View>
                          <Text style={styles.nextDeliveryLabel}>Order #{orderId}</Text>
                        </View>

                        <Text style={styles.nextDeliveryDateText}>
                          {homemadeDateDisplay} <Text style={styles.bulletDot}>•</Text> {homemadeSlotDisplay}
                        </Text>
                        <Text style={styles.nextDeliveryMenuTitle}>
                          Chef: <Text style={{ color: "#166538", fontWeight: "800" }}>{dynamicChefName}</Text>
                        </Text>

                        <View style={styles.bannerActionRow}>
                          <TouchableOpacity
                            style={[styles.viewDetailsBtn, { backgroundColor: "#166534" }]}
                            activeOpacity={0.85}
                            onPress={() => openOrderDetails(order)}
                          >
                            <Text style={styles.viewDetailsBtnText}>View Details</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Image source={{ uri: firstDishImage }} style={styles.nextDeliveryImage} />
                    </View>

                    <DeliverySlotCountdownWidget
                      deliveryDate={homemadeDateDisplay || order?.deliveryDate || "Today"}
                      timeSlot={homemadeSlotDisplay || order?.deliveryTimeSlot || "45-60 min"}
                      isDelivered={isDeliveredState}
                      isHomemade={true}
                      estimatedDeliveryAt={homemadeEstimatedIso}
                    />

                    {isDeliveredState && (
                      <View style={styles.feedbackCardContainer}>
                        <View style={styles.feedbackHeaderRow}>
                          <Ionicons name="star" size={18} color="#2D4A22" />
                          <Text style={styles.feedbackCardTitle}>Chef Feedback & Rating</Text>
                        </View>

                        {order.feedback?.isSubmitted ? (
                          <View style={styles.feedbackSubmittedView}>
                            <View style={styles.submittedStarsRow}>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Ionicons
                                  key={`hm-sub-star-${s}`}
                                  name={s <= (order.feedback?.rating || 0) ? "star" : "star-outline"}
                                  size={18}
                                  color="#2D4A22"
                                />
                              ))}
                              <Text style={styles.submittedRatingText}>{order.feedback?.rating}/5</Text>
                            </View>
                            {order.feedback?.comment ? (
                              <Text style={styles.submittedCommentText}>"{order.feedback.comment}"</Text>
                            ) : null}
                            <Text style={styles.feedbackSubmittedSuccessLabel}>✓ Review submitted successfully</Text>
                          </View>
                        ) : (
                          <View style={styles.feedbackFormView}>
                            <Text style={styles.feedbackInstructionText}>Rate your experience with Chef {dynamicChefName}:</Text>
                            <View style={styles.starPickerRow}>
                              {[1, 2, 3, 4, 5].map((starNum) => {
                                const currentRating = feedbackRatings[orderId] || 0;
                                const isFilled = starNum <= currentRating;
                                return (
                                  <TouchableOpacity
                                    key={`hm-star-${starNum}`}
                                    onPress={() => setFeedbackRatings((prev) => ({ ...prev, [orderId]: starNum }))}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons
                                      name={isFilled ? "star" : "star-outline"}
                                      size={26}
                                      color={isFilled ? "#2D4A22" : "#CBD5E1"}
                                      style={{ marginHorizontal: 4 }}
                                    />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            <TextInput
                              style={styles.feedbackCommentInput}
                              placeholder="Write a review about the food quality, taste..."
                              placeholderTextColor="#94A3B8"
                              multiline
                              value={feedbackComments[orderId] || ""}
                              onChangeText={(val) => setFeedbackComments((prev) => ({ ...prev, [orderId]: val }))}
                            />

                            {Array.isArray(feedbackImages[orderId]) && feedbackImages[orderId].length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                  {feedbackImages[orderId].map((uri, imgIdx) => (
                                    <View key={`hm-picked-img-${imgIdx}`} style={{ position: "relative" }}>
                                      <Image source={{ uri }} style={styles.feedbackThumbImage} />
                                      <TouchableOpacity
                                        style={styles.removeThumbBtn}
                                        onPress={() => handleRemoveFeedbackImage(orderId, imgIdx)}
                                      >
                                        <Ionicons name="close-circle" size={18} color="#EF4444" />
                                      </TouchableOpacity>
                                    </View>
                                  ))}
                                </View>
                              </ScrollView>
                            )}

                            <View style={styles.feedbackFormActionsRow}>
                              <TouchableOpacity
                                style={styles.attachImageBtn}
                                activeOpacity={0.8}
                                onPress={() => handlePickFeedbackImages(orderId)}
                              >
                                <Ionicons name="camera-outline" size={16} color="#2D4A22" />
                                <Text style={styles.attachImageBtnText}>Add Photos</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.submitReviewBtn}
                                activeOpacity={0.85}
                                onPress={() => handleSubmitOrderFeedback(order)}
                                disabled={feedbackSubmitting[orderId]}
                              >
                                {feedbackSubmitting[orderId] ? (
                                  <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                  <Text style={styles.submitReviewBtnText}>Submit Review</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => toggleOrderStepper(orderId)}
                      style={[
                        styles.deliveryCard,
                        styles.cardWithBadgePadding,
                      ]}
                    >
                      {/* ✅ CHANGED: Top-right badge now shows ONLY the payment state. */}
                      <View
                        style={[
                          styles.floatingTopRightBadge,
                          cardPaymentBadgeSettled
                            ? styles.floatingBadgePaymentSettled
                            : styles.floatingBadgePaymentPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.floatingTopRightBadgeText,
                            cardPaymentBadgeSettled
                              ? styles.floatingBadgePaymentTextSettled
                              : styles.floatingBadgePaymentTextPending,
                          ]}
                        >
                          {cardPaymentBadgeText}
                        </Text>
                      </View>

                      <View style={styles.deliveryCardMain}>
                        <View style={[styles.cateringEventTile, { backgroundColor: "#F0FDF4", borderColor: "#DCFCE7" }]}>
                          <View style={[styles.cateringEventTileHeader, { backgroundColor: "#15803D" }]}>
                            <Text style={styles.cateringEventTileHeaderText}>KITCHEN</Text>
                          </View>
                          <Ionicons name="fast-food-outline" size={20} color="#15803D" style={{ marginTop: 6 }} />
                        </View>

                        <View style={styles.deliveryInfoCol}>
                          <Text style={styles.deliveryMenuTitle} numberOfLines={1}>
                            {homemadeItems.map((i: any) => i.name).join(", ") || "Fresh Homemade Food"}
                          </Text>
                          <Text style={styles.deliveryTimeText} numberOfLines={1}>
                            {deliveryAddressString}
                          </Text>

                          {/* ✅ CHANGED: Inline small pill shows the order status */}
                          <View style={styles.cardBadgesRowSimplified}>
                            <Text style={styles.simplifiedBadgeText}>{homemadeItems.length} Dishes</Text>
                            <Text style={styles.simplifiedBadgeText}>Chef: {dynamicChefName}</Text>
                            <View style={styles.inlineOrderStatusPill}>
                              <Text style={styles.inlineOrderStatusPillText}>{displayBadgeStatus}</Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.deliveryCardPriceRight}>
                          <Text style={styles.cateringPriceBigTotal}>₹{homemadeTotal}</Text>
                          <Text style={styles.cateringPriceTotalLabel}>Delivering hot</Text>
                        </View>
                      </View>

                      {isHomemadeStepperOpen && (
                        <View style={styles.embeddedStepperWrapper}>
                          <WhatsNextStepperCard order={order} targetStatus={orderStatusString} />
                        </View>
                      )}

                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openOrderDetails(order)}
                        >
                          <Ionicons name="settings-outline" size={16} color="#334155" />
                          <Text style={styles.actionBtnText}>Order Details</Text>
                        </TouchableOpacity>

                        <View style={styles.actionDivider} />

                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => {
                            setSelectedOrderDetails(order);
                            openInvoiceScreen();
                          }}
                        >
                          <Octicons name="file-badge" size={15} color="#334155" />
                          <Text style={styles.actionBtnText}>Invoice</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {isNotLastOrder && <View style={styles.orderDividerDotted} />}
                </View>
              );
            }

            if (isCatering) {
              const cateringOccasion = order.occasion || "Celebration";
              const cateringMenuName = order.menuName || "Royal Catering Platter";
              const cateringMenuImage = order.menuImage || order.restaurantImage || "https://images.unsplash.com/photo-1555244162-803834f70033?w=400";
              const cateringDate = order.eventDate || order.deliveryDate || "18 March";
              const cateringTime = order.eventTime || order.deliveryTimeSlot || "08:30 PM";
              const cateringGuests = order.guests || 50;
              const cateringDelivery = order.deliveryType || "Standard";
              const cateringTotal = order.totalAmount || 0;
              const isCateringStepperOpen = !!expandedSteppers[orderId];

              return (
                <View key={`catering-order-${orderId || orderIndex}`}>
                  <View style={styles.orderGroupContainer}>
                    <View style={styles.nextDeliveryBanner}>
                      <View style={styles.nextDeliveryContentLeft}>
                        <View style={styles.nextDeliveryHeaderRow}>
                          <View style={styles.calendarIconBox}>
                            <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
                          </View>
                          <Text style={styles.nextDeliveryLabel}>Order #{orderId}</Text>
                        </View>

                        <Text style={styles.nextDeliveryDateText}>
                          {cateringDate} <Text style={styles.bulletDot}>•</Text> {cateringTime}
                        </Text>
                        <Text style={styles.nextDeliveryMenuTitle}>{cateringMenuName}</Text>

                        <View style={styles.bannerActionRow}>
                          <TouchableOpacity
                            style={styles.viewDetailsBtn}
                            activeOpacity={0.85}
                            onPress={() => openOrderDetails(order)}
                          >
                            <Text style={styles.viewDetailsBtnText}>View Details</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Image source={{ uri: cateringMenuImage }} style={styles.nextDeliveryImage} />
                    </View>

                    <DeliverySlotCountdownWidget
                      deliveryDate={cateringDate}
                      timeSlot={cateringTime}
                      isDelivered={isDeliveredState}
                      estimatedDeliveryAt={resolveEffectiveDeliveryTime(order)}
                    />

                    {isDeliveredState && (
                      <View style={styles.feedbackCardContainer}>
                        <View style={styles.feedbackHeaderRow}>
                          <Ionicons name="star" size={18} color="#2D4A22" />
                          <Text style={styles.feedbackCardTitle}>Event Feedback & Rating</Text>
                        </View>

                        {order.feedback?.isSubmitted ? (
                          <View style={styles.feedbackSubmittedView}>
                            <View style={styles.submittedStarsRow}>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Ionicons
                                  key={`cat-sub-star-${s}`}
                                  name={s <= (order.feedback?.rating || 0) ? "star" : "star-outline"}
                                  size={18}
                                  color="#2D4A22"
                                />
                              ))}
                              <Text style={styles.submittedRatingText}>{order.feedback?.rating}/5</Text>
                            </View>
                            {order.feedback?.comment ? (
                              <Text style={styles.submittedCommentText}>"{order.feedback.comment}"</Text>
                            ) : null}
                            <Text style={styles.feedbackSubmittedSuccessLabel}>✓ Review submitted successfully</Text>
                          </View>
                        ) : (
                          <View style={styles.feedbackFormView}>
                            <Text style={styles.feedbackInstructionText}>Rate your catering experience with {dynamicChefName}:</Text>
                            <View style={styles.starPickerRow}>
                              {[1, 2, 3, 4, 5].map((starNum) => {
                                const currentRating = feedbackRatings[orderId] || 0;
                                const isFilled = starNum <= currentRating;
                                return (
                                  <TouchableOpacity
                                    key={`cat-star-${starNum}`}
                                    onPress={() => setFeedbackRatings((prev) => ({ ...prev, [orderId]: starNum }))}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons
                                      name={isFilled ? "star" : "star-outline"}
                                      size={26}
                                      color={isFilled ? "#2D4A22" : "#CBD5E1"}
                                      style={{ marginHorizontal: 4 }}
                                    />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            <TextInput
                              style={styles.feedbackCommentInput}
                              placeholder="Write a review about the catering service, food taste, setup..."
                              placeholderTextColor="#94A3B8"
                              multiline
                              value={feedbackComments[orderId] || ""}
                              onChangeText={(val) => setFeedbackComments((prev) => ({ ...prev, [orderId]: val }))}
                            />

                            {Array.isArray(feedbackImages[orderId]) && feedbackImages[orderId].length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                  {feedbackImages[orderId].map((uri, imgIdx) => (
                                    <View key={`cat-picked-img-${imgIdx}`} style={{ position: "relative" }}>
                                      <Image source={{ uri }} style={styles.feedbackThumbImage} />
                                      <TouchableOpacity
                                        style={styles.removeThumbBtn}
                                        onPress={() => handleRemoveFeedbackImage(orderId, imgIdx)}
                                      >
                                        <Ionicons name="close-circle" size={18} color="#EF4444" />
                                      </TouchableOpacity>
                                    </View>
                                  ))}
                                </View>
                              </ScrollView>
                            )}

                            <View style={styles.feedbackFormActionsRow}>
                              <TouchableOpacity
                                style={styles.attachImageBtn}
                                activeOpacity={0.8}
                                onPress={() => handlePickFeedbackImages(orderId)}
                              >
                                <Ionicons name="camera-outline" size={16} color="#2D4A22" />
                                <Text style={styles.attachImageBtnText}>Add Photos</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.submitReviewBtn}
                                activeOpacity={0.85}
                                onPress={() => handleSubmitOrderFeedback(order)}
                                disabled={feedbackSubmitting[orderId]}
                              >
                                {feedbackSubmitting[orderId] ? (
                                  <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                  <Text style={styles.submitReviewBtnText}>Submit Review</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )}

                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionHeaderTitle}>Event Booking Details</Text>
                      <View style={styles.cateringOccasionBadgeTag}>
                        <Ionicons name={getOccasionIcon(cateringOccasion)} size={13} color="#166348" style={{ marginRight: 4 }} />
                        <Text style={styles.cateringOccasionBadgeTagText}>{cateringOccasion}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => toggleOrderStepper(orderId)}
                      style={[
                        styles.deliveryCard,
                        styles.cardWithBadgePadding,
                      ]}
                    >
                      {/* ✅ CHANGED: Top-right badge now shows ONLY the payment state. */}
                      <View
                        style={[
                          styles.floatingTopRightBadge,
                          cardPaymentBadgeSettled
                            ? styles.floatingBadgePaymentSettled
                            : styles.floatingBadgePaymentPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.floatingTopRightBadgeText,
                            cardPaymentBadgeSettled
                              ? styles.floatingBadgePaymentTextSettled
                              : styles.floatingBadgePaymentTextPending,
                          ]}
                        >
                          {cardPaymentBadgeText}
                        </Text>
                      </View>

                      <View style={styles.deliveryCardMain}>
                        <View style={styles.cateringEventTile}>
                          <View style={styles.cateringEventTileHeader}>
                            <Text style={styles.cateringEventTileHeaderText}>EVENT</Text>
                          </View>
                          <Ionicons name={getOccasionIcon(cateringOccasion)} size={22} color="#166348" style={{ marginTop: 6 }} />
                        </View>

                        <View style={styles.deliveryInfoCol}>
                          <Text style={styles.deliveryMenuTitle}>{cateringMenuName}</Text>

                          <View style={styles.cateringPriceStrip}>
                            <View style={styles.cateringPriceLabelCol}>
                              <Text style={styles.cateringPriceLabelText}>Total Amount</Text>
                              <Text style={styles.cateringPriceSubText}>{cateringDelivery} setup included</Text>
                            </View>
                            <Text style={styles.cateringPriceValueText}>₹{cateringTotal}</Text>
                          </View>

                          {/* ✅ CHANGED: Inline small pill shows the order status */}
                          <View style={styles.inlineOrderStatusPillWrapper}>
                            <View style={styles.inlineOrderStatusPill}>
                              <Text style={styles.inlineOrderStatusPillText}>{displayBadgeStatus}</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={styles.cateringMetaCombinedCard}>
                        <View style={styles.cateringMetaItem}>
                          <Ionicons name="calendar-outline" size={13} color="#166538" />
                          <Text style={styles.cateringMetaText} numberOfLines={1}>
                            {cateringDate}
                          </Text>
                        </View>

                        <View style={styles.cateringMetaDottedSep} />

                        <View style={styles.cateringMetaItem}>
                          <Ionicons name="time-outline" size={13} color="#166538" />
                          <Text style={styles.cateringMetaText} numberOfLines={1}>
                            {cateringTime}
                          </Text>
                        </View>

                        <View style={styles.cateringMetaDottedSep} />

                        <View style={styles.cateringMetaItem}>
                          <Text style={styles.cateringMetaGuestTextLabel}>Guests:</Text>
                          <Text style={styles.cateringMetaText} numberOfLines={1}>
                            {cateringGuests}
                          </Text>
                        </View>

                        <View style={styles.cateringMetaDottedSep} />

                        <View style={styles.cateringMetaItem}>
                          <Ionicons name="person-outline" size={13} color="#166538" />
                          <Text style={styles.cateringMetaText} numberOfLines={1}>
                            {dynamicChefName}
                          </Text>
                        </View>
                      </View>

                      {isCateringStepperOpen && (
                        <View style={styles.embeddedStepperWrapper}>
                          <WhatsNextStepperCard order={order} targetStatus={orderStatusString} />
                        </View>
                      )}

                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openPreviewModal(order)}
                        >
                          <Ionicons name="restaurant-outline" size={16} color="#334155" />
                          <Text style={styles.actionBtnText}>Menu Items</Text>
                        </TouchableOpacity>

                        <View style={styles.actionDivider} />

                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openOrderDetails(order)}
                        >
                          <Ionicons name="settings-outline" size={16} color="#334155" />
                          <Text style={styles.actionBtnText}>Order Details</Text>
                        </TouchableOpacity>

                        <View style={styles.actionDivider} />

                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => {
                            setSelectedOrderDetails(order);
                            openInvoiceScreen();
                          }}
                        >
                          <Octicons name="file-badge" size={15} color="#334155" />
                          <Text style={styles.actionBtnText}>Invoice</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {isNotLastOrder && <View style={styles.orderDividerDotted} />}
                </View>
              );
            }

            const rawScheduledDates: string[] = Array.isArray(order.upcomingDeliveries) && order.upcomingDeliveries.length > 0
              ? order.upcomingDeliveries
              : [order.deliveryDate || "Mon, 17 Jun"];

            const scheduledDatesArray = sortDatesAscending(rawScheduledDates);
            const currentSelectedDate = selectedDatesPerOrder[orderId] || scheduledDatesArray[0] || order.deliveryDate;
            const { dayName } = parseDateParts(currentSelectedDate);

            let dynamicMenuName = order.menuName || "Gym Diet Plan";
            let dynamicMenuImage = order.menuImage || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";

            if (order.selections && typeof order.selections === "object" && !Array.isArray(order.selections)) {
              const keys = Object.keys(order.selections).filter((k) => k !== "pausedDates");
              const matchedDayKey = keys.find((k) => k.toLowerCase().includes(dayName.toLowerCase()));
              if (matchedDayKey && order.selections[matchedDayKey] && order.selections[matchedDayKey].length > 0) {
                const firstSelection = order.selections[matchedDayKey][0];
                if (firstSelection.name) dynamicMenuName = `${firstSelection.name} (${matchedDayKey})`;
                if (firstSelection.image) dynamicMenuImage = firstSelection.image;
              }
            }

            const timeSlot = order.deliveryTimeSlot || "7:00 PM - 9:00 PM";

            return (
              <View key={`user-order-wrapper-${orderId || orderIndex}`}>
                <View style={styles.orderGroupContainer}>
                  <View style={styles.nextDeliveryBanner}>
                    <View style={styles.nextDeliveryContentLeft}>
                      <View style={styles.nextDeliveryHeaderRow}>
                        <View style={styles.calendarIconBox}>
                          <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
                        </View>
                        <Text style={styles.nextDeliveryLabel}>Order #{orderId}</Text>
                      </View>

                      <Text style={styles.nextDeliveryDateText}>
                        {currentSelectedDate} <Text style={styles.bulletDot}>•</Text> {timeSlot}
                      </Text>
                      <Text style={styles.nextDeliveryMenuTitle}>
                        {dynamicMenuName} • Chef: <Text style={{ color: "#166538", fontWeight: "700" }}>{dynamicChefName}</Text>
                      </Text>

                      <View style={styles.bannerActionRow}>
                        <TouchableOpacity
                          style={styles.viewDetailsBtn}
                          activeOpacity={0.85}
                          onPress={() => openOrderDetails(order, currentSelectedDate)}
                        >
                          <Text style={styles.viewDetailsBtnText}>View Details</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Image source={{ uri: dynamicMenuImage }} style={styles.nextDeliveryImage} />
                  </View>

                  <DeliverySlotCountdownWidget
                    deliveryDate={currentSelectedDate}
                    timeSlot={timeSlot}
                    isDelivered={isDeliveredState}
                    estimatedDeliveryAt={resolveEffectiveDeliveryTime(order)}
                  />

                  {isDeliveredState && (
                    <View style={styles.feedbackCardContainer}>
                      <View style={styles.feedbackHeaderRow}>
                        <Ionicons name="star" size={18} color="#2D4A22" />
                        <Text style={styles.feedbackCardTitle}>Chef Feedback & Rating</Text>
                      </View>

                      {order.feedback?.isSubmitted ? (
                        <View style={styles.feedbackSubmittedView}>
                          <View style={styles.submittedStarsRow}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Ionicons
                                key={`mb-sub-star-${s}`}
                                name={s <= (order.feedback?.rating || 0) ? "star" : "star-outline"}
                                size={18}
                                color="#2D4A22"
                              />
                            ))}
                            <Text style={styles.submittedRatingText}>{order.feedback?.rating}/5</Text>
                          </View>
                          {order.feedback?.comment ? (
                            <Text style={styles.submittedCommentText}>"{order.feedback.comment}"</Text>
                          ) : null}
                          <Text style={styles.feedbackSubmittedSuccessLabel}>✓ Review submitted successfully</Text>
                        </View>
                      ) : (
                        <View style={styles.feedbackFormView}>
                          <Text style={styles.feedbackInstructionText}>Rate your subscription meal with Chef {dynamicChefName}:</Text>
                          <View style={styles.starPickerRow}>
                            {[1, 2, 3, 4, 5].map((starNum) => {
                              const currentRating = feedbackRatings[orderId] || 0;
                              const isFilled = starNum <= currentRating;
                              return (
                                <TouchableOpacity
                                  key={`mb-star-${starNum}`}
                                  onPress={() => setFeedbackRatings((prev) => ({ ...prev, [orderId]: starNum }))}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name={isFilled ? "star" : "star-outline"}
                                    size={26}
                                    color={isFilled ? "#2D4A22" : "#CBD5E1"}
                                    style={{ marginHorizontal: 4 }}
                                  />
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <TextInput
                            style={styles.feedbackCommentInput}
                            placeholder="Write a review about the meal quality, taste, delivery..."
                            placeholderTextColor="#94A3B8"
                            multiline
                            value={feedbackComments[orderId] || ""}
                            onChangeText={(val) => setFeedbackComments((prev) => ({ ...prev, [orderId]: val }))}
                          />

                          {Array.isArray(feedbackImages[orderId]) && feedbackImages[orderId].length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                {feedbackImages[orderId].map((uri, imgIdx) => (
                                  <View key={`mb-picked-img-${imgIdx}`} style={{ position: "relative" }}>
                                    <Image source={{ uri }} style={styles.feedbackThumbImage} />
                                    <TouchableOpacity
                                      style={styles.removeThumbBtn}
                                      onPress={() => handleRemoveFeedbackImage(orderId, imgIdx)}
                                    >
                                      <Ionicons name="close-circle" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </View>
                            </ScrollView>
                          )}

                          <View style={styles.feedbackFormActionsRow}>
                            <TouchableOpacity
                              style={styles.attachImageBtn}
                              activeOpacity={0.8}
                              onPress={() => handlePickFeedbackImages(orderId)}
                            >
                              <Ionicons name="camera-outline" size={16} color="#2D4A22" />
                              <Text style={styles.attachImageBtnText}>Add Photos</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.submitReviewBtn}
                              activeOpacity={0.85}
                              onPress={() => handleSubmitOrderFeedback(order)}
                              disabled={feedbackSubmitting[orderId]}
                            >
                              {feedbackSubmitting[orderId] ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.submitReviewBtnText}>Submit Review</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>Upcoming Deliveries</Text>
                  </View>

                  {scheduledDatesArray.length > 0 && (
                    <View style={styles.deliveriesList}>
                      {scheduledDatesArray.map((itemDate, index) => {
                        const { dayName, dayNumber, month } = parseDateParts(itemDate);
                        const isPaused =
                          !!pausedDates[`${orderId}-${itemDate}`] ||
                          (Array.isArray(order.pausedDates) && order.pausedDates.includes(itemDate));
                        const isSelected = currentSelectedDate === itemDate;
                        const cardKey = `${orderId}-${itemDate}`;
                        const isCardStepperOpen = !!expandedSteppers[cardKey];

                        const matchedSchedule = (order.deliverySchedules || []).find((s: any) => s.date === itemDate);
                        const individualStatus = isPaused ? "Paused" : (matchedSchedule?.status || order.orderStatus || "Scheduled");
                        const individualAddress = matchedSchedule?.address || order.addressDetails || order.deliveryAddress || "";

                        return (
                          <TouchableOpacity
                            key={`delivery-card-${orderId}-${index}`}
                            activeOpacity={0.88}
                            onPress={() => {
                              handleSelectDateForOrder(orderId, itemDate);
                              toggleOrderStepper(cardKey);
                            }}
                            style={[
                              styles.deliveryCard,
                              styles.cardWithBadgePadding,
                              isSelected && styles.deliveryCardSelected,
                              isPaused && styles.deliveryCardPausedBg,
                            ]}
                          >
                            {/* ✅ CHANGED: Top-right badge now shows ONLY the payment state. */}
                            <View
                              style={[
                                styles.floatingTopRightBadge,
                                cardPaymentBadgeSettled
                                  ? styles.floatingBadgePaymentSettled
                                  : styles.floatingBadgePaymentPending,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.floatingTopRightBadgeText,
                                  cardPaymentBadgeSettled
                                    ? styles.floatingBadgePaymentTextSettled
                                    : styles.floatingBadgePaymentTextPending,
                                ]}
                              >
                                {cardPaymentBadgeText}
                              </Text>
                            </View>

                            <View style={styles.deliveryCardMain}>
                              <View
                                style={[
                                  styles.dateTile,
                                  isSelected ? styles.dateTileSelected : isPaused ? styles.dateTilePaused : styles.dateTileActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.dateTileDay,
                                    isSelected ? styles.dateTileDaySelected : isPaused ? styles.dateTileDayPaused : styles.dateTileDayActive,
                                  ]}
                                >
                                  {dayName}
                                </Text>
                                <Text
                                  style={[
                                    styles.dateTileNumber,
                                    isSelected ? styles.dateTileNumberSelected : isPaused ? styles.dateTileNumberPaused : styles.dateTileNumberActive,
                                  ]}
                                >
                                  {dayNumber}
                                </Text>
                                <Text
                                  style={[
                                    styles.dateTileMonth,
                                    isSelected ? styles.dateTileMonthSelected : isPaused ? styles.dateTileMonthPaused : styles.dateTileMonthActive,
                                  ]}
                                >
                                  {month}
                                </Text>
                              </View>

                              <View style={styles.deliveryInfoCol}>
                                <Text style={styles.deliveryMenuTitle}>{order.menuName || "Classic Lunch"}</Text>
                                <Text style={styles.deliveryTimeText}>{timeSlot} • Chef: {dynamicChefName}</Text>
                                {individualAddress ? (
                                  <View style={styles.addressInlineRow}>
                                    <Ionicons name="location-outline" size={12} color="#166538" style={{ marginRight: 3 }} />
                                    <Text style={styles.scheduleAddressSmall} numberOfLines={1}>
                                      {individualAddress}
                                    </Text>
                                  </View>
                                ) : null}
                                {/* ✅ CHANGED: Inline small pill shows the order status per schedule */}
                                <View style={styles.inlineOrderStatusPillWrapper}>
                                  <View style={styles.inlineOrderStatusPill}>
                                    <Text style={styles.inlineOrderStatusPillText}>{individualStatus}</Text>
                                  </View>
                                </View>
                              </View>

                              <Ionicons
                                name={isCardStepperOpen ? "chevron-up" : "chevron-forward"}
                                size={18}
                                color="#0F172A"
                              />
                            </View>

                            {isCardStepperOpen && (
                              <View style={styles.embeddedStepperWrapper}>
                                <WhatsNextStepperCard order={order} targetStatus={individualStatus} />
                              </View>
                            )}

                            {isPaused ? (
                              <View style={styles.pausedFooterRow}>
                                <View style={styles.pausedFooterTextCol}>
                                  <Text style={styles.deliveryPausedTitle}>Delivery paused</Text>
                                  <Text style={styles.deliveryPausedSubtext}>
                                    Select a date to continue
                                  </Text>
                                </View>
                                <View style={styles.pausedButtonsGroup}>
                                  <TouchableOpacity
                                    style={styles.unpauseBtn}
                                    activeOpacity={0.8}
                                    onPress={() => handleUnpauseClick(order, itemDate)}
                                  >
                                    <Ionicons name="play-circle-outline" size={14} color="#16A34A" />
                                    <Text style={styles.unpauseBtnText}>Resume</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={styles.addNewDateBtn}
                                    activeOpacity={0.8}
                                    onPress={() => openRescheduleModal(order, itemDate)}
                                  >
                                    <Ionicons name="calendar-outline" size={14} color="#D97706" />
                                    <Text style={styles.addNewDateBtnText}>Shift Date</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                              <View style={styles.cardActionsRow}>
                                <TouchableOpacity
                                  style={styles.actionBtn}
                                  onPress={() => handlePauseClick(order, itemDate)}
                                >
                                  <Ionicons name="pause-circle-outline" size={15} color="#334155" />
                                  <Text style={styles.actionBtnText}>Pause</Text>
                                </TouchableOpacity>

                                <View style={styles.actionDivider} />

                                <TouchableOpacity style={styles.actionBtn} onPress={() => openPreviewModal(order, itemDate)}>
                                  <Ionicons name="eye-outline" size={15} color="#334155" />
                                  <Text style={styles.actionBtnText}>Preview</Text>
                                </TouchableOpacity>

                                <View style={styles.actionDivider} />

                                <TouchableOpacity style={styles.actionBtn} onPress={() => openOrderDetails(order, itemDate)}>
                                  <Ionicons name="settings-outline" size={15} color="#334155" />
                                  <Text style={styles.actionBtnText}>Details</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {isNotLastOrder && <View style={styles.orderDividerDotted} />}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyTabState}>
            <Text style={styles.emptyTabTitle}>No {activeTab.toLowerCase()} orders</Text>
            <Text style={styles.emptyTabSubtitle}>
              Your orders will appear here once booked.
            </Text>
          </View>
        )}

        <View style={styles.bottomControlCard}>
          <View style={styles.sproutIconBox}>
            <Ionicons name="leaf-outline" size={22} color="#2D4A22" />
          </View>
          <View style={styles.bottomControlTextCol}>
            <Text style={styles.bottomControlTitle}>Flexible Management</Text>
            <Text style={styles.bottomControlSubtext}>
              Pause, shift dates, or customize your meal schedule with ease.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showRescheduleModal} transparent animationType="none" onRequestClose={closeRescheduleModal}>
        <BlurView intensity={30} tint="dark" style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeRescheduleModal} />
          <Animated.View
            style={[
              styles.rescheduleModalContent,
              { transform: [{ translateY: rescheduleSheetAnim }] },
            ]}
          >
            <View style={styles.drawerHandle} />
            <TouchableOpacity style={styles.modalCloseBtn} onPress={closeRescheduleModal}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.modalHeaderTitle}>Shift Delivery Date</Text>
            <Text style={styles.modalOrderIdText}>
              Order #{rescheduleTargetOrder?.orderId} • Current Date: {rescheduleOldDate}
            </Text>

            <Text style={styles.selectDateSectionTitle}>Choose New Delivery Date:</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 14 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {availableDateOptions.map((dateOpt) => {
                  const isSelected = selectedNewDate === dateOpt;
                  return (
                    <TouchableOpacity
                      key={`opt-${dateOpt}`}
                      activeOpacity={0.8}
                      onPress={() => setSelectedNewDate(dateOpt)}
                      style={[
                        styles.dateOptionPill,
                        isSelected && styles.dateOptionPillSelected,
                      ]}
                    >
                      <Ionicons
                        name="calendar-clear-outline"
                        size={16}
                        color={isSelected ? "#FFFFFF" : "#2D4A22"}
                      />
                      <Text
                        style={[
                          styles.dateOptionPillText,
                          isSelected && styles.dateOptionPillTextSelected,
                        ]}
                      >
                        {dateOpt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={[styles.selectDateSectionTitle, { marginTop: 2, marginBottom: 6 }]}>Delivery Address for this Date:</Text>
            <TextInput
              style={styles.rescheduleAddressInput}
              placeholder="Enter delivery address for shifted date"
              placeholderTextColor="#94A3B8"
              value={rescheduleNewAddress}
              onChangeText={setRescheduleNewAddress}
            />

            <View style={styles.shiftSummaryNotice}>
              <Ionicons name="information-circle-outline" size={18} color="#D97706" />
              <Text style={styles.shiftSummaryNoticeText}>
                Your menu from {rescheduleOldDate} will now be delivered on <Text style={{ fontWeight: "800", color: "#0F172A" }}>{selectedNewDate}</Text>.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.confirmShiftCtaButton}
              activeOpacity={0.88}
              onPress={handleConfirmReschedule}
              disabled={reschedulingLoading}
            >
              {reschedulingLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmShiftCtaButtonText}>
                  Confirm Date Shift
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </BlurView>
      </Modal>

      <Modal visible={showPreviewModal} transparent animationType="none" onRequestClose={closePreviewModal}>
        <BlurView intensity={25} tint="dark" style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePreviewModal} />

          <Animated.View
            style={[
              styles.previewModalContent,
              { transform: [{ translateY: previewSheetAnim }], height: "82%" },
            ]}
          >
            <View style={styles.drawerHandle} />
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closePreviewModal} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.previewHeaderCentered}>
              <Text style={styles.previewTitle}>
                {isPreviewHomemade ? "Ordered Dishes" : "Customer Selected Items"}
              </Text>
              <Text style={styles.previewSubtitle}>
                {isPreviewHomemade
                  ? "Prepared fresh for this order"
                  : isPreviewCatering
                  ? "Confirmed platter dishes & course selections"
                  : "Customized mealbox items"}
              </Text>
            </View>

            {!isPreviewCatering && !isPreviewHomemade && previewOrder?.selections && !Array.isArray(previewOrder.selections) && (
              <View style={styles.pillTabsWrapperBlock}>
                {Object.keys(previewOrder.selections)
                  .filter((k) => k !== "pausedDates")
                  .map((dayKey) => {
                    const dayItemsCount = previewOrder.selections[dayKey]?.length || 0;
                    const isTabPillSelected = previewActiveDay.toLowerCase() === dayKey.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={`preview-tab-pill-${dayKey}`}
                        activeOpacity={0.8}
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

            <ScrollView style={{ width: "100%", marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {isPreviewHomemade ? (
                <View style={styles.previewCategoryCard}>
                  <View style={styles.previewCategoryHeader}>
                    <Text style={styles.previewCategoryTitle}>Ordered Homemade Items</Text>
                  </View>

                  {Array.isArray(previewOrder?.items) && previewOrder.items.length > 0 ? (
                    previewOrder.items.map((dishItem: any, idx: number) => (
                      <View key={`conf-preview-homemade-${idx}`} style={styles.previewItemCard}>
                        <Image
                          source={{ uri: dishItem.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop" }}
                          style={styles.previewItemImage}
                        />
                        <View style={styles.previewItemInfoCol}>
                          <Text style={styles.previewItemName}>{dishItem.name}</Text>
                          <Text style={styles.previewItemServingSub}>
                            {dishItem.selectedQtyConfig || "Standard"} • Qty: {dishItem.quantity || 1}
                          </Text>
                        </View>
                        <Text style={styles.previewItemPriceValue}>
                          ₹{(Number(dishItem.price) || 0) * (Number(dishItem.quantity) || 1)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.previewEmptyListText}>
                      No items listed.
                    </Text>
                  )}
                </View>
              ) : isPreviewCatering ? (
                <View style={{ width: "100%" }}>
                  {Array.isArray(previewOrder?.selections) &&
                    previewOrder.selections.map((cat: any, index: number) => {
                      const allSelected = [...(cat.selected || []), ...(cat.extraSelected || [])];
                      if (!allSelected.length) return null;

                      return (
                        <View key={`conf-preview-cat-${index}`} style={styles.previewCategoryCard}>
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
                                  size={18}
                                  color={isExtra ? "#f59e0b" : "#16a34a"}
                                  style={{ marginLeft: "auto" }}
                                />
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}

                  {Array.isArray(previewOrder?.addons) && previewOrder.addons.length > 0 && (
                    <View style={styles.previewCategoryCard}>
                      <View style={styles.previewCategoryHeader}>
                        <Text style={styles.previewCategoryTitle}>Add-ons</Text>
                      </View>
                      {previewOrder.addons.map((addon: any, idx: number) => (
                        <View key={`conf-addon-preview-${idx}`} style={styles.previewItemCard}>
                          <Image
                            source={{ uri: addon.imageUrl || addon.image || "https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=120&auto=format&fit=crop" }}
                            style={styles.previewItemImage}
                          />
                          <Text style={styles.previewItemName}>
                            {addon.name} × {addon.count || 1}
                          </Text>
                          <View style={styles.extraTag}>
                            <Text style={styles.extraTagText}>+₹{(addon.price || 0) * (addon.count || 1)}/plate</Text>
                          </View>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#16a34a"
                            style={{ marginLeft: "auto" }}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.premiumMealBoxContentCardFrame}>
                  <View style={styles.subCardHeaderStripLabel}>
                    <Text style={styles.subCardHeaderStripLabelText}>
                      {previewActiveDay || "SELECTED"} MENU PREFERENCE
                    </Text>
                  </View>

                  {currentPreviewDaySelections.length === 0 ? (
                    <Text style={styles.previewEmptyStateText}>
                      No items configured for this selection.
                    </Text>
                  ) : (
                    Object.entries(groupedPreviewItemsMap).map(([sectionTitle, dishesGroupArray]) => {
                      if (!dishesGroupArray || dishesGroupArray.length === 0) return null;
                      return (
                        <View key={`preview-section-${sectionTitle}`} style={{ marginTop: 14 }}>
                          <View style={styles.sectionHeaderLabelContainerTag}>
                            <Text style={styles.sectionHeaderLabelContainerTagText}>{sectionTitle}</Text>
                          </View>

                          {dishesGroupArray.map((dishItem: any, idx: number) => {
                            const isExtraItemAddon = sectionTitle === "ADD ON'S" || dishItem.type === "addon";
                            return (
                              <View
                                key={`preview-dish-item-${idx}`}
                                style={styles.previewSelectionRowItemBlock}
                              >
                                <Image
                                  source={
                                    dishItem.image
                                      ? { uri: dishItem.image }
                                      : { uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&auto=format&fit=crop" }
                                  }
                                  style={styles.modalCircularFoodThumbGraphic}
                                />
                                <View style={styles.dishPreviewTextCol}>
                                  <Text style={styles.modalItemNameTextString}>{dishItem.name}</Text>
                                  {dishItem.spiceLevel && (
                                    <Text style={styles.dishPreviewSpiceLevel}>
                                      Spice: {dishItem.spiceLevel}
                                    </Text>
                                  )}
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
              )}
            </ScrollView>

            <View style={styles.modalAbsoluteFooterCTAWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={closePreviewModal}
                style={styles.modalAbsoluteFooterCTAButtonSolid}
              >
                <Text style={styles.modalAbsoluteFooterCTAButtonSolidText}>
                  Close Summary
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIconBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#F2EFE9",
    borderRadius: 24,
    marginHorizontal: 16,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  tabButtonActive: {
    backgroundColor: "#2D4A22",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  orderGroupContainer: {
    marginBottom: 4,
  },
  orderDividerDotted: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginVertical: 20,
    borderRadius: 1,
  },
  cateringOccasionBadgeTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cateringOccasionBadgeTagText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166348",
  },
  cateringEventTile: {
    width: 58,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    overflow: "hidden",
  },
  cateringEventTileHeader: {
    width: "100%",
    backgroundColor: "#15803D",
    paddingVertical: 2,
    alignItems: "center",
  },
  cateringEventTileHeaderText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  cardBadgesRowSimplified: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    alignItems: "center",
  },
  simplifiedBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // ✅ NEW: Inline order-status pill — small companion next to the payment badge
  inlineOrderStatusPillWrapper: {
    flexDirection: "row",
    marginTop: 6,
  },
  inlineOrderStatusPill: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  inlineOrderStatusPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#1E40AF",
    letterSpacing: 0.2,
  },

  cateringMetaCombinedCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    rowGap: 6,
  },
  cateringMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  cateringMetaText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
    letterSpacing: 0.1,
  },
  cateringMetaGuestTextLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#166538",
  },
  cateringMetaDottedSep: {
    width: 1,
    height: 14,
    borderStyle: "dotted",
    borderLeftWidth: 1,
    borderColor: "#94A3B8",
    marginHorizontal: 4,
  },

  cateringPriceStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  cateringPriceLabelCol: {
    flex: 1,
    paddingRight: 8,
  },
  cateringPriceLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 0.1,
  },
  cateringPriceSubText: {
    fontSize: 9.5,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 1,
  },
  cateringPriceValueText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#166534",
    letterSpacing: -0.3,
  },

  deliveryCardPriceRight: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  cateringPriceBigTotal: {
    fontSize: 17,
    fontWeight: "900",
    color: "#16A34A",
    textAlign: "right",
  },
  cateringPriceTotalLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "right",
    marginTop: 1,
    textTransform: "capitalize",
  },
  nextDeliveryBanner: {
    backgroundColor: "#FFFBF2",
    borderRadius: 24,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F3E8D3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  nextDeliveryContentLeft: {
    flex: 1,
    paddingRight: 10,
  },
  nextDeliveryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  calendarIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#2D4A22",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  nextDeliveryLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  nextDeliveryDateText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 2,
  },
  bulletDot: {
    fontSize: 14,
    color: "#64748B",
  },
  nextDeliveryMenuTitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 10,
    fontWeight: "500",
  },
  bannerActionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewDetailsBtn: {
    backgroundColor: "#2D4A22",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  viewDetailsBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  nextDeliveryImage: {
    width: 86,
    height: 86,
    borderRadius: 16,
    resizeMode: "cover",
  },
  compactTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
    gap: 5,
  },
  compactTimerRowDelivered: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
    gap: 5,
  },
  compactTimerText: {
    fontSize: 11.5,
    color: "#15803D",
    fontWeight: "600",
  },
  compactTimerBold: {
    fontWeight: "900",
    color: "#14532D",
    letterSpacing: 0.3,
  },
  compactTimerDeliveredText: {
    fontSize: 11.5,
    color: "#15803D",
    fontWeight: "800",
  },

  feedbackCardContainer: {
    backgroundColor: "#F0FDF4",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    marginBottom: 14,
  },
  feedbackHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  feedbackCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#166534",
  },
  feedbackSubmittedView: {
    paddingVertical: 4,
  },
  submittedStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  submittedRatingText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
    marginLeft: 6,
  },
  submittedCommentText: {
    fontSize: 12.5,
    color: "#14532D",
    fontStyle: "italic",
    marginTop: 2,
  },
  feedbackSubmittedSuccessLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16A34A",
    marginTop: 6,
  },
  feedbackFormView: {
    paddingTop: 2,
  },
  feedbackInstructionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
    marginBottom: 6,
  },
  starPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  feedbackCommentInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: "#0F172A",
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  feedbackThumbImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    resizeMode: "cover",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  removeThumbBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
  },
  feedbackFormActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  attachImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#86EFAC",
    gap: 6,
  },
  attachImageBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  submitReviewBtn: {
    backgroundColor: "#2D4A22",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  submitReviewBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  deliveriesList: {
    gap: 16,
  },
  deliveryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
    position: "relative",
  },
  cardWithBadgePadding: {
    paddingTop: 18,
  },
  deliveryCardSelected: {
    borderColor: "#2D4A22",
    borderWidth: 1.5,
    backgroundColor: "#FAFCF9",
  },
  deliveryCardPausedBg: {
    backgroundColor: "#FFFBF5",
    borderColor: "#FDE68A",
  },
  deliveryCardMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  // ✅ CHANGED: floatingTopRightBadge now shows ONLY payment state
  floatingTopRightBadge: {
    position: "absolute",
    top: -1,
    right: 18,
    backgroundColor: "#F0FDF4",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#86EFAC",
    paddingHorizontal: 12,
    paddingVertical: 3,
    zIndex: 10,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  floatingTopRightBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#15803D",
  },
  floatingBadgePaused: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  floatingBadgeTextPaused: {
    color: "#D97706",
  },
  floatingBadgePreparing: {
    backgroundColor: "#DCFCE7",
    borderColor: "#4ADE80",
  },
  floatingBadgeTextPreparing: {
    color: "#15803D",
  },
  floatingBadgeDelivered: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
  },
  floatingBadgeTextDelivered: {
    color: "#15803D",
  },
  // ✅ NEW: Payment-badge themes — settled (green) vs pending (amber)
  floatingBadgePaymentSettled: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  floatingBadgePaymentPending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  floatingBadgePaymentTextSettled: {
    color: "#15803D",
  },
  floatingBadgePaymentTextPending: {
    color: "#B45309",
  },
  dateTile: {
    width: 58,
    height: 64,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  dateTileActive: {
    backgroundColor: "#F2F7F2",
  },
  dateTileSelected: {
    backgroundColor: "#2D4A22",
  },
  dateTilePaused: {
    backgroundColor: "#FEF3C7",
  },
  dateTileDay: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    color: "#2D4A22",
  },
  dateTileDayActive: {
    color: "#2D4A22",
  },
  dateTileDaySelected: {
    color: "#FFFFFF",
  },
  dateTileDayPaused: {
    color: "#92400E",
  },
  dateTileNumber: {
    fontSize: 18,
    fontWeight: "900",
    marginVertical: -1,
    color: "#0F172A",
  },
  dateTileNumberActive: {
    color: "#0F172A",
  },
  dateTileNumberSelected: {
    color: "#FFFFFF",
  },
  dateTileNumberPaused: {
    color: "#78350F",
  },
  dateTileMonth: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#2D4A22",
  },
  dateTileMonthActive: {
    color: "#2D4A22",
  },
  dateTileMonthSelected: {
    color: "#FFFFFF",
  },
  dateTileMonthPaused: {
    color: "#92400E",
  },
  deliveryInfoCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  deliveryMenuTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  deliveryTimeText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  addressInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  scheduleAddressSmall: {
    fontSize: 11,
    color: "#166538",
    fontWeight: "600",
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    marginTop: 14,
    paddingTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  actionDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#E2E8F0",
  },
  pausedFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
    marginTop: 12,
    paddingTop: 10,
  },
  pausedFooterTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  deliveryPausedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D97706",
  },
  deliveryPausedSubtext: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  pausedButtonsGroup: {
    flexDirection: "row",
    gap: 6,
  },
  unpauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#86EFAC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
    gap: 4,
  },
  unpauseBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },
  addNewDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    gap: 6,
  },
  addNewDateBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D97706",
  },

  embeddedStepperWrapper: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
  },
  whatsNextCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  whatsNextHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  whatsNextHeaderLeft: {
    flex: 1,
    paddingRight: 10,
  },
  whatsNextTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  whatsNextSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },
  whatsNextBagIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  stepperContainer: {
    paddingLeft: 2,
  },
  stepRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  stepIndicatorCol: {
    width: 32,
    alignItems: "center",
    marginRight: 10,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  stepCircleGreenFilled: {
    backgroundColor: "#16A34A",
  },
  stepCircleActivePulse: {
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 4,
  },
  stepCircleInactive: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  stepLine: {
    position: "absolute",
    top: 28,
    bottom: -16,
    width: 2,
    zIndex: 1,
  },
  stepLineGreen: {
    backgroundColor: "#16A34A",
  },
  stepLineInactive: {
    backgroundColor: "#E2E8F0",
  },
  stepContentCol: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 2,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  stepHeading: {
    fontSize: 13.5,
    fontWeight: "800",
    marginBottom: 2,
    flexShrink: 1,
  },
  stepHeadingGreen: {
    color: "#16A34A",
  },
  stepHeadingActiveDark: {
    color: "#0F172A",
    fontWeight: "900",
  },
  stepHeadingInactive: {
    color: "#94A3B8",
  },
  stepSubtext: {
    fontSize: 11.5,
    color: "#64748B",
    lineHeight: 16,
    fontWeight: "500",
  },
  liveActiveIndicatorPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: "#86EFAC",
  },
  liveActiveIndicatorPillText: {
    fontSize: 8.5,
    fontWeight: "900",
    color: "#15803D",
    letterSpacing: 0.5,
  },

  bottomControlCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F5ED",
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
  },
  sproutIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E2EBD3",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomControlTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  bottomControlTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  bottomControlSubtext: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 16,
  },
  emptyTabState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyTabTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyTabSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
  },
  detailsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailsHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  detailsScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  greenHeroBanner: {
    backgroundColor: "#2B4B22",
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  greenHeroLeftCol: {
    flex: 1,
    paddingRight: 8,
  },
  orderIdPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  orderIdPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  copyPillBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
  },
  copyPillBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scheduledStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  greenStatusDotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  scheduledStatusText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4ADE80",
  },
  heroConfirmedHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  heroConfirmedSubheading: {
    fontSize: 12,
    color: "#D1FAE5",
    fontWeight: "500",
  },
  scooterMascotGraphic: {
    width: 110,
    height: 100,
    resizeMode: "contain",
  },

  mealSpecCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  mealSpecMainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  mealSpecImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
    resizeMode: "cover",
  },
  mealSpecTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  mealSpecTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  mealSpecSubtext: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 4,
    fontWeight: "600",
  },
  mealSpecPriceText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#2D4A22",
  },
  perWeekSpan: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  mealSpecFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAF8",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginTop: 12,
  },
  specFooterCol: {
    flex: 1,
  },
  specFooterLabel: {
    fontSize: 10.5,
    color: "#64748B",
    fontWeight: "600",
  },
  specFooterValue: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  specFooterDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 10,
  },

  mergedScheduleSectionBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  mergedScheduleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  mergedHeaderLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mergedScheduleHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  metaIconTextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  selectedScheduleStatusBadge: {
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  selectedScheduleStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#166538",
  },
  selectedScheduleCardContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  selectedScheduleDateTile: {
    width: 52,
    height: 58,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  selectedScheduleInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  selectedScheduleMenuTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 1,
  },
  selectedScheduleSlotText: {
    fontSize: 11.5,
    color: "#64748B",
  },
  selectedScheduleAddressText: {
    fontSize: 11.5,
    color: "#166538",
    fontWeight: "600",
    lineHeight: 15,
    flex: 1,
  },

  detailsSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  detailsSectionTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  orderSummaryCardBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 24,
  },
  orderSummaryCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },
  orderSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderSummaryLabel: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
  },
  orderSummaryValue: {
    fontSize: 12.5,
    color: "#0F172A",
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  orderSummaryDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 8,
  },
  orderSummaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderSummaryTotalLabel: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  orderSummaryTotalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#2D4A22",
  },
  stickyFooterWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FAF9F5",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EAE8E3",
  },
  viewInvoiceDarkBtn: {
    backgroundColor: "#2D4A22",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  viewInvoiceDarkBtnText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  invoicePaperCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  invoiceHeaderBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  invoiceBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  brandIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#2D4A22",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTextGroup: {
    flex: 1,
  },
  brandTitleText: {
    fontSize: 14.5,
    fontWeight: "900",
    color: "#2D4A22",
    letterSpacing: 0.5,
  },
  brandSubtext: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  invoiceMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  invoiceMetaLeftCol: {
    flex: 1,
    paddingRight: 10,
  },
  invoiceMetaRightCol: {
    alignItems: "flex-end",
  },
  invoiceMetaLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  invoiceMetaValueText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceMetaSubtext: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  invoiceMetaAccentText: {
    fontSize: 11,
    color: "#15803D",
    fontWeight: "700",
    marginTop: 3,
  },
  invoiceTableDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  invoiceSectionTitle: {
    fontSize: 10.5,
    fontWeight: "900",
    color: "#64748B",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  invoiceItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  invoiceItemInfoCol: {
    flex: 1,
    paddingRight: 10,
  },
  invoiceItemNameText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceItemDescText: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 1,
  },
  invoiceItemPriceText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceCalcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  invoiceCalcLabel: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
  },
  invoiceCalcValue: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  invoiceTotalDivider: {
    height: 1.5,
    backgroundColor: "#0F172A",
    marginVertical: 10,
  },
  invoiceTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  invoiceTotalLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  invoiceTotalValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#2D4A22",
  },
  paymentMethodInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F5ED",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  paymentMethodTextCol: {
    flex: 1,
    marginLeft: 8,
  },
  paymentMethodTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  paymentMethodSubtext: {
    fontSize: 10.5,
    color: "#64748B",
    marginTop: 1,
  },
  invoiceWatermarkFooter: {
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  invoiceWatermarkText: {
    fontSize: 10.5,
    color: "#94A3B8",
    fontWeight: "600",
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  drawerHandle: { width: 40, height: 5, backgroundColor: "#cbd5e1", borderRadius: 10, alignSelf: "center", marginBottom: 14 },
  modalCloseBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    backgroundColor: "#334155",
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalOrderIdText: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "600",
    marginBottom: 14,
  },
  rescheduleModalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 32,
  },
  selectDateSectionTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#2D4A22",
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rescheduleAddressInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    marginBottom: 10,
  },
  dateOptionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F7F2",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  dateOptionPillSelected: {
    backgroundColor: "#2D4A22",
    borderColor: "#2D4A22",
  },
  dateOptionPillText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#2D4A22",
  },
  dateOptionPillTextSelected: {
    color: "#FFFFFF",
  },
  shiftSummaryNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBF5",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 12,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  shiftSummaryNoticeText: {
    flex: 1,
    fontSize: 11.5,
    color: "#92400E",
    lineHeight: 16,
  },
  confirmShiftCtaButton: {
    backgroundColor: "#2D4A22",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmShiftCtaButtonText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
  },

  supportCardOverlay: {
    flex: 1,
    backgroundColor: "rgba(11, 38, 29, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  supportCardBox: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 15,
  },
  supportCardHeader: {
    alignItems: "center",
    marginBottom: 18,
  },
  supportCardIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#2D4A22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#2D4A22",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  supportCardTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  supportCardSub: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 10,
  },
  supportPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F7F2",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    marginBottom: 14,
  },
  supportPhoneIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2D4A22",
    alignItems: "center",
    justifyContent: "center",
  },
  supportPhoneNumber: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.3,
  },
  supportPhoneSub: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },
  supportCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2D4A22",
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: "#2D4A22",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 10,
  },
  supportCallBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  supportCancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  supportCancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },

  previewModalContent: {
    width: "100%",
    backgroundColor: "#FBFBFA",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 20,
  },
  previewCloseBtn: {
    position: "absolute",
    top: 18,
    right: 18,
    backgroundColor: "#f1f5f9",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  previewHeaderCentered: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    paddingHorizontal: 24,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#166534",
    marginBottom: 4,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  previewSubtitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 16,
  },
  previewItemInfoCol: {
    flex: 1,
    paddingRight: 10,
  },
  previewItemServingSub: {
    fontSize: 11,
    color: "#5B756C",
    marginTop: 2,
  },
  previewItemPriceValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#166348",
    marginLeft: 8,
  },
  previewEmptyListText: {
    color: "#64748B",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20,
  },
  dishPreviewTextCol: {
    flex: 1,
    paddingLeft: 10,
  },
  dishPreviewSpiceLevel: {
    fontSize: 11,
    color: "#EA580C",
    fontWeight: "600",
    marginTop: 2,
  },
  previewEmptyStateText: {
    textAlign: "center",
    color: "#94a3b8",
    fontStyle: "italic",
    paddingVertical: 24,
  },
  pillTabsWrapperBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#eceae4",
    padding: 4,
    borderRadius: 14,
    marginBottom: 12,
    marginTop: 8,
  },
  tabPillContainerItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  tabPillContainerItemActive: {
    backgroundColor: "#3e5028",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabPillContainerItemInactive: {
    backgroundColor: "transparent",
  },
  tabPillTextString: {
    fontSize: 12,
    fontWeight: "600",
  },
  tabPillTextStringActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  tabPillTextStringInactive: {
    color: "#6b7280",
  },
  tabPillCounterBadgeGlow: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillCounterBadgeGlowActive: {
    backgroundColor: "#ffffff",
  },
  tabPillCounterBadgeGlowInactive: {
    backgroundColor: "#3e5028",
  },
  tabPillCounterBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  tabPillCounterBadgeTextActive: {
    color: "#3e5028",
  },
  tabPillCounterBadgeTextInactive: {
    color: "#ffffff",
  },
  premiumMealBoxContentCardFrame: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#eceae4",
    padding: 14,
    marginBottom: 70,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  subCardHeaderStripLabel: {
    borderBottomWidth: 1,
    borderBottomColor: "#f5f4f0",
    paddingBottom: 10,
    marginBottom: 6,
  },
  subCardHeaderStripLabelText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#3e5028",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionHeaderLabelContainerTag: {
    fontSize: 11,
    fontWeight: "900",
    color: "#c2612e",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: "#faf1ec",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  sectionHeaderLabelContainerTagText: {
    fontSize: 10.5,
    fontWeight: "900",
    color: "#c2612e",
    letterSpacing: 0.6,
  },
  previewSelectionRowItemBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  modalCircularFoodThumbGraphic: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#f5f4f0",
  },
  modalItemNameTextString: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  includedBadgePillBox: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  includedBadgePillBoxStandard: {
    backgroundColor: "#f0fdf4",
  },
  includedBadgePillBoxExtra: {
    backgroundColor: "#fff7ed",
  },
  includedBadgePillBoxText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  includedBadgePillBoxTextStandard: {
    color: "#16a34a",
  },
  includedBadgePillBoxTextExtra: {
    color: "#ea580c",
  },
  previewCategoryCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  previewCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  previewCategoryTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  previewItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 8,
  },
  previewItemImage: { width: 40, height: 40, borderRadius: 10, marginRight: 10 },
  previewItemName: { fontSize: 13.5, fontWeight: "600", color: "#0f172a" },
  extraTag: { backgroundColor: "#ffedd5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginLeft: 8 },
  extraTagText: { fontSize: 10.5, fontWeight: "700", color: "#9a3412" },
  modalAbsoluteFooterCTAWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 20,
    zIndex: 99,
  },
  modalAbsoluteFooterCTAButtonSolid: {
    backgroundColor: "#3e5028",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3e5028",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  modalAbsoluteFooterCTAButtonSolidText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  invoiceStatusBadge: {
    position: "absolute",
    top: -1,
    right: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 3.5,
    zIndex: 10,
  },
  invoiceStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#B45309",
    textTransform: "uppercase",
  },
  invoiceDeliveryDatesRow: {
    marginTop: 10,
    marginBottom: 6,
  },
  invoiceDatesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  invoiceDateItem: {
    fontSize: 11.5,
    color: "#0F172A",
    fontWeight: "600",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
});