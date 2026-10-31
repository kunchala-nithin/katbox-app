import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  useWindowDimensions,
  Animated,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import RazorpayCheckout from "react-native-razorpay";
import { useFocusEffect } from "@react-navigation/native";

import api from "@/src/lib/api";
import {
  getUser,
  refreshUser,
  updateUserAddress,
  ActiveAddress,
  SavedAddress,
} from "@/src/lib/authStorage";
// ✅ NEW: read the active delivery location (lat/lng) from the global store
import { useDeliveryLocationStore } from "@/src/store/deliveryLocationStore";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
  if (!addr) return "";
  if (addr.houseDetails && String(addr.houseDetails).trim().length > 0) {
    return `${addr.houseDetails}, ${addr.fullAddress}`;
  }
  return addr.fullAddress || "";
};

// ✅ NEW: Format an absolute Date into a friendly "4:30 PM" string
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

// ✅ Delivery option info with respective emojis (mirrors CartScreen)
const DELIVERY_OPTION_INFO: Record<
  string,
  { emoji: string; title: string; description: string; includes: string[] }
> = {
  Standard: {
    emoji: "📦",
    title: "Standard Delivery",
    description:
      "Order delivered to your building gate or apartment entrance.",
    includes: [
      "Delivery to building gate / entrance",
      "Best for apartments & gated communities",
      "No floor delivery included",
    ],
  },
  Doorstep: {
    emoji: "🚪",
    title: "Doorstep Delivery",
    description:
      "Delivered to your doorstep, any floor, no extra hassle.",
    includes: [
      "Delivery right to your door",
      "Any floor covered",
      "No setup or serving included",
    ],
  },
  "Doorstep + Service": {
    emoji: "🛎️",
    title: "Doorstep + Service",
    description:
      "End to end support: our staff will deliver, take care of setup, and serve for 3 hours.",
    includes: [
      "Doorstep delivery on any floor",
      "Full setup by our staff",
      "Serving support for 3 hours",
    ],
  },
};

// ✅ Simple spice label → emoji mapping (mirrors CartScreen)
const resolveSpiceEmoji = (label: string): string => {
  const l = String(label || "").toLowerCase();
  if (l.includes("less")) return "❄️";
  if (l.includes("medium")) return "🌶️";
  if (l.includes("very")) return "🔥";
  if (l.includes("no onion")) return "🚫🧄";
  return "🍽️";
};

export default function CheckOutScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // ✅ NEW: read delivery location (lat/lng) from global store — single source of truth
  const deliveryLocation = useDeliveryLocationStore((s) => s.deliveryLocation);

  const [loading, setLoading] = useState(false);

  const serviceType = (params.serviceType as string) || "mealbox";
  // ✅ QuickBites detection — separate flow flag, but same UI as homemade.
  const isQuickBitesFlow = serviceType === "quickbites";
  const isCateringFlow = serviceType === "catering";
  const isHomemadeFlow = serviceType === "homemade" || isQuickBitesFlow;
  // ✅ NEW: Explicit mealbox flow flag — used to gate upcomingDeliveries logic.
  const isMealBoxFlowExplicit = serviceType === "mealbox";

  const totalAmount = (params.totalAmount as string) || "687";
  const numericTotal = Number(totalAmount) || 0;

  // Catering and MealBox customers can choose a 40% advance or full payment.
  const advanceAmount = Math.round(numericTotal * 0.40 * 100) / 100;

  const subtotal = Number(params.subtotal) || Number(totalAmount);
  const deliveryPrice = Number(params.deliveryPrice) || 0;
  const discount = Number(params.discount) || 0;
  const appliedCoupon = (params.appliedCoupon as string) || null;

  const chefId = (params.chefId as string) || "";
  const chefName = (params.chefName as string) || "Nithin Samrat";
  const userId = (params.userId as string) || "";
  const userName = (params.userName as string) || "";

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
  // ✅ Homemade-only: top-level delivery slot param (may be empty for mealbox/catering).
  //    This IS the authoritative cart.deliverySlot value from Prompt 1's cart flow —
  //    CartScreen forwards cart.deliverySlot as params.deliverySlot.
  const deliverySlotParam = (params.deliverySlot as string) || "";

  // ✅ Homemade resolution — prefer the top-level slot; fall back to deliveryTimeSlot
  const homemadeResolvedDate = deliveryDate || "";
  const homemadeResolvedSlot = deliverySlotParam || deliveryTimeSlot || "";

  // ✅ Detect QuickBites flow either from the serviceType OR from an explicit param.
  const isQuickBites =
    isQuickBitesFlow ||
    String((params.isQuickBites as string) || "").toLowerCase() === "true";

  // ✅ Compute a fresh, live estimated delivery time for QuickBites.
  // Anchored to "now" so the label stays accurate even if the user took
  // several minutes on the review screen.
  const liveEstimatedDeliveryAt = useMemo(() => {
    if (isQuickBites) {
      return new Date(Date.now() + 75 * 60 * 1000);
    }
    // Fall back to any client-provided absolute ms timestamp
    const rawMs = (params.estimatedDeliveryAtMs as string) || "";
    const parsedMs = Number(rawMs);
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return new Date(parsedMs);
    }
    return null;
  }, [isQuickBites, params.estimatedDeliveryAtMs]);

  // ✅ Compute the dynamic delivery date/slot labels for display
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
      // ✅ Just the clock time, e.g. "4:30 PM"
      return formatTimeShortLocal(liveEstimatedDeliveryAt);
    }
    return homemadeResolvedSlot;
  }, [isHomemadeFlow, isQuickBites, liveEstimatedDeliveryAt, homemadeResolvedSlot]);

  const [addressDetails, setAddressDetails] = useState<string>(
    (params.addressDetails as string) || (params.deliveryAddress as string) || "2-91/32, Sai Enclave, Hyderabad"
  );
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [activeAddress, setActiveAddress] = useState<ActiveAddress | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(true);

  const [showChangeAddressModal, setShowChangeAddressModal] = useState(false);
  const [newFlatNo, setNewFlatNo] = useState("");
  const [newBuilding, setNewBuilding] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newCity, setNewCity] = useState("");

  // ✅ NEW: Delivery option info popup (flag + explanation) state
  const [deliveryInfoVisible, setDeliveryInfoVisible] = useState(false);
  const deliveryInfoAnim = useRef(new Animated.Value(0)).current;

  // ✅ NEW: Special instructions collapsible state
  const [specialInstructionsExpanded, setSpecialInstructionsExpanded] = useState(false);
  const specialInstructionsAnim = useRef(new Animated.Value(0)).current;

  // ✅ NEW: Fetched cart data for the current cartId (source of truth for
  // Prompt 1's cart.specialInstructions sub-doc). We deliberately do NOT
  // duplicate this into params or into a second store — we read the cart
  // document once via the existing /api/cart endpoint and keep it local.
  const [cartDoc, setCartDoc] = useState<any>(null);

  // ✅ NEW: Load the authoritative cart document for this checkout session.
  // This is the SAME /api/cart endpoint CartScreen already uses (no new API,
  // no second source of truth). We pick the cart that matches params.cartId
  // when available; otherwise the most recent in-cart document.
  useEffect(() => {
    let cancelled = false;
    const loadCartDoc = async () => {
      try {
        const res = await api.get("/api/cart");
        if (cancelled) return;
        if (res.data?.success && Array.isArray(res.data.cart) && res.data.cart.length > 0) {
          const targetId = String((params.cartId as string) || "");
          const match = targetId
            ? res.data.cart.find((c: any) => String(c?._id) === targetId)
            : null;
          setCartDoc(match || res.data.cart[0]);
        } else {
          setCartDoc(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.log("Checkout: failed to load cart doc for special instructions:", err);
          setCartDoc(null);
        }
      }
    };
    loadCartDoc();
    return () => {
      cancelled = true;
    };
  }, [params.cartId]);

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

  useFocusEffect(
    useCallback(() => {
      const loadDynamicAddress = async () => {
        setIsLoadingAddress(true);
        try {
          const cached = await getUser();
          if (cached) {
            setCustomerPhone(String(cached.phone || ""));
            setCustomerEmail(String(cached.email || ""));
            if (cached.activeAddress && cached.activeAddress.fullAddress) {
              setActiveAddress(cached.activeAddress);
              setAddressDetails(formatAddressDisplay(cached.activeAddress));
            } else if (cached.address && String(cached.address).trim().length > 0) {
              setAddressDetails(String(cached.address).trim());
            }
          }
          const fresh = await refreshUser();
          if (fresh) {
            setCustomerPhone(String(fresh.phone || ""));
            setCustomerEmail(String(fresh.email || ""));
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

  // Group the two expanded component rows of a combo into one checkout card.
  // Keep parsedItems unchanged because the order API still receives both
  // component rows and their combo metadata.
  const checkoutDisplayItems = useMemo(() => {
    const sourceItems = Array.isArray(parsedItems) ? parsedItems : [];
    const displayItems: any[] = [];
    const comboGroups = new Map<string, any>();

    sourceItems.forEach((item: any, index: number) => {
      if (!item?.isComboComponent) {
        displayItems.push({
          type: "item",
          key: String(item?.id || `checkout-item-${index}`),
          item,
        });
        return;
      }

      const id = String(item?.id || "");
      const idMatch = id.match(/^combo-(?:src|pair)-(.+)$/);
      const groupKey = idMatch?.[1] ||
        String(item?.comboId || item?.comboKey || item?.comboName || `checkout-combo-${index}`);

      let group = comboGroups.get(groupKey);
      if (!group) {
        group = {
          type: "combo",
          key: `checkout-combo-${groupKey}`,
          comboName: String(item?.comboName || "Combo Offer"),
          items: [],
          quantity: Math.max(1, Number(item?.quantity) || 1),
          unitPrice: 0,
        };
        comboGroups.set(groupKey, group);
        displayItems.push(group);
      }

      group.items.push(item);
      group.unitPrice += Number(item?.price) || 0;
      group.quantity = Math.max(group.quantity, Number(item?.quantity) || 1);
    });

    return displayItems;
  }, [parsedItems]);

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

  // ✅ upcomingDeliveriesList is computed ONLY for the mealbox flow.
  //    For catering / homemade / quickbites it intentionally returns [].
  //    This is the single source of upcoming dates that gets persisted on
  //    the order document via the `upcomingDeliveries` formData field.
  const upcomingDeliveriesList: string[] = useMemo(() => {
    if (isCateringFlow || isHomemadeFlow) return [];

    // Expo Router params may arrive as strings, while older cart documents
    // can contain JSON-stringified values inside the Mixed orderDetails field.
    // Parse safely, including a second encoding layer from older app versions.
    const parseArray = (value: any): any[] | null => {
      let parsed = value;
      for (let attempt = 0; attempt < 3 && typeof parsed === "string"; attempt += 1) {
        const trimmed = parsed.trim();
        if (!trimmed) return null;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return null;
        }
      }
      return Array.isArray(parsed) ? parsed : null;
    };

    const formatDateItems = (items: any[]): string[] =>
      items
        .map((item: any) => {
          if (typeof item === "string") return item.trim();
          if (item?.dayName && item?.dayNumber && item?.monthName) {
            return `${item.dayName}, ${item.dayNumber} ${item.monthName}`;
          }
          if (item?.fullDateString) return String(item.fullDateString);
          return "";
        })
        .filter((item: string) => item.length > 0);

    const formattedDates = formatDateItems(parseArray(params.scheduledDatesFormatted) || []);
    if (formattedDates.length > 0) return formattedDates;

    // Do not return an empty formatted array early: the detailed list can
    // still contain the user's selected dates and must be used as fallback.
    const listedDates = formatDateItems(parseArray(params.scheduledDatesList) || []);
    if (listedDates.length > 0) return listedDates;

    if (deliveryDate) return [String(deliveryDate)];
    return [];
  }, [params.scheduledDatesFormatted, params.scheduledDatesList, deliveryDate, isCateringFlow, isHomemadeFlow]);

  // ✅ "razorpay" is now the ONLY payment method — all 5 cards route to it.
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"upi" | "card" | "netbanking" | "wallet" | "">("");
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<"advance" | "full">("full");
  const isAdvancePaymentEligible = isCateringFlow || isMealBoxFlowExplicit;
  const [showDetails, setShowDetails] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggleDetails = () => {
    const toValue = showDetails ? 0 : 1;
    setShowDetails(!showDetails);
    Animated.spring(slideAnim, { toValue, friction: 8, tension: 40, useNativeDriver: false }).start();
  };

  // ✅ NEW: Dynamic delivery option resolution (mirrors CartScreen)
  const resolvedDeliveryOption: string = useMemo(() => {
    return String(deliveryType || "").trim();
  }, [deliveryType]);

  const deliveryInfo = resolvedDeliveryOption
    ? DELIVERY_OPTION_INFO[resolvedDeliveryOption] || null
    : null;

  // ✅ NEW: Special instructions resolution.
  // Priority:
  //   1) Prompt 1's authoritative cart.specialInstructions sub-doc (fetched by cartId).
  //   2) Fallback: reconstruct from params.orderDetails (legacy catering-style data),
  //      exactly as before — nothing removed.
  const resolvedSpecialInstruction = useMemo(() => {
    // ✅ 1) Read Prompt 1's authoritative cart sub-doc first.
    const cartSub = cartDoc?.specialInstructions;
    if (cartSub && (cartSub.spice || cartSub.noOnionsGarlic || cartSub.notes)) {
      const spiceRaw = String(cartSub.spice || "").toLowerCase().trim();
      let label = "";
      if (spiceRaw === "less") label = "Less spicy";
      else if (spiceRaw === "medium") label = "Medium spicy";
      else if (spiceRaw === "very") label = "Very spicy";
      else if (spiceRaw === "noonion") label = "No onion & garlic";
      else if (spiceRaw) label = String(cartSub.spice);

      const noOnion = !!cartSub.noOnionsGarlic;
      const text = String(cartSub.notes || "").trim();
      const spiceEmoji = label ? resolveSpiceEmoji(label) : "";
      const hasAny = !!(label || text || noOnion);

      return {
        tag: spiceRaw,
        label,
        spiceEmoji,
        text,
        noOnion,
        hasAny,
      };
    }

    // ✅ 2) Fallback: existing legacy reconstruction from params.orderDetails.
    let orderDetails: any = null;
    const rawOrderDetails = params.orderDetails;
    if (rawOrderDetails) {
      try {
        orderDetails =
          typeof rawOrderDetails === "string"
            ? JSON.parse(rawOrderDetails)
            : rawOrderDetails;
      } catch (e) {
        orderDetails = null;
      }
    }

    const nested = orderDetails?.specialInstruction;
    const nestedLabel =
      nested?.label || orderDetails?.specialInstructionLabel || "";
    const nestedTag = nested?.tag || orderDetails?.specialInstructionTag || "";
    const nestedText =
      nested?.text || orderDetails?.specialInstructionText || "";
    const spiceRaw = orderDetails?.selectedSpice || "";
    const noOnion = !!orderDetails?.noOnionsGarlic;
    const notesRaw = orderDetails?.notes || "";

    let label = String(nestedLabel || "").trim();
    if (!label && spiceRaw) {
      const s = String(spiceRaw).toLowerCase().trim();
      if (s === "less") label = "Less spicy";
      else if (s === "medium") label = "Medium spicy";
      else if (s === "very") label = "Very spicy";
      else if (s === "noonion") label = "No onion & garlic";
      else label = String(spiceRaw);
    }

    const tag = String(nestedTag || spiceRaw || "").trim();
    const text = String(nestedText || notesRaw || "").trim();

    const spiceEmoji = label ? resolveSpiceEmoji(label) : "";
    const hasAny = !!(label || text || noOnion);

    return {
      tag,
      label,
      spiceEmoji,
      text,
      noOnion,
      hasAny,
    };
  }, [cartDoc, params.orderDetails]);

  // ✅ NEW: Toggle special instructions collapsible
  const toggleSpecialInstructions = () => {
    if (specialInstructionsExpanded) {
      Animated.timing(specialInstructionsAnim, {
        toValue: 0,
        duration: 240,
        easing: undefined,
        useNativeDriver: false,
      }).start(() => setSpecialInstructionsExpanded(false));
    } else {
      setSpecialInstructionsExpanded(true);
      Animated.timing(specialInstructionsAnim, {
        toValue: 1,
        duration: 280,
        easing: undefined,
        useNativeDriver: false,
      }).start();
    }
  };

  const specialInstructionsChevronRotate = specialInstructionsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const specialInstructionsContentHeight = specialInstructionsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  const specialInstructionsContentOpacity = specialInstructionsAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  // ✅ NEW: show / hide delivery info popup
  const showDeliveryInfo = () => {
    setDeliveryInfoVisible(true);
    deliveryInfoAnim.setValue(0);
    Animated.spring(deliveryInfoAnim, {
      toValue: 1,
      tension: 70,
      friction: 9,
      useNativeDriver: true,
    }).start();
  };

  const hideDeliveryInfo = () => {
    Animated.timing(deliveryInfoAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setDeliveryInfoVisible(false));
  };

  /* ─────────────────────────────────────────────────────────────────
     RAZORPAY FULL-PAYMENT FLOW
     1. Create the KatBox order in MongoDB (Payment Pending).
     2. Create a Razorpay order linked to that MongoDB orderId.
     3. Open the selected native Razorpay payment method.
     4. Verify signature + captured payment on the backend.
     5. Navigate only after successful server-side verification.
     ───────────────────────────────────────────────────────────────── */
  const handleRazorpayPayment = async (paymentOptionOverride?: "advance" | "full") => {
    const effectivePaymentOption = paymentOptionOverride || selectedPaymentOption;
    const payableAmount = isAdvancePaymentEligible && effectivePaymentOption === "advance" ? advanceAmount : numericTotal;
    const remainingBalance = Math.max(0, Math.round((numericTotal - payableAmount) * 100) / 100);
    if (loading) return;
    if (!selectedPaymentMethod) {
      Alert.alert("Select a payment method", "Please choose UPI, Cards, Net Banking or Wallets to continue.");
      return;
    }
    if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
      Alert.alert("Invalid amount", "The order total is invalid. Please return to your cart and try again.");
      return;
    }

    try {
      setLoading(true);

      // Build the complete order payload once. This preserves all existing
      // service-specific fields and saves them before opening Razorpay.
      const orderPayload = {
        userId,
        cartId: String(params.cartId || ""),
        userName,
        userPhone: customerPhone,
        chefId,
        chefName,
        serviceType,
        menuName,
        menuImage,
        durationType,
        deliveryTimeSlot,
        deliverySlot: isHomemadeFlow ? dynamicHomemadeSlotLabel : "",
        addressDetails,
        deliveryAddress: addressDetails,
        deliveryDate,
        upcomingDeliveries: JSON.stringify(upcomingDeliveriesList),
        scheduledDatesFormatted: JSON.stringify(upcomingDeliveriesList),
        scheduledDatesList: JSON.stringify(upcomingDeliveriesList),
        subtotal: String(subtotal),
        deliveryPrice: String(deliveryPrice),
        discount: String(discount),
        appliedCoupon: appliedCoupon || "",
        totalAmount: String(numericTotal),
        advancePaidAmount: String(payableAmount),
        balanceAmountToCollect: String(remainingBalance),
        paymentOption: isAdvancePaymentEligible ? effectivePaymentOption : "full",
        paymentMethod: selectedPaymentMethod,
        selections: parsedSelections ? JSON.stringify(parsedSelections) : null,
        items: JSON.stringify(parsedItems),
        restaurantName,
        restaurantImage,
        occasion,
        guests: String(guests),
        eventDate,
        eventTime,
        deliveryType: resolvedDeliveryOption || "",
        pricePerPlate: String(pricePerPlate),
        addons: JSON.stringify(parsedAddons),
        isQuickBites: isQuickBites ? "true" : "false",
        estimatedDeliveryAtMs: liveEstimatedDeliveryAt ? String(liveEstimatedDeliveryAt.getTime()) : "",
        deliveryWindowMinutes: isQuickBites ? "75" : "0",
        latitude: String(
          deliveryLocation?.latitude !== undefined && deliveryLocation?.latitude !== null
            ? deliveryLocation.latitude
            : activeAddress?.latitude ?? 0
        ),
        longitude: String(
          deliveryLocation?.longitude !== undefined && deliveryLocation?.longitude !== null
            ? deliveryLocation.longitude
            : activeAddress?.longitude ?? 0
        ),
        specialInstruction: resolvedSpecialInstruction.hasAny
          ? JSON.stringify({
              tag: resolvedSpecialInstruction.tag || "",
              label: resolvedSpecialInstruction.label || "",
              text: resolvedSpecialInstruction.text || "",
            })
          : "",
        specialInstructionTag: resolvedSpecialInstruction.tag || "",
        specialInstructionLabel: resolvedSpecialInstruction.label || "",
        specialInstructionText: resolvedSpecialInstruction.text || "",
        quickDeliverySlot: isHomemadeFlow ? dynamicHomemadeSlotLabel : "",
        specialInstructions:
          isHomemadeFlow && cartDoc?.specialInstructions
            ? JSON.stringify({
                spice: cartDoc.specialInstructions.spice || "",
                noOnionsGarlic: !!cartDoc.specialInstructions.noOnionsGarlic,
                notes: cartDoc.specialInstructions.notes || "",
              })
            : "",
      };

      // Step 1: Save the complete KatBox order first. The backend returns
      // the MongoDB orderId required by the Razorpay create-order endpoint.
      const orderRes = await api.post("/api/orders/create", orderPayload);
      const createdOrder = orderRes.data?.order;
      const katboxOrderId = String(createdOrder?.orderId || "").trim();
      if (!orderRes.data?.success || !katboxOrderId) {
        throw new Error(orderRes.data?.message || "KatBox could not create your order. Please try again.");
      }

      // Step 2: Create a Razorpay order for the selected advance or full amount.
      const createRes = await api.post("/api/payments/create-order", { orderId: katboxOrderId });
      if (!createRes.data?.success || !createRes.data?.razorpayOrderId || !createRes.data?.keyId) {
        throw new Error(createRes.data?.message || "Failed to initialize Razorpay checkout.");
      }

      // Step 3: Open the native Razorpay SDK using the customer's selection.
      const razorpayOptions: any = {
        description: `Order for ${menuName}`,
        image: "https://katbox.in/favicon.ico",
        currency: createRes.data.currency || "INR",
        key: createRes.data.keyId,
        amount: createRes.data.amount,
        name: "KatBox",
        order_id: createRes.data.razorpayOrderId,
        method: selectedPaymentMethod,
        prefill: {
          name: userName || "",
          contact: customerPhone ? (customerPhone.startsWith("+") ? customerPhone : `+91${customerPhone.replace(/\D/g, "")}`) : "",
          email: customerEmail || "",
        },
        theme: { color: "#073B1E" },
      };

      let razorpayResult: any;
      try {
        razorpayResult = await RazorpayCheckout.open(razorpayOptions);
      } catch (sdkErr: any) {
        console.log("Razorpay SDK result:", sdkErr);
        const description = String(sdkErr?.description || sdkErr?.message || "");
        if (
          String(sdkErr?.code || "").toLowerCase().includes("payment_cancelled") ||
          description.toLowerCase().includes("cancel")
        ) {
          Alert.alert("Payment cancelled", "Your payment was cancelled. Your order is still pending payment and has not been sent to the chef.");
        } else {
          Alert.alert("Payment Failed", description || "Payment could not be completed. Please try again.");
        }
        return;
      }

      if (!razorpayResult?.razorpay_payment_id || !razorpayResult?.razorpay_order_id || !razorpayResult?.razorpay_signature) {
        throw new Error("Razorpay did not return all payment verification details. Please contact support before retrying.");
      }

      // Step 4: Server verifies the signature and confirms the captured
      // payment against the exact MongoDB order and selected payable amount.
      const verifyRes = await api.post("/api/payments/verify", {
        orderId: katboxOrderId,
        razorpay_order_id: razorpayResult.razorpay_order_id,
        razorpay_payment_id: razorpayResult.razorpay_payment_id,
        razorpay_signature: razorpayResult.razorpay_signature,
      });
      if (!verifyRes.data?.success || !verifyRes.data?.order || verifyRes.data.order.paymentCaptured !== true) {
        throw new Error(verifyRes.data?.message || "Payment could not be verified. Do not retry until the order status is checked.");
      }

      // Cart cleanup is deliberately after successful server verification.
      if (params.cartId) {
        try { await api.delete(`/api/cart/${params.cartId}`); }
        catch (e) { console.log("Cart cleanup non-critical error", e); }
      }

      setShowConfirmModal(false);
      router.replace({
        pathname: "/screens/OrderConfirmationScreen",
        params: {
          orderId: katboxOrderId,
          serviceType,
          paymentMethod: selectedPaymentMethod,
          paymentStatus: "Paid",
        },
      });
    } catch (err: any) {
      console.log("Razorpay payment error:", err);
      console.log("Backend status:", err?.response?.status);
      console.log("Backend response:", JSON.stringify(err?.response?.data, null, 2));
      setShowConfirmModal(false);
      Alert.alert(
        "Payment Error",
        err?.response?.data?.message || err?.response?.data?.error || err?.message ||
          "Something went wrong while processing your payment. Please check your order status before trying again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpayPaymentWithOption = (option: "advance" | "full") => handleRazorpayPayment(option);

  const handleConfirmPlaceOrder = () => {
    if (!selectedPaymentMethod) {
      closeConfirmModal();
      Alert.alert("Select a payment method", "Please select a payment method before placing your order.");
      return;
    }
    closeConfirmModal(() => {
      setTimeout(() => { handleRazorpayPayment(); }, 100);
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

            {/* ✅ HOMEMADE / QUICKBITES DELIVERY DATE & SLOT STRIP */}
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

            {/* ✅ NEW: Simple delivery option line with emoji + info icon (for homemade flow too) */}
            {!!resolvedDeliveryOption && (
              <View style={styles.deliveryOptionRowInline}>
                <Text style={styles.deliveryOptionEmojiInline}>
                  {deliveryInfo?.emoji || "📦"}
                </Text>
                <Text style={styles.deliveryOptionTextInline}>
                  {resolvedDeliveryOption}
                </Text>
                <TouchableOpacity
                  onPress={showDeliveryInfo}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.deliveryInfoBtnInline}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={15}
                    color="#0F382A"
                  />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.groupedMetaSectionContainer}>
              {parsedItems && parsedItems.length > 0 ? (
                checkoutDisplayItems.map((displayItem: any, idx: number) => {
                  if (displayItem.type === "combo") {
                    const comboItems = displayItem.items || [];
                    const first = comboItems[0] || {};
                    const second = comboItems[1] || {};
                    const comboTotal = (Number(displayItem.unitPrice) || 0) * (Number(displayItem.quantity) || 1);
                    const dishNames = comboItems
                      .map((component: any) => String(component?.name || "").trim())
                      .filter(Boolean);

                    return (
                      <View key={displayItem.key}>
                        <View style={styles.homemadeItemCardRow}>
                          <View style={styles.homemadeComboImagesWrap}>
                            <Image
                              source={{ uri: first.image || "https://via.placeholder.com/150" }}
                              style={styles.homemadeComboThumbnail}
                            />
                            <View style={styles.homemadeComboPlus}>
                              <Ionicons name="add" size={12} color="#FFFFFF" />
                            </View>
                            <Image
                              source={{ uri: second.image || first.image || "https://via.placeholder.com/150" }}
                              style={[styles.homemadeComboThumbnail, styles.homemadeComboSecondThumbnail]}
                            />
                          </View>
                          <View style={{ flex: 1, marginLeft: 14, justifyContent: "center" }}>
                            <View style={styles.homemadeComboPill}>
                              <Text style={styles.homemadeComboPillText}>COMBO OFFER</Text>
                            </View>
                            <Text style={styles.homemadeDishName} numberOfLines={2}>
                              {displayItem.comboName || "Combo Offer"}
                            </Text>
                            <Text style={styles.homemadeComboDishNames} numberOfLines={2}>
                              {dishNames.join(" + ") || "Two selected items"}
                            </Text>
                            <View style={styles.homemadePriceQtyRow}>
                              <Text style={styles.homemadeQtyLabel}>
                                Qty: <Text style={styles.homemadeQtyValue}>{displayItem.quantity}</Text>
                              </Text>
                              <Text style={styles.homemadeDishPrice}>₹{comboTotal}</Text>
                            </View>
                          </View>
                        </View>
                        {idx !== checkoutDisplayItems.length - 1 && (
                          <View style={styles.separatorHorizontalDotted} />
                        )}
                      </View>
                    );
                  }

                  const dishItem = displayItem.item;
                  return (
                    <View key={displayItem.key}>
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
                      {idx !== checkoutDisplayItems.length - 1 && (
                        <View style={styles.separatorHorizontalDotted} />
                      )}
                    </View>
                  );
                })
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

            {/* ✅ NEW: Simple Special Instructions row for homemade flow */}
            {resolvedSpecialInstruction.hasAny && (
              <View style={styles.simpleSpecialInstrWrapper}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={toggleSpecialInstructions}
                  style={styles.simpleSpecialInstrTrigger}
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={14}
                    color="#0F382A"
                  />
                  <Text style={styles.simpleSpecialInstrTriggerText}>
                    Special Instructions
                  </Text>
                  <Animated.View
                    style={{
                      transform: [
                        { rotate: specialInstructionsChevronRotate },
                      ],
                      marginLeft: 4,
                    }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color="#0F382A"
                    />
                  </Animated.View>
                </TouchableOpacity>

                {specialInstructionsExpanded && (
                  <Animated.View
                    style={[
                      styles.simpleSpecialInstrBody,
                      {
                        maxHeight: specialInstructionsContentHeight,
                        opacity: specialInstructionsContentOpacity,
                        overflow: "hidden",
                      },
                    ]}
                  >
                    {!!resolvedSpecialInstruction.label && (
                      <View style={styles.simpleSpecialInstrRow}>
                        <Text style={styles.simpleSpecialInstrEmoji}>
                          {resolvedSpecialInstruction.spiceEmoji}
                        </Text>
                        <Text style={styles.simpleSpecialInstrRowText}>
                          {resolvedSpecialInstruction.label}
                        </Text>
                      </View>
                    )}

                    {resolvedSpecialInstruction.noOnion &&
                      !String(resolvedSpecialInstruction.label || "")
                        .toLowerCase()
                        .includes("no onion") && (
                        <View style={styles.simpleSpecialInstrRow}>
                          <Text style={styles.simpleSpecialInstrEmoji}>
                            🚫🧄
                          </Text>
                          <Text style={styles.simpleSpecialInstrRowText}>
                            No onion & garlic
                          </Text>
                        </View>
                      )}

                    {!!resolvedSpecialInstruction.text && (
                      <View style={styles.simpleSpecialInstrNoteBox}>
                        <Text style={styles.simpleSpecialInstrNoteText}>
                          {resolvedSpecialInstruction.text}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                )}
              </View>
            )}

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

                {/* ✅ NEW: Simple delivery option line below chef name with emoji + info icon */}
                {!!resolvedDeliveryOption && (
                  <View style={styles.deliveryOptionRowInline}>
                    <Text style={styles.deliveryOptionEmojiInline}>
                      {deliveryInfo?.emoji || "📦"}
                    </Text>
                    <Text style={styles.deliveryOptionTextInline}>
                      {resolvedDeliveryOption}
                    </Text>
                    <TouchableOpacity
                      onPress={showDeliveryInfo}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.deliveryInfoBtnInline}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={15}
                        color="#0F382A"
                      />
                    </TouchableOpacity>
                  </View>
                )}
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

            {/* ✅ NEW: Simple Special Instructions row for catering flow */}
            {resolvedSpecialInstruction.hasAny && (
              <View style={styles.simpleSpecialInstrWrapper}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={toggleSpecialInstructions}
                  style={styles.simpleSpecialInstrTrigger}
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={14}
                    color="#0F382A"
                  />
                  <Text style={styles.simpleSpecialInstrTriggerText}>
                    Special Instructions
                  </Text>
                  <Animated.View
                    style={{
                      transform: [
                        { rotate: specialInstructionsChevronRotate },
                      ],
                      marginLeft: 4,
                    }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color="#0F382A"
                    />
                  </Animated.View>
                </TouchableOpacity>

                {specialInstructionsExpanded && (
                  <Animated.View
                    style={[
                      styles.simpleSpecialInstrBody,
                      {
                        maxHeight: specialInstructionsContentHeight,
                        opacity: specialInstructionsContentOpacity,
                        overflow: "hidden",
                      },
                    ]}
                  >
                    {!!resolvedSpecialInstruction.label && (
                      <View style={styles.simpleSpecialInstrRow}>
                        <Text style={styles.simpleSpecialInstrEmoji}>
                          {resolvedSpecialInstruction.spiceEmoji}
                        </Text>
                        <Text style={styles.simpleSpecialInstrRowText}>
                          {resolvedSpecialInstruction.label}
                        </Text>
                      </View>
                    )}

                    {resolvedSpecialInstruction.noOnion &&
                      !String(resolvedSpecialInstruction.label || "")
                        .toLowerCase()
                        .includes("no onion") && (
                        <View style={styles.simpleSpecialInstrRow}>
                          <Text style={styles.simpleSpecialInstrEmoji}>
                            🚫🧄
                          </Text>
                          <Text style={styles.simpleSpecialInstrRowText}>
                            No onion & garlic
                          </Text>
                        </View>
                      )}

                    {!!resolvedSpecialInstruction.text && (
                      <View style={styles.simpleSpecialInstrNoteBox}>
                        <Text style={styles.simpleSpecialInstrNoteText}>
                          {resolvedSpecialInstruction.text}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                )}
              </View>
            )}

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

                {/* ✅ NEW: Simple delivery option line below chef name with emoji + info icon */}
                {!!resolvedDeliveryOption && (
                  <View style={styles.deliveryOptionRowInline}>
                    <Text style={styles.deliveryOptionEmojiInline}>
                      {deliveryInfo?.emoji || "📦"}
                    </Text>
                    <Text style={styles.deliveryOptionTextInline}>
                      {resolvedDeliveryOption}
                    </Text>
                    <TouchableOpacity
                      onPress={showDeliveryInfo}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.deliveryInfoBtnInline}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={15}
                        color="#0F382A"
                      />
                    </TouchableOpacity>
                  </View>
                )}
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

            {/* ✅ NEW: Simple Special Instructions row for mealbox flow */}
            {resolvedSpecialInstruction.hasAny && (
              <View style={styles.simpleSpecialInstrWrapper}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={toggleSpecialInstructions}
                  style={styles.simpleSpecialInstrTrigger}
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={14}
                    color="#0F382A"
                  />
                  <Text style={styles.simpleSpecialInstrTriggerText}>
                    Special Instructions
                  </Text>
                  <Animated.View
                    style={{
                      transform: [
                        { rotate: specialInstructionsChevronRotate },
                      ],
                      marginLeft: 4,
                    }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color="#0F382A"
                    />
                  </Animated.View>
                </TouchableOpacity>

                {specialInstructionsExpanded && (
                  <Animated.View
                    style={[
                      styles.simpleSpecialInstrBody,
                      {
                        maxHeight: specialInstructionsContentHeight,
                        opacity: specialInstructionsContentOpacity,
                        overflow: "hidden",
                      },
                    ]}
                  >
                    {!!resolvedSpecialInstruction.label && (
                      <View style={styles.simpleSpecialInstrRow}>
                        <Text style={styles.simpleSpecialInstrEmoji}>
                          {resolvedSpecialInstruction.spiceEmoji}
                        </Text>
                        <Text style={styles.simpleSpecialInstrRowText}>
                          {resolvedSpecialInstruction.label}
                        </Text>
                      </View>
                    )}

                    {resolvedSpecialInstruction.noOnion &&
                      !String(resolvedSpecialInstruction.label || "")
                        .toLowerCase()
                        .includes("no onion") && (
                        <View style={styles.simpleSpecialInstrRow}>
                          <Text style={styles.simpleSpecialInstrEmoji}>
                            🚫🧄
                          </Text>
                          <Text style={styles.simpleSpecialInstrRowText}>
                            No onion & garlic
                          </Text>
                        </View>
                      )}

                    {!!resolvedSpecialInstruction.text && (
                      <View style={styles.simpleSpecialInstrNoteBox}>
                        <Text style={styles.simpleSpecialInstrNoteText}>
                          {resolvedSpecialInstruction.text}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                )}
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

        {/* Choose a Payment Method Section */}
        <Text style={styles.choosePaymentHeaderLabel}>Choose a payment method</Text>

        {/* 1. UPI Payment Option — now ENABLED, opens Razorpay (UPI) */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setSelectedPaymentMethod("upi"); setSelectedPaymentOption("full"); openConfirmModal(); }}
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

        {/* 2. Cards Option — now ENABLED, opens Razorpay (Cards) */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setSelectedPaymentMethod("card"); setSelectedPaymentOption("full"); openConfirmModal(); }}
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

        {/* 3. Net Banking Option — now ENABLED, opens Razorpay (Net Banking) */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setSelectedPaymentMethod("netbanking"); setSelectedPaymentOption("full"); openConfirmModal(); }}
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

        {/* 4. Wallets Option — now ENABLED, opens Razorpay (Wallets) */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setSelectedPaymentMethod("wallet"); setSelectedPaymentOption("full"); openConfirmModal(); }}
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

        {/* Bottom Trust Badge Footer Banner */}
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

      {/* Dynamic Expandable Price Breakup Sheet */}
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

          <View style={styles.breakupLineRow}>
            <Text style={[styles.breakupLineLabel, { fontWeight: "800", color: "#0B261D" }]}>
              Total Payable
            </Text>
            <Text style={[styles.breakupLineValue, { fontWeight: "900", color: "#0F382A" }]}>
              ₹{numericTotal}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Floating Bottom Action Bar */}
      <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View>
          <Text style={styles.bottomAmountPayableLabel}>Amount Payable</Text>
          <TouchableOpacity
            onPress={toggleDetails}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text style={styles.bottomAmountValue}>₹{numericTotal}</Text>
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
          style={[styles.payNowSolidButton, loading && { opacity: 0.7 }]}
          onPress={() => {
            if (!selectedPaymentMethod) {
              Alert.alert("Select a payment method", "Please choose UPI, Cards, Net Banking or Wallets to continue.");
              return;
            }
            openConfirmModal();
          }}
          disabled={loading}
        >
          {loading ? (
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

      {/* ================= ORDER CONFIRMATION MODAL (RAZORPAY) ================= */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (!loading) closeConfirmModal();
        }}
      >
        <View style={styles.confirmModalOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />

          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              if (!loading) closeConfirmModal();
            }}
          />

          <Animated.View
            style={[
              styles.confirmCard,
              {
                maxHeight: Math.max(320, windowHeight - insets.top - insets.bottom - 36),
                width: Math.min(windowWidth - 32, 440),
                opacity: confirmOpacity,
                transform: [
                  { scale: confirmScale },
                  { translateY: confirmTranslateY },
                ],
              },
            ]}
          >
            <ScrollView
              style={styles.confirmCardScroll}
              contentContainerStyle={styles.confirmCardContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.confirmIconCircle}>
              <Ionicons name="card-outline" size={28} color="#FAF8F5" />
            </View>

            <Text style={styles.confirmTitle}>{isAdvancePaymentEligible ? "Choose Payment Amount" : "Confirm Secure Payment"}</Text>

            <Text style={styles.confirmSubtitle}>
              {isAdvancePaymentEligible
                ? `You selected ${selectedPaymentMethod.toUpperCase()}. Choose the amount you would like to pay now.`
                : `You selected ${selectedPaymentMethod.toUpperCase()}. Continue to Razorpay to complete your secure payment.`}
              {" "}Your order will be confirmed after Razorpay verifies the payment.
            </Text>

            <View style={styles.confirmSummaryStrip}>
              <Ionicons name="location-outline" size={13} color="#0F382A" />
              <Text style={styles.confirmSummaryStripText} numberOfLines={1}>
                {addressDetails}
              </Text>
            </View>

            {isAdvancePaymentEligible ? (
              <View style={styles.confirmPaymentOptions}>
                <TouchableOpacity
                  style={[
                    styles.confirmPaymentOption,
                    styles.confirmAdvanceOption,
                    selectedPaymentOption === "advance" && { borderWidth: 2, borderColor: "#FFFFFF" },
                    loading && { opacity: 0.75 },
                  ]}
                  activeOpacity={0.88}
                  disabled={loading}
                  onPress={() => setSelectedPaymentOption("advance")}
                >
                  <View style={styles.confirmOptionTextBlock}>
                    <Text style={styles.confirmOptionEyebrow}>PAY 40% NOW</Text>
                    <Text style={styles.confirmOptionTitle}>Advance Payment</Text>
                    <Text style={styles.confirmOptionDescription}>Pay the remaining balance later</Text>
                  </View>
                  <View style={styles.confirmOptionAmountBlock}>
                    <Text style={styles.confirmAdvanceAmount}>₹{advanceAmount.toFixed(2)}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.confirmPaymentOption,
                    selectedPaymentOption === "full" ? styles.confirmSelectedFullOption : styles.confirmFullOption,
                    loading && { opacity: 0.75 },
                  ]}
                  activeOpacity={0.88}
                  disabled={loading}
                  onPress={() => setSelectedPaymentOption("full")}
                >
                  <View style={styles.confirmOptionTextBlock}>
                    <Text style={styles.confirmFullEyebrow}>PAY 100% NOW</Text>
                    <Text style={styles.confirmFullTitle}>Full Payment</Text>
                    <Text style={styles.confirmFullDescription}>Nothing left to pay later</Text>
                  </View>
                  <View style={styles.confirmOptionAmountBlock}>
                    <Text style={styles.confirmFullAmount}>₹{numericTotal.toFixed(2)}</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.confirmBtnRow}>
                  <TouchableOpacity
                    style={[styles.confirmCancelBtn, styles.confirmAmountActionBtn]}
                    activeOpacity={0.85}
                    disabled={loading}
                    onPress={() => closeConfirmModal()}
                  >
                    <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmOkBtn, styles.confirmAmountActionBtn, loading && { opacity: 0.75 }]}
                    activeOpacity={0.9}
                    disabled={loading}
                    onPress={() => {
                      const option = selectedPaymentOption;
                      closeConfirmModal(() => {
                        setTimeout(() => handleRazorpayPaymentWithOption(option), 100);
                      });
                    }}
                  >
                    <Text style={styles.confirmOkBtnText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.confirmBtnRow}>
                <TouchableOpacity style={styles.confirmCancelBtn} activeOpacity={0.85} disabled={loading} onPress={() => closeConfirmModal()}>
                  <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmOkBtn, loading && { opacity: 0.75 }]} activeOpacity={0.9} disabled={loading} onPress={handleConfirmPlaceOrder}>
                  {loading ? <ActivityIndicator size="small" color="#FAF8F5" /> : <Text style={styles.confirmOkBtnText}>Pay ₹{numericTotal.toFixed(2)} Securely</Text>}
                </TouchableOpacity>
              </View>
            )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* CHANGE DELIVERY ADDRESS MODAL (HOMEMADE FLOW) */}
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

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.changeAddressModalContainer}
          >
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ✅ NEW: Delivery option info flag popup */}
      <Modal
        visible={deliveryInfoVisible}
        transparent
        animationType="none"
        onRequestClose={hideDeliveryInfo}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: deliveryInfoAnim }]}>
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={hideDeliveryInfo}
          />
          {deliveryInfo && (
            <Animated.View
              style={[
                styles.deliveryInfoPopupCard,
                {
                  transform: [
                    {
                      scale: deliveryInfoAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.88, 1],
                      }),
                    },
                    {
                      translateY: deliveryInfoAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                  ],
                  opacity: deliveryInfoAnim,
                },
              ]}
            >
              <View style={styles.deliveryInfoFlagRow}>
                <View style={styles.deliveryInfoFlagBadge}>
                  <Text style={styles.deliveryInfoFlagEmoji}>
                    {deliveryInfo.emoji}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.deliveryInfoTitle}>
                    {deliveryInfo.title}
                  </Text>
                  <Text style={styles.deliveryInfoSubtitle}>
                    Delivery option chosen for this order
                  </Text>
                </View>
              </View>

              <Text style={styles.deliveryInfoDescription}>
                {deliveryInfo.description}
              </Text>

              <View style={styles.deliveryInfoIncludesBox}>
                <Text style={styles.deliveryInfoIncludesTitle}>
                  What's included
                </Text>
                {deliveryInfo.includes.map((line, idx) => (
                  <View key={`delivery-inc-${idx}`} style={styles.deliveryInfoIncludeRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color="#166534"
                      style={{ marginTop: 1 }}
                    />
                    <Text style={styles.deliveryInfoIncludeText}>{line}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.deliveryInfoCta}
                activeOpacity={0.88}
                onPress={hideDeliveryInfo}
              >
                <Text style={styles.deliveryInfoCtaText}>Got it</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      </Modal>

      {/* Dynamic Selections Preview Modal */}
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

            <ScrollView
              style={{ width: "100%", marginTop: 8 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 120 }}
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
                <Text style={styles.modalAbsoluteFooterButtonSolidText}>
                  Close Summary • ₹{numericTotal}
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

  // ✅ Simple delivery option line under chef name (emoji + text + info icon)
  deliveryOptionRowInline: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    alignSelf: "flex-start",
    gap: 4,
  },
  deliveryOptionEmojiInline: {
    fontSize: 13,
    marginRight: 1,
  },
  deliveryOptionTextInline: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F382A",
    letterSpacing: 0.1,
  },
  deliveryInfoBtnInline: {
    marginLeft: 2,
    padding: 1,
  },

  // ✅ Simple Special Instructions row — icon + underlined text + chevron on the left
  simpleSpecialInstrWrapper: {
    marginTop: 4,
    marginBottom: 8,
  },
  simpleSpecialInstrTrigger: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    gap: 5,
  },
  simpleSpecialInstrTriggerText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#0F382A",
    textDecorationLine: "underline",
    letterSpacing: 0.1,
  },
  simpleSpecialInstrBody: {
    marginTop: 8,
    paddingLeft: 2,
  },
  simpleSpecialInstrRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  simpleSpecialInstrEmoji: {
    fontSize: 15,
    marginRight: 8,
  },
  simpleSpecialInstrRowText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B261D",
  },
  simpleSpecialInstrNoteBox: {
    backgroundColor: "#FAF8F5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
  simpleSpecialInstrNoteText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#4F6B61",
    lineHeight: 18,
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

  /* ✅ HOMEMADE / QUICKBITES DELIVERY DATE & SLOT STRIP */
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
  homemadeComboImagesWrap: {
    width: 78,
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  homemadeComboThumbnail: {
    width: 42,
    height: 58,
    borderRadius: 11,
    backgroundColor: "#E5ECE8",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  homemadeComboSecondThumbnail: {
    marginLeft: -9,
  },
  homemadeComboPlus: {
    position: "absolute",
    zIndex: 2,
    left: 33,
    top: 24,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#166538",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  homemadeComboPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(22, 101, 56, 0.10)",
    borderColor: "rgba(22, 101, 56, 0.18)",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 3,
  },
  homemadeComboPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#166538",
    letterSpacing: 0.45,
  },
  homemadeComboDishNames: {
    fontSize: 10.5,
    lineHeight: 14,
    color: "#5B756C",
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 4,
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

  /* ─────────────────────────────────────────────────────────
     ✅ FULL SCREEN SCANNER MODAL STYLES
     These replace the old bottom-sheet styles for the scanner
     modal. The container fills the entire screen and the header
     respects the device safe area via dynamic insets padding.
     ───────────────────────────────────────────────────────── */
  fullScreenScannerContainer: {
    flex: 1,
    backgroundColor: "#FAF8F5",
    width: "100%",
    height: "100%",
  },
  fullScreenScannerKeyboardView: {
    flex: 1,
    backgroundColor: "#FAF8F5",
  },
  fullScreenScannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#FAF8F5",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 56, 42, 0.08)",
  },
  fullScreenScannerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  fullScreenScannerHeaderTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.3,
    flex: 1,
    textAlign: "center",
  },
  fullScreenScannerScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: "stretch",
  },
  fullScreenScannerAmountLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#5B756C",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  fullScreenScannerAmountValue: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0B261D",
    textAlign: "center",
    letterSpacing: -1,
    marginTop: 4,
  },
  fullScreenScannerAmountHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B756C",
    textAlign: "center",
    marginTop: 6,
  },
  fullScreenScannerSubtitleRow: {
    marginTop: 20,
    marginBottom: 12,
  },
  fullScreenScannerSubtitle: {
    fontSize: 13,
    color: "#5B756C",
    fontWeight: "600",
    textAlign: "center",
  },
  fullScreenScannerCenterBlock: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
  },

  // ✅ Legacy scanner frame + timer pill styles (kept as-is, still used)
  scannerFrameContainer: {
    width: 240,
    height: 240,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "rgba(15, 56, 42, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    padding: 12,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  scannerImageStyle: {
    width: "100%",
    height: "100%",
  },

  // ✅ Simple, real-timer pill below the image card
  realTimerPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 101, 52, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: -4,
    marginBottom: 16,
    alignSelf: "center",
  },
  realTimerText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#166534",
    marginLeft: 6,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  realTimerLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#5B756C",
    marginLeft: 5,
  },

  // ✅ Legacy scanner modal styles (still used by other modals that share name space)
  scannerModalContainer: {
    width: "100%",
    backgroundColor: "#FAF8F5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  scannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 4,
  },
  scannerModalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  timerBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(217, 119, 6, 0.2)",
  },
  timerBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#D97706",
  },
  scannerModalSubtitle: {
    fontSize: 12,
    color: "#5B756C",
    fontWeight: "500",
    marginBottom: 12,
  },
  verificationModeToggleRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  verificationModeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  verificationModeTabActive: {
    backgroundColor: "#166534",
  },
  verificationModeTabText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#5B756C",
  },
  verificationModeTabTextActive: {
    color: "#FAF8F5",
    fontWeight: "800",
  },
  scannerUtrNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 101, 52, 0.06)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
    width: "100%",
  },
  scannerUtrNoticeText: {
    flex: 1,
    fontSize: 11.5,
    color: "#0F382A",
    fontWeight: "600",
    lineHeight: 16,
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

  // ✅ UTR strict 12-digit helpers
  utrLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  utrCounterText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#166534",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.4,
  },
  utrInputComplete: {
    borderColor: "#166538",
    borderWidth: 1.5,
    backgroundColor: "#F2FBF4",
  },
  utrHelperText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#D97706",
    marginTop: 6,
    paddingLeft: 2,
  },
  utrSuccessText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    marginTop: 6,
    paddingLeft: 2,
  },

  addAddressSolidCTA: {
    backgroundColor: "#166538",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
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
  uploadScreenshotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    borderWidth: 1.5,
    borderColor: "#166538",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 14,
    width: "100%",
    marginBottom: 12,
  },
  uploadScreenshotBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#166538",
  },
  screenshotPreviewContainer: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    backgroundColor: "#FFFFFF",
  },
  screenshotPreviewImage: {
    width: "100%",
    height: "100%",
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
  modalAbsoluteFooterButtonSolidText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
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
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
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
    backgroundColor: "rgba(11, 38, 29, 0.52)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#FAF8F5",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.10)",
    overflow: "hidden",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 26,
  },
  confirmCardScroll: {
    width: "100%",
    flexGrow: 0,
  },
  confirmCardContent: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
  },
  confirmIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#166538",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 4,
    borderColor: "rgba(22, 101, 52, 0.12)",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.35,
    marginBottom: 8,
    textAlign: "center",
  },
  confirmSubtitle: {
    width: "100%",
    fontSize: 13,
    color: "#5B756C",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  confirmSummaryStrip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
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
  confirmPaymentOptions: {
    width: "100%",
    gap: 11,
    marginTop: 2,
  },
  confirmPaymentOption: {
    width: "100%",
    minHeight: 88,
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
  },
  confirmAdvanceOption: {
    backgroundColor: "#166538",
    borderColor: "#166538",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  confirmFullOption: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(22, 101, 56, 0.28)",
  },
  confirmSelectedFullOption: {
    backgroundColor: "#EAF4EE",
    borderColor: "#166538",
    borderWidth: 2,
  },
  confirmAmountActionBtn: {
    flex: 1,
    width: undefined,
    marginTop: 12,
    minWidth: 0,
  },
  confirmOptionTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  confirmOptionEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  confirmOptionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  confirmOptionDescription: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  confirmOptionAmountBlock: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    flexShrink: 0,
  },
  confirmAdvanceAmount: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  confirmFullEyebrow: {
    color: "#668176",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  confirmFullTitle: {
    color: "#0B261D",
    fontSize: 15,
    fontWeight: "900",
  },
  confirmFullDescription: {
    color: "#6B8178",
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  confirmFullAmount: {
    color: "#166538",
    fontSize: 17,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  confirmBtnRow: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  confirmCancelBtn: {
    width: "100%",
    minHeight: 46,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.14)",
    marginTop: 12,
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
  confirmFullPayBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#166538",
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  confirmFullPayBtnText: { color: "#166538", fontSize: 14, fontWeight: "900" },
  confirmOkBtnText: {
    color: "#FAF8F5",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
    textAlign: "center",
  },

  // ✅ Delivery info flag popup styles (emoji on neutral bg, no green chip)
  deliveryInfoPopupCard: {
    position: "absolute",
    alignSelf: "center",
    top: "26%",
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.10)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 28,
  },
  deliveryInfoFlagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  deliveryInfoFlagBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(15, 56, 42, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryInfoFlagEmoji: {
    fontSize: 22,
  },
  deliveryInfoTitle: {
    fontSize: 16.5,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  deliveryInfoSubtitle: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#5B756C",
    marginTop: 2,
  },
  deliveryInfoDescription: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0B261D",
    lineHeight: 19,
    marginBottom: 14,
  },
  deliveryInfoIncludesBox: {
    backgroundColor: "#F8FAF5",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  deliveryInfoIncludesTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F382A",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  deliveryInfoIncludeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  deliveryInfoIncludeText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0B261D",
    marginLeft: 6,
    flex: 1,
    lineHeight: 17,
  },
  deliveryInfoCta: {
    width: "100%",
    backgroundColor: "#166534",
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  deliveryInfoCtaText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});