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
import api from "@/src/lib/api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTHS_MAP: { [key: string]: number } = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

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

// ─── DYNAMIC DELIVERY SLOT COUNTDOWN TIMER COMPONENT (CUSTOMER SIDE) ───
function DeliverySlotCountdownWidget({
  deliveryDate,
  timeSlot,
  isDelivered,
}: {
  deliveryDate: string;
  timeSlot: string;
  isDelivered: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isExtended, setIsExtended] = useState<boolean>(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const calculateRemainingSeconds = useCallback(() => {
    try {
      const now = new Date();
      let targetYear = now.getFullYear();
      let targetMonth = now.getMonth();
      let targetDay = now.getDate();

      if (deliveryDate) {
        const cleanedDate = deliveryDate.includes('–') ? deliveryDate.split('–')[0].trim() : deliveryDate.trim();
        const dateParts = cleanedDate.replace(/,/g, '').split(/\s+/);
        
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
        const slotToParse = timeSlot.includes('-') ? timeSlot.split('-')[1].trim() : timeSlot.trim();
        const timeMatch = slotToParse.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);

        if (timeMatch) {
          hour = parseInt(timeMatch[1], 10);
          minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          const meridiem = timeMatch[3] ? timeMatch[3].toUpperCase() : null;

          if (meridiem === 'PM' && hour < 12) hour += 12;
          if (meridiem === 'AM' && hour === 12) hour = 0;
        }
      }

      const targetDate = new Date(targetYear, targetMonth, targetDay, hour, minute, 0, 0);
      const diffSecs = Math.floor((targetDate.getTime() - now.getTime()) / 1000);

      if (diffSecs > 0) {
        setIsExtended(false);
        return diffSecs;
      } else {
        setIsExtended(true);
        return 300;
      }
    } catch {
      return 1800;
    }
  }, [deliveryDate, timeSlot]);

  useEffect(() => {
    if (isDelivered) return;
    setSecondsRemaining(calculateRemainingSeconds());
  }, [calculateRemainingSeconds, isDelivered]);

  useEffect(() => {
    if (isDelivered) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsExtended(true);
          return 300;
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

    if (days > 0) {
      return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
    }
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (isDelivered) {
    return (
      <View style={styles.countdownSuccessCard}>
        <View style={styles.countdownSuccessDot}>
          <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.countdownSuccessTitle}>Delivered on time</Text>
          <Text style={styles.countdownSuccessSubtitle}>Your meal has arrived fresh</Text>
        </View>
        <View style={styles.onTimeBadgePill}>
          <Text style={styles.onTimeBadgePillText}>Delivered</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.countdownActiveCard}>
      <Animated.View style={[styles.countdownIconBox, { transform: [{ scale: pulseAnim }] }]}>
        <Ionicons name="timer-outline" size={20} color="#15803D" />
      </Animated.View>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.countdownActiveTitle}>Delivery Countdown</Text>
          {isExtended && (
            <View style={styles.extendedBadge}>
              <Text style={styles.extendedBadgeText}>+5m Extended</Text>
            </View>
          )}
        </View>
        <Text style={styles.countdownActiveSubtitle}>Arriving: {deliveryDate} • {timeSlot}</Text>
      </View>

      <View style={styles.countdownClockDisplay}>
        <Text style={styles.countdownClockDigits}>{formatTimerDisplay(secondsRemaining)}</Text>
        <Text style={styles.countdownClockUnit}>remaining</Text>
      </View>
    </View>
  );
}

// ─── DYNAMIC "WHAT'S NEXT?" STEPPER WITH HEARTBEAT PULSE ANIMATION ───
function WhatsNextStepperCard({ order }: { order: any }) {
  const rawStatus = (order?.orderStatus || "Placed").toLowerCase();
  const paymentStatus = (order?.paymentStatus || "").toLowerCase();

  // 0: Placed/Confirmed, 1: Preparing, 2: Prepared & Packing, 3: Out for Delivery, 4: Delivered, 5: Cash/Amount Collected
  let activeStep = 0;
  if (paymentStatus === "collected" || paymentStatus === "paid" || rawStatus.includes("amount collected") || rawStatus.includes("cash collected")) {
    activeStep = 4;
  } else if (rawStatus === "delivered" || rawStatus === "completed") {
    activeStep = 3;
  } else if (rawStatus.includes("out") || rawStatus.includes("delivery") || rawStatus.includes("out for delivery")) {
    activeStep = 2;
  } else if (rawStatus.includes("pack") || rawStatus.includes("prepared and packing")) {
    activeStep = 1;
  } else if (rawStatus.includes("prep") || rawStatus.includes("preparing")) {
    activeStep = 0;
  } else {
    activeStep = 0;
  }

  // Heartbeat pulse animation value for the active step
  const heartbeatAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(heartbeatAnim, {
          toValue: 1.2,
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
          toValue: 1.15,
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
  const codAmount = order?.totalAmount || 0;
  const isCod = String(order?.paymentMethod || "cod").toLowerCase() === "cod";

  const stepsConfig = [
    {
      index: 0,
      title: "Preparing by Chef",
      iconName: "chef-hat",
      iconType: "material",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return "Chef has completed preparing your authentic meal.";
        if (isCurrent) return "Chef is actively in the kitchen preparing your fresh meal box.";
        return `Order confirmed! Meal preparation starts for ${firstDeliveryDate}.`;
      },
    },
    {
      index: 1,
      title: "Prepared and Packing",
      iconName: "cube-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return "Packaging completed with hygiene seal verified.";
        if (isCurrent) return "Dishes are prepared and our team is carefully packing your box.";
        return "Hygiene packing begins right after cooking is finished.";
      },
    },
    {
      index: 2,
      title: "Out for Delivery",
      iconName: "truck-delivery-outline",
      iconType: "material",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast) return "Delivery completed to your designated venue.";
        if (isCurrent) return "Rider has picked up your order and is on the way.";
        return "Rider tracking and delivery partner details will appear here.";
      },
    },
    {
      index: 3,
      title: "Delivered",
      iconName: "checkmark-circle-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast || isCurrent) return "Meal box safely delivered. Enjoy your hot, fresh meal!";
        return "Meal box will be handed over at your doorstep.";
      },
    },
    {
      index: 4,
      title: isCod ? "Cash Amount Collected" : "Payment Settled",
      iconName: "cash-outline",
      iconType: "ionicons",
      getDescription: (isPast: boolean, isCurrent: boolean) => {
        if (isPast || isCurrent) return `₹${codAmount} payment collected and bill closed. Thank you!`;
        return isCod ? `Please keep ₹${codAmount} in cash ready upon delivery.` : "Paid online via UPI/Card.";
      },
    },
  ];

  return (
    <View style={styles.whatsNextCard}>
      <View style={styles.whatsNextHeader}>
        <View>
          <Text style={styles.whatsNextTitle}>What's Next?</Text>
          <Text style={styles.whatsNextSubtitle}>Live kitchen fulfillment & tracking</Text>
        </View>
        <View style={styles.whatsNextBagIconBox}>
          <Feather name="shopping-bag" size={20} color="#E11D48" />
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
                    <Ionicons name="checkmark-sharp" size={15} color="#FFFFFF" />
                  </View>
                ) : isCurrent ? (
                  <Animated.View
                    style={[
                      styles.stepCircle,
                      styles.stepCircleActivePulse,
                      { transform: [{ scale: heartbeatAnim }] },
                    ]}
                  >
                    {step.iconType === "material" ? (
                      <MaterialCommunityIcons name={step.iconName as any} size={16} color="#FFFFFF" />
                    ) : (
                      <Ionicons name={step.iconName as any} size={16} color="#FFFFFF" />
                    )}
                  </Animated.View>
                ) : (
                  <View style={[styles.stepCircle, styles.stepCircleInactive]}>
                    {step.iconType === "material" ? (
                      <MaterialCommunityIcons name={step.iconName as any} size={15} color="#94A3B8" />
                    ) : (
                      <Ionicons name={step.iconName as any} size={15} color="#94A3B8" />
                    )}
                  </View>
                )}

                {!isLast && (
                  <View style={[styles.stepLine, isPast ? styles.stepLineGreen : styles.stepLineInactive]} />
                )}
              </View>

              <View style={styles.stepContentCol}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={[
                      styles.stepHeading,
                      isPast && styles.stepHeadingGreen,
                      isCurrent && styles.stepHeadingActiveDark,
                      isUpcoming && styles.stepHeadingInactive,
                    ]}
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
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<"Upcoming" | "Active" | "Completed" | "Cancelled">("Upcoming");
  const [loading, setLoading] = useState(true);
  const [userOrders, setUserOrders] = useState<any[]>([]);

  const [isDetailScreenOpen, setIsDetailScreenOpen] = useState(false);
  const [isInvoiceScreenOpen, setIsInvoiceScreenOpen] = useState(false);

  const [selectedDatesPerOrder, setSelectedDatesPerOrder] = useState<{ [orderId: string]: string }>({});
  const [expandedSteppers, setExpandedSteppers] = useState<{ [orderId: string]: boolean }>({});

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
  const [modalActiveDay, setModalActiveDay] = useState<string>("");

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<any>(null);
  const [previewActiveDay, setPreviewActiveDay] = useState<string>("");

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTargetOrder, setRescheduleTargetOrder] = useState<any>(null);
  const [rescheduleOldDate, setRescheduleOldDate] = useState<string>("");
  const [selectedNewDate, setSelectedNewDate] = useState<string>("");
  const [reschedulingLoading, setReschedulingLoading] = useState(false);

  const [pausedDates, setPausedDates] = useState<{ [key: string]: boolean }>({});

  const previewSheetAnim = useRef(new Animated.Value(400)).current;
  const rescheduleSheetAnim = useRef(new Animated.Value(400)).current;

  const availableDateOptions = useMemo(() => generateFutureDateOptions(), []);

  const toggleOrderStepper = (orderId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSteppers((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
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
          const isCatering = (ord.serviceType || "").toLowerCase() === "catering";
          const defaultEventDate = ord.eventDate || ord.deliveryDate || "Mon, 17 Jun";

          const sortedUpcoming = isCatering
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

  useEffect(() => {
    let isMounted = true;
    fetchMyOrders(isMounted);
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (!userOrders || userOrders.length === 0) return [];

    return userOrders.filter((order) => {
      const status = (order.orderStatus || "Placed").toLowerCase();
      if (activeTab === "Upcoming") {
        return (
          status === "placed" ||
          status === "accepted" ||
          status === "scheduled" ||
          status === "upcoming" ||
          status === "preparing" ||
          status === "prepared and packing" ||
          status === "paused" ||
          status === "confirmed"
        );
      } else if (activeTab === "Active") {
        return (
          status === "active" ||
          status === "preparing" ||
          status === "prepared and packing" ||
          status === "out for delivery" ||
          status === "in progress"
        );
      } else if (activeTab === "Completed") {
        return status === "completed" || status === "delivered";
      } else if (activeTab === "Cancelled") {
        return status === "cancelled";
      }
      return true;
    });
  }, [userOrders, activeTab]);

  const handleSelectDateForOrder = (orderId: string, selectedDate: string) => {
    setSelectedDatesPerOrder((prev) => ({
      ...prev,
      [orderId]: selectedDate,
    }));
  };

  const handlePauseClick = (order: any, itemDate: string) => {
    Alert.alert(
      "Pause Delivery",
      "Would you like to pause delivery for this scheduled date?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
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

    const isCatering = (order?.serviceType || "").toLowerCase() === "catering";
    const activeDateToUse = defaultDate || selectedDatesPerOrder[order.orderId] || order.eventDate || order.deliveryDate;

    if (!isCatering && order?.selections && typeof order.selections === "object" && !Array.isArray(order.selections)) {
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
    setSelectedOrderDetails(order);

    const isCatering = (order?.serviceType || "").toLowerCase() === "catering";
    const dateToInspect = activeDate || selectedDatesPerOrder[order.orderId] || order.eventDate || order.deliveryDate;

    if (!isCatering && order?.selections && typeof order.selections === "object" && !Array.isArray(order.selections)) {
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

  const handleDownloadInvoice = () => {
    Alert.alert("Invoice Download", "Preparing your invoice PDF download.");
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
    return [{ name: order.menuName || "Catering Platter", qty: order.guests || 1, price: order.pricePerPlate || order.subtotal || order.totalAmount }];
  };

  if (isInvoiceScreenOpen && selectedOrderDetails) {
    const isCatering = (selectedOrderDetails.serviceType || "").toLowerCase() === "catering";
    const invOrderId = selectedOrderDetails.orderId || "DW12345678";
    const invMenuName = selectedOrderDetails.menuName || (isCatering ? "Royal Catering Platter" : "Classic Lunch");
    const invTotal = selectedOrderDetails.totalAmount || 1014;
    const invSubtotal = selectedOrderDetails.subtotal || invTotal;
    const invDiscount = selectedOrderDetails.discount || 0;
    const invDeliveryPrice = selectedOrderDetails.deliveryPrice ?? 0;
    const invPaymentMethod = (selectedOrderDetails.paymentMethod || "UPI / Online").toUpperCase();
    const invPaymentStatus = selectedOrderDetails.paymentStatus || "PAID";
    const invDate = isCatering
      ? (selectedOrderDetails.eventDate || selectedOrderDetails.deliveryDate || "18 March")
      : (selectedOrderDetails.deliveryDate || selectedOrderDetails.createdAt || "Mon, 17 Jun 2024");
    const invCustomerName = selectedOrderDetails.userName || selectedOrderDetails.customerName || "Valued Customer";
    const invCustomerPhone = selectedOrderDetails.phone || selectedOrderDetails.userPhone || "+91 98765 43210";
    const invCustomerAddress = selectedOrderDetails.addressDetails || "Primary Delivery Address";
    const invCouponCode = selectedOrderDetails.appliedCoupon || selectedOrderDetails.couponCode || null;

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
          contentContainerStyle={[
            styles.detailsScrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 80 },
          ]}
        >
          <View style={styles.invoicePaperCard}>
            <View style={styles.invoiceHeaderBlock}>
              <View style={styles.invoiceBrandRow}>
                <View style={[styles.brandIconBox, isCatering && { backgroundColor: "#15803D" }]}>
                  <Ionicons name={isCatering ? "restaurant" : "leaf-outline"} size={22} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={[styles.brandTitleText, isCatering && { color: "#15803D" }]}>
                    {isCatering ? (selectedOrderDetails.restaurantName || "DAAWATH & CO.") : "KATBOX MEALS"}
                  </Text>
                  <Text style={styles.brandSubtext}>
                    {isCatering ? "Grand Event Catering" : "Fresh Daily Subscriptions"}
                  </Text>
                </View>
              </View>

              <View style={[styles.paidStatusBadge, invPaymentStatus.toLowerCase() !== "paid" && { backgroundColor: "#FEF3C7" }]}>
                <Text style={[styles.paidStatusBadgeText, invPaymentStatus.toLowerCase() !== "paid" && { color: "#D97706" }]}>
                  {invPaymentStatus.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.invoiceMetaRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.invoiceMetaLabel}>CUSTOMER</Text>
                <Text style={styles.invoiceMetaValueText}>{invCustomerName}</Text>
                <Text style={styles.invoiceMetaSubtext}>{invCustomerPhone}</Text>
                <Text style={styles.invoiceMetaSubtext}>{invCustomerAddress}</Text>
                {isCatering && selectedOrderDetails.occasion && (
                  <Text style={[styles.invoiceMetaSubtext, { color: "#15803D", fontWeight: "700", marginTop: 4 }]}>
                    {selectedOrderDetails.occasion} • {selectedOrderDetails.guests || 50} Guests
                  </Text>
                )}
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.invoiceMetaLabel}>INVOICE #</Text>
                <Text style={styles.invoiceMetaValueText}>INV-{invOrderId}</Text>
                <Text style={styles.invoiceMetaLabel}>DATE</Text>
                <Text style={styles.invoiceMetaSubtext}>{invDate}</Text>
                {isCatering && selectedOrderDetails.eventTime && (
                  <Text style={styles.invoiceMetaSubtext}>{selectedOrderDetails.eventTime}</Text>
                )}
              </View>
            </View>

            <View style={styles.invoiceTableDivider} />

            <Text style={styles.invoiceSectionTitle}>
              {isCatering ? "MENU ITEMS & SELECTIONS" : "ORDERED ITEMS"}
            </Text>

            {dynamicInvoiceItems.map((itm: any, idx: number) => {
              const itemName = itm.name || invMenuName;
              const itemQty = itm.qty || itm.quantity || (isCatering ? selectedOrderDetails.guests : 1);
              const itemPrice = itm.price ? `₹${itm.price}` : "Included";

              return (
                <View key={`inv-item-${idx}`} style={styles.invoiceItemRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.invoiceItemNameText}>{itemName}</Text>
                    <Text style={styles.invoiceItemDescText}>Qty: {itemQty}</Text>
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
                    <View style={{ flex: 1, paddingRight: 10 }}>
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
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.paymentMethodTitle}>Paid via {invPaymentMethod}</Text>
                <Text style={styles.paymentMethodSubtext}>Payment captured & receipt generated</Text>
              </View>
            </View>

            <View style={styles.invoiceWatermarkFooter}>
              <Text style={styles.invoiceWatermarkText}>
                {isCatering ? "Thank you for choosing Daawath & Co.!" : "Thank you for subscribing to Katbox Meals!"}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.stickyFooterWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.viewInvoiceDarkBtn} activeOpacity={0.88} onPress={handleDownloadInvoice}>
            <Text style={styles.viewInvoiceDarkBtnText}>Download PDF Invoice</Text>
            <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isDetailScreenOpen && selectedOrderDetails) {
    const isCatering = (selectedOrderDetails.serviceType || "").toLowerCase() === "catering";
    const detailOrderId = selectedOrderDetails.orderId || "DW12345678";
    const detailStatus = selectedOrderDetails.orderStatus || "Placed";
    const detailMenuName = selectedOrderDetails.menuName || (isCatering ? "Catering Platter" : "Classic Lunch");
    const detailMenuImage = selectedOrderDetails.menuImage || selectedOrderDetails.restaurantImage || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";
    const detailTotal = selectedOrderDetails.totalAmount || 1014;
    const detailStartDate = isCatering
      ? (selectedOrderDetails.eventDate || selectedOrderDetails.deliveryDate || "18 March")
      : (selectedOrderDetails.deliveryDate || "Mon, 17 Jun 2024");
    const detailTimeSlot = isCatering
      ? (selectedOrderDetails.eventTime || selectedOrderDetails.deliveryTimeSlot || "08:30 PM")
      : (selectedOrderDetails.deliveryTimeSlot || "7:00 AM - 9:00 AM");

    const isDeliveredCurrent = detailStatus.toLowerCase() === "delivered";

    return (
      <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
        <View style={styles.detailsHeaderRow}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={closeOrderDetails}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.detailsHeaderTitle}>
            {isCatering ? "Catering Event Details" : "Order Details"}
          </Text>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Ionicons name="headset-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.detailsScrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 80 },
          ]}
        >
          {/* Green Hero Order Banner */}
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
                  ? `Catering Booking Locked for ${selectedOrderDetails.occasion || "Birthday Party"}`
                  : `Status: ${detailStatus}`}
              </Text>
              <Text style={styles.heroConfirmedSubheading}>
                {isCatering
                  ? `Our chefs will set up the buffet at your venue on ${detailStartDate}.`
                  : "Track your meal box preparation in real-time."}
              </Text>
            </View>

            <Image
              source={{
                uri: "https://cdn-icons-png.flaticon.com/512/2830/2830312.png",
              }}
              style={styles.scooterMascotGraphic}
            />
          </View>

          {/* DYNAMIC BACKWARD TICKING TIMER IN ORDER DETAILS SCREEN */}
          <DeliverySlotCountdownWidget
            deliveryDate={detailStartDate}
            timeSlot={detailTimeSlot}
            isDelivered={isDeliveredCurrent}
          />

          <View style={styles.mealSpecCard}>
            <View style={styles.mealSpecMainRow}>
              <Image source={{ uri: detailMenuImage }} style={styles.mealSpecImage} />
              <View style={styles.mealSpecTextCol}>
                <Text style={styles.mealSpecTitle}>{detailMenuName}</Text>
                <Text style={styles.mealSpecSubtext}>
                  {isCatering
                    ? `👨‍🍳 ${selectedOrderDetails.restaurantName || selectedOrderDetails.chefName || "Expert Caterer"}`
                    : "1 Meal / Day  •  6 Meals / Week"}
                </Text>
                <Text style={styles.mealSpecPriceText}>
                  ₹{detailTotal} <Text style={styles.perWeekSpan}>{isCatering ? "total" : "/ week"}</Text>
                </Text>
              </View>
            </View>

            <View style={styles.mealSpecFooterRow}>
              <View style={styles.specFooterCol}>
                <Text style={styles.specFooterLabel}>{isCatering ? "Event Date" : "Start Date"}</Text>
                <Text style={styles.specFooterValue}>{detailStartDate}</Text>
              </View>
              <View style={styles.specFooterDivider} />
              <View style={styles.specFooterCol}>
                <Text style={styles.specFooterLabel}>Time Slot</Text>
                <Text style={styles.specFooterValue}>{detailTimeSlot}</Text>
              </View>
              {isCatering && (
                <>
                  <View style={styles.specFooterDivider} />
                  <View style={styles.specFooterCol}>
                    <Text style={styles.specFooterLabel}>Guests</Text>
                    <Text style={styles.specFooterValue}>{selectedOrderDetails.guests || 50}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ─── STANDALONE "WHAT'S NEXT?" DYNAMIC STEPPER VIEW (NO CARD ONLY) ─── */}
          <View style={styles.detailsSectionHeaderRow}>
            <Text style={styles.detailsSectionTitle}>Upcoming Deliveries</Text>
            <TouchableOpacity style={styles.manageScheduleBtn} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={15} color="#2D4A22" />
              <Text style={styles.manageScheduleBtnText}>Manage Schedule</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 20 }}>
            <WhatsNextStepperCard order={selectedOrderDetails} />
          </View>

          {isCatering && (
            <View style={styles.cateringDetailsInfoCardBlock}>
              <View style={styles.cateringDetailsInfoCardHeader}>
                <Text style={styles.cateringDetailsInfoCardTitle}>Event Summary</Text>
                <TouchableOpacity
                  style={styles.cateringViewMenuInlineBtn}
                  activeOpacity={0.8}
                  onPress={() => openPreviewModal(selectedOrderDetails)}
                >
                  <Ionicons name="restaurant-outline" size={14} color="#15803D" />
                  <Text style={styles.cateringViewMenuInlineBtnText}>View Menu</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.cateringDetailsGrid}>
                <View style={styles.cateringDetailPillRow}>
                  <Ionicons name="people-outline" size={15} color="#15803D" />
                  <Text style={styles.cateringDetailPillLabel}>Event & Guests:</Text>
                  <Text style={styles.cateringDetailPillValue}>
                    {selectedOrderDetails.occasion || "Event"} ({selectedOrderDetails.guests || 50} Guests)
                  </Text>
                </View>

                <View style={styles.cateringDetailPillRow}>
                  <Ionicons name="location-outline" size={15} color="#15803D" />
                  <Text style={styles.cateringDetailPillLabel}>Delivery Address:</Text>
                  <Text style={styles.cateringDetailPillValue} numberOfLines={2}>
                    {selectedOrderDetails.addressDetails || "Primary Venue Location"}
                  </Text>
                </View>

                <View style={styles.cateringDetailPillRow}>
                  <Ionicons name="car-outline" size={15} color="#15803D" />
                  <Text style={styles.cateringDetailPillLabel}>Setup Service:</Text>
                  <Text style={styles.cateringDetailPillValue}>
                    {selectedOrderDetails.deliveryType || "Standard"} Setup
                  </Text>
                </View>

                <View style={styles.cateringDetailPillRow}>
                  <Ionicons name="card-outline" size={15} color="#15803D" />
                  <Text style={styles.cateringDetailPillLabel}>Price Per Plate:</Text>
                  <Text style={styles.cateringDetailPillValue}>
                    ₹{selectedOrderDetails.pricePerPlate || 0}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.orderSummaryCardBlock}>
            <Text style={styles.orderSummaryCardTitle}>Bill Summary</Text>

            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>{isCatering ? "Catering Platter" : "Plan"}</Text>
              <Text style={styles.orderSummaryValue}>{detailMenuName}</Text>
            </View>

            {isCatering ? (
              <>
                <View style={styles.orderSummaryRow}>
                  <Text style={styles.orderSummaryLabel}>Price Per Plate</Text>
                  <Text style={styles.orderSummaryValue}>₹{selectedOrderDetails.pricePerPlate || 0}</Text>
                </View>
                <View style={styles.orderSummaryRow}>
                  <Text style={styles.orderSummaryLabel}>Guests</Text>
                  <Text style={styles.orderSummaryValue}>× {selectedOrderDetails.guests || 50}</Text>
                </View>
                <View style={styles.orderSummaryRow}>
                  <Text style={styles.orderSummaryLabel}>Delivery & Setup</Text>
                  <Text style={[styles.orderSummaryValue, { color: "#16A34A", fontWeight: "800" }]}>
                    {selectedOrderDetails.deliveryPrice ? `₹${selectedOrderDetails.deliveryPrice}` : "FREE"}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.orderSummaryRow}>
                  <Text style={styles.orderSummaryLabel}>Meals</Text>
                  <Text style={styles.orderSummaryValue}>1 Meal / Day • 6 Meals / Week</Text>
                </View>
                <View style={styles.orderSummaryRow}>
                  <Text style={styles.orderSummaryLabel}>Delivery Charges</Text>
                  <Text style={[styles.orderSummaryValue, { color: "#16A34A", fontWeight: "800" }]}>FREE</Text>
                </View>
              </>
            )}

            <View style={styles.orderSummaryDivider} />

            <View style={styles.orderSummaryTotalRow}>
              <Text style={styles.orderSummaryTotalLabel}>Total Amount</Text>
              <Text style={styles.orderSummaryTotalValue}>
                ₹{detailTotal} <Text style={{ fontSize: 13, color: "#64748B", fontWeight: "500" }}>{isCatering ? "total" : "/ week"}</Text>
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.stickyFooterWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.viewInvoiceDarkBtn} activeOpacity={0.88} onPress={openInvoiceScreen}>
            <Text style={styles.viewInvoiceDarkBtnText}>View Invoice</Text>
            <Octicons name="file-badge" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

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
      </View>
    );
  }

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={styles.headerRightActions}>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Ionicons name="search-outline" size={20} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Octicons name="sliders" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
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
            const isCatering = (order.serviceType || "").toLowerCase() === "catering";
            const orderId = order.orderId;
            const isNotLastOrder = orderIndex < filteredOrders.length - 1;
            const orderStatusString = order.orderStatus || "Placed";
            const isDeliveredState = orderStatusString.toLowerCase() === "delivered";
            const isStepperOpen = !!expandedSteppers[orderId];

            if (isCatering) {
              const cateringOccasion = order.occasion || "Celebration";
              const cateringMenuName = order.menuName || "Royal Catering Platter";
              const cateringMenuImage = order.menuImage || order.restaurantImage || "https://images.unsplash.com/photo-1555244162-803834f70033?w=400";
              const cateringDate = order.eventDate || order.deliveryDate || "18 March";
              const cateringTime = order.eventTime || order.deliveryTimeSlot || "08:30 PM";
              const cateringGuests = order.guests || 50;
              const cateringDelivery = order.deliveryType || "Standard";
              const cateringTotal = order.totalAmount || 0;
              const pricePerPlate = order.pricePerPlate || (cateringGuests > 0 ? Math.round(cateringTotal / cateringGuests) : 0);

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

                    {/* DYNAMIC TIMER COUNTDOWN FOR CATERING */}
                    {orderStatusString.toLowerCase() !== 'placed' && orderStatusString.toLowerCase() !== 'cancelled' && (
                      <DeliverySlotCountdownWidget
                        deliveryDate={cateringDate}
                        timeSlot={cateringTime}
                        isDelivered={isDeliveredState}
                      />
                    )}

                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionHeaderTitle}>Event Booking Details</Text>
                      <View style={styles.cateringOccasionBadgeTag}>
                        <Text style={styles.cateringOccasionBadgeTagText}>
                          {getOccasionEmoji(cateringOccasion)} {cateringOccasion}
                        </Text>
                      </View>
                    </View>

                    {/* TAP TO EXPAND STEPPER CARD */}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => toggleOrderStepper(orderId)}
                      style={[
                        styles.deliveryCard,
                        styles.cardWithBadgePadding,
                      ]}
                    >
                      {/* TOP RIGHT BORDER BADGE PILL MIXED WITH CARD */}
                      <View style={[
                        styles.floatingTopRightBadge,
                        orderStatusString.toLowerCase() === 'delivered' && styles.floatingBadgeDelivered,
                        orderStatusString.toLowerCase().includes('prep') && styles.floatingBadgePreparing,
                      ]}>
                        <Text style={[
                          styles.floatingTopRightBadgeText,
                          orderStatusString.toLowerCase() === 'delivered' && styles.floatingBadgeTextDelivered,
                          orderStatusString.toLowerCase().includes('prep') && styles.floatingBadgeTextPreparing,
                        ]}>
                          {orderStatusString}
                        </Text>
                      </View>

                      <View style={styles.deliveryCardMain}>
                        <View style={styles.cateringEventTile}>
                          <View style={styles.cateringEventTileHeader}>
                            <Text style={styles.cateringEventTileHeaderText}>EVENT</Text>
                          </View>
                          <Text style={styles.cateringEventTileEmoji}>{getOccasionEmoji(cateringOccasion)}</Text>
                        </View>

                        <View style={styles.deliveryInfoCol}>
                          <Text style={styles.deliveryMenuTitle}>{cateringMenuName}</Text>
                          <Text style={styles.deliveryTimeText}>
                            {cateringDate} • {cateringTime}
                          </Text>

                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <View style={styles.cateringPillBadge}>
                              <Ionicons name="people" size={11} color="#15803D" style={{ marginRight: 3 }} />
                              <Text style={styles.cateringPillBadgeText}>{cateringGuests} Guests</Text>
                            </View>

                            <View style={styles.cateringPillBadge}>
                              <Text style={styles.cateringPillBadgeText}>₹{pricePerPlate}/plate</Text>
                            </View>
                          </View>
                        </View>

                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.cateringPriceBigTotal}>₹{cateringTotal}</Text>
                          <Text style={styles.cateringPriceTotalLabel}>{cateringDelivery} setup</Text>
                        </View>
                      </View>

                      {/* DYNAMIC STEPPER VIEW ACCORDION */}
                      {isStepperOpen && (
                        <View style={styles.embeddedStepperWrapper}>
                          <WhatsNextStepperCard order={order} />
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

            // MEALBOX RENDER FLOW
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
                      <Text style={styles.nextDeliveryMenuTitle}>{dynamicMenuName}</Text>

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

                  {/* DYNAMIC BACKWARD TICKING TIMER */}
                  {orderStatusString.toLowerCase() !== 'placed' && orderStatusString.toLowerCase() !== 'cancelled' && (
                    <DeliverySlotCountdownWidget
                      deliveryDate={currentSelectedDate}
                      timeSlot={timeSlot}
                      isDelivered={isDeliveredState}
                    />
                  )}

                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>Upcoming Deliveries</Text>
                    <TouchableOpacity style={styles.viewCalendarBtn} activeOpacity={0.8}>
                      <Ionicons name="calendar-outline" size={14} color="#2D4A22" />
                      <Text style={styles.viewCalendarBtnText}>View Calendar</Text>
                    </TouchableOpacity>
                  </View>

                  {scheduledDatesArray.length > 0 && (
                    <View style={styles.deliveriesList}>
                      {scheduledDatesArray.map((itemDate, index) => {
                        const { dayName, dayNumber, month } = parseDateParts(itemDate);
                        const isPaused =
                          !!pausedDates[`${orderId}-${itemDate}`] ||
                          (Array.isArray(order.pausedDates) && order.pausedDates.includes(itemDate));
                        const isSelected = currentSelectedDate === itemDate;

                        return (
                          <TouchableOpacity
                            key={`delivery-card-${orderId}-${index}`}
                            activeOpacity={0.88}
                            onPress={() => {
                              handleSelectDateForOrder(orderId, itemDate);
                              toggleOrderStepper(orderId);
                            }}
                            style={[
                              styles.deliveryCard,
                              styles.cardWithBadgePadding,
                              isSelected && styles.deliveryCardSelected,
                              isPaused && styles.deliveryCardPausedBg,
                            ]}
                          >
                            {/* TOP-RIGHT OVERLAPPING STATUS BADGE MIXED WITH CARD */}
                            <View style={[
                              styles.floatingTopRightBadge,
                              isPaused && styles.floatingBadgePaused,
                              orderStatusString.toLowerCase() === 'delivered' && styles.floatingBadgeDelivered,
                              orderStatusString.toLowerCase().includes('prep') && styles.floatingBadgePreparing,
                            ]}>
                              <Text style={[
                                styles.floatingTopRightBadgeText,
                                isPaused && styles.floatingBadgeTextPaused,
                                orderStatusString.toLowerCase() === 'delivered' && styles.floatingBadgeTextDelivered,
                                orderStatusString.toLowerCase().includes('prep') && styles.floatingBadgeTextPreparing,
                              ]}>
                                {isPaused ? "Paused" : order.orderStatus || "Scheduled"}
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
                                <Text style={styles.deliveryTimeText}>{timeSlot}</Text>
                              </View>

                              <Ionicons
                                name={isStepperOpen ? "chevron-up" : "chevron-forward"}
                                size={18}
                                color="#0F172A"
                              />
                            </View>

                            {/* DYNAMIC STEPPER VIEW ACCORDION */}
                            {isStepperOpen && (
                              <View style={styles.embeddedStepperWrapper}>
                                <WhatsNextStepperCard order={order} />
                              </View>
                            )}

                            {isPaused ? (
                              <View style={styles.pausedFooterRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.deliveryPausedTitle}>Delivery paused</Text>
                                  <Text style={styles.deliveryPausedSubtext}>
                                    Select a date to continue
                                  </Text>
                                </View>
                                <View style={{ flexDirection: "row", gap: 6 }}>
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
                                  <Ionicons name="pause-circle-outline" size={16} color="#334155" />
                                  <Text style={styles.actionBtnText}>Pause</Text>
                                </TouchableOpacity>

                                <View style={styles.actionDivider} />

                                <TouchableOpacity style={styles.actionBtn} onPress={() => openPreviewModal(order, itemDate)}>
                                  <Ionicons name="eye-outline" size={16} color="#334155" />
                                  <Text style={styles.actionBtnText}>Preview</Text>
                                </TouchableOpacity>

                                <View style={styles.actionDivider} />

                                <TouchableOpacity style={styles.actionBtn} onPress={() => openOrderDetails(order, itemDate)}>
                                  <Ionicons name="settings-outline" size={16} color="#334155" />
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
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.bottomControlTitle}>Flexible Management</Text>
            <Text style={styles.bottomControlSubtext}>
              Pause, shift dates, or customize your meal schedule with ease.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* MODALS */}
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
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closePreviewModal}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={styles.previewHeaderRow}>
              <View>
                <Text style={[styles.previewTitle, { marginBottom: 2, fontSize: 22, color: "#166534" }]}>
                  Menu Summary
                </Text>
                <Text style={{ fontSize: 13, color: "#64748B", marginLeft: 2, fontWeight: "500" }}>
                  Choices for #{previewOrder?.orderId}
                </Text>
              </View>
            </View>

            {(previewOrder?.serviceType || "").toLowerCase() === "catering" ? (
              <ScrollView style={{ width: "100%", marginTop: 8 }} showsVerticalScrollIndicator={false}>
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
                                source={{ uri: item.imageUrl || item.image || "https://via.placeholder.com/80?text=Food" }}
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
                          source={{ uri: addon.imageUrl || addon.image || "https://via.placeholder.com/80?text=Food" }}
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
              </ScrollView>
            ) : (
              <>
                {previewOrder?.selections &&
                  typeof previewOrder.selections === "object" &&
                  !Array.isArray(previewOrder.selections) &&
                  Object.keys(previewOrder.selections).filter((k) => k !== "pausedDates").length > 1 && (
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
                  {previewOrder?.selections && !Array.isArray(previewOrder.selections) ? (
                    <View style={styles.premiumMealBoxContentCardFrame}>
                      <View style={styles.subCardHeaderStripLabel}>
                        <Text style={styles.subCardHeaderStripLabelText}>
                          {previewActiveDay || "SELECTED"} MENU PREFERENCE
                        </Text>
                      </View>

                      {currentPreviewDaySelections.length === 0 ? (
                        <Text
                          style={{
                            textAlign: "center",
                            color: "#94a3b8",
                            fontStyle: "italic",
                            paddingVertical: 30,
                          }}
                        >
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
                                          : { uri: "https://via.placeholder.com/80?text=Food" }
                                      }
                                      style={styles.modalCircularFoodThumbGraphic}
                                    />
                                    <View style={{ flex: 1, paddingLeft: 12 }}>
                                      <Text style={styles.modalItemNameTextString}>{dishItem.name}</Text>
                                      {dishItem.spiceLevel && (
                                        <Text style={{ fontSize: 11, color: "#EA580C", fontWeight: "600", marginTop: 2 }}>
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
                  ) : Array.isArray(previewOrder?.items) && previewOrder.items.length > 0 ? (
                    previewOrder.items.map((item: any, idx: number) => (
                      <View key={`preview-direct-item-${idx}`} style={styles.previewSelectionRowItemBlock}>
                        <Image
                          source={
                            item.image
                              ? { uri: item.image }
                              : { uri: "https://via.placeholder.com/80?text=Food" }
                          }
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
                  ) : null}
                </ScrollView>
              </>
            )}

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
    color: "#166534",
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
  cateringEventTileEmoji: {
    fontSize: 22,
    marginTop: 6,
  },
  cateringPillBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "#DCFCE7",
  },
  cateringPillBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#15803D",
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
  cateringDetailsInfoCardBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cateringDetailsInfoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 10,
    marginBottom: 12,
  },
  cateringDetailsInfoCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  cateringViewMenuInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  cateringViewMenuInlineBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#15803D",
  },
  cateringDetailsGrid: {
    gap: 8,
  },
  cateringDetailPillRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  cateringDetailPillLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginLeft: 8,
    width: 110,
  },
  cateringDetailPillValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    flex: 1,
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
  countdownActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  countdownIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownActiveTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  countdownActiveSubtitle: {
    fontSize: 11.5,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 1,
  },
  extendedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  extendedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  countdownClockDisplay: {
    alignItems: 'flex-end',
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  countdownClockDigits: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  countdownClockUnit: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#DCFCE7',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  countdownSuccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  countdownSuccessDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownSuccessTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  countdownSuccessSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  onTimeBadgePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onTimeBadgePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
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
  viewCalendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewCalendarBtnText: {
    fontSize: 12,
    fontWeight: "700",
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
  /* Mixed Seamless Top-Right Border Badge */
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

  /* ─── WHAT'S NEXT STEPPER STYLES WITH ANIMATED PULSING ICONS ─── */
  embeddedStepperWrapper: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
  },
  whatsNextCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
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
    marginBottom: 18,
  },
  whatsNextTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  whatsNextSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },
  whatsNextBagIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperContainer: {
    paddingLeft: 2,
  },
  stepRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  stepIndicatorCol: {
    width: 34,
    alignItems: "center",
    marginRight: 10,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    shadowRadius: 6,
    elevation: 5,
  },
  stepCircleInactive: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  stepLine: {
    position: "absolute",
    top: 32,
    bottom: -16,
    width: 2.5,
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
    paddingTop: 3,
  },
  stepHeading: {
    fontSize: 14.5,
    fontWeight: "800",
    marginBottom: 2,
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
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
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
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  mealSpecMainRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  mealSpecImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
    resizeMode: "cover",
  },
  mealSpecTextCol: {
    flex: 1,
    marginLeft: 14,
  },
  mealSpecTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  mealSpecSubtext: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 6,
    fontWeight: "500",
  },
  mealSpecPriceText: {
    fontSize: 16,
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
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  specFooterCol: {
    flex: 1,
  },
  specFooterLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  specFooterValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  specFooterDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 12,
  },
  detailsSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  detailsSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  manageScheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  manageScheduleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  orderSummaryCardBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#EAE8E3",
    marginBottom: 30,
  },
  orderSummaryCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 14,
  },
  orderSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  orderSummaryLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  orderSummaryValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "700",
  },
  orderSummaryDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 10,
  },
  orderSummaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderSummaryTotalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  orderSummaryTotalValue: {
    fontSize: 17,
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
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  viewInvoiceDarkBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  invoicePaperCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
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
    marginBottom: 20,
  },
  invoiceBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#2D4A22",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitleText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#2D4A22",
    letterSpacing: 0.5,
  },
  brandSubtext: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  paidStatusBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paidStatusBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#166534",
  },
  invoiceMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  invoiceMetaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  invoiceMetaValueText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceMetaSubtext: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  invoiceTableDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 14,
  },
  invoiceSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#64748B",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  invoiceItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  invoiceItemNameText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceItemDescText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  invoiceItemPriceText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  invoiceCalcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  invoiceCalcLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  invoiceCalcValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  invoiceTotalDivider: {
    height: 1.5,
    backgroundColor: "#0F172A",
    marginVertical: 12,
  },
  invoiceTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  invoiceTotalLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  invoiceTotalValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#2D4A22",
  },
  paymentMethodInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F5ED",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  paymentMethodTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  paymentMethodSubtext: {
    fontSize: 11,
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
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  drawerHandle: { width: 44, height: 6, backgroundColor: "#cbd5e1", borderRadius: 10, alignSelf: "center", marginBottom: 16 },
  modalCloseBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    backgroundColor: "#334155",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalOrderIdText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
    marginBottom: 16,
  },
  rescheduleModalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  selectDateSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2D4A22",
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateOptionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F7F2",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
  },
  dateOptionPillSelected: {
    backgroundColor: "#2D4A22",
    borderColor: "#2D4A22",
  },
  dateOptionPillText: {
    fontSize: 13,
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
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  shiftSummaryNoticeText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
    lineHeight: 17,
  },
  confirmShiftCtaButton: {
    backgroundColor: "#2D4A22",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmShiftCtaButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  previewModalContent: {
    width: "100%",
    backgroundColor: "#FBFBFA",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 20,
  },
  previewCloseBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "#f1f5f9",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  previewHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  previewTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#166534",
    marginBottom: 14,
    marginLeft: 4,
    letterSpacing: -0.3,
  },
  pillTabsWrapperBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#eceae4",
    padding: 6,
    borderRadius: 16,
    marginBottom: 16,
    marginTop: 12,
  },
  tabPillContainerItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  tabPillContainerItemActive: {
    backgroundColor: "#3e5028",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabPillContainerItemInactive: {
    backgroundColor: "transparent",
  },
  tabPillTextString: {
    fontSize: 13,
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
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
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
    fontSize: 10,
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#eceae4",
    padding: 20,
    marginBottom: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
  },
  subCardHeaderStripLabel: {
    borderBottomWidth: 1,
    borderBottomColor: "#f5f4f0",
    paddingBottom: 12,
    marginBottom: 8,
  },
  subCardHeaderStripLabelText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#3e5028",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionHeaderLabelContainerTag: {
    fontSize: 12,
    fontWeight: "900",
    color: "#c2612e",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 8,
    backgroundColor: "#faf1ec",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  sectionHeaderLabelContainerTagText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#c2612e",
    letterSpacing: 0.8,
  },
  previewSelectionRowItemBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  modalCircularFoodThumbGraphic: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#f5f4f0",
  },
  modalItemNameTextString: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  includedBadgePillBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  includedBadgePillBoxStandard: {
    backgroundColor: "#f0fdf4",
  },
  includedBadgePillBoxExtra: {
    backgroundColor: "#fff7ed",
  },
  includedBadgePillBoxText: {
    fontSize: 11,
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
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  previewCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  previewCategoryTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  previewItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  previewItemImage: { width: 44, height: 44, borderRadius: 12, marginRight: 12 },
  previewItemName: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  extraTag: { backgroundColor: "#ffedd5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginLeft: 10 },
  extraTagText: { fontSize: 11, fontWeight: "700", color: "#9a3412" },
  modalAbsoluteFooterCTAWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 99,
  },
  modalAbsoluteFooterCTAButtonSolid: {
    backgroundColor: "#3e5028",
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3e5028",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  modalAbsoluteFooterCTAButtonSolidText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});