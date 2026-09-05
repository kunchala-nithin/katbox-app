import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

import { useFocusEffect } from "@react-navigation/native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import api from "@/src/lib/api";
import { useNavigationStore } from "@/src/store/navigationStore";
import { Ionicons } from "@expo/vector-icons";

// Guarded import implementation to prevent runtime crash stacks if module isn't loaded
let AudioModule: any = null;
try {
  AudioModule = require("expo-av").Audio;
} catch (e) {
  console.log("expo-av is not linked or installed yet. Audio playback is muted.");
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function CartScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [cartHasItem, setCartHasItem] = useState(false);
  const [isCartLoading, setIsCartLoading] = useState(true);
  const [cartData, setCartData] = useState<any>(null);
  const [discount, setDiscount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [soundInstance, setSoundInstance] = useState<any>(null);

  // Active state tab parameter for managing selections preview layout
  const [previewActiveDay, setPreviewActiveDay] = useState<string>("");

  // Dynamic inline coupon expansion state variables
  const [expandedCoupons, setExpandedCoupons] = useState(false);
  const inlineCouponExpandAnim = useRef(new Animated.Value(0)).current;

  // Smooth Interpolated Hardware Animation States for the Daawath Success Pop-up
  const [showHurray, setShowHurray] = useState(false);
  const celebrationMasterAnim = useRef(new Animated.Value(0)).current;

  // Track scroll changes for dynamic collapsing of price breakup
  const scrollY = useRef(new Animated.Value(0)).current;

  // Track the scroll movement direction to conditionally collapse/expand the breakup box
  const diffClamp = Animated.diffClamp(scrollY, 0, 120);
  const breakupHeight = diffClamp.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // CHECK IF CURRENT SERVICE FLOW CONTEXT IS HOMEMADE OR MEALBOX
  const isHomemadeFlow = params.serviceType === 'homemade' || cartData?.serviceType === 'homemade';
  const isMealBoxFlow = params.serviceType === 'mealbox' || cartData?.serviceType === 'mealbox';
  const isFromHome = params.fromHome === 'true';

  const HEADER_HEIGHT = insets.top + 60;

  // Animation values for modal sheets
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const previewBackdropAnim = useRef(new Animated.Value(0)).current;

  const priceSheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const priceBackdropAnim = useRef(new Animated.Value(0)).current;
  const viewDetailsChevronAnim = useRef(new Animated.Value(0)).current;

  // Zustand Navigation Context
  const { currentContext, clearNavigationContext } = useNavigationStore();

  useEffect(() => {
    return () => {
      if (soundInstance && typeof soundInstance.unloadAsync === "function") {
        soundInstance.unloadAsync();
      }
    };
  }, [soundInstance]);

  const fetchCart = async () => {
    setIsCartLoading(true);
    try {
      const res = await api.get("/api/cart");

      if (res.data.success && res.data.cart?.length > 0) {
        const activeCart = res.data.cart[0];
        setCartData(activeCart);
        setCartHasItem(true);
        
        // Dynamic generation mapping setup fallback selectors values seamlessly
        if (activeCart?.selections && !Array.isArray(activeCart.selections)) {
          const keys = Object.keys(activeCart.selections);
          if (keys.length > 0) {
            setPreviewActiveDay(keys[0]);
          }
        }
        
        // Restore applied states cleanly from underlying database record properties
        if (activeCart.couponCode) {
          setAppliedCoupon(activeCart.couponCode);
          setDiscount(activeCart.discount || 0);
        } else {
          setAppliedCoupon(null);
          setDiscount(0);
        }
      } else {
        setCartData(null);
        setCartHasItem(false);
        setAppliedCoupon(null);
        setDiscount(0);
      }
    } catch (err) {
      console.log("Cart fetch error", err);
      setCartData(null);
      setCartHasItem(false);
      setAppliedCoupon(null);
      setDiscount(0);
    } finally {
      setIsCartLoading(false);
    }
  };

  // Automatically fetch database coupons on load so coupons[0] is populated instantly
  const loadCouponsOnMount = async () => {
    try {
      const res = await api.get("/api/coupon");
      if (res.data.success) {
        setCoupons(res.data.coupons);
      }
    } catch (e) {
      console.log("Error loading coupons on mount:", e);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchCart();
      loadCouponsOnMount();
    }, [])
  );

  // Optimized toggle to display remaining database offers directly inside the view template
  const toggleInlineCouponsView = () => {
    if (expandedCoupons) {
      Animated.timing(inlineCouponExpandAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
        useNativeDriver: false,
      }).start(() => setExpandedCoupons(false));
    } else {
      setExpandedCoupons(true);
      Animated.timing(inlineCouponExpandAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
        useNativeDriver: false,
      }).start();
    }
  };

  const menu = cartData?.menu || {};
  const restaurant = cartData?.restaurant || {};
  const orderDetails = cartData?.orderDetails || {};
  const cartAddons = cartData?.addons || [];
  
  // Dynamic extraction of upcoming scheduled delivery dates for MealBox
  const upcomingDeliveriesList: string[] = React.useMemo(() => {
    if (orderDetails?.scheduledDatesFormatted && Array.isArray(orderDetails.scheduledDatesFormatted)) {
      return orderDetails.scheduledDatesFormatted;
    }
    if (orderDetails?.scheduledDatesList && Array.isArray(orderDetails.scheduledDatesList)) {
      return orderDetails.scheduledDatesList.map((item: any) => `${item.dayName}, ${item.dayNumber} ${item.monthName}`);
    }
    if (orderDetails?.deliveryDate) {
      return [orderDetails.deliveryDate];
    }
    return [];
  }, [orderDetails]);
  
  // DEFENSIVE PARSING TYPE GUARD TO AVOID CRASHES ON MEALBOX OBJECT STRUCTURES
  const selectionsSummary = Array.isArray(cartData?.selections)
    ? cartData.selections.map((cat: any) => ({
        ...cat,
        selected: [
          ...(cat.selected || []),
          ...(cat.extraSelected || []), 
        ],
      }))
    : [];

  const plates = orderDetails?.guests || 50;

  // FINAL PRICE FROM MONGODB (base + extra)
  const pricePerPlate = Number(menu?.finalPrice) || Number(menu?.price) || 0;

  const getDeliveryPrice = (delivery: string) => {
    if (!delivery) return 0;
    if (delivery === "Standard") return 290;
    if (delivery === "Doorstep") return 803;
    if (delivery === "Doorstep + Service") return 1025;
    return 0;
  };

  const deliveryPrice = getDeliveryPrice(orderDetails?.delivery);
  
  // ACCOUNT FOR INTEGRATED ADD-ONS IN DYNAMIC BOOKINGS VALUE BREAKDOWNS
  const totalAddonsPriceCombined = cartAddons.reduce((sum: number, entry: any) => {
    return sum + (Number(entry.price || 0) * Number(entry.count || 0) * plates);
  }, 0);

  const subtotal = (isHomemadeFlow || isMealBoxFlow)
    ? (cartData?.totalPrice || 0) 
    : ((plates * pricePerPlate) + totalAddonsPriceCombined);

  // CORRECT MATHEMATICAL DERIVATION: Subtotal + Delivery - Saved Discount
  const finalTotal = Math.max(0, subtotal + deliveryPrice - discount);

  const openSheet = () => {
    sheetAnim.setValue(SCREEN_HEIGHT * 0.7);
    previewBackdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(sheetAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(previewBackdropAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue: SCREEN_HEIGHT * 0.7,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(previewBackdropAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowPreviewModal(false);
    });
  };

  const openPriceSheet = () => {
    setShowPriceModal(true);
    priceSheetAnim.setValue(SCREEN_HEIGHT * 0.6);
    priceBackdropAnim.setValue(0);

    Animated.parallel([
      Animated.spring(priceSheetAnim, {
        toValue: 0,
        tension: 68,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(priceBackdropAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(viewDetailsChevronAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closePriceSheet = () => {
    Animated.parallel([
      Animated.timing(priceSheetAnim, {
        toValue: SCREEN_HEIGHT * 0.6,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(priceBackdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(viewDetailsChevronAnim, {
        toValue: 0,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowPriceModal(false);
    });
  };

  // handleEdit completely handles automated MongoDB permanent document ejection
  const handleEdit = async () => {
    if (!cartData?._id) return;

    const isHomemade = currentContext?.serviceType === 'homemade' || isHomemadeFlow;
    const isMealBox = isMealBoxFlow;

    try {
      // Permanent removal operation applied against the MongoDB document row instance directly
      await api.delete(`/api/cart/${cartData._id}`);

      if (isHomemade || isMealBox) {
        // Go straight back to preceding screen selection view layout framework setup dynamically
        router.back();
        return;
      }

      const reviewParams: any = {
        cartId: cartData._id,
        menu: JSON.stringify(menu),
        selections: JSON.stringify(selectionsSummary),
        addons: JSON.stringify(cartAddons),
        orderDetails: JSON.stringify(orderDetails),
        totalItems: selectionsSummary.reduce(
          (acc: number, cat: any) => acc + (cat.selected?.length || 0),
          0
        ),
        type: cartData.type,
        finalPrice: pricePerPlate,
        extraPrice: Number(menu?.extraPrice) || 0,
      };

      // Decide between restaurant vs chef
      if (isHomemade && currentContext?.restaurantOrChef) {
        reviewParams.chef = JSON.stringify(currentContext.restaurantOrChef);
      } else {
        reviewParams.restaurant = JSON.stringify(restaurant);
      }

      router.push({
        pathname: "/screens/CateringOrderReview",
        params: reviewParams,
      });
    } catch (error) {
      console.log("❌ Error deleting cart during layout exit rewrite sequence", error);
    }
  };

  const syncCouponStateWithBackend = async (code: string | null, computedDiscount: number) => {
    if (!cartData?._id) return;
    try {
      await api.put(`/api/cart/update/${cartData._id}`, {
        serviceType: isHomemadeFlow ? 'homemade' : (isMealBoxFlow ? 'mealbox' : 'catering'),
        chefId: cartData?.chefId,
        chefName: cartData?.chefName,
        userId: cartData?.userId || params.userId,
        userName: cartData?.userName || params.userName,
        items: cartData?.items,
        totalItems: cartData?.totalItems,
        totalPrice: cartData?.totalPrice || subtotal,
        menu,
        restaurant,
        selections: cartData?.selections,
        addons: cartAddons,
        orderDetails,
        type: cartData?.type,
        finalPrice: pricePerPlate,
        deliveryPrice,
        extraItems: cartData?.extraItems,
        couponCode: code,
        discount: computedDiscount
      });
    } catch (err) {
      console.log("Error syncing discount information block properties with backend database configuration", err);
    }
  };

  const handleRemoveFromCart = async () => {
    if (!cartData?._id) return;
    try {
      await api.delete(`/api/cart/${cartData._id}`);
    } catch (e) {
      console.error(e);
    }
    setCartData(null);
    setCartHasItem(false);
    setDiscount(0);
    setAppliedCoupon(null);
    clearNavigationContext();
  };

  const getOccasionEmoji = (occasion: string) => {
    if (!occasion) return "🎉";
    if (occasion.includes("Birthday")) return "🎂";
    if (occasion.includes("Puja")) return "🪔";
    if (occasion.includes("House Warming")) return "🏠";
    if (occasion.includes("Corporate")) return "🏢";
    if (occasion.includes("Family")) return "👨‍👩‍👧‍👦";
    if (occasion.includes("Kitty")) return "🥂";
    if (occasion.includes("Farm")) return "🌿";
    if (occasion.includes("Workshop")) return "🛠️";
    return "🎉";
  };

  const playSuccessSound = async () => {
    if (!AudioModule) return;
    try {
      const { sound } = await AudioModule.Sound.createAsync(
        { uri: "https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav" },
        { shouldPlay: true, volume: 1.0 }
      );
      setSoundInstance(sound);
    } catch (error) {
      console.log("Audio notification failed to initialize:", error);
    }
  };

  const triggerHurrayAnimation = () => {
    setShowHurray(true);
    celebrationMasterAnim.setValue(0);

    // Play physical pop feedback sound system instantly
    playSuccessSound();

    // High performance smooth native staging timeline
    Animated.sequence([
      Animated.timing(celebrationMasterAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.bezier(0.25, 1, 0.5, 1.2), 
        useNativeDriver: true,
      }),
      Animated.delay(1400),
      Animated.timing(celebrationMasterAnim, {
        toValue: 2,
        duration: 400,
        easing: Easing.bezier(0.55, 0, 1, 0.45),
        useNativeDriver: true,
      })
    ]).start(() => {
      setShowHurray(false);
    });
  };

  const applyCoupon = async (code: string) => {
    try {
      const res = await api.post("/api/coupon/apply", {
        code,
        cartTotal: subtotal,
      });

      if (res.data.success) {
        const computedDiscount = res.data.discount;
        setDiscount(computedDiscount);
        setAppliedCoupon(res.data.code);
        triggerHurrayAnimation();
        
        // Sync application state straight into database metrics fields
        await syncCouponStateWithBackend(res.data.code, computedDiscount);
      } else {
        alert(res.data.message);
      }
    } catch (e) {
      console.log(e);
    }
  };

  // Master UI element interpolation vectors
  const cardScale = celebrationMasterAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.1, 1, 0.7],
  });

  const overallOpacity = celebrationMasterAnim.interpolate({
    inputRange: [0, 0.1, 1, 2],
    outputRange: [0, 1, 1, 0],
  });

  const cardRotate = celebrationMasterAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ["-8deg", "0deg", "4deg"],
  });

  // Smooth particle mapping models using hardware metrics
  const b1X = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -90, -120] });
  const b1Y = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -100, -130] });
  
  const b2X = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 95, 130] });
  const b2Y = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -80, -110] });

  const b3X = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -80, -110] });
  const b3Y = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 90, 120] });

  const b4X = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 90, 120] });
  const b4Y = celebrationMasterAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 100, 130] });

  const bubbleOpacity = celebrationMasterAnim.interpolate({
    inputRange: [0, 0.1, 0.8, 1.5, 2],
    outputRange: [0, 1, 1, 0.5, 0],
  });

  const bubbleScale = celebrationMasterAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.2, 1.3, 0.6],
  });

  const spinInterpolation = celebrationMasterAnim.interpolate({
    inputRange: [0, 2],
    outputRange: ["0deg", "360deg"],
  });

  // Interpolation metrics map for dynamic wrapper extension layout models
  const inlineCouponHeightMax = coupons.length > 1 ? (coupons.length - 1) * 145 : 0;
  const inlineExpansionHeight = inlineCouponExpandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, inlineCouponHeightMax],
  });
  const inlineExpansionOpacity = inlineCouponExpandAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.3, 1],
  });

  // Group dynamic elements safely matching specific sections
  const getGroupedMealBoxItemsBySection = (items: any[]) => {
    const map: Record<string, any[]> = { STARTERS: [], MAINS: [], "ADD ON'S": [] };
    if (!Array.isArray(items)) return map;
    
    items.forEach(item => {
      const sect = String(item.section || "").toUpperCase();
      if (sect.includes("STARTER")) map["STARTERS"].push(item);
      else if (sect.includes("ADDON") || sect.includes("ADD ON") || item.type === "addon") map["ADD ON'S"].push(item);
      else map["MAINS"].push(item);
    });
    return map;
  };

  const currentDaySelectionsArray = (isMealBoxFlow && cartData?.selections) ? (cartData.selections[previewActiveDay] || []) : [];
  const groupedPreviewDayItemsMap = getGroupedMealBoxItemsBySection(currentDaySelectionsArray);

  // Navigation handler to CheckOutScreen with exact order data parameters including scheduled deliveries & selections
  const handlePlaceOrderNavigation = () => {
    const derivedServiceType = isHomemadeFlow ? 'homemade' : (isMealBoxFlow ? 'mealbox' : 'catering');

    if (derivedServiceType === 'catering') {
      router.push({
        pathname: "/screens/CheckOutScreen",
        params: {
          cartId: cartData?._id || "",
          userId: cartData?.userId || params.userId || "",
          userName: cartData?.userName || params.userName || "",
          chefId: cartData?.chefId || params.chefId || "",
          chefName: cartData?.chefName || restaurant?.name || params.chefName || "Expert Chef",
          serviceType: 'catering',
          // Catering Specific Fields
          restaurantName: restaurant?.name || cartData?.chefName || "Premium Restaurant",
          restaurantImage: restaurant?.imageUrl || restaurant?.image || menu?.heroImageUrl || menu?.imageUrl || "https://picsum.photos/200",
          menuName: menu?.name || "Premium Catering Platter",
          menuImage: menu?.heroImageUrl || menu?.imageUrl || "https://picsum.photos/200",
          guests: plates,
          occasion: orderDetails?.occasion || "Event",
          eventDate: orderDetails?.date || "18 March",
          eventTime: orderDetails?.time || "08:30 PM",
          deliveryType: orderDetails?.delivery || "Standard",
          addressDetails: orderDetails?.address || "Home Nizampet, Hyderabad",
          pricePerPlate: pricePerPlate,
          // Financials
          subtotal: subtotal,
          deliveryPrice: deliveryPrice,
          discount: discount,
          appliedCoupon: appliedCoupon || "",
          totalAmount: finalTotal,
          // Complex Arrays / Objects
          selections: JSON.stringify(cartData?.selections || []),
          addons: JSON.stringify(cartAddons || []),
          orderDetails: JSON.stringify(orderDetails || {}),
          menu: JSON.stringify(menu || {}),
          restaurant: JSON.stringify(restaurant || {}),
        },
      });
      return;
    }

    // Default MealBox & Homemade Flow Parameters
    router.push({
      pathname: "/screens/CheckOutScreen",
      params: {
        cartId: cartData?._id || "",
        userId: cartData?.userId || params.userId || "",
        userName: cartData?.userName || params.userName || "",
        chefId: cartData?.chefId || params.chefId || "",
        chefName: cartData?.chefName || restaurant?.name || params.chefName || "Nithin Samrat",
        subtotal: subtotal,
        deliveryPrice: deliveryPrice,
        discount: discount,
        appliedCoupon: appliedCoupon || "",
        totalAmount: finalTotal,
        menuName: menu?.name || "Classic Lunch Plan",
        menuImage: menu?.imageUrl || menu?.heroImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
        durationType: menu?.durationType || "Flexible Days (2 Days Running)",
        deliveryDate: orderDetails?.deliveryDate || "Mon, 20 May – Tue, 21 May",
        deliveryTimeSlot: orderDetails?.deliveryTimeSlot || "7:00 PM - 9:00 PM",
        addressDetails: orderDetails?.addressDetails || orderDetails?.address || "2-91/32, Sai Enclave, Hyderabad",
        scheduledDatesFormatted: orderDetails?.scheduledDatesFormatted ? JSON.stringify(orderDetails.scheduledDatesFormatted) : undefined,
        scheduledDatesList: orderDetails?.scheduledDatesList ? JSON.stringify(orderDetails.scheduledDatesList) : undefined,
        selections: cartData?.selections ? JSON.stringify(cartData.selections) : undefined,
        items: cartData?.items ? JSON.stringify(cartData.items) : undefined,
        serviceType: derivedServiceType,
      },
    });
  };

  const chevronRotateInterpolate = viewDetailsChevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <View
        style={[
          styles.header,
          {
            height: HEADER_HEIGHT,
            paddingTop: insets.top,
          },
        ]}
      >
        {isFromHome ? (
          <TouchableOpacity
            style={styles.headerEditButton}
            onPress={() => router.replace("/(tabs)/Home")}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color="#0D2E22" />
            <Text style={styles.headerEditText}>Back</Text>
          </TouchableOpacity>
        ) : cartHasItem ? (
          <TouchableOpacity
            style={styles.headerEditButton}
            onPress={handleEdit}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color="#0D2E22" />
            <Text style={styles.headerEditText}>Edit</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.headerTitle, isFromHome && { marginLeft: 8 }]}>Cart</Text>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.85}>
          <Ionicons name="headset-outline" size={20} color="#0F382A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        contentContainerStyle={{
          paddingTop: (isCartLoading || !cartHasItem)
            ? HEADER_HEIGHT + 40
            : HEADER_HEIGHT + 20,
          paddingBottom: 220,
        }}
      >
        {isCartLoading ? (
          <View style={{ height: 180 }} />
        ) : (cartHasItem && cartData) ? (
          isHomemadeFlow ? (
            <View style={styles.mainCard}>
              <TouchableOpacity
                style={styles.removeFromCartBtn}
                onPress={handleRemoveFromCart}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={20} color="#E53935" />
              </TouchableOpacity>
              
              <Text style={[styles.restaurantName, { fontSize: 16, color: "#0F382A", marginBottom: 16 }]}>
                👨‍🍳 Chef: {cartData?.chefName || "Homemade Chef"}
              </Text>

              {cartData?.items && cartData.items.map((item: any, idx: number) => (
                <View key={item.id || idx} style={{ flexDirection: "row", marginBottom: 16, borderBottomWidth: idx === cartData.items.length - 1 ? 0 : 1, borderBottomColor: "rgba(15, 56, 42, 0.06)", paddingBottom: 16, alignItems: 'center' }}>
                  <Image source={{ uri: item.image || "https://via.placeholder.com/150" }} style={[styles.itemImage, { width: 75, height: 75, borderRadius: 16 }]} />
                  <View style={{ flex: 1, marginLeft: 16, justifyContent: "center" }}>
                    <Text style={[styles.itemTitle, { fontSize: 16 }]}>{item.name}</Text>
                    <Text style={{ fontSize: 13, color: "#5B756C", marginTop: 4, fontWeight: "500" }}>
                      Size/Qty Option: <Text style={{ fontWeight: "700", color: "#0B261D" }}>{item.selectedQtyConfig}</Text>
                    </Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <Text style={{ fontSize: 13, color: "#5B756C", fontWeight: "500" }}>
                        Qty: <Text style={{ fontWeight: "800", color: "#0B261D" }}>{item.quantity}</Text>
                      </Text>
                      <Text style={[styles.priceValue, { fontSize: 18 }]}>₹{item.price * item.quantity}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : isMealBoxFlow ? (
            /* DYNAMIC MEALBOX SUBSCRIPTION INTERFACE - MODERN BORDERLESS MINIMAL LUXURY STYLE */
            <View style={styles.mainCardModern}>
              {/* Edge-merged top badge */}
              <View style={styles.modernTagPillEdge}>
                <Text style={styles.modernTagTextEdge}>MEALBOX PLAN</Text>
              </View>

              <TouchableOpacity
                style={styles.removeFromCartBtnModern}
                onPress={handleRemoveFromCart}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={19} color="#E53935" />
              </TouchableOpacity>

              <View style={styles.modernHeaderRow}>
                <Image
                  source={{ uri: menu?.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400" }}
                  style={styles.modernHeroImage}
                />
                <View style={styles.modernTitleBlock}>
                  <Text style={styles.modernMainTitle} numberOfLines={2}>{menu?.name || "Premium Subscription Plan"}</Text>
                  <Text style={styles.modernChefSubtitle}>Chef: {cartData?.chefName || "Expert Chef"}</Text>
                </View>
              </View>

              {/* Grouped Container with Dotted Separator */}
              <View style={styles.groupedMetaSectionContainer}>
                <View style={styles.modernInfoGrid}>
                  <View style={styles.modernInfoCell}>
                    <Ionicons name="calendar-outline" size={14} color="#0F382A" />
                    <Text style={styles.modernCellLabel}>Plan Duration</Text>
                    <Text style={styles.modernCellValue}>{menu?.durationType || "Weekly"} ({cartData?.totalItems || 0} Days)</Text>
                  </View>

                  <View style={styles.separatorVerticalDotted} />

                  <View style={styles.modernInfoCell}>
                    <Ionicons name="time-outline" size={14} color="#0F382A" />
                    <Text style={styles.modernCellLabel}>Delivery Slot</Text>
                    <Text style={styles.modernCellValue}>{orderDetails?.deliveryTimeSlot || "Standard"}</Text>
                  </View>
                </View>

                <View style={styles.separatorHorizontalDotted} />

                <View style={styles.modernAddressBlockNested}>
                  <Ionicons name="location-outline" size={14} color="#0F382A" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.modernAddressLabel}>Delivery Address</Text>
                    <Text style={styles.modernAddressText} numberOfLines={1}>{orderDetails?.addressDetails || "Address details"}</Text>
                  </View>
                </View>
              </View>

              {/* Simple & Clean Subscription Starts Pill */}
              <View style={styles.modernStartDateBanner}>
                <Text style={styles.modernStartDateText}>
                  Starts: <Text style={{ fontWeight: "800", color: "#0B261D" }}>{orderDetails?.deliveryDate || "Scheduled Date"}</Text>
                </Text>
              </View>

              {/* Dynamic Scheduled Delivery Dates Section */}
              {upcomingDeliveriesList.length > 0 && (
                <View style={styles.upcomingDeliveriesContainer}>
                  <View style={styles.upcomingDeliveriesHeaderRow}>
                    <Ionicons name="calendar" size={14} color="#0F382A" />
                    <Text style={styles.upcomingDeliveriesTitle}>Upcoming Scheduled Deliveries</Text>
                  </View>
                  <View style={styles.upcomingDeliveriesGrid}>
                    {upcomingDeliveriesList.map((deliveryDateItem: string, idx: number) => (
                      <View key={`upcoming-del-${idx}`} style={styles.upcomingDeliveryPill}>
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
                <Text style={styles.priceValue}>₹{cartData?.totalPrice}</Text>
              </View>

              <TouchableOpacity
                style={styles.modernViewItemsBtn}
                onPress={() => {
                  setShowPreviewModal(true);
                  setTimeout(openSheet, 50);
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.modernViewItemsText}>Selected Items</Text>
                <Ionicons name="arrow-forward" size={14} color="#FAF8F5" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mainCardModern}>
              <View style={[styles.modernTagPillEdge, { backgroundColor: "rgba(15, 56, 42, 0.08)", borderColor: "rgba(15, 56, 42, 0.12)" }]}>
                <Text style={[styles.modernTagTextEdge, { color: '#0F382A' }]}>CATERING PLATTER</Text>
              </View>

              <TouchableOpacity
                style={styles.removeFromCartBtnModern}
                onPress={handleRemoveFromCart}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={19} color="#E53935" />
              </TouchableOpacity>

              <View style={styles.modernHeaderRow}>
                <Image
                  source={{
                    uri: menu?.heroImageUrl || menu?.imageUrl || "https://picsum.photos/200",
                  }}
                  style={styles.modernHeroImage}
                />
                <View style={styles.modernTitleBlock}>
                  <Text style={styles.modernMainTitle} numberOfLines={2}>{menu?.name || "Premium Breakfast Box"}</Text>
                  <Text style={styles.modernChefSubtitle}>Chef: {restaurant?.name || cartData?.chefName || "Expert Caterer"}</Text>
                </View>
              </View>

              {/* Grouped Catering Metadata Section without Delivery Mode */}
              <View style={styles.groupedMetaSectionContainer}>
                <View style={styles.cateringAlignedGrid}>
                  <View style={styles.cateringGridCell}>
                    <View style={styles.cateringCellHeader}>
                      <Ionicons name="gift-outline" size={13} color="#0F382A" />
                      <Text style={styles.modernCellLabel}>Occasion</Text>
                    </View>
                    <Text style={styles.cateringCellValueText} numberOfLines={1}>
                      {getOccasionEmoji(orderDetails?.occasion)} {orderDetails?.occasion || "Event"}
                    </Text>
                  </View>

                  <View style={styles.separatorVerticalDotted} />

                  <View style={styles.cateringGridCell}>
                    <View style={styles.cateringCellHeader}>
                      <Ionicons name="calendar-outline" size={13} color="#0F382A" />
                      <Text style={styles.modernCellLabel}>Event Date</Text>
                    </View>
                    <Text style={styles.cateringCellValueText} numberOfLines={1}>
                      {orderDetails?.date || "18 March"}
                    </Text>
                  </View>

                  <View style={styles.separatorVerticalDotted} />

                  <View style={styles.cateringGridCell}>
                    <View style={styles.cateringCellHeader}>
                      <Ionicons name="time-outline" size={13} color="#0F382A" />
                      <Text style={styles.modernCellLabel}>Time Slot</Text>
                    </View>
                    <Text style={styles.cateringCellValueText} numberOfLines={1}>
                      {orderDetails?.time || "08:30 PM"}
                    </Text>
                  </View>
                </View>

                <View style={styles.separatorHorizontalDotted} />

                {/* Event Guests and Dynamic Price per Plate Grid */}
                <View style={styles.modernInfoGrid}>
                  <View style={styles.modernInfoCell}>
                    <View style={styles.cateringCellHeader}>
                      <Ionicons name="people-outline" size={14} color="#0F382A" />
                      <Text style={styles.modernCellLabel}>Event Guests</Text>
                    </View>
                    <Text style={styles.modernCellValue}>{plates} Guests</Text>
                  </View>

                  <View style={styles.separatorVerticalDotted} />

                  <View style={styles.modernInfoCell}>
                    <View style={styles.cateringCellHeader}>
                      <Ionicons name="pricetag-outline" size={14} color="#0F382A" />
                      <Text style={styles.modernCellLabel}>Price per Plate</Text>
                    </View>
                    <Text style={styles.modernCellValue}>₹{pricePerPlate}</Text>
                  </View>
                </View>

                <View style={styles.separatorHorizontalDotted} />

                <View style={styles.modernAddressBlockNested}>
                  <Ionicons name="location-outline" size={14} color="#0F382A" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.modernAddressLabel}>Event Venue Address</Text>
                    <Text style={styles.modernAddressText} numberOfLines={1}>{orderDetails?.address || "Home Nizampet, Hyderabad"}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.divider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Price per plate</Text>
                <Text style={styles.priceValue}>₹{pricePerPlate}</Text>
              </View>

              <TouchableOpacity
                style={styles.modernViewItemsBtn}
                onPress={() => {
                  setShowPreviewModal(true);
                  setTimeout(openSheet, 50);
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.modernViewItemsText}>Inspect Platter Menu & Addons</Text>
                <Ionicons name="arrow-forward" size={14} color="#FAF8F5" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="basket-outline" size={36} color="#0F382A" />
            </View>
            <Text style={styles.emptyStateTitle}>Your cart is empty</Text>
            <Text style={styles.emptyStateText}>Browse your favorite meal plans or platters for your next order</Text>
            <TouchableOpacity
              style={styles.goHomeBtn}
              onPress={() => router.replace("/(tabs)/Home")}
              activeOpacity={0.88}
            >
              <Ionicons name="home-outline" size={18} color="#FAF8F5" style={{ marginRight: 6 }} />
              <Text style={styles.goHomeText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Daawath Premium Offers UI Component Section */}
        <View style={styles.premiumSectionCard}>
          <View style={styles.premiumSectionHeaderContainer}>
            <View style={styles.premiumHeaderTitleRow}>
              <View style={styles.premiumCrownCircle}>
                <Ionicons name="gift-outline" size={18} color="#0F382A" />
              </View>
              <View>
                <Text style={styles.premiumSectionMainHeading}>Exclusive Offers</Text>
                <Text style={styles.premiumSectionSubHeading}>Unlock grand event savings</Text>
              </View>
            </View>
          </View>

          {appliedCoupon ? (
            <View style={styles.daawathAppliedBox}>
              <View style={styles.daawathLeftGoldBar} />
              <View style={{ flex: 1, paddingVertical: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={styles.appliedSparkleCircle}>
                    <Ionicons name="sparkles" size={12} color="#FAF8F5" />
                  </View>
                  <Text style={styles.daawathAppliedCodeText}>{appliedCoupon} APPLIED</Text>
                </View>
                <Text style={styles.daawathAppliedSavingsText}>Grand Daawath savings of ₹{discount} activated!</Text>
              </View>
              <TouchableOpacity 
                style={styles.daawathRemoveCouponBtn}
                onPress={async () => {
                  setDiscount(0);
                  setAppliedCoupon(null);
                  await syncCouponStateWithBackend(null, 0);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.daawathRemoveCouponText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : coupons.length > 0 ? (
            <View style={{ flexDirection: "column" }}>
              {/* Primary Active Single Card Block always highlighted on top */}
              <View style={styles.daawathPremiumCouponCard}>
                <View style={styles.daawathLeftAccentLine} />
                <View style={styles.daawathCouponMainBody}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={styles.daawathCouponPill}>
                      <Text style={styles.daawathPremiumCouponTitle}>{coupons[0].code}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.daawathPremiumApplyBtn}
                      onPress={() => applyCoupon(coupons[0].code)}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.daawathPremiumApplyText}>Apply Now</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.daawathPremiumCouponDesc}>
                    {coupons[0].type === "FLAT"
                      ? `Flat ₹${coupons[0].value} OFF order`
                      : `${coupons[0].value}% OFF up to ₹${coupons[0].maxDiscount}`}
                  </Text>
                  <View style={styles.daawathPremiumMiniDivider} />
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="shield-checkmark-outline" size={13} color="#0F382A" style={{ marginRight: 5 }} />
                    <Text style={styles.daawathPremiumCouponMeta}>Valid on bookings above ₹{coupons[0].minOrder}</Text>
                  </View>
                </View>
              </View>

              {/* Inline Expansion Area for Additional Promotions */}
              {expandedCoupons && (
                <Animated.View style={{ maxHeight: inlineExpansionHeight, opacity: inlineExpansionOpacity, overflow: "hidden" }}>
                  {coupons.slice(1).map((coupon, index) => (
                    <View key={index} style={[styles.daawathPremiumCouponCard, { marginTop: 12 }]}>
                      <View style={[styles.daawathLeftAccentLine, { backgroundColor: "#0F382A" }]} />
                      <View style={styles.daawathCouponMainBody}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={[styles.daawathCouponPill, { backgroundColor: "rgba(15, 56, 42, 0.06)", borderColor: "rgba(15, 56, 42, 0.12)" }]}>
                            <Text style={[styles.daawathPremiumCouponTitle, { color: "#0F382A" }]}>{coupon.code}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.daawathPremiumApplyBtn}
                            onPress={() => applyCoupon(coupon.code)}
                            activeOpacity={0.88}
                          >
                            <Text style={styles.daawathPremiumApplyText}>Apply Now</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.daawathPremiumCouponDesc}>
                          {coupon.type === "FLAT"
                            ? `Flat ₹${coupon.value} OFF order`
                            : `${coupon.value}% OFF up to ₹${coupon.maxDiscount}`}
                        </Text>
                        <View style={styles.daawathPremiumMiniDivider} />
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Ionicons name="shield-checkmark-outline" size={13} color="#0F382A" style={{ marginRight: 5 }} />
                          <Text style={styles.daawathPremiumCouponMeta}>Valid on bookings above ₹{coupon.minOrder}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </Animated.View>
              )}
            </View>
          ) : (
            <View style={{ paddingVertical: 18, alignItems: "center", backgroundColor: '#FAF8F5', borderRadius: 16 }}>
              <Text style={{ color: "#5B756C", fontSize: 13, fontWeight: "600" }}>No special offers available at this moment</Text>
            </View>
          )}
          
          {coupons.length > 1 && !appliedCoupon && (
            <TouchableOpacity style={styles.viewAllOffersLinkRow} onPress={toggleInlineCouponsView} activeOpacity={0.85}>
              <Text style={styles.linkText}>
                {expandedCoupons ? "Collapse alternative codes" : "View all promotional codes"}
              </Text>
              <Animated.View style={[styles.arrowCircleIconBackground, { transform: [{ rotate: inlineCouponExpandAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }]}>
                <Ionicons name="chevron-down" size={14} color="#FAF8F5" />
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: 160 }} />
      </ScrollView>

      {/* Persistent Bottom Bar with View Details and Place Order */}
      <View style={styles.bottomContainer}>
        {cartHasItem && (
          <View style={styles.bottomBarRow}>
            <View style={styles.bottomBarPriceBlock}>
              <View style={styles.bottomBarAmountRow}>
                <Text style={styles.bottomBarTotalLabel}>To Pay</Text>
                <Text style={styles.bottomBarTotalAmount}>₹{finalTotal}</Text>
              </View>
              <TouchableOpacity
                onPress={openPriceSheet}
                activeOpacity={0.7}
                style={styles.viewDetailsTouchable}
              >
                <Text style={styles.viewDetailsUnderlineText}>View details</Text>
                <Animated.View style={{ transform: [{ rotate: chevronRotateInterpolate }], marginLeft: 4 }}>
                  <Ionicons name="chevron-down" size={15} color="#0F382A" />
                </Animated.View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.placeOrderBtn, !cartHasItem && { opacity: 0.5 }]}
              disabled={!cartHasItem}
              onPress={handlePlaceOrderNavigation}
              activeOpacity={0.88}
            >
              <Text style={styles.placeOrderText}>Place Order</Text>
              <Ionicons name="arrow-forward" size={18} color="#FAF8F5" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Price Breakdown Pop-up Bottom Sheet Modal */}
      <Modal
        visible={showPriceModal}
        transparent
        animationType="none"
        onRequestClose={closePriceSheet}
      >
        <Animated.View style={[styles.modalOverlayAnimated, { opacity: priceBackdropAnim }]}>
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePriceSheet} />
          
          <Animated.View
            style={[
              styles.priceModalContent,
              { transform: [{ translateY: priceSheetAnim }] },
            ]}
          >
            <View style={styles.drawerHandle} />
            
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closePriceSheet} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color="#FAF8F5" />
            </TouchableOpacity>

            <View style={styles.priceModalHeaderBlock}>
              <View style={styles.priceModalHeaderIconBadge}>
                <Ionicons name="receipt-outline" size={18} color="#0F382A" />
              </View>
              <View>
                <Text style={styles.priceModalHeading}>Bill Summary</Text>
                <Text style={styles.priceModalSubHeading}>Transparent charges breakdown</Text>
              </View>
            </View>

            {(isHomemadeFlow || isMealBoxFlow) ? (
              <View style={styles.priceModalInnerBox}>
                <View style={styles.breakupRow}>
                  <Text style={styles.breakupLabel}>{isMealBoxFlow ? "MealBox Plan Base Subtotal" : "Homemade Subtotal"}</Text>
                  <Text style={styles.breakupValue}>₹{subtotal}</Text>
                </View>
                <View style={styles.breakupRow}>
                  <Text style={styles.breakupLabel}>Delivery & Kitchen Charges</Text>
                  <View style={styles.freeBadgePill}>
                    <Text style={styles.freeBadgePillText}>FREE</Text>
                  </View>
                </View>
                {discount > 0 && (
                  <View style={styles.breakupRow}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="gift" size={13} color="#0F382A" style={{ marginRight: 6 }} />
                      <Text style={[styles.breakupLabel, { color: "#0F382A", fontWeight: "700" }]}>Coupon Discount</Text>
                    </View>
                    <Text style={{ color: "#0F382A", fontWeight: "800", fontSize: 15 }}>
                      -₹{discount}
                    </Text>
                  </View>
                )}
                
                <View style={styles.breakupDividerDashed} />
                
                <View style={[styles.breakupRow, { marginBottom: 0, alignItems: "center" }]}>
                  <View>
                    <Text style={styles.totalText}>Grand Total</Text>
                    <Text style={styles.taxInclusiveNote}>All taxes & fees included</Text>
                  </View>
                  <Text style={styles.totalAmount}>₹{finalTotal}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.priceModalInnerBox}>
                <View style={styles.breakupRow}>
                  <Text style={styles.breakupLabel}>Price per plate</Text>
                  <Text style={styles.breakupValue}>₹{pricePerPlate}</Text>
                </View>
                <View style={styles.breakupRow}>
                  <Text style={styles.breakupLabel}>Guests Count</Text>
                  <Text style={styles.breakupValue}>× {plates}</Text>
                </View>
                <View style={styles.breakupRow}>
                  <Text style={styles.breakupLabel}>Base Subtotal</Text>
                  <Text style={styles.breakupValue}>₹{subtotal}</Text>
                </View>
                <View style={styles.breakupRow}>
                  <Text style={styles.breakupLabel}>
                    Delivery ({orderDetails?.delivery || "Doorstep"})
                  </Text>
                  <Text style={styles.breakupValue}>₹{deliveryPrice}</Text>
                </View>
                {discount > 0 && (
                  <View style={styles.breakupRow}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="gift" size={13} color="#0F382A" style={{ marginRight: 6 }} />
                      <Text style={[styles.breakupLabel, { color: "#0F382A", fontWeight: "700" }]}>Coupon Discount</Text>
                    </View>
                    <Text style={{ color: "#0F382A", fontWeight: "800", fontSize: 15 }}>
                      -₹{discount}
                    </Text>
                  </View>
                )}
                
                <View style={styles.breakupDividerDashed} />
                
                <View style={[styles.breakupRow, { marginBottom: 0, alignItems: "center" }]}>
                  <View>
                    <Text style={styles.totalText}>Grand Total</Text>
                    <Text style={styles.taxInclusiveNote}>All taxes & fees included</Text>
                  </View>
                  <Text style={styles.totalAmount}>₹{finalTotal}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity 
              style={styles.modalDoneBtn} 
              onPress={closePriceSheet}
              activeOpacity={0.88}
            >
              <Text style={styles.modalDoneBtnText}>Got it</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Preview Modal */}
      <Modal
        visible={showPreviewModal}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <Animated.View style={[styles.modalOverlayAnimated, { opacity: previewBackdropAnim }]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSheet} />

          <Animated.View
            style={[
              styles.previewModalContent,
              { transform: [{ translateY: sheetAnim }], height: "82%" },
            ]}
          >
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closeSheet} activeOpacity={0.85}>
              <Ionicons name="close" size={20} color="#FAF8F5" />
            </TouchableOpacity>

            <View style={styles.previewHeaderRow}>
              <View>
                <Text style={[styles.previewTitle, { marginBottom: 2, fontSize: 20, color: '#0B261D' }]}>Selections Summary</Text>
                <Text style={{ fontSize: 12.5, color: "#5B756C", marginLeft: 2, fontWeight: '500' }}>Tap pills to inspect or confirm choices</Text>
              </View>
            </View>

            {isMealBoxFlow && cartData?.selections && !Array.isArray(cartData.selections) && (
              <View style={styles.pillTabsWrapperBlock}>
                {Object.keys(cartData.selections).map((dayKey) => {
                  const dayItemsCount = cartData.selections[dayKey]?.length || 0;
                  const isTabPillSelected = previewActiveDay === dayKey;
                  return (
                    <TouchableOpacity
                      key={`tab-pill-${dayKey}`}
                      activeOpacity={0.85}
                      onPress={() => setPreviewActiveDay(dayKey)}
                      style={[
                        styles.tabPillContainerItem,
                        isTabPillSelected ? styles.tabPillContainerItemActive : styles.tabPillContainerItemInactive,
                      ]}
                    >
                      <Text style={[styles.tabPillTextString, isTabPillSelected ? styles.tabPillTextStringActive : styles.tabPillTextStringInactive]}>
                        {dayKey}
                      </Text>
                      <View style={[styles.tabPillCounterBadgeGlow, isTabPillSelected ? styles.tabPillCounterBadgeGlowActive : styles.tabPillCounterBadgeGlowInactive]}>
                        <Text style={[styles.tabPillCounterBadgeText, isTabPillSelected ? styles.tabPillCounterBadgeTextActive : styles.tabPillCounterBadgeTextInactive]}>
                          {dayItemsCount}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <ScrollView style={{ width: "100%", marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {isMealBoxFlow && cartData?.selections && !Array.isArray(cartData.selections) ? (
                <View style={styles.premiumMealBoxContentCardFrame}>
                  <View style={styles.subCardHeaderStripLabel}>
                    <Text style={styles.subCardHeaderStripLabelText}>{previewActiveDay} MENU PREFERENCE</Text>
                  </View>

                  {currentDaySelectionsArray.length === 0 ? (
                    <Text style={{ textAlign: "center", color: "#5B756C", fontStyle: "italic", paddingVertical: 30 }}>No items configured for this weekday.</Text>
                  ) : (
                    Object.entries(groupedPreviewDayItemsMap).map(([sectionTitle, dishesGroupArray]) => {
                      if (!dishesGroupArray || dishesGroupArray.length === 0) return null;
                      return (
                        <View key={`preview-section-${sectionTitle}`} style={{ marginTop: 14 }}>
                          <View style={styles.sectionHeaderLabelContainerTag}>
                            <Text style={styles.sectionHeaderLabelContainerTagText}>{sectionTitle}</Text>
                          </View>

                          {dishesGroupArray.map((dishItem: any, idx: number) => {
                            const isExtraItemAddon = sectionTitle === "ADD ON'S" || dishItem.type === "addon";
                            return (
                              <View key={`dish-item-${idx}`} style={styles.previewSelectionRowItemBlock}>
                                <Image 
                                  source={dishItem.image ? { uri: dishItem.image } : { uri: 'https://via.placeholder.com/80?text=Food' }} 
                                  style={styles.modalCircularFoodThumbGraphic} 
                                />
                                <View style={{ flex: 1, paddingLeft: 12 }}>
                                  <Text style={styles.modalItemNameTextString}>{dishItem.name}</Text>
                                </View>
                                <View style={[styles.includedBadgePillBox, isExtraItemAddon ? styles.includedBadgePillBoxExtra : styles.includedBadgePillBoxStandard]}>
                                  <Text style={[styles.includedBadgePillBoxText, isExtraItemAddon ? styles.includedBadgePillBoxTextExtra : styles.includedBadgePillBoxTextStandard]}>
                                    {isExtraItemAddon ? `Extra ×${dishItem.qty || dishItem.quantity || 1}` : "Included"}
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
                selectionsSummary.map((cat: any, index: number) => {
                  if (!cat.selected?.length) return null;
                  return (
                    <View key={index} style={styles.previewCategoryCard}>
                      <View style={styles.previewCategoryHeader}>
                        <Text style={styles.previewCategoryTitle}>{cat.category}</Text>
                      </View>

                      {cat.selected.map((item: any, i: number) => {
                        const isExtra = cat.max ? i >= cat.max : false;

                        return (
                          <View key={i}>
                            {isExtra && i === cat.max && (
                              <Text style={styles.extraSectionTitle}>+ Extra Items</Text>
                            )}

                            <View style={styles.previewItemCard}>
                              <Image
                                source={{ uri: item.imageUrl || item.image }}
                                style={styles.previewItemImage}
                              />

                              <Text style={styles.previewItemName}>{item.name}</Text>

                              {isExtra && (
                                <View style={styles.extraTag}>
                                  <Text style={styles.extraTagText}>
                                    +₹{item.price || 0}/plate
                                  </Text>
                                </View>
                              )}

                              <Ionicons
                                name="checkmark-circle"
                                size={17}
                                color={isExtra ? "#0F382A" : "#107C41"}
                                style={{ marginLeft: "auto" }}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}

              {/* DYNAMIC ADD-ONS SECTION IN PREVIEW MODAL FOR CATERING SYSTEMS */}
              {!isMealBoxFlow && cartAddons && cartAddons.length > 0 && (
                <View style={styles.previewCategoryCard}>
                  <View style={styles.previewCategoryHeader}>
                    <Text style={styles.previewCategoryTitle}>Add-ons</Text>
                  </View>
                  {cartAddons.map((addon: any, idx: number) => (
                    <View key={`cart-addon-item-${idx}`} style={styles.previewItemCard}>
                      <Image
                        source={{ uri: addon.imageUrl || addon.image }}
                        style={styles.previewItemImage}
                      />
                      <Text style={styles.previewItemName}>
                        {addon.name} × {addon.count}
                      </Text>
                      <View style={styles.extraTag}>
                        <Text style={styles.extraTagText}>
                          +₹{addon.price * addon.count}/plate
                        </Text>
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
            </ScrollView>

            {isMealBoxFlow && (
              <View style={styles.modalAbsoluteFooterCTAWrapper}>
                <TouchableOpacity 
                  activeOpacity={0.88} 
                  onPress={closeSheet} 
                  style={styles.modalAbsoluteFooterCTAButtonSolid}
                >
                  <Text style={styles.modalAbsoluteFooterCTAButtonSolidText}>
                    Confirm & Subscribe • ₹{cartData?.totalPrice}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* HARDWARE-ACCELERATED ULTRA SMOOTH POPUP ELEMENT */}
      {showHurray && (
        <Animated.View style={[styles.hurrayOverlay, { opacity: overallOpacity }]}>
          <Animated.View style={[styles.hurrayCard, { transform: [{ scale: cardScale }, { rotate: cardRotate }] }]}>
            <View style={styles.hurrayRingOutline}>
              <Animated.View style={[styles.hurrayIconCircle, { transform: [{ rotate: spinInterpolation }] }]}>
                <Ionicons name="sparkles" size={38} color="#FAF8F5" />
              </Animated.View>
            </View>
            <Text style={styles.hurrayTitle}>Hurray! 🎉</Text>
            <Text style={styles.hurraySubtitle}>Premium Daawath Coupon Applied</Text>
            <View style={styles.savingsContainerGlow}>
              <Text style={styles.hurraySavings}>Saved ₹{discount}</Text>
            </View>

            <Animated.View style={[styles.bubble, styles.b1, { opacity: bubbleOpacity, transform: [{ translateX: b1X }, { translateY: b1Y }, { scale: bubbleScale }] }]} />
            <Animated.View style={[styles.bubble, styles.b2, { opacity: bubbleOpacity, transform: [{ translateX: b2X }, { translateY: b2Y }, { scale: bubbleScale }] }]} />
            <Animated.View style={[styles.bubble, styles.b3, { opacity: bubbleOpacity, transform: [{ translateX: b3X }, { translateY: b3Y }, { scale: bubbleScale }] }]} />
            <Animated.View style={[styles.bubble, styles.b4, { opacity: bubbleOpacity, transform: [{ translateX: b4X }, { translateY: b4Y }, { scale: bubbleScale }] }]} />
          </Animated.View>
        </Animated.View>
      )}
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
  iconBtn: {
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
  headerEditButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  headerEditText: { marginLeft: 6, fontSize: 13.5, fontWeight: "700", color: "#0D2E22" },
  mainCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 20,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  mainCardModern: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    paddingTop: 26,
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
  removeFromCartBtnModern: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    padding: 6,
  },
  modernTagPillEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
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
    paddingRight: 32,
    marginTop: 6,
    marginBottom: 16,
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
  cateringAlignedGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cateringGridCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  cateringCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  cateringCellValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
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
  modernAddressLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#5B756C',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modernAddressText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0B261D',
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

  removeFromCartBtn: { 
    position: "absolute", 
    top: 16, 
    right: 16, 
    zIndex: 10, 
    padding: 4,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemImage: { width: 80, height: 100, borderRadius: 16, backgroundColor: "#E5ECE8" },
  itemTitle: { fontSize: 17, fontWeight: "800", color: "#0B261D", letterSpacing: -0.2 },
  restaurantName: { fontSize: 13, fontWeight: "700", color: "#5B756C", marginBottom: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  metaText: { marginLeft: 8, fontSize: 13, color: "#4F6B61", fontWeight: "500" },
  doorstepBadge: { marginTop: 8, backgroundColor: "rgba(22, 101, 52, 0.08)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(22, 101, 52, 0.15)" },
  doorstepText: { fontSize: 11.5, fontWeight: "800", color: "#0F382A" },

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
    backgroundColor: "rgba(22, 101, 52, 0.08)",
    borderColor: "rgba(22, 101, 52, 0.15)",
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
  viewItemsContainer: { 
    marginTop: 16, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "rgba(22, 101, 52, 0.08)", 
    paddingVertical: 14, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: "rgba(22, 101, 52, 0.15)" 
  },
  viewItems: { color: "#0F382A", fontWeight: "800", fontSize: 14 },
  
  emptyStateContainer: { 
    marginHorizontal: 20, 
    backgroundColor: "#FFFFFF", 
    borderRadius: 24, 
    paddingVertical: 50, 
    paddingHorizontal: 24, 
    shadowColor: "#0F382A", 
    shadowOffset: { width: 0, height: 6 }, 
    shadowOpacity: 0.04, 
    shadowRadius: 14, 
    elevation: 4, 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.08)" 
  },
  emptyIconContainer: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  emptyStateTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0B261D",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptyStateText: { fontSize: 13, fontWeight: "500", color: "#5B756C", textAlign: "center", lineHeight: 19, marginBottom: 20 },
  goHomeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#166534", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 20, shadowColor: "#166534", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  goHomeText: { color: "#FAF8F5", fontSize: 14.5, fontWeight: "800", letterSpacing: 0.2 },
  
  priceBreakupBox: { backgroundColor: "#FAF8F5", borderRadius: 20, padding: 18, marginTop: 12, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.08)" },
  breakupRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  breakupLabel: { fontSize: 13.5, color: "#4F6B61", fontWeight: "600" },
  breakupValue: { fontSize: 14.5, fontWeight: "800", color: "#0B261D" },
  breakupDivider: { height: 1, backgroundColor: "rgba(15, 56, 42, 0.08)", marginVertical: 12 },
  breakupDividerDashed: { 
    height: 1, 
    borderStyle: 'dashed', 
    borderBottomWidth: 1.2, 
    borderColor: "rgba(15, 56, 42, 0.15)", 
    marginVertical: 14 
  },
  freeBadgePill: {
    backgroundColor: 'rgba(22, 101, 52, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.15)',
  },
  freeBadgePillText: {
    color: '#107C41',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  taxInclusiveNote: {
    fontSize: 11,
    color: '#5B756C',
    fontWeight: '500',
    marginTop: 2,
  },
  totalText: { fontSize: 15, fontWeight: "900", color: "#0B261D" },
  totalAmount: { fontSize: 22, fontWeight: "900", color: "#0F382A", letterSpacing: -0.4 },
  
  bottomContainer: { 
    position: "absolute", 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: "#FFFFFF", 
    paddingHorizontal: 20, 
    paddingTop: 16, 
    paddingBottom: 28, 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    shadowColor: "#0F382A", 
    shadowOffset: { width: 0, height: -6 }, 
    shadowOpacity: 0.06, 
    shadowRadius: 16, 
    elevation: 15, 
    borderTopWidth: 1, 
    borderTopColor: "rgba(15, 56, 42, 0.08)" 
  },
  bottomBarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bottomBarPriceBlock: { flexDirection: "column", justifyContent: "center" },
  bottomBarAmountRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  bottomBarTotalLabel: { fontSize: 11, fontWeight: "800", color: "#5B756C", textTransform: "uppercase", letterSpacing: 0.4 },
  bottomBarTotalAmount: { fontSize: 22, fontWeight: "900", color: "#0B261D", letterSpacing: -0.4 },
  viewDetailsTouchable: { flexDirection: "row", alignItems: "center", marginTop: 4, paddingVertical: 2 },
  viewDetailsUnderlineText: { 
    fontSize: 13, 
    fontWeight: "700", 
    color: "#0F382A", 
    textDecorationLine: "underline",
    letterSpacing: -0.1
  },
  placeOrderWrapper: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  placeOrderBtn: { 
    backgroundColor: "#166534", 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    flex: 1, 
    marginLeft: 24, 
    paddingVertical: 15, 
    borderRadius: 20, 
    shadowColor: "#166534", 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.22, 
    shadowRadius: 8, 
    elevation: 5 
  },
  placeOrderText: { color: "#FAF8F5", fontWeight: "800", fontSize: 15.5, letterSpacing: 0.2 },

  modalOverlayAnimated: {
    flex: 1,
    backgroundColor: "rgba(11, 38, 29, 0.45)",
    justifyContent: "flex-end",
  },
  priceModalContent: {
    width: "100%",
    backgroundColor: "#FAF8F5",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 25,
  },
  priceModalHeaderBlock: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 4,
  },
  priceModalHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  priceModalHeading: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  priceModalSubHeading: {
    fontSize: 12,
    color: "#5B756C",
    fontWeight: "500",
    marginTop: 2,
  },
  priceModalInnerBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  modalDoneBtn: {
    marginTop: 16,
    backgroundColor: "#166534",
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  modalDoneBtnText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
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
  drawerHandle: { width: 40, height: 4.5, backgroundColor: "rgba(15, 56, 42, 0.15)", borderRadius: 2.5, alignSelf: "center", marginBottom: 14 },
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
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  previewCategoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
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
  previewHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  previewTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0B261D",
    marginBottom: 14,
    marginLeft: 2,
    letterSpacing: -0.3,
  },
  previewCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  previewCategoryTitle: { fontSize: 14.5, fontWeight: "800", color: "#0B261D", letterSpacing: -0.2 },
  previewItemImage: { width: 40, height: 40, borderRadius: 10, marginRight: 12, backgroundColor: '#E5ECE8' },
  previewItemName: { fontSize: 13.5, fontWeight: "700", color: "#0B261D", flex: 1 },

  extraSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F382A",
    marginTop: 8,
    marginBottom: 6,
    marginLeft: 4,
  },
  extraTag: { backgroundColor: "rgba(22, 101, 52, 0.08)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8, borderWidth: 1, borderColor: "rgba(22, 101, 52, 0.15)" },
  extraTagText: { fontSize: 10.5, fontWeight: "800", color: "#0F382A" },

  premiumSectionCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 18,
    borderRadius: 22,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  premiumSectionHeaderContainer: {
    marginBottom: 14,
  },
  premiumHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  premiumCrownCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  premiumSectionMainHeading: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  premiumSectionSubHeading: {
    fontSize: 12,
    fontWeight: "500",
    color: "#5B756C",
    marginTop: 2,
  },
  viewAllOffersLinkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "#FAF8F5",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  linkText: {
    color: "#0B261D",
    fontSize: 12.5,
    fontWeight: "700",
  },
  arrowCircleIconBackground: {
    backgroundColor: "#166534",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  daawathPremiumCouponCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    marginVertical: 4,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  daawathLeftAccentLine: {
    width: 5,
    backgroundColor: "#166534",
  },
  daawathCouponMainBody: {
    flex: 1,
    padding: 14,
  },
  daawathCouponPill: {
    backgroundColor: "rgba(22, 101, 52, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 52, 0.15)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  daawathPremiumCouponTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F382A",
    letterSpacing: 0.5,
  },
  daawathPremiumApplyBtn: {
    backgroundColor: "#166534",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  daawathPremiumApplyText: {
    color: "#FAF8F5",
    fontWeight: "800",
    fontSize: 12,
  },
  daawathPremiumCouponDesc: {
    fontSize: 14,
    color: "#0B261D",
    fontWeight: "800",
    marginTop: 10,
  },
  daawathPremiumMiniDivider: {
    height: 1,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    marginVertical: 10,
  },
  daawathPremiumCouponMeta: {
    fontSize: 11.5,
    color: "#5B756C",
    fontWeight: "600",
  },

  daawathAppliedBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF8F5",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "rgba(22, 101, 52, 0.2)",
  },
  daawathLeftGoldBar: {
    width: 4,
    height: "100%",
    backgroundColor: "#166534",
    borderRadius: 2,
    marginRight: 12,
  },
  appliedSparkleCircle: {
    backgroundColor: "#166534",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  daawathAppliedCodeText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0F382A",
    letterSpacing: 0.5,
  },
  daawathAppliedSavingsText: {
    fontSize: 12,
    color: "#4F6B61",
    marginTop: 3,
    fontWeight: "600",
  },
  daawathRemoveCouponBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    marginLeft: 8,
  },
  daawathRemoveCouponText: {
    color: "#D32F2F",
    fontWeight: "700",
    fontSize: 11.5,
  },

  hurrayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 38, 29, 0.55)",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  hurrayCard: {
    width: SCREEN_WIDTH * 0.84,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 26,
    alignItems: "center",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  hurrayRingOutline: {
    padding: 5,
    borderRadius: 50,
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  hurrayIconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#166534",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  hurrayTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.4,
  },
  hurraySubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5B756C",
    marginTop: 4,
    textAlign: "center",
  },
  savingsContainerGlow: {
    marginTop: 16,
    shadowColor: "#166534",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  hurraySavings: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FAF8F5",
    backgroundColor: "#166534",
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 14,
    overflow: "hidden",
  },
  bubble: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    top: "42%",
    left: "48%",
  },
  b1: { backgroundColor: "#166534" },
  b2: { backgroundColor: "#107C41" },
  b3: { backgroundColor: "rgba(22, 101, 52, 0.3)" },
  b4: { backgroundColor: "#5B756C" },

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