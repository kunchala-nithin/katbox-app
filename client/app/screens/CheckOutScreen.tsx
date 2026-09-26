import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useFocusEffect } from "@react-navigation/native";

import api from "@/src/lib/api";
import {
  getUser,
  refreshUser,
  updateUserAddress,
  ActiveAddress,
  SavedAddress,
  getCachedPushToken,
} from "@/src/lib/authStorage";
import { useDeliveryLocationStore } from "@/src/store/deliveryLocationStore";
import startCashfreePayment from "@/src/lib/cashfree";


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
  if (!addr) return "";
  if (addr.houseDetails && String(addr.houseDetails).trim().length > 0) {
    return `${addr.houseDetails}, ${addr.fullAddress}`;
  }
  return addr.fullAddress || "";
};

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

export default function CheckOutScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const deliveryLocation = useDeliveryLocationStore((s) => s.deliveryLocation);

  const [loading, setLoading] = useState(false);
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [cachedPushToken, setCachedPushToken] = useState<string | null>(null);

  const serviceType = (params.serviceType as string) || "mealbox";
  const isQuickBitesFlow = serviceType === "quickbites";
  const isCateringFlow = serviceType === "catering";
  const isHomemadeFlow = serviceType === "homemade" || isQuickBitesFlow;
  const requiresAdvanceFlow = !isHomemadeFlow;

  const totalAmount = (params.totalAmount as string) || "687";
  const numericTotal = Number(totalAmount) || 0;

  const ADVANCE_RATIO = 0.45;
  const advanceAmount = Math.round(numericTotal * ADVANCE_RATIO * 100) / 100;
  const balanceAmount = Math.round((numericTotal - advanceAmount) * 100) / 100;

  const subtotal = Number(params.subtotal) || Number(totalAmount);
  const deliveryPrice = Number(params.deliveryPrice) || 0;
  const discount = Number(params.discount) || 0;
  const appliedCoupon = (params.appliedCoupon as string) || null;

  const chefId = (params.chefId as string) || "";
  const chefName = (params.chefName as string) || "Nithin Samrat";
  const userId = (params.userId as string) || "";
  const userName = (params.userName as string) || "";
  const userPhone = (params.userPhone as string) || "";
  const userEmail = (params.userEmail as string) || "";

  const restaurantName = (params.restaurantName as string) || "Premium Caterer";
  const restaurantImage = (params.restaurantImage as string) || "https://picsum.photos/200";
  const occasion = (params.occasion as string) || "Event";
  const guests = Number(params.guests) || 50;
  const eventDate = (params.eventDate as string) || "18 March";
  const eventTime = (params.eventTime as string) || "08:30 PM";
  const deliveryType = (params.deliveryType as string) || "Standard";
  const pricePerPlate = Number(params.pricePerPlate) || 0;

  const menuName = (params.menuName as string) || (isCateringFlow ? "Catering Platter" : (isHomemadeFlow ? "Homemade Order" : "Classic Lunch Plan"));
  const menuImage = (() => {
    const v = params.menuImage || params.restaurantImage;
    if (Array.isArray(v)) return v[0];
    return v || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";
  })();
  const durationType = (params.durationType as string) || "Flexible Days (2 Days Running)";
  const deliveryDate = (params.deliveryDate as string) || "Mon, 20 May – Tue, 21 May";
  const deliveryTimeSlot = (params.deliveryTimeSlot as string) || "7:00 PM - 9:00 PM";
  const deliverySlotParam = (params.deliverySlot as string) || "";

  const homemadeResolvedDate = deliveryDate || "";
  const homemadeResolvedSlot = deliverySlotParam || deliveryTimeSlot || "";

  const isQuickBites =
    isQuickBitesFlow ||
    String((params.isQuickBites as string) || "").toLowerCase() === "true";

  const liveEstimatedDeliveryAt = useMemo(() => {
    if (isQuickBites) {
      return new Date(Date.now() + 75 * 60 * 1000);
    }
    const rawMs = (params.estimatedDeliveryAtMs as string) || "";
    const parsedMs = Number(rawMs);
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return new Date(parsedMs);
    }
    return null;
  }, [isQuickBites, params.estimatedDeliveryAtMs]);

  const dynamicHomemadeDateLabel = useMemo(() => {
    if (!isHomemadeFlow) return homemadeResolvedDate;
    if (isQuickBites) {
      const now = new Date();
      const day = now.getDate();
      const month = now.toLocaleDateString("en-US", { month: "short" });
      return `Today, ${day} ${month}`;
    }
    return homemadeResolvedDate;
  }, [isHomemadeFlow, isQuickBites, homemadeResolvedDate]);

  const dynamicHomemadeSlotLabel = useMemo(() => {
    if (!isHomemadeFlow) return homemadeResolvedSlot;
    if (isQuickBites && liveEstimatedDeliveryAt) {
      return formatTimeShortLocal(liveEstimatedDeliveryAt);
    }
    return homemadeResolvedSlot;
  }, [isHomemadeFlow, isQuickBites, liveEstimatedDeliveryAt, homemadeResolvedSlot]);

  const [addressDetails, setAddressDetails] = useState<string>(
    (params.addressDetails as string) || (params.deliveryAddress as string) || "2-91/32, Sai Enclave, Hyderabad"
  );
  const [activeAddress, setActiveAddress] = useState<ActiveAddress | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(true);

  const [showChangeAddressModal, setShowChangeAddressModal] = useState(false);
  const [newFlatNo, setNewFlatNo] = useState("");
  const [newBuilding, setNewBuilding] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newCity, setNewCity] = useState("");

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const confirmScale = useRef(new Animated.Value(0.85)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const confirmTranslateY = useRef(new Animated.Value(24)).current;

  const openConfirmModal = useCallback(() => {
    if (loading) return;
    setShowConfirmModal(true);
    confirmScale.setValue(0.85);
    confirmOpacity.setValue(0);
    confirmTranslateY.setValue(24);

    Animated.parallel([
      Animated.spring(confirmScale, { toValue: 1, friction: 7, tension: 65, useNativeDriver: true }),
      Animated.timing(confirmOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(confirmTranslateY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  }, [loading, confirmScale, confirmOpacity, confirmTranslateY]);

  const closeConfirmModal = useCallback(
    (onClosed?: () => void) => {
      Animated.parallel([
        Animated.timing(confirmScale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
        Animated.timing(confirmOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(confirmTranslateY, { toValue: 18, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setShowConfirmModal(false);
        if (typeof onClosed === "function") onClosed();
      });
    },
    [confirmScale, confirmOpacity, confirmTranslateY]
  );

  useEffect(() => {
    (async () => {
      try {
        const token = await getCachedPushToken();
        if (token) setCachedPushToken(token);
      } catch (e) {}
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadDynamicAddress = async () => {
        setIsLoadingAddress(true);
        try {
          const cached = await getUser();
          if (cached) {
            if (cached.activeAddress && cached.activeAddress.fullAddress) {
              setActiveAddress(cached.activeAddress);
              setAddressDetails(formatAddressDisplay(cached.activeAddress));
            } else if (cached.address && String(cached.address).trim().length > 0) {
              setAddressDetails(String(cached.address).trim());
            }
          }
          const fresh = await refreshUser();
          if (fresh) {
            if (fresh.activeAddress && fresh.activeAddress.fullAddress) {
              setActiveAddress(fresh.activeAddress);
              setAddressDetails(formatAddressDisplay(fresh.activeAddress));
            } else if (fresh.address && String(fresh.address).trim().length > 0) {
              setAddressDetails(String(fresh.address).trim());
            }
          }
        } catch (err) {
          console.log("Error loading dynamic checkout address:", err);
        } finally {
          setIsLoadingAddress(false);
        }
      };
      loadDynamicAddress();
    }, [])
  );

  const handleSaveManualAddress = async () => {
    if (!newFlatNo.trim() || !newBuilding.trim() || !newStreet.trim() || !newCity.trim()) {
      Alert.alert("Incomplete Address", "Please fill in all address fields.");
      return;
    }
    const fullAddress = `${newStreet.trim()}, ${newCity.trim()}`;
    const houseDetails = `Flat ${newFlatNo.trim()}, ${newBuilding.trim()}`;
    const newActive: ActiveAddress = {
      id: `manual_${Date.now()}`,
      title: "Delivery",
      houseDetails,
      fullAddress,
      latitude: activeAddress?.latitude || 0,
      longitude: activeAddress?.longitude || 0,
      tag: "Home",
      updatedAt: new Date().toISOString(),
    };
    setActiveAddress(newActive);
    const formatted = formatAddressDisplay(newActive);
    setAddressDetails(formatted);
    setShowChangeAddressModal(false);
    setNewFlatNo("");
    setNewBuilding("");
    setNewStreet("");
    setNewCity("");
    await updateUserAddress({ activeAddress: newActive, address: formatted });
  };

  const rawSelections = params.selections;
  const rawItems = params.items;
  const rawAddons = params.addons;

  const parsedSelections = useMemo(() => {
    if (!rawSelections) return null;
    try {
      return typeof rawSelections === "string" ? JSON.parse(rawSelections) : rawSelections;
    } catch (e) {
      return null;
    }
  }, [rawSelections]);

  const parsedItems = useMemo(() => {
    if (!rawItems) return [];
    try {
      return typeof rawItems === "string" ? JSON.parse(rawItems) : rawItems;
    } catch (e) {
      return [];
    }
  }, [rawItems]);

  const parsedAddons = useMemo(() => {
    if (!rawAddons) return [];
    try {
      return typeof rawAddons === "string" ? JSON.parse(rawAddons) : rawAddons;
    } catch (e) {
      return [];
    }
  }, [rawAddons]);

  const isMealBoxFlow = serviceType === "mealbox" || (!isCateringFlow && !isHomemadeFlow && parsedSelections && !Array.isArray(parsedSelections));

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewActiveDay, setPreviewActiveDay] = useState<string>(() => {
    if (parsedSelections && typeof parsedSelections === "object" && !Array.isArray(parsedSelections)) {
      const keys = Object.keys(parsedSelections);
      return keys.length > 0 ? keys[0] : "";
    }
    return "";
  });

  const sheetAnim = useRef(new Animated.Value(400)).current;

  const openSheet = () => {
    sheetAnim.setValue(400);
    Animated.timing(sheetAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, { toValue: 400, duration: 250, useNativeDriver: true }).start(() => {
      setShowPreviewModal(false);
    });
  };

  const upcomingDeliveriesList: string[] = useMemo(() => {
    if (isCateringFlow || isHomemadeFlow) return [];
    const rawFormatted = params.scheduledDatesFormatted;
    if (rawFormatted) {
      if (Array.isArray(rawFormatted)) return rawFormatted;
      try {
        const parsed = JSON.parse(rawFormatted as string);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    const rawList = params.scheduledDatesList;
    if (rawList) {
      try {
        const parsed = typeof rawList === "string" ? JSON.parse(rawList) : rawList;
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => {
            if (typeof item === "string") return item;
            if (item?.dayName && item?.dayNumber && item?.monthName) {
              return `${item.dayName}, ${item.dayNumber} ${item.monthName}`;
            }
            return String(item);
          });
        }
      } catch (e) {}
    }
    if (deliveryDate) return [deliveryDate];
    return [];
  }, [params.scheduledDatesFormatted, params.scheduledDatesList, deliveryDate, isCateringFlow, isHomemadeFlow]);

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("upi");
  const [showDetails, setShowDetails] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggleDetails = () => {
    const toValue = showDetails ? 0 : 1;
    setShowDetails(!showDetails);
    Animated.spring(slideAnim, { toValue, friction: 8, tension: 40, useNativeDriver: false }).start();
  };

  const payNowAmount = useMemo(() => {
    if (isHomemadeFlow) {
      return selectedPaymentMethod === "cod" ? 0 : numericTotal;
    }
    return advanceAmount;
  }, [isHomemadeFlow, selectedPaymentMethod, numericTotal, advanceAmount]);

  const payLaterAmount = useMemo(() => {
    if (isHomemadeFlow) {
      return selectedPaymentMethod === "cod" ? numericTotal : 0;
    }
    return balanceAmount;
  }, [isHomemadeFlow, selectedPaymentMethod, numericTotal, balanceAmount]);

  const payNowLabel = useMemo(() => {
    if (isHomemadeFlow && selectedPaymentMethod === "cod") {
      return "Total Due on Delivery";
    }
    if (isHomemadeFlow) {
      return "Total Due Now";
    }
    return "Advance (45%) Due Now";
  }, [isHomemadeFlow, selectedPaymentMethod]);

  const bottomBarAmount = useMemo(() => {
    if (isHomemadeFlow && selectedPaymentMethod === "cod") {
      return payLaterAmount;
    }
    return payNowAmount;
  }, [isHomemadeFlow, selectedPaymentMethod, payLaterAmount, payNowAmount]);

  const paymentSectionHeaderLabel = useMemo(() => {
    if (isHomemadeFlow) return "Choose a payment method";
    return "Pay 45% Advance (Online Only)";
  }, [isHomemadeFlow]);

  const confirmModalTitle = useMemo(() => {
    if (isHomemadeFlow && selectedPaymentMethod === "cod") {
      return "Confirm Cash on Delivery";
    }
    if (isHomemadeFlow) {
      return "Confirm Online Payment";
    }
    return "Confirm Advance Payment";
  }, [isHomemadeFlow, selectedPaymentMethod]);

  const handleConfirmPlaceOrder = () => {
    if (paymentInProgress) return;

    closeConfirmModal(async () => {
      setTimeout(async () => {
        try {
          setPaymentInProgress(true);
          setLoading(true);

          const resolvedLatitude =
            deliveryLocation?.latitude !== undefined && deliveryLocation?.latitude !== null
              ? deliveryLocation.latitude
              : (activeAddress?.latitude ?? 0);
          const resolvedLongitude =
            deliveryLocation?.longitude !== undefined && deliveryLocation?.longitude !== null
              ? deliveryLocation.longitude
              : (activeAddress?.longitude ?? 0);
          const resolvedDeliveryFullAddress =
            deliveryLocation?.fullAddress || activeAddress?.fullAddress || addressDetails;

          const pushTokenValue = cachedPushToken ? String(cachedPushToken) : "";

          // ---------- Branch 1: Homemade/QuickBites + COD ----------
          if (isHomemadeFlow && selectedPaymentMethod === "cod") {
            const formData = new FormData();
            formData.append("userId", userId);
            formData.append("userName", userName);
            formData.append("serviceType", serviceType);
            formData.append("menuName", menuName);
            formData.append("menuImage", menuImage);
            formData.append("addressDetails", addressDetails);
            formData.append("deliveryAddress", addressDetails);
            formData.append("latitude", String(resolvedLatitude));
            formData.append("longitude", String(resolvedLongitude));
            formData.append("deliveryAddressFull", resolvedDeliveryFullAddress);
            formData.append("subtotal", String(subtotal));
            formData.append("deliveryPrice", String(deliveryPrice));
            formData.append("discount", String(discount));
            formData.append("appliedCoupon", appliedCoupon || "");
            formData.append("totalAmount", String(totalAmount));
            formData.append("advancePaidAmount", "0");
            formData.append("balanceAmountToCollect", String(numericTotal));
            formData.append("paymentMethod", "cod");
            formData.append("chefId", chefId);
            formData.append("chefName", chefName);
            formData.append("items", JSON.stringify(parsedItems));
            formData.append("deliveryDate", dynamicHomemadeDateLabel || "Today");
            formData.append("deliveryTimeSlot", dynamicHomemadeSlotLabel || "30–45 min");
            formData.append("deliverySlot", dynamicHomemadeSlotLabel || "30–45 min");
            formData.append("isQuickBites", isQuickBites ? "true" : "false");
            formData.append("deliveryWindowMinutes", isQuickBites ? "75" : "0");
            formData.append("isAdvanceOrder", "false");
            formData.append("advancePercent", "0");
            if (pushTokenValue) formData.append("customerPushToken", pushTokenValue);
            if (liveEstimatedDeliveryAt) {
              formData.append("estimatedDeliveryAtMs", String(liveEstimatedDeliveryAt.getTime()));
            }

            const res = await api.post("/api/orders/create", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });

            if (res.data && res.data.success) {
              const createdOrder = res.data.order;
              if (params.cartId) {
                try {
                  await api.delete(`/api/cart/${params.cartId}`);
                } catch (e) {
                  console.log("Cart cleanup non-critical error", e);
                }
              }
              router.push({
                pathname: "/screens/OrderConfirmationScreen",
                params: { orderId: createdOrder.orderId, serviceType },
              });
            } else {
              Alert.alert("Order Error", res.data?.message || "Failed to place order.");
            }
            return;
          }

          // ---------- Branch 2 & 3: Cashfree online payment ----------
          const orderPayload: Record<string, any> = {
            userId,
            userName,
            serviceType,
            menuName,
            menuImage,
            addressDetails,
            deliveryAddress: addressDetails,
            latitude: resolvedLatitude,
            longitude: resolvedLongitude,
            deliveryAddressFull: resolvedDeliveryFullAddress,
            subtotal,
            deliveryPrice,
            discount,
            appliedCoupon: appliedCoupon || "",
            totalAmount,
            advancePaidAmount: isHomemadeFlow ? numericTotal : advanceAmount,
            balanceAmountToCollect: isHomemadeFlow ? 0 : balanceAmount,
            paymentMethod: "online",
            isAdvanceOrder: !isHomemadeFlow,
            advancePercent: !isHomemadeFlow ? 45 : 0,
          };

          if (pushTokenValue) {
            orderPayload.customerPushToken = pushTokenValue;
          }

          if (isCateringFlow) {
            orderPayload.chefId = chefId;
            orderPayload.chefName = chefName || restaurantName;
            orderPayload.restaurantName = restaurantName;
            orderPayload.restaurantImage = restaurantImage;
            orderPayload.guests = guests;
            orderPayload.occasion = occasion;
            orderPayload.eventDate = eventDate;
            orderPayload.eventTime = eventTime;
            orderPayload.deliveryType = deliveryType;
            orderPayload.pricePerPlate = pricePerPlate;
            if (parsedSelections) orderPayload.selections = parsedSelections;
            if (parsedAddons) orderPayload.addons = parsedAddons;
          } else if (isHomemadeFlow) {
            orderPayload.chefId = chefId;
            orderPayload.chefName = chefName;

            const sanitizedItems = (Array.isArray(parsedItems) ? parsedItems : []).map(
              (it: any, idx: number) => ({
                id: String(it.id || it._id || `item_${Date.now()}_${idx}`),
                name: String(it.name || "Special Dish"),
                image: String(it.image || it.imageUrl || ""),
                price: Number(it.price) || 0,
                quantity: Number(it.quantity) || 1,
                selectedQtyConfig: String(
                  it.selectedQtyConfig || it.sizeLabel || it.size || "Standard Serving"
                ),
                isVeg: it.isVeg !== undefined ? Boolean(it.isVeg) : true,
              })
            );
            orderPayload.items = sanitizedItems;
            orderPayload.deliveryAddress = addressDetails;
            orderPayload.deliveryDate = dynamicHomemadeDateLabel || "Today";
            orderPayload.deliveryTimeSlot = dynamicHomemadeSlotLabel || "30–45 min";
            orderPayload.deliverySlot = dynamicHomemadeSlotLabel || "30–45 min";
            orderPayload.isQuickBites = isQuickBites ? "true" : "false";
            orderPayload.deliveryWindowMinutes = isQuickBites ? "75" : "0";
            if (liveEstimatedDeliveryAt) {
              orderPayload.estimatedDeliveryAtMs = String(liveEstimatedDeliveryAt.getTime());
            }
          } else {
            orderPayload.chefId = chefId;
            orderPayload.chefName = chefName;
            orderPayload.durationType = durationType;
            orderPayload.deliveryTimeSlot = deliveryTimeSlot;
            orderPayload.deliveryDate = deliveryDate;
            orderPayload.upcomingDeliveries = upcomingDeliveriesList;
            if (parsedSelections) orderPayload.selections = parsedSelections;
            if (parsedItems) orderPayload.items = parsedItems;
          }

          const cashfreeChargeAmount = isHomemadeFlow ? numericTotal : advanceAmount;

          // ✅ FIX: use the current Cashfree wrapper signature
          const result = await startCashfreePayment.runCashfreePaymentFlow({
            serviceType,
            totalAmount: cashfreeChargeAmount,
            customerId: userId || undefined,
            customerName: userName || undefined,
            customerPhone: userPhone || undefined,
            customerEmail: userEmail || undefined,
          });

          if (result.ok && result.orderId) {
            if (params.cartId) {
              try {
                await api.delete(`/api/cart/${params.cartId}`);
              } catch (e) {
                console.log("Cart cleanup non-critical error", e);
              }
            }

            router.push({
              pathname: "/screens/OrderConfirmationScreen",
              params: { orderId: result.orderId, serviceType },
            });
          } else {
            Alert.alert(
              "Payment Not Completed",
              result.message ||
                "Your payment was not completed. No amount has been charged. Please try again."
            );
          }
        } catch (error: any) {
          console.error("Payment error:", error);
          Alert.alert(
            "Payment Error",
            error?.message ||
              "Something went wrong while processing the payment. Please try again."
          );
        } finally {
          setLoading(false);
          setPaymentInProgress(false);
        }
      }, 150);
    });
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

  const currentDaySelectionsArray =
    (parsedSelections && previewActiveDay && !Array.isArray(parsedSelections))
      ? parsedSelections[previewActiveDay] || []
      : [];
  const groupedPreviewDayItemsMap = getGroupedMealBoxItemsBySection(currentDaySelectionsArray);

  const HEADER_HEIGHT = insets.top + 60;

  return (
    <SafeAreaView style={[styles.container]} edges={["left", "right"]}>
      <View
        style={[
          styles.header,
          {
            height: HEADER_HEIGHT,
            paddingTop: insets.top,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButtonInline}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color="#0D2E22" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Checkout</Text>

        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_HEIGHT + 16 }]}
      >
        {isHomemadeFlow ? (
          <View style={styles.mainCardModern}>
            <View style={[styles.modernTagPillEdge, { backgroundColor: "rgba(22, 101, 52, 0.08)", borderColor: "rgba(22, 101, 52, 0.15)" }]}>
              <Text style={styles.modernTagTextEdge}>
                {isQuickBitesFlow ? "QUICK BITES ORDER" : "HOMEMADE ORDER"}
              </Text>
            </View>

            <View style={styles.homemadeChefHeaderRow}>
              <View style={styles.chefPillBadgeContainer}>
                <View style={styles.chefPillAvatarCircle}>
                  <Ionicons name="restaurant" size={12} color="#FAF8F5" />
                </View>
                <Text style={styles.chefPillBadgeText} numberOfLines={1}>
                  Chef: {chefName || "Homemade Chef"}
                </Text>
              </View>
            </View>

            {(dynamicHomemadeDateLabel || dynamicHomemadeSlotLabel) ? (
              <View style={styles.homemadeDeliveryStripContainer}>
                {!!dynamicHomemadeDateLabel && (
                  <View style={styles.homemadeDeliveryCell}>
                    <View style={styles.homemadeDeliveryIconCircle}>
                      <Ionicons name="calendar-outline" size={13} color="#166348" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.homemadeDeliveryLabel}>DELIVERY DATE</Text>
                      <Text style={styles.homemadeDeliveryValue} numberOfLines={1}>
                        {dynamicHomemadeDateLabel}
                      </Text>
                    </View>
                  </View>
                )}

                {!!dynamicHomemadeDateLabel && !!dynamicHomemadeSlotLabel && (
                  <View style={styles.homemadeDeliveryDivider} />
                )}

                {!!dynamicHomemadeSlotLabel && (
                  <View style={styles.homemadeDeliveryCell}>
                    <View style={styles.homemadeDeliveryIconCircle}>
                      <Ionicons name="time-outline" size={13} color="#166348" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.homemadeDeliveryLabel}>DELIVERY SLOT</Text>
                      <Text style={styles.homemadeDeliveryValue} numberOfLines={1}>
                        {dynamicHomemadeSlotLabel}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.groupedMetaSectionContainer}>
              {parsedItems && parsedItems.length > 0 ? (
                parsedItems.map((dishItem: any, idx: number) => (
                  <View key={`dish-${dishItem.id || idx}`}>
                    <View style={styles.homemadeItemCardRow}>
                      <Image
                        source={{ uri: dishItem.image || "https://via.placeholder.com/150" }}
                        style={styles.homemadeDishThumbnail}
                      />
                      <View style={{ flex: 1, marginLeft: 14, justifyContent: "center" }}>
                        <Text style={styles.homemadeDishName} numberOfLines={2}>{dishItem.name}</Text>

                        <View style={styles.portionPillTag}>
                          <Ionicons name="layers-outline" size={11} color="#0F382A" style={{ marginRight: 4 }} />
                          <Text style={styles.portionPillText}>{dishItem.selectedQtyConfig || "Standard Serving"}</Text>
                        </View>

                        <View style={styles.homemadePriceQtyRow}>
                          <Text style={styles.homemadeQtyLabel}>
                            Qty: <Text style={styles.homemadeQtyValue}>{dishItem.quantity || 1}</Text>
                          </Text>
                          <Text style={styles.homemadeDishPrice}>
                            ₹{(Number(dishItem.price) || 0) * (Number(dishItem.quantity) || 1)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {idx !== parsedItems.length - 1 && (
                      <View style={styles.separatorHorizontalDotted} />
                    )}
                  </View>
                ))
              ) : (
                <View style={styles.modernHeaderRow}>
                  <Image source={{ uri: menuImage }} style={styles.modernHeroImage} />
                  <View style={styles.modernTitleBlock}>
                    <Text style={styles.modernMainTitle} numberOfLines={2}>{menuName}</Text>
                    <Text style={styles.modernChefSubtitle}>Fresh Chef Preparations</Text>
                  </View>
                </View>
              )}

              <View style={styles.separatorHorizontalDotted} />

              <View style={styles.modernAddressBlockNested}>
                <Ionicons name="location-outline" size={15} color="#0F382A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={styles.addressHeaderRowWithChange}>
                    <Text style={styles.modernAddressLabel}>Delivery Venue Address</Text>
                    <TouchableOpacity
                      onPress={() => setShowChangeAddressModal(true)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.changeAddressLinkText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                  {isLoadingAddress ? (
                    <ActivityIndicator size="small" color="#166538" style={{ alignSelf: "flex-start", marginTop: 4 }} />
                  ) : (
                    <Text style={styles.modernAddressText} numberOfLines={2}>{addressDetails}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Items Subtotal</Text>
              <Text style={styles.priceValue}>₹{subtotal}</Text>
            </View>
          </View>
        ) : isCateringFlow ? (
          <View style={styles.mainCardModern}>
            <View style={[styles.modernTagPillEdge, { backgroundColor: 'rgba(15, 56, 42, 0.08)', borderColor: 'rgba(15, 56, 42, 0.12)' }]}>
              <Text style={[styles.modernTagTextEdge, { color: '#0F382A' }]}>CATERING PLATTER</Text>
            </View>

            <View style={styles.modernHeaderRow}>
              <Image source={{ uri: menuImage }} style={styles.modernHeroImage} />
              <View style={styles.modernTitleBlock}>
                <Text style={styles.modernMainTitle} numberOfLines={2}>
                  {menuName}
                </Text>
                <Text style={styles.modernChefSubtitle}>Chef: {restaurantName}</Text>
              </View>
            </View>

            <View style={styles.groupedMetaSectionContainer}>
              <View style={styles.modernInfoGrid}>
                <View style={styles.modernInfoCell}>
                  <Ionicons name="people-outline" size={14} color="#0F382A" />
                  <Text style={styles.modernCellLabel}>Event Guests</Text>
                  <Text style={styles.modernCellValue}>{guests} Guests ({occasion})</Text>
                </View>

                <View style={styles.separatorVerticalDotted} />

                <View style={styles.modernInfoCell}>
                  <Ionicons name="car-outline" size={14} color="#0F382A" />
                  <Text style={styles.modernCellLabel}>Delivery Mode</Text>
                  <Text style={styles.modernCellValue}>{deliveryType}</Text>
                </View>
              </View>

              <View style={styles.separatorHorizontalDotted} />

              <View style={styles.modernAddressBlockNested}>
                <Ionicons name="location-outline" size={14} color="#0F382A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.modernAddressLabel}>Event Venue Address</Text>
                  <Text style={styles.modernAddressText} numberOfLines={1}>
                    {addressDetails}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.modernStartDateBanner}>
              <Text style={styles.modernStartDateText}>
                Date & Time: <Text style={{ fontWeight: "700", color: "#0B261D" }}>{eventDate} • {eventTime}</Text>
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Price Per Plate</Text>
              <Text style={styles.priceValue}>₹{pricePerPlate}</Text>
            </View>

            {(parsedSelections || parsedAddons.length > 0) && (
              <TouchableOpacity
                style={styles.modernViewItemsBtn}
                onPress={() => {
                  setShowPreviewModal(true);
                  setTimeout(openSheet, 50);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modernViewItemsText}>Inspect Platter Menu & Addons</Text>
                <Ionicons name="arrow-forward" size={14} color="#FAF8F5" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.mainCardModern}>
            <View style={styles.modernTagPillEdge}>
              <Text style={styles.modernTagTextEdge}>MEALBOX PLAN</Text>
            </View>

            <View style={styles.modernHeaderRow}>
              <Image source={{ uri: menuImage }} style={styles.modernHeroImage} />
              <View style={styles.modernTitleBlock}>
                <Text style={styles.modernMainTitle} numberOfLines={2}>
                  {menuName}
                </Text>
                <Text style={styles.modernChefSubtitle}>Chef: {chefName}</Text>
              </View>
            </View>

            <View style={styles.groupedMetaSectionContainer}>
              <View style={styles.modernInfoGrid}>
                <View style={styles.modernInfoCell}>
                  <Ionicons name="calendar-outline" size={14} color="#0F382A" />
                  <Text style={styles.modernCellLabel}>Plan Duration</Text>
                  <Text style={styles.modernCellValue}>{durationType}</Text>
                </View>

                <View style={styles.separatorVerticalDotted} />

                <View style={styles.modernInfoCell}>
                  <Ionicons name="time-outline" size={14} color="#0F382A" />
                  <Text style={styles.modernCellLabel}>Delivery Slot</Text>
                  <Text style={styles.modernCellValue}>{deliveryTimeSlot}</Text>
                </View>
              </View>

              <View style={styles.separatorHorizontalDotted} />

              <View style={styles.modernAddressBlockNested}>
                <Ionicons name="location-outline" size={14} color="#0F382A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.modernAddressLabel}>Delivery Address</Text>
                  <Text style={styles.modernAddressText} numberOfLines={1}>
                    {addressDetails}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.modernStartDateBanner}>
              <Text style={styles.modernStartDateText}>
                Starts: <Text style={{ fontWeight: "700", color: "#0B261D" }}>{deliveryDate}</Text>
              </Text>
            </View>

            {upcomingDeliveriesList.length > 0 && (
              <View style={styles.upcomingDeliveriesContainer}>
                <View style={styles.upcomingDeliveriesHeaderRow}>
                  <Ionicons name="calendar" size={14} color="#0F382A" />
                  <Text style={styles.upcomingDeliveriesTitle}>Upcoming Scheduled Deliveries</Text>
                </View>
                <View style={styles.upcomingDeliveriesGrid}>
                  {upcomingDeliveriesList.map((deliveryDateItem: string, idx: number) => (
                    <View key={`checkout-upcoming-del-${idx}`} style={styles.upcomingDeliveryPill}>
                      <Ionicons name="checkmark-circle" size={12} color="#0F382A" style={{ marginRight: 4 }} />
                      <Text style={styles.upcomingDeliveryPillText}>{deliveryDateItem}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Package Pricing Total</Text>
              <Text style={styles.priceValue}>₹{totalAmount}</Text>
            </View>

            {(parsedSelections || parsedItems.length > 0) && (
              <TouchableOpacity
                style={styles.modernViewItemsBtn}
                onPress={() => {
                  setShowPreviewModal(true);
                  setTimeout(openSheet, 50);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modernViewItemsText}>Selected Items</Text>
                <Ionicons name="arrow-forward" size={14} color="#FAF8F5" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.choosePaymentHeaderLabel}>{paymentSectionHeaderLabel}</Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedPaymentMethod("upi")}
          style={[
            styles.paymentOptionCard,
            selectedPaymentMethod === "upi" && styles.paymentOptionCardActive,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View style={[styles.radioCircle, selectedPaymentMethod === "upi" && styles.radioCircleActive]}>
              {selectedPaymentMethod === "upi" && <View style={styles.radioInnerDot} />}
            </View>
            <View style={styles.paymentIconBox}>
              <MaterialCommunityIcons name="qrcode-scan" size={20} color="#0F382A" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.paymentOptionTitle}>UPI</Text>
                <View style={styles.recommendedPill}>
                  <Text style={styles.recommendedPillText}>Recommended</Text>
                </View>
              </View>
              <Text style={styles.paymentOptionSubtitle}>Pay using any UPI App</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#5B756C" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedPaymentMethod("card")}
          style={[
            styles.paymentOptionCard,
            selectedPaymentMethod === "card" && styles.paymentOptionCardActive,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View style={[styles.radioCircle, selectedPaymentMethod === "card" && styles.radioCircleActive]}>
              {selectedPaymentMethod === "card" && <View style={styles.radioInnerDot} />}
            </View>
            <View style={styles.paymentIconBox}>
              <Ionicons name="card-outline" size={20} color="#0F382A" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.paymentOptionTitle}>Cards</Text>
              <Text style={styles.paymentOptionSubtitle}>Visa, Mastercard, RuPay & more</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#5B756C" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedPaymentMethod("netbanking")}
          style={[
            styles.paymentOptionCard,
            selectedPaymentMethod === "netbanking" && styles.paymentOptionCardActive,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View style={[styles.radioCircle, selectedPaymentMethod === "netbanking" && styles.radioCircleActive]}>
              {selectedPaymentMethod === "netbanking" && <View style={styles.radioInnerDot} />}
            </View>
            <View style={styles.paymentIconBox}>
              <Ionicons name="business-outline" size={20} color="#0F382A" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.paymentOptionTitle}>Net Banking</Text>
              <Text style={styles.paymentOptionSubtitle}>All major banks available</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#5B756C" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedPaymentMethod("wallet")}
          style={[
            styles.paymentOptionCard,
            selectedPaymentMethod === "wallet" && styles.paymentOptionCardActive,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View style={[styles.radioCircle, selectedPaymentMethod === "wallet" && styles.radioCircleActive]}>
              {selectedPaymentMethod === "wallet" && <View style={styles.radioInnerDot} />}
            </View>
            <View style={styles.paymentIconBox}>
              <Ionicons name="wallet-outline" size={20} color="#0F382A" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.paymentOptionTitle}>Wallets</Text>
              <Text style={styles.paymentOptionSubtitle}>PhonePe, Paytm, Amazon Pay & more</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#5B756C" />
        </TouchableOpacity>

        {isHomemadeFlow && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelectedPaymentMethod("cod")}
            style={[
              styles.paymentOptionCard,
              selectedPaymentMethod === "cod" && styles.paymentOptionCardActive,
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <View style={[styles.radioCircle, selectedPaymentMethod === "cod" && styles.radioCircleActive]}>
                {selectedPaymentMethod === "cod" && <View style={styles.radioInnerDot} />}
              </View>
              <View style={styles.paymentIconBox}>
                <Ionicons name="cash-outline" size={20} color="#0F382A" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.paymentOptionTitle}>Cash on Delivery</Text>
                <Text style={styles.paymentOptionSubtitle}>
                  Pay ₹{totalAmount} in full upon delivery
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#5B756C" />
          </TouchableOpacity>
        )}

        <View style={styles.trustBadgeFooterContainer}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={styles.trustShieldCircle}>
              <Ionicons name="shield-checkmark" size={18} color="#0F382A" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.trustBadgeTitleText}>100% Secure Payments</Text>
              <Text style={styles.trustBadgeDescText}>We never store your card or UPI details</Text>
            </View>
            <View style={styles.trustBadgeIllustrationBox}>
              <Ionicons name="lock-closed-outline" size={22} color="#0F382A" />
            </View>
          </View>
        </View>

        <View style={{ height: 160 }} />
      </ScrollView>

      {showDetails && (
        <Animated.View
          style={[
            styles.expandableDetailsCard,
            {
              opacity: slideAnim,
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.modalIndicatorBar} />
          <Text style={styles.breakupHeaderTitle}>Price Breakdown</Text>

          {isCateringFlow ? (
            <>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Price Per Plate</Text>
                <Text style={styles.breakupLineValue}>₹{pricePerPlate}</Text>
              </View>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Total Guests</Text>
                <Text style={styles.breakupLineValue}>× {guests}</Text>
              </View>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Platter Subtotal</Text>
                <Text style={styles.breakupLineValue}>₹{subtotal}</Text>
              </View>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Delivery ({deliveryType})</Text>
                <Text style={styles.breakupLineValue}>₹{deliveryPrice}</Text>
              </View>
            </>
          ) : isHomemadeFlow ? (
            <>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>
                  {isQuickBitesFlow ? "Quick Bites Subtotal" : "Dishes Subtotal"}
                </Text>
                <Text style={styles.breakupLineValue}>₹{subtotal}</Text>
              </View>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Delivery & Kitchen Handling</Text>
                <Text style={styles.breakupLineValue}>₹{deliveryPrice}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>
                  {isMealBoxFlow ? "MealBox Plan Base Subtotal" : "Plan Base Amount"}
                </Text>
                <Text style={styles.breakupLineValue}>₹{subtotal}</Text>
              </View>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Delivery & Kitchen Charges</Text>
                <Text style={styles.breakupLineValue}>₹{deliveryPrice}</Text>
              </View>
            </>
          )}

          {discount > 0 && (
            <View style={styles.breakupLineRow}>
              <Text style={styles.breakupLineLabel}>
                Coupon Discount {appliedCoupon ? `(${appliedCoupon})` : ""}
              </Text>
              <Text style={[styles.breakupLineValue, { color: "#0F382A", fontWeight: "700" }]}>
                -₹{discount}
              </Text>
            </View>
          )}

          <View style={styles.breakupDividerLine} />

          {isHomemadeFlow ? (
            selectedPaymentMethod === "cod" ? (
              <>
                <View style={styles.breakupLineRow}>
                  <Text style={styles.breakupLineLabel}>Pay Online Now</Text>
                  <Text style={[styles.breakupLineValue, { color: "#166538" }]}>₹0</Text>
                </View>
                <View style={styles.breakupLineRow}>
                  <Text style={styles.breakupLineLabel}>Pay on Delivery</Text>
                  <Text style={styles.breakupLineValue}>₹{totalAmount}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.breakupLineRow}>
                  <Text style={styles.breakupLineLabel}>Pay Online Now (Full)</Text>
                  <Text style={[styles.breakupLineValue, { color: "#166538" }]}>₹{totalAmount}</Text>
                </View>
                <View style={styles.breakupLineRow}>
                  <Text style={styles.breakupLineLabel}>Pay on Delivery</Text>
                  <Text style={styles.breakupLineValue}>₹0</Text>
                </View>
              </>
            )
          ) : (
            <>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>45% Advance to Pay Now</Text>
                <Text style={[styles.breakupLineValue, { color: "#166538" }]}>₹{advanceAmount}</Text>
              </View>
              <View style={styles.breakupLineRow}>
                <Text style={styles.breakupLineLabel}>Balance Upon Delivery</Text>
                <Text style={styles.breakupLineValue}>₹{balanceAmount}</Text>
              </View>
            </>
          )}

          <View style={styles.breakupDividerLine} />

          <View style={styles.breakupLineRow}>
            <Text style={[styles.breakupLineLabel, { fontWeight: "800", color: "#0B261D" }]}>
              Total Payable
            </Text>
            <Text style={[styles.breakupLineValue, { fontWeight: "900", color: "#0F382A" }]}>
              ₹{totalAmount}
            </Text>
          </View>
        </Animated.View>
      )}

      <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View>
          <Text style={styles.bottomAmountPayableLabel}>{payNowLabel}</Text>
          <TouchableOpacity
            onPress={toggleDetails}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text style={styles.bottomAmountValue}>₹{bottomBarAmount}</Text>
            <View style={styles.viewDetailsBadgeContainer}>
              <Text style={styles.viewDetailsBadgeText}>View Details</Text>
              <Ionicons
                name={showDetails ? "chevron-up" : "chevron-down"}
                size={12}
                color="#0F382A"
                style={{ marginLeft: 2 }}
              />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.payNowSolidButton, (loading || paymentInProgress) && { opacity: 0.7 }]}
          onPress={openConfirmModal}
          disabled={loading || paymentInProgress}
        >
          {loading || paymentInProgress ? (
            <ActivityIndicator size="small" color="#FAF8F5" />
          ) : (
            <>
              <Ionicons
                name={"checkmark-circle"}
                size={15}
                color="#FAF8F5"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.payNowSolidButtonText}>
                {"Place Order"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.termsFooterText}>
        By continuing, you agree to our{" "}
        <Text style={{ color: "#0F382A", fontWeight: "700" }}>Terms & Conditions</Text>
      </Text>

      <Modal
        visible={showConfirmModal}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (!loading && !paymentInProgress) closeConfirmModal();
        }}
      >
        <View style={styles.confirmModalOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />

          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              if (!loading && !paymentInProgress) closeConfirmModal();
            }}
          />

          <Animated.View
            style={[
              styles.confirmCard,
              {
                opacity: confirmOpacity,
                transform: [
                  { scale: confirmScale },
                  { translateY: confirmTranslateY },
                ],
              },
            ]}
          >
            <View style={styles.confirmIconCircle}>
              <Ionicons name="receipt-outline" size={28} color="#FAF8F5" />
            </View>

            <Text style={styles.confirmTitle}>{confirmModalTitle}</Text>

            <Text style={styles.confirmSubtitle}>
              {isHomemadeFlow && selectedPaymentMethod === "cod" ? (
                <>
                  You'll pay the full amount of{" "}
                  <Text style={{ fontWeight: "900", color: "#166538" }}>₹{totalAmount}</Text> in cash upon delivery.
                  {"\n"}
                  No online payment is required right now.
                </>
              ) : isHomemadeFlow ? (
                <>
                  You'll pay the full amount of{" "}
                  <Text style={{ fontWeight: "900", color: "#166538" }}>₹{totalAmount}</Text> online now.
                  {"\n"}
                  Nothing is due on delivery.
                </>
              ) : (
                <>
                  You need to pay an advance amount of{" "}
                  <Text style={{ fontWeight: "900", color: "#166538" }}>₹{advanceAmount} (45%)</Text> online now.
                  {"\n"}
                  Balance amount of{" "}
                  <Text style={{ fontWeight: "800", color: "#0B261D" }}>₹{balanceAmount} (55%)</Text> will be collected upon delivery.
                </>
              )}
            </Text>

            <View style={styles.confirmSummaryStrip}>
              <Ionicons name="location-outline" size={13} color="#0F382A" />
              <Text style={styles.confirmSummaryStripText} numberOfLines={1}>
                {addressDetails}
              </Text>
            </View>

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.85}
                disabled={loading || paymentInProgress}
                onPress={() => closeConfirmModal()}
              >
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmOkBtn, (loading || paymentInProgress) && { opacity: 0.75 }]}
                activeOpacity={0.9}
                disabled={loading || paymentInProgress}
                onPress={handleConfirmPlaceOrder}
              >
                {loading || paymentInProgress ? (
                  <ActivityIndicator size="small" color="#FAF8F5" />
                ) : (
                  <>
                    <Ionicons
                      name={isHomemadeFlow && selectedPaymentMethod === "cod" ? "checkmark-circle-outline" : "qr-code-outline"}
                      size={16}
                      color="#FAF8F5"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.confirmOkBtnText}>
                      {isHomemadeFlow && selectedPaymentMethod === "cod"
                        ? `Place COD Order`
                        : isHomemadeFlow
                        ? `Pay ₹${totalAmount} Now`
                        : `Pay ₹${advanceAmount} via UPI`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={showChangeAddressModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChangeAddressModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowChangeAddressModal(false)}
          />

          <View style={styles.changeAddressModalContainer}>
            <View style={styles.drawerHandle} />
            <TouchableOpacity
              style={styles.previewCloseBtn}
              onPress={() => setShowChangeAddressModal(false)}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={20} color="#FAF8F5" />
            </TouchableOpacity>

            <Text style={styles.changeAddressModalTitle}>Enter Delivery Address</Text>
            <Text style={styles.changeAddressModalSubtitle}>Provide accurate address for prompt chef delivery</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: "100%", marginTop: 12 }}>
              <View style={styles.addressInputGroup}>
                <Text style={styles.addressInputLabel}>Flat / House / Floor No.</Text>
                <TextInput
                  style={styles.addressTextInput}
                  placeholder="e.g. Flat 302, 3rd Floor"
                  placeholderTextColor="#9EA8A3"
                  value={newFlatNo}
                  onChangeText={setNewFlatNo}
                />
              </View>

              <View style={styles.addressInputGroup}>
                <Text style={styles.addressInputLabel}>Building / Apartment / Complex Name</Text>
                <TextInput
                  style={styles.addressTextInput}
                  placeholder="e.g. Royal Heights Apartment"
                  placeholderTextColor="#9EA8A3"
                  value={newBuilding}
                  onChangeText={setNewBuilding}
                />
              </View>

              <View style={styles.addressInputGroup}>
                <Text style={styles.addressInputLabel}>Street / Area / Landmark</Text>
                <TextInput
                  style={styles.addressTextInput}
                  placeholder="e.g. Road No 4, Near Metro Pillar 18"
                  placeholderTextColor="#9EA8A3"
                  value={newStreet}
                  onChangeText={setNewStreet}
                />
              </View>

              <View style={styles.addressInputGroup}>
                <Text style={styles.addressInputLabel}>City & State</Text>
                <TextInput
                  style={styles.addressTextInput}
                  placeholder="e.g. Hyderabad, Telangana"
                  placeholderTextColor="#9EA8A3"
                  value={newCity}
                  onChangeText={setNewCity}
                />
              </View>

              <TouchableOpacity
                style={styles.addAddressSolidCTA}
                activeOpacity={0.88}
                onPress={handleSaveManualAddress}
              >
                <Text style={styles.addAddressSolidCTAText}>Add Address</Text>
                <Ionicons name="checkmark-circle" size={18} color="#FAF8F5" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showPreviewModal} transparent animationType="none" onRequestClose={closeSheet}>
        <BlurView intensity={30} tint="dark" style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSheet} />

          <Animated.View
            style={[
              styles.previewModalContent,
              { transform: [{ translateY: sheetAnim }], height: "82%" },
            ]}
          >
            <View style={styles.drawerHandle} />
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closeSheet}>
              <Ionicons name="close" size={20} color="#FAF8F5" />
            </TouchableOpacity>

            <View style={styles.previewHeaderRow}>
              <View>
                <Text style={[styles.previewTitle, { marginBottom: 2, fontSize: 20, color: "#0B261D" }]}>
                  Selections Summary
                </Text>
                <Text style={{ fontSize: 12.5, color: "#5B756C", marginLeft: 2, fontWeight: "500" }}>
                  {isCateringFlow ? "Review your platter menu & add-ons" : (isHomemadeFlow ? "Review your homemade dishes" : "Tap pills to inspect or confirm choices")}
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
                      key={`checkout-tab-pill-${dayKey}`}
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

            <ScrollView style={{ width: "100%", marginTop: 8 }} showsVerticalScrollIndicator={false}>
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
                        <View key={`cat-${index}`} style={styles.previewCategoryCard}>
                          <View style={styles.previewCategoryHeader}>
                            <Text style={styles.previewCategoryTitle}>{cat.category}</Text>
                          </View>

                          {allSelected.map((item: any, i: number) => {
                            const isExtra = cat.max ? i >= cat.max : false;
                            return (
                              <View key={`cat-item-${i}`} style={styles.previewItemCard}>
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
                        <View key={`addon-item-${idx}`} style={styles.previewItemCard}>
                          <Image
                            source={{ uri: addon.imageUrl || addon.image || "https://via.placeholder.com/80?text=Food" }}
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
                            size={18}
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
                    <Text style={styles.previewCategoryTitle}>Order Summary ({parsedItems.length} Dishes)</Text>
                  </View>
                  {parsedItems.map((dish: any, dIdx: number) => (
                    <View key={`homemade-modal-dish-${dIdx}`} style={styles.previewItemCard}>
                      <Image
                        source={{ uri: dish.image || "https://via.placeholder.com/80?text=Food" }}
                        style={styles.previewItemImage}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewItemName}>{dish.name}</Text>
                        <Text style={styles.previewItemSubdetail}>{dish.selectedQtyConfig || "Standard Serving"} • Qty: {dish.quantity || 1}</Text>
                      </View>
                      <Text style={styles.previewItemPriceTag}>
                        ₹{(Number(dish.price) || 0) * (Number(dish.quantity) || 1)}
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
                        <View key={`checkout-preview-section-${sectionTitle}`} style={{ marginTop: 14 }}>
                          <View style={styles.sectionHeaderLabelContainerTag}>
                            <Text style={styles.sectionHeaderLabelContainerTagText}>{sectionTitle}</Text>
                          </View>

                          {dishesGroupArray.map((dishItem: any, idx: number) => {
                            const isExtraItemAddon = sectionTitle === "ADD ON'S" || dishItem.type === "addon";
                            return (
                              <View
                                key={`checkout-dish-item-${idx}`}
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
                  <View key={`checkout-item-${idx}`} style={styles.previewSelectionRowItemBlock}>
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
              )}
            </ScrollView>

            <View style={styles.modalAbsoluteFooterCTAWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={closeSheet}
                style={styles.modalAbsoluteFooterCTAButtonSolid}
              >
                <Text style={styles.modalAbsoluteFooterCTAButtonSolidText}>
                  Close Summary • ₹{totalAmount}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF8F5" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: "#FAF8F5",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 56, 42, 0.08)",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0B261D", letterSpacing: -0.3 },
  backButtonInline: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  mainCardModern: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 0,
    borderRadius: 24,
    padding: 20,
    paddingTop: 26,
    marginBottom: 20,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    position: 'relative',
    overflow: 'hidden',
  },
  modernTagPillEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  modernTagTextEdge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F382A',
    letterSpacing: 0.8,
  },
  modernHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    marginTop: 6,
  },
  modernHeroImage: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: "#E5ECE8",
  },
  modernTitleBlock: {
    flex: 1,
    marginLeft: 14,
  },
  modernMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.3,
    lineHeight: 22,
    marginBottom: 4,
  },
  modernChefSubtitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F382A',
  },
  groupedMetaSectionContainer: {
    backgroundColor: '#FAF8F5',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  modernInfoGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modernInfoCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  separatorVerticalDotted: {
    width: 1,
    height: 32,
    borderStyle: 'dashed',
    borderRightWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.15)",
    marginHorizontal: 10,
  },
  separatorHorizontalDotted: {
    height: 1,
    borderStyle: 'dashed',
    borderBottomWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.15)",
    marginVertical: 12,
  },
  modernCellLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#5B756C',
    marginTop: 4,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modernCellValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B261D',
  },
  modernAddressBlockNested: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressHeaderRowWithChange: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  changeAddressLinkText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166538",
    textDecorationLine: "underline",
    letterSpacing: 0.2,
  },
  modernAddressLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#5B756C',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modernAddressText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0B261D',
    lineHeight: 18,
  },
  modernStartDateBanner: {
    backgroundColor: '#FAF8F5',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    marginBottom: 4,
  },
  modernStartDateText: {
    fontSize: 12.5,
    color: '#5B756C',
    fontWeight: '500',
  },
  modernViewItemsBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#166534',
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  modernViewItemsText: {
    color: '#FAF8F5',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  homemadeChefHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 14,
  },
  chefPillBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    paddingVertical: 4.5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
    alignSelf: "flex-start",
  },
  chefPillAvatarCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#166538",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  chefPillBadgeText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0F382A",
    letterSpacing: 0.1,
  },
  homemadeDeliveryStripContainer: {
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
  homemadeDeliveryCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  homemadeDeliveryIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(22, 101, 52, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  homemadeDeliveryLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#5B756C",
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  homemadeDeliveryValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  homemadeDeliveryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(22, 101, 52, 0.15)",
    marginHorizontal: 10,
  },
  homemadeItemCardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  homemadeDishThumbnail: {
    width: 66,
    height: 66,
    borderRadius: 14,
    backgroundColor: "#E5ECE8",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  homemadeDishName: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  portionPillTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 3,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  portionPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#0F382A",
  },
  homemadePriceQtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  homemadeQtyLabel: {
    fontSize: 12,
    color: "#5B756C",
    fontWeight: "600",
  },
  homemadeQtyValue: {
    fontWeight: "800",
    color: "#0B261D",
  },
  homemadeDishPrice: {
    fontSize: 15.5,
    fontWeight: "900",
    color: "#166538",
    letterSpacing: -0.2,
  },
  previewItemSubdetail: {
    fontSize: 11.5,
    color: "#5B756C",
    fontWeight: "500",
    marginTop: 2,
  },
  previewItemPriceTag: {
    fontSize: 14.5,
    fontWeight: "900",
    color: "#166538",
    marginLeft: 10,
  },
  upcomingDeliveriesContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 56, 42, 0.08)",
  },
  upcomingDeliveriesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  upcomingDeliveriesTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B261D",
    marginLeft: 6,
  },
  upcomingDeliveriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  upcomingDeliveryPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    borderColor: "rgba(15, 56, 42, 0.12)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  upcomingDeliveryPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0F382A",
  },
  divider: { height: 1, backgroundColor: "rgba(15, 56, 42, 0.08)", marginVertical: 16 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel: { color: "#5B756C", fontSize: 13.5, fontWeight: "600" },
  priceValue: { fontSize: 20, fontWeight: "900", color: "#0B261D", letterSpacing: -0.4 },
  choosePaymentHeaderLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B261D",
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: -0.2,
  },
  paymentOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  paymentOptionCardActive: {
    borderColor: "#0F382A",
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
  },
  disabledPaymentCard: {
    backgroundColor: "#F4F6F5",
    borderColor: "rgba(15, 56, 42, 0.04)",
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(15, 56, 42, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  radioCircleActive: {
    borderColor: "#0F382A",
    backgroundColor: "#0F382A",
  },
  radioInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FAF8F5",
  },
  paymentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  paymentOptionTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0B261D",
  },
  paymentOptionSubtitle: {
    fontSize: 11.5,
    color: "#5B756C",
    marginTop: 2,
    fontWeight: "500",
  },
  recommendedPill: {
    backgroundColor: "rgba(16, 124, 65, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(16, 124, 65, 0.15)",
  },
  recommendedPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#107C41",
    letterSpacing: 0.4,
  },
  trustBadgeFooterContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  trustShieldCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(16, 124, 65, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  trustBadgeTitleText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0F382A",
  },
  trustBadgeDescText: {
    fontSize: 11.5,
    color: "#5B756C",
    marginTop: 2,
    fontWeight: "500",
  },
  trustBadgeIllustrationBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  expandableDetailsCard: {
    position: "absolute",
    bottom: 96,
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 25,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    zIndex: 105,
  },
  modalIndicatorBar: {
    width: 40,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: "rgba(15, 56, 42, 0.15)",
    alignSelf: "center",
    marginBottom: 12,
  },
  breakupHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B261D",
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  breakupLineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  breakupLineLabel: {
    fontSize: 13.5,
    color: "#4F6B61",
    fontWeight: "600",
  },
  breakupLineValue: {
    fontSize: 14,
    color: "#0B261D",
    fontWeight: "800",
  },
  breakupDividerLine: {
    height: 1,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    marginVertical: 10,
  },
  bottomActionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 100,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 56, 42, 0.08)",
  },
  bottomAmountPayableLabel: {
    fontSize: 11,
    color: "#5B756C",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bottomAmountValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.5,
  },
  viewDetailsBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  viewDetailsBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F382A",
  },
  payNowSolidButton: {
    backgroundColor: "#166534",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 20,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  payNowSolidButtonText: {
    color: "#FAF8F5",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  termsFooterText: {
    textAlign: "center",
    fontSize: 11,
    color: "#5B756C",
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    zIndex: 101,
    fontWeight: "500",
  },
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
  changeAddressModalContainer: {
    width: "100%",
    backgroundColor: "#FAF8F5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
    maxHeight: SCREEN_HEIGHT * 0.76,
  },
  changeAddressModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  changeAddressModalSubtitle: {
    fontSize: 12,
    color: "#5B756C",
    marginTop: 2,
    fontWeight: "500",
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11, 38, 29, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FAF8F5",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 26,
  },
  confirmIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#166538",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 4,
    borderColor: "rgba(22, 101, 52, 0.12)",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  confirmTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: "center",
  },
  confirmSubtitle: {
    fontSize: 13,
    color: "#5B756C",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },
  confirmSummaryStrip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  confirmSummaryStripText: {
    flex: 1,
    marginLeft: 7,
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0F382A",
  },
  confirmBtnRow: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.14)",
  },
  confirmCancelBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#5B756C",
    letterSpacing: 0.2,
  },
  confirmOkBtn: {
    flex: 1.4,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#166534",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  confirmOkBtnText: {
    color: "#FAF8F5",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  addressInputGroup: {
    marginBottom: 12,
    width: "100%",
  },
  addressInputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0B261D",
    marginBottom: 6,
  },
  addressTextInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
    color: "#0B261D",
    fontWeight: "500",
    width: "100%",
  },
  addAddressSolidCTA: {
    backgroundColor: "#166538",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 16,
    width: "100%",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  addAddressSolidCTAText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});