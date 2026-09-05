import React, { useRef, useState, useEffect } from "react";
import { BlurView } from "expo-blur";
import { Alert, TouchableWithoutFeedback } from "react-native";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
  StatusBar,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api from "@/src/lib/api";
import { useNavigationStore } from "@/src/store/navigationStore";
import MenuItemSkeleton from "@/src/components/skeletons/MenuItemSkeleton";

const SHOW_BACK_TO_TOP_THRESHOLD = 400;
const FOOTER_HEIGHT = 72;
const HEADER_COLLAPSE_THRESHOLD = 280;
const { width } = Dimensions.get("window");
const FALLBACK_HERO_IMAGE = {
  uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
};
const FALLBACK_PLATE_DATA = [
  { id: "1", name: "Dal Tadka", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=200" },
  { id: "2", name: "Jeera Rice", image: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=200" },
  { id: "3", name: "Paneer Butter Masala", image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=200" },
  { id: "4", name: "Mix Veg", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200" },
];

const safeParsePrice = (val: any): number => {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const ChevronLeft = ({ size = 22, color = '#0B261D' }) => (
  <Feather name="chevron-left" size={size} color={color} />
);

export default function CateringMenuItemScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const backToTopOpacity = useRef(new Animated.Value(0)).current;
  const productScrollRef = useRef<ScrollView>(null);
  const selectionBarAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isStickyActive, setIsStickyActive] = useState(false);
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const [limitAcknowledged, setLimitAcknowledged] = useState<Record<number, boolean>>({});
  const cartFlyAnim = useRef(new Animated.Value(0)).current;
  const [flyItemImage, setFlyItemImage] = useState<string | null>(null);
  const [extraItemsCount, setExtraItemsCount] = useState<Record<number, number>>({});
  const [totalExtraPrice, setTotalExtraPrice] = useState(0);
  const [showPriceDetails, setShowPriceDetails] = useState(false);
  const [showFooterPriceDetails, setShowFooterPriceDetails] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selections, setSelections] = useState<Record<number, Set<string>>>({});
  const [triggeredItemPrice, setTriggeredItemPrice] = useState(0);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);

  const itemScaleAnims = useRef<Record<string, Animated.Value>>({}).current;

  const getItemScaleAnim = (id: string) => {
    if (!itemScaleAnims[id]) {
      itemScaleAnims[id] = new Animated.Value(1);
    }
    return itemScaleAnims[id];
  };

  let menuParam: any = null;
  let chef: any = null;
  let incomingCategoryName = params.category as string | undefined;
  try {
    if (params.menu) menuParam = JSON.parse(params.menu as string);
    if (params.chef) chef = JSON.parse(params.chef as string);
  } catch (e) {}

  const effectiveChefId = (params.chefId as string) || (params.id as string) || chef?.id || chef?.chefId || "";
  const effectiveMenuId = (params.planId as string) || menuParam?._id || menuParam?.id || "";

  const contextCategoryName = useNavigationStore((state) =>
    state.currentContext?.restaurantOrChef?.selectedCategoryName
  );
  const categoryNameStr = (incomingCategoryName || contextCategoryName || "").trim().toLowerCase();
  const isMealBox = categoryNameStr === "meal box" || categoryNameStr === "mealbox";

  let selectionsFromParams: any = null;
  let orderDetailsFromParams: any = null;
  try {
    if (params.selections) {
      selectionsFromParams = JSON.parse(params.selections as string);
    }
    if (params.orderDetails) {
      orderDetailsFromParams = JSON.parse(params.orderDetails as string);
    }
  } catch (e) {}

  const [fullMenuData, setFullMenuData] = useState<any>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [remoteCateringData, setRemoteCateringData] = useState<any>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [remotePlanImage, setRemotePlanImage] = useState<string | null>(null);

  // Fetch full menu via configured api instance
  useEffect(() => {
    const fetchFullMenu = async () => {
      if (!effectiveChefId || !effectiveMenuId) {
        if (menuParam) {
          setFullMenuData(menuParam);
        }
        setMenuLoading(false);
        return;
      }
      try {
        setMenuLoading(true);
        const res = await api.get(`/api/chef-categories/menu/chef/${effectiveChefId}`);
        const data = res.data;
        if (data && Array.isArray(data)) {
          const found = data.find((m: any) => m._id === effectiveMenuId || m.id === effectiveMenuId);
          if (found) {
            setFullMenuData(found);
          } else if (menuParam) {
            setFullMenuData(menuParam);
          }
        } else if (menuParam) {
          setFullMenuData(menuParam);
        }
      } catch (err) {
        console.log("Error fetching full menu:", err);
        if (menuParam) setFullMenuData(menuParam);
      } finally {
        setMenuLoading(false);
      }
    };
    fetchFullMenu();
  }, [effectiveChefId, effectiveMenuId]);

  const effectiveMenu = fullMenuData || menuParam;

  const platePrice = safeParsePrice(effectiveMenu?.price || params.planPrice);
  const safeExtraPriceAccumulator = safeParsePrice(totalExtraPrice);
  const finalPrice = platePrice + safeExtraPriceAccumulator;
  const extraPrice = safeParsePrice(effectiveMenu?.extraPrice);
  const previewHeaderImage = effectiveMenu?.plateItems?.[0]?.imageUrl || effectiveMenu?.imageUrl || "https://picsum.photos/200";
  const daawathCategories = effectiveMenu?.daawathCategories || [];
  const daawathAddons = effectiveMenu?.daawathAddons || [];

  const getMaxForCategory = (catIndex: number) => {
    const cat = daawathCategories[catIndex];
    if (cat?.maxItems !== undefined && cat?.maxItems !== null && cat?.maxItems !== "") {
      const parsed = parseInt(String(cat.maxItems), 10);
      return isNaN(parsed) ? 1 : parsed;
    }
    return 1;
  };

  const totalAllowedItems = daawathCategories.reduce((sum: number, cat: any, index: number) => {
    const base = getMaxForCategory(index);
    const extra = extraItemsCount[index] || 0;
    return sum + base + extra;
  }, 0);

  const totalSelectedItems = Object.values(selections)
    .reduce((sum: number, set: any) => sum + set.size, 0);

  const getAddedCountForCategory = (catIndex: number) => {
    return selections[catIndex]?.size || 0;
  };

  const { currentContext } = useNavigationStore();
  const displayPlanName = effectiveMenu?.name || "Classic Plan";
  const displayPlanPrice = finalPrice > 0 ? `₹${finalPrice}` : (platePrice > 0 ? `₹${platePrice}` : null);

  const parseDynamicPlateItems = (): Array<{ id: string; name: string; image: string }> => {
    if (effectiveMenu && effectiveMenu.plateItems && Array.isArray(effectiveMenu.plateItems) && effectiveMenu.plateItems.length > 0) {
      return effectiveMenu.plateItems.map((item: any, index: number) => ({
        id: item._id || item.id || String(index),
        name: item.name || item.title || item.itemName || "Item",
        image: item.image || item.imageUrl || item.coverimage || "",
      }));
    }
    if (params.plateItems && typeof params.plateItems === "string") {
      try {
        const parsed = JSON.parse(params.plateItems);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any, index: number) => ({
            id: item._id || item.id || String(index),
            name: item.name || item.title || item.itemName || "Item",
            image: item.image || item.imageUrl || item.coverimage || "",
          }));
        }
      } catch (_) {}
    }
    if (currentContext?.menu) {
      const ctxMenu = currentContext.menu;
      const ctxItems = ctxMenu.items || ctxMenu.plateItems || ctxMenu.mealItems || ctxMenu.dishes;
      if (Array.isArray(ctxItems) && ctxItems.length > 0) {
        return ctxItems.map((item: any, index: number) => ({
          id: item._id || item.id || String(index),
          name: item.name || item.title || item.itemName || "Item",
          image: item.image || item.imageUrl || item.coverimage || "",
        }));
      }
    }
    if (remoteCateringData) {
      const remoteItems = remoteCateringData.items || remoteCateringData.plateItems || remoteCateringData.dishes;
      if (Array.isArray(remoteItems) && remoteItems.length > 0) {
        return remoteItems.map((item: any, index: number) => ({
          id: item._id || item.id || String(index),
          name: item.name || item.title || item.itemName || "Item",
          image: item.image || item.imageUrl || item.coverimage || "",
        }));
      }
    }
    return FALLBACK_PLATE_DATA;
  };

  const allPlateItems = parseDynamicPlateItems();
  const VISIBLE_PLATE_COUNT = 4;
  const visiblePlateItems = allPlateItems.slice(0, VISIBLE_PLATE_COUNT);
  const overflowCount = allPlateItems.length > VISIBLE_PLATE_COUNT ? allPlateItems.length - VISIBLE_PLATE_COUNT : 0;

  const resolveHeaderImageSource = () => {
    if (effectiveMenu && effectiveMenu.heroImageUrl) {
      return { uri: effectiveMenu.heroImageUrl };
    }
    if (params.planImage && typeof params.planImage === "string" && (params.planImage as string).trim().length > 0) {
      return { uri: params.planImage as string };
    }
    if (currentContext?.menu) {
      const storedImageUrl = currentContext.menu.resolvedImageString || currentContext.menu.image || currentContext.menu.heroImageUrl;
      if (storedImageUrl) return { uri: storedImageUrl };
    }
    if (remotePlanImage) return { uri: remotePlanImage };
    return FALLBACK_HERO_IMAGE;
  };

  const displayHeroImage = resolveHeaderImageSource();

  // Fetch plan packages safely via api client
  useEffect(() => {
    const fetchPlanDetailsWithItems = async () => {
      if (!effectiveChefId) {
        setLoadingItems(false);
        return;
      }
      try {
        setLoadingItems(true);
        const res = await api.get(`/api/chef-categories/plans/chef/${effectiveChefId}`);
        const data = res.data;
        if (data && Array.isArray(data)) {
          const matchingPlan = data.find((p: any) => p._id === effectiveMenuId || p.id === effectiveMenuId);
          if (matchingPlan) {
            setRemotePlanImage(matchingPlan.image || matchingPlan.coverimage || matchingPlan.planimage || matchingPlan.heroImageUrl);
            if (matchingPlan.mealBoxData) {
              const parsedData = typeof matchingPlan.mealBoxData === "string"
                ? JSON.parse(matchingPlan.mealBoxData)
                : matchingPlan.mealBoxData;
              setRemoteCateringData(parsedData);
            }
          }
        }
      } catch (err) {
        console.log("Error loading dynamic items:", err);
      } finally {
        setLoadingItems(false);
      }
    };
    fetchPlanDetailsWithItems();
  }, [effectiveChefId, effectiveMenuId]);

  const triggerCartFlyAnimation = (imageUrl: string) => {
    setFlyItemImage(imageUrl);
    cartFlyAnim.setValue(0);
    Animated.timing(cartFlyAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      setFlyItemImage(null);
    });
  };

  const toggleAdded = (catIndex: number, itemId: string) => {
    const scaleAnim = getItemScaleAnim(itemId);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 90, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
    ]).start();

    const cat = daawathCategories[catIndex];
    const baseMax = getMaxForCategory(catIndex);
    const extraCountLocal = extraItemsCount[catIndex] || 0;
    const max = baseMax + extraCountLocal;
    const currentSet = selections[catIndex] || new Set<string>();
    const items = cat.items || [];

    if (!currentSet.has(itemId) && currentSet.size >= max) {
      if (!limitAcknowledged[catIndex]) {
        const item = items.find((p: any, i: number) => (p.id || i.toString()) === itemId);
        const itemPrice = safeParsePrice(item?.price || extraPrice);
        setTriggeredItemPrice(itemPrice);
        setSelectedCategoryIndex(catIndex);
        setShowLimitModal(true);
        return;
      } else {
        setExtraItemsCount((prev) => ({
          ...prev,
          [catIndex]: (prev[catIndex] || 0) + 1,
        }));
        const item = items.find((p: any, i: number) => (p.id || i.toString()) === itemId);
        const itemPrice = safeParsePrice(item?.price || extraPrice);
        setTotalExtraPrice((prev) => safeParsePrice(prev) + itemPrice);
      }
    }

    setSelections((prev) => {
      const curr = prev[catIndex] || new Set<string>();
      const newSet = new Set(curr);

      if (newSet.has(itemId)) {
        const prevSize = newSet.size;
        newSet.delete(itemId);
        const item = items.find((p: any, i: number) => (p.id || i.toString()) === itemId);
        const itemPrice = safeParsePrice(item?.price || extraPrice);
        if (prevSize > baseMax) {
          setExtraItemsCount((prevExtra) => ({
            ...prevExtra,
            [catIndex]: Math.max(0, (prevExtra[catIndex] || 0) - 1),
          }));
          setTotalExtraPrice((prevExtraTotal) => Math.max(0, safeParsePrice(prevExtraTotal) - itemPrice));
        }
        if (newSet.size <= baseMax) {
          setLimitAcknowledged((prevAck) => ({
            ...prevAck,
            [catIndex]: false,
          }));
        }
      } else {
        newSet.add(itemId);
        const item = items.find((p: any, i: number) => (p.id || i.toString()) === itemId);
        if (item?.imageUrl) {
          triggerCartFlyAnimation(item.imageUrl);
        }
      }
      return { ...prev, [catIndex]: newSet };
    });
  };

  const handleAddonClick = (itemId: string, action: 'inc' | 'dec', price: number) => {
    const safeItemPrice = safeParsePrice(price);
    setExtraItemsCount((prev) => {
      const currentVal = prev[itemId as any] || 0;
      let newVal = action === 'inc' ? currentVal + 1 : Math.max(0, currentVal - 1);
      if (action === 'inc') {
        setTotalExtraPrice((p) => safeParsePrice(p) + safeItemPrice);
      } else if (action === 'dec' && currentVal > 0) {
        setTotalExtraPrice((p) => Math.max(0, safeParsePrice(p) - safeItemPrice));
      }
      return { ...prev, [itemId as any]: newVal };
    });
  };

  const handleAddonDirectCountChange = (itemId: string, newCountStr: string, price: number) => {
    const safeItemPrice = safeParsePrice(price);
    const parsed = parseInt(newCountStr.replace(/[^0-9]/g, ""), 10);
    const validCount = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setExtraItemsCount((prev) => {
      const oldVal = prev[itemId as any] || 0;
      const difference = validCount - oldVal;
      setTotalExtraPrice((p) => Math.max(0, safeParsePrice(p) + difference * safeItemPrice));
      return { ...prev, [itemId as any]: validCount };
    });
  };

  const scrollToTop = () => {
    productScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const getExtraBreakdown = () => {
    const breakdown: { name: string; price: number; categoryName: string }[] = [];
    daawathCategories.forEach((cat: any, index: number) => {
      const base = getMaxForCategory(index);
      const selectedIds = selections[index] || new Set<string>();
      const items = cat.items || [];
      let count = 0;
      selectedIds.forEach((id: string) => {
        const item = items.find((p: any, i: number) => (p.id || i.toString()) === id);
        count++;
        if (count > base) {
          breakdown.push({
            name: item?.name || cat.name,
            categoryName: cat.name || `Course ${index + 1}`,
            price: safeParsePrice(item?.price || extraPrice),
          });
        }
      });
    });
    return breakdown;
  };

  const getAddonSummary = () => {
    const addons = daawathAddons || [];
    const summary: any[] = [];
    addons.forEach((addon: any, aIdx: number) => {
      const addonId = addon._id || addon.id || `addon-${aIdx}`;
      const count = extraItemsCount[addonId as any] || 0;
      if (count > 0) {
        summary.push({
          name: addon.name || "Addon",
          count: count,
          price: safeParsePrice(addon.price),
          imageUrl: addon.imageUrl || "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=100",
        });
      }
    });
    return summary;
  };

  const getSelectionSummary = () => {
    return daawathCategories.map((cat: any, index: number) => {
      const selectedIds = selections[index] || new Set<string>();
      const items = cat.items || [];
      const selectedItems = items.filter((item: any, i: number) =>
        selectedIds.has(item.id || i.toString())
      );
      return {
        category: cat.name,
        max: getMaxForCategory(index),
        selected: selectedItems,
      };
    });
  };

  const recalculateExtrasFromSelections = (incomingSelections: any[]) => {
    let extraCounts: Record<number, number> = {};
    let totalExtra = 0;
    incomingSelections.forEach((cat: any, index: number) => {
      const baseMaxLocal = getMaxForCategory(index);
      const selectedItems = cat.selected || [];
      if (selectedItems.length > baseMaxLocal) {
        const extra = selectedItems.length - baseMaxLocal;
        extraCounts[index] = extra;
        selectedItems.slice(baseMaxLocal).forEach((item: any) => {
          totalExtra += safeParsePrice(item?.price || extraPrice);
        });
      }
    });
    setExtraItemsCount(extraCounts);
    setTotalExtraPrice(totalExtra);
  };

  const [readyToRender, setReadyToRender] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setReadyToRender(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (totalSelectedItems > 0) {
      Animated.spring(selectionBarAnim, { toValue: 1, useNativeDriver: true }).start();
    } else {
      Animated.timing(selectionBarAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [totalSelectedItems]);

  useEffect(() => {
    if (selectionsFromParams && selectionsFromParams.length > 0) {
      const restoredSelections: Record<number, Set<string>> = {};
      selectionsFromParams.forEach((cat: any, index: number) => {
        if (cat.selected?.length > 0) {
          const selectedSet = new Set<string>(
            cat.selected.map((item: any, i: number) => String(item.id ?? i.toString()))
          );
          restoredSelections[index] = selectedSet;
        }
      });
      setSelections(restoredSelections);
      recalculateExtrasFromSelections(selectionsFromParams);
    }
  }, [params.type]);

  const handleBackPress = () => {
    router.push({
      pathname: "/screens/CateringMealPlans",
      params: {
        id: chef?.id || chef?.chefId || params.chefId,
        chefId: chef?.id || chef?.chefId || params.chefId,
        chefName: chef?.name || chef?.chefName || params.chefName,
        userId: chef?.userId || params.userId,
        userName: chef?.userName || params.userName,
        location: chef?.location || params.location || "",
        image: chef?.image || chef?.avatar || params.image || params.avatar,
        rating: chef?.rating || params.rating || "",
        isAvailable: String(chef?.isAvailable ?? true),
        fromCategory: "Catering",
      },
    });
  };

  if (!readyToRender || menuLoading || !effectiveMenu || !chef) {
    return <MenuItemSkeleton />;
  }

  const compactStickyOpacity = scrollY.interpolate({
    inputRange: [HEADER_COLLAPSE_THRESHOLD - 40, HEADER_COLLAPSE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const compactStickyTranslate = scrollY.interpolate({
    inputRange: [HEADER_COLLAPSE_THRESHOLD - 40, HEADER_COLLAPSE_THRESHOLD],
    outputRange: [-20, 0],
    extrapolate: "clamp",
  });

  const detailedExtraItems = getExtraBreakdown();
  const detailedAddons = getAddonSummary();

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* BACK TO TOP BUTTON */}
      <Animated.View
        style={[
          styles.backToTopButton,
          {
            opacity: backToTopOpacity,
            transform: [
              {
                translateY: backToTopOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity onPress={scrollToTop} style={styles.backToTopTouchable} activeOpacity={0.85}>
          <Feather name="arrow-up" size={18} color="#FAF8F5" />
          <Text style={styles.backToTopText}>Top</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* COMPACT STICKY HEADER */}
      <Animated.View
        style={[
          styles.compactStickyHeader,
          {
            paddingTop: Math.max(insets.top, 12),
            opacity: compactStickyOpacity,
            transform: [{ translateY: compactStickyTranslate }],
          },
        ]}
        pointerEvents={isStickyActive ? "auto" : "none"}
      >
        <View style={styles.titleRowCompact}>
          <TouchableOpacity style={styles.compactBackBtn} onPress={handleBackPress} activeOpacity={0.75}>
            <ChevronLeft size={20} color="#0B261D" />
          </TouchableOpacity>
          <View style={styles.centerTitleWrapper}>
            <Text style={styles.planTitleCompact} numberOfLines={1}>{displayPlanName}</Text>
            <Text style={styles.compactPriceSub} numberOfLines={1}>₹{finalPrice} / plate</Text>
          </View>
          <View style={styles.compactBackBtnPlaceholder} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stickyPlateContainer}
        >
          {visiblePlateItems.map((dish) => (
            <View key={dish.id} style={styles.stickyDishItem}>
              <View style={styles.dishOuterCircle}>
                <Image
                  source={dish.image ? { uri: dish.image } : FALLBACK_HERO_IMAGE}
                  style={styles.dishAvatarImage}
                />
              </View>
              <Text style={styles.dishItemLabel} numberOfLines={1}>{dish.name}</Text>
            </View>
          ))}
          {overflowCount > 0 && (
            <View style={styles.stickyDishItem}>
              <View style={styles.moreItemsOuterCircle}>
                <Text style={styles.moreItemsCountText}>+{overflowCount}</Text>
              </View>
              <Text style={styles.dishItemLabel} numberOfLines={1}>More</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* CORE SCROLL CONTAINER */}
      <ScrollView
        ref={productScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const yOffset = event.nativeEvent.contentOffset.y;
              if (yOffset >= HEADER_COLLAPSE_THRESHOLD) {
                if (!isStickyActive) setIsStickyActive(true);
              } else {
                if (isStickyActive) setIsStickyActive(false);
              }
              if (yOffset > SHOW_BACK_TO_TOP_THRESHOLD) {
                if (!showBackToTop) {
                  setShowBackToTop(true);
                  Animated.timing(backToTopOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
                }
              } else if (showBackToTop) {
                setShowBackToTop(false);
                Animated.timing(backToTopOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
              }
            },
          }
        )}
      >
        {/* Hero Image Section */}
        <View style={styles.heroContainer}>
          <Image source={displayHeroImage} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.heroImageOverlay} />
          <TouchableOpacity
            style={[styles.floatingImageBackBtn, { top: Math.max(insets.top, 16) + 8 }]}
            onPress={handleBackPress}
            activeOpacity={0.8}
          >
            <View style={styles.backBtnCircle}>
              <ChevronLeft size={22} color="#0D2E22" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Catering Details Main Card */}
        <View style={styles.mainCardView}>
          <View style={styles.titleRow}>
            <Text style={styles.planTitle} numberOfLines={1}>{displayPlanName}</Text>
            <View style={styles.popularBadge}>
              <Feather name="star" size={10} color="#0F382A" style={{ marginRight: 4 }} />
              <Text style={styles.popularText}>POPULAR</Text>
            </View>
          </View>
          
          {displayPlanPrice && (
            <View style={styles.priceRow}>
              <View style={styles.priceMetaLeft}>
                <Text style={styles.priceLabel}>Price per plate</Text>
                <Text style={styles.priceSubHint}>Includes all course dishes</Text>
              </View>
              <Text style={styles.priceValue}>{displayPlanPrice}</Text>
            </View>
          )}

          <View style={styles.summaryContainerBox}>
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="layers" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>{allPlateItems.length} Items</Text>
              <Text style={styles.summaryLabelText}>In the platter</Text>
            </View>
            <View style={styles.summaryDividerLine} />
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="clock" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>18h Notice</Text>
              <Text style={styles.summaryLabelText}>Preparation</Text>
            </View>
            <View style={styles.summaryDividerLine} />
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="users" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>10+ Guests</Text>
              <Text style={styles.summaryLabelText}>Ideal serving</Text>
            </View>
            <View style={styles.summaryDividerLine} />
            <View style={styles.summaryColumn}>
              <View style={styles.summaryIconCircle}>
                <Feather name="shield" size={14} color="#0F382A" />
              </View>
              <Text style={styles.summaryValueText}>Fresh</Text>
              <Text style={styles.summaryLabelText}>Hygienic</Text>
            </View>
          </View>

          <View style={styles.whatsInPlateSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>WHAT'S IN THE PLATTER</Text>
              <View style={styles.sectionHeaderLine} />
            </View>
            {loadingItems ? (
              <ActivityIndicator size="small" color="#0F382A" style={{ marginVertical: 14 }} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dishesHorizontalScroll}
              >
                {visiblePlateItems.map((dish) => (
                  <View key={dish.id} style={styles.dishCardItem}>
                    <View style={styles.dishOuterCircle}>
                      <Image
                        source={dish.image ? { uri: dish.image } : FALLBACK_HERO_IMAGE}
                        style={styles.dishAvatarImage}
                      />
                    </View>
                    <Text style={styles.dishItemLabel} numberOfLines={2}>
                      {dish.name}
                    </Text>
                  </View>
                ))}
                {overflowCount > 0 && (
                  <View style={styles.dishCardItem}>
                    <View style={styles.moreItemsOuterCircle}>
                      <Text style={styles.moreItemsCountText}>+{overflowCount}</Text>
                    </View>
                    <Text style={styles.dishItemLabel} numberOfLines={2}>More Items</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>

          <View style={styles.customizeCateringSection}>
            <Text style={styles.customizeCateringTitle}>Customize Platter Items</Text>
            <Text style={styles.customizeCateringSubtitle}>
              Select dishes from each category to build your custom platter
            </Text>
          </View>
        </View>

        {/* CUSTOMIZER CONFIGURATION BODY SECTION */}
        <View style={styles.mainCustomizerBody}>
          {daawathCategories.map((category: any, catIndex: number) => {
            const maxCount = getMaxForCategory(catIndex);
            const items = category.items || [];
            const currentSelections = selections[catIndex] || new Set<string>();
            const selectedArray = Array.from(currentSelections);
            const extraSelectedIds = new Set(selectedArray.slice(maxCount));
            const scaleAnim = getItemScaleAnim;

            return (
              <View key={catIndex} style={styles.categoryCardBlock}>
                <View style={styles.categoryHeaderRow}>
                  <View style={styles.titleWithBadgeGroup}>
                    <View style={styles.numberBadgeCircle}>
                      <MaterialIcons name="room-service" size={14} color="#FAF8F5" />
                    </View>
                    <Text style={styles.categoryHeaderTitleText}>{category.name}</Text>
                  </View>
                  <View style={styles.chooseTagBadge}>
                    <Text style={styles.simpleChooseText}>Choose any {maxCount}</Text>
                  </View>
                </View>

                <View style={styles.itemListGroup}>
                  {items.map((item: any, index: number) => {
                    const itemId = item._id || item.id || index.toString();
                    const isAdded = currentSelections.has(itemId);
                    const isExtraItem = isAdded && extraSelectedIds.has(itemId);
                    const itemPrice = safeParsePrice(item.price || extraPrice);
                    const itemScale = scaleAnim(itemId);

                    return (
                      <TouchableOpacity
                        key={itemId}
                        activeOpacity={0.75}
                        onPress={() => toggleAdded(catIndex, itemId)}
                        style={[
                          styles.itemRowWrapper,
                          isAdded && styles.itemRowWrapperActive,
                        ]}
                      >
                        <Image source={{ uri: item.imageUrl || "https://picsum.photos/100" }} style={styles.itemThumbImage} />
                        <View style={styles.itemMetaMiddle}>
                          <Text style={[styles.rowItemNameTitle, isAdded && styles.rowItemNameTitleActive]}>
                            {item.name}
                          </Text>
                          {isExtraItem && itemPrice > 0 ? (
                            <Text style={styles.rowItemPriceText}>+₹{itemPrice} / Plate</Text>
                          ) : null}
                        </View>
                        <View style={styles.addButtonWrapper}>
                          <Animated.View style={{ transform: [{ scale: itemScale }] }}>
                            <View style={[styles.radioButtonCircle, isAdded && styles.radioButtonCircleSelected]}>
                              {isAdded && <View style={styles.radioButtonInnerDot} />}
                            </View>
                          </Animated.View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {category.description && (
                  <View style={styles.categoryFooterHintBox}>
                    <Feather name="info" size={13} color="#0F382A" style={{ marginRight: 6 }} />
                    <Text style={styles.hintBoxMessageText}>{category.description}</Text>
                  </View>
                )}
              </View>
            );
          })}

          {/* DYNAMIC ADD-ONS SECTION */}
          {(daawathAddons || []).map((addon: any, aIdx: number) => {
            const addonId = addon._id || addon.id || `addon-${aIdx}`;
            const addonPrice = safeParsePrice(addon.price);
            const currentCount = extraItemsCount[addonId as any] || 0;
            const isEditing = editingAddonId === addonId;

            return (
              <View key={addonId} style={styles.categoryCardBlock}>
                <View style={styles.categoryHeaderRow}>
                  <View style={styles.titleWithBadgeGroup}>
                    <View style={styles.addonIconCircle}>
                      <Feather name="plus" size={13} color="#FAF8F5" />
                    </View>
                    <View style={styles.labelSubTextContainer}>
                      <Text style={styles.categoryHeaderTitleText}>{addon.name || "Addon"}</Text>
                      <Text style={styles.chooseTextLabel}>Optional add-ons for your platter</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.itemListGroup}>
                  <View style={styles.itemRowWrapper}>
                    <Image source={{ uri: addon.imageUrl || "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=100" }} style={styles.itemThumbImage} />
                    <View style={styles.itemMetaMiddle}>
                      <Text style={styles.rowItemNameTitle}>{addon.name}</Text>
                      {addonPrice > 0 ? (
                        <Text style={styles.rowItemPriceText}>+₹{addonPrice} / Plate</Text>
                      ) : null}
                    </View>
                    <View style={styles.counterActionControlBox}>
                      <TouchableOpacity onPress={() => handleAddonClick(addonId, 'dec', addonPrice)} style={styles.controlBoxBtn}>
                        <Feather name="minus" size={13} color="#0F382A" />
                      </TouchableOpacity>
                      
                      {isEditing ? (
                        <TextInput
                          keyboardType="numeric"
                          defaultValue={String(currentCount)}
                          autoFocus
                          onBlur={() => setEditingAddonId(null)}
                          onChangeText={(txt) => handleAddonDirectCountChange(addonId, txt, addonPrice)}
                          style={styles.controlBoxInput}
                          selectTextOnFocus
                        />
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setEditingAddonId(addonId)}
                          style={styles.controlBoxValueTouchable}
                        >
                          <Text style={styles.controlBoxValueText}>{currentCount}</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity onPress={() => handleAddonClick(addonId, 'inc', addonPrice)} style={styles.controlBoxBtn}>
                        <Feather name="plus" size={13} color="#0F382A" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* LIMIT MODAL */}
      <Modal
        visible={showLimitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLimitModal(false)}
      >
        <View style={styles.modalRootOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableWithoutFeedback onPress={() => setShowLimitModal(false)}>
            <View style={styles.modalCenteredContainer}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <View style={styles.modalAlertIconCircle}>
                    <Feather name="alert-circle" size={22} color="#0F382A" />
                  </View>
                  <Text style={styles.modalTitle}>Limit Reached</Text>
                  <Text style={styles.modalMessage}>
                    You can still add more items to this course. Each additional item will be added to your plate price.{'\n\n'}
                    Base price: ₹{platePrice}{'\n'}
                    Extra item: +₹{triggeredItemPrice} per plate{'\n\n'}
                    Tap Continue to include this dish.
                  </Text>
                  <TouchableOpacity
                    style={styles.modalButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      setShowLimitModal(false);
                      setLimitAcknowledged((prev) => ({ ...prev, [selectedCategoryIndex]: true }));
                      setTriggeredItemPrice(0);
                    }}
                  >
                    <Text style={styles.modalButtonText}>Continue Adding</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

      {/* PREVIEW MODAL */}
      <Modal
        visible={showPreviewModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPreviewModal(false)}
      >
        <View style={styles.modalRootOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableWithoutFeedback onPress={() => setShowPreviewModal(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <View style={styles.previewModalContent}>
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setShowPreviewModal(false)} activeOpacity={0.85}>
              <Feather name="x" size={20} color="#FAF8F5" />
            </TouchableOpacity>
            
            <View style={styles.previewHeaderCard}>
              <View style={styles.previewHeaderRow}>
                <Image source={{ uri: previewHeaderImage }} style={styles.previewHeaderImage} />
                <View style={styles.previewTitleInline}>
                  <Text style={styles.previewMainTitle} numberOfLines={1}>{chef?.name}</Text>
                  <Text style={styles.previewSubInline} numberOfLines={1}>{effectiveMenu?.name}</Text>
                </View>
                <TouchableOpacity style={styles.previewPricePillSmall} onPress={() => setShowPriceDetails(prev => !prev)} activeOpacity={0.85}>
                  <Text style={styles.previewPriceInline}>₹{finalPrice}/plate</Text>
                  <Feather name={showPriceDetails ? "chevron-up" : "chevron-down"} size={13} color="#FAF8F5" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              </View>
            </View>

            {showPriceDetails && (
              <View style={styles.priceBreakdownCard}>
                <Text style={styles.breakdownTitle}>Price Details</Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Base Price</Text>
                  <Text style={styles.breakdownValue}>₹{platePrice}</Text>
                </View>
                {getExtraBreakdown().map((item: any, i: number) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownSubLabel}>{item.name}</Text>
                    <Text style={styles.extraValue}>+₹{safeParsePrice(item.price)}/plate</Text>
                  </View>
                ))}
                {(() => {
                  const addonSummary = getAddonSummary();
                  return addonSummary.map((addon: any, idx: number) => (
                    <View key={`addon-${idx}`} style={styles.breakdownRow}>
                      <Text style={styles.breakdownSubLabel}>{addon.name} × {addon.count}</Text>
                      <Text style={styles.extraValue}>+₹{safeParsePrice(addon.price) * addon.count}/plate</Text>
                    </View>
                  ));
                })()}
                <View style={styles.divider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.totalLabel}>Total Price</Text>
                  <Text style={styles.totalValue}>₹{finalPrice}</Text>
                </View>
              </View>
            )}

            <Text style={styles.previewTitle}>Selected Courses</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {getSelectionSummary().map((cat: any, index: number) => {
                if (cat.selected?.length === 0) return null;
                let count = 0;
                return (
                  <View key={index} style={styles.previewCategoryCard}>
                    <View style={styles.previewCategoryHeader}>
                      <Text style={styles.previewCategoryTitle}>{cat.category}</Text>
                    </View>
                    {cat.selected.map((item: any, i: number) => {
                      count++;
                      const isExtra = count > cat.max;
                      return (
                        <View key={i}>
                          {count === cat.max + 1 && (
                            <Text style={styles.extraSectionTitle}>+ Extra Items</Text>
                          )}
                          <View style={styles.previewItemCard}>
                            <Image source={{ uri: item.imageUrl }} style={styles.previewItemImage} />
                            <Text style={styles.previewItemName}>{item.name}</Text>
                            {isExtra && (
                              <View style={styles.extraTag}>
                                <Text style={styles.extraTagText}>+₹{safeParsePrice(item.price || extraPrice)}/plate</Text>
                              </View>
                            )}
                            <Feather
                              name="check-circle"
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
              })}

              {/* ADD-ONS SECTION IN PREVIEW */}
              {(() => {
                const addonSummary = getAddonSummary();
                if (addonSummary.length === 0) return null;
                return (
                  <View style={styles.previewCategoryCard}>
                    <View style={styles.previewCategoryHeader}>
                      <Text style={styles.previewCategoryTitle}>Add-ons</Text>
                    </View>
                    {addonSummary.map((addon: any, idx: number) => (
                      <View key={idx} style={styles.previewItemCard}>
                        <Image 
                          source={{ uri: addon.imageUrl }} 
                          style={styles.previewItemImage} 
                        />
                        <Text style={styles.previewItemName}>{addon.name} × {addon.count}</Text>
                        <View style={styles.extraTag}>
                          <Text style={styles.extraTagText}>+₹{safeParsePrice(addon.price) * addon.count}/plate</Text>
                        </View>
                        <Feather
                          name="check-circle"
                          size={17}
                          color="#107C41"
                          style={{ marginLeft: "auto" }}
                        />
                      </View>
                    ))}
                  </View>
                );
              })()}
            </ScrollView>

            <TouchableOpacity
              style={styles.previewContinueButton}
              activeOpacity={0.88}
              onPress={() => {
                const modifiedChefObj = {
                  ...chef,
                  selectedCategoryName: incomingCategoryName || contextCategoryName,
                };
                const addonData = getAddonSummary();
                const extraBreakdownData = getExtraBreakdown();

                const updatedNavigationContext: any = {
                  serviceType: 'homemade',
                  previousScreen: 'CateringMenuItemScreen',
                  restaurantOrChef: modifiedChefObj,
                  menu: effectiveMenu,
                  selections: getSelectionSummary(),
                  orderDetails: params.orderDetails || null,
                  addons: addonData,
                  extraBreakdown: extraBreakdownData,
                };
                useNavigationStore.getState().setNavigationContext(updatedNavigationContext);
                setShowPreviewModal(false);
                if (isMealBox) {
                  router.push({
                    pathname: "/screens/MealBoxOrderReview" as any,
                    params: {
                      menu: JSON.stringify(effectiveMenu),
                      chef: JSON.stringify(modifiedChefObj),
                      selections: JSON.stringify(getSelectionSummary()),
                      addons: JSON.stringify(addonData),
                      extraBreakdown: JSON.stringify(extraBreakdownData),
                      totalItems: totalSelectedItems,
                      finalPrice: finalPrice,
                      extraPrice: totalExtraPrice,
                      extraItems: Object.values(extraItemsCount).reduce((sum, val) => sum + val, 0),
                      orderDetails: params.orderDetails || null,
                      category: incomingCategoryName || contextCategoryName,
                    },
                  });
                } else {
                  router.push({
                    pathname: "/screens/CateringOrderReview",
                    params: {
                      menu: JSON.stringify(effectiveMenu),
                      chef: JSON.stringify(modifiedChefObj),
                      selections: JSON.stringify(getSelectionSummary()),
                      addons: JSON.stringify(addonData),
                      extraBreakdown: JSON.stringify(extraBreakdownData),
                      totalItems: totalSelectedItems,
                      finalPrice: finalPrice,
                      extraPrice: totalExtraPrice,
                      extraItems: Object.values(extraItemsCount).reduce((sum, val) => sum + val, 0),
                      orderDetails: params.orderDetails || null,
                      category: incomingCategoryName || contextCategoryName,
                    },
                  });
                }
              }}
            >
              <Text style={styles.previewContinueText}>Confirm & Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* EXPANDABLE BOTTOM DETAILS POPOVER */}
      {showFooterPriceDetails && (
        <View style={styles.bottomPriceDetailsPopover}>
          <View style={styles.popoverHeaderRow}>
            <Text style={styles.popoverTitle}>Price Breakdown</Text>
            <TouchableOpacity 
              onPress={() => setShowFooterPriceDetails(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={18} color="#0B261D" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.popoverScrollArea} showsVerticalScrollIndicator={false}>
            {/* Base Platter Price */}
            <View style={styles.popoverRow}>
              <View style={styles.popoverLabelCol}>
                <Text style={styles.popoverLabel}>Base Platter Price</Text>
                <Text style={styles.popoverSubDetail}>Standard menu inclusions</Text>
              </View>
              <Text style={styles.popoverValue}>₹{platePrice}</Text>
            </View>

            {/* Extra Items Breakdown */}
            {detailedExtraItems.length > 0 && (
              <View style={styles.breakdownSectionGroup}>
                <Text style={styles.breakdownSectionTitle}>Extra Course Dishes</Text>
                {detailedExtraItems.map((item, idx) => (
                  <View key={`extra-breakdown-${idx}`} style={styles.popoverRow}>
                    <View style={styles.popoverLabelCol}>
                      <Text style={styles.popoverItemName}>{item.name}</Text>
                      <Text style={styles.popoverSubDetail}>{item.categoryName}</Text>
                    </View>
                    <Text style={styles.popoverExtraValue}>+₹{item.price}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Addons Breakdown */}
            {detailedAddons.length > 0 && (
              <View style={styles.breakdownSectionGroup}>
                <Text style={styles.breakdownSectionTitle}>Optional Add-ons</Text>
                {detailedAddons.map((addon, aIdx) => (
                  <View key={`addon-breakdown-${aIdx}`} style={styles.popoverRow}>
                    <View style={styles.popoverLabelCol}>
                      <Text style={styles.popoverItemName}>{addon.name} × {addon.count}</Text>
                      <Text style={styles.popoverSubDetail}>₹{addon.price} each</Text>
                    </View>
                    <Text style={styles.popoverExtraValue}>+₹{addon.price * addon.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.popoverDivider} />

          {/* Subtotal / Total Calculation */}
          <View style={styles.popoverRowTotal}>
            <View>
              <Text style={styles.popoverTotalLabel}>Total Per Plate</Text>
              <Text style={styles.popoverTotalHint}>Base rate + all selected extras</Text>
            </View>
            <Text style={styles.popoverTotalValue}>₹{finalPrice}</Text>
          </View>
        </View>
      )}

      {/* FIXED FOOTER CONTROLS */}
      <View style={styles.fixedBottomControlBar}>
        <View style={styles.footerPriceMetaColumn}>
          <Text style={styles.footerFinalPriceText}>₹{finalPrice} <Text style={styles.footerSubUnitText}>/ price per plate</Text></Text>
          <TouchableOpacity 
            onPress={() => setShowFooterPriceDetails((prev) => !prev)}
            activeOpacity={0.7}
            style={styles.viewDetailsTouchable}
          >
            <Text style={styles.viewDetailsLinkText}>View Details</Text>
            <Feather 
              name={showFooterPriceDetails ? "chevron-up" : "chevron-down"} 
              size={13} 
              color="#166538" 
              style={{ marginLeft: 3, marginTop: 1 }} 
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.footerActionSubmitBtn} onPress={() => setShowPreviewModal(true)} activeOpacity={0.88}>
          <Text style={styles.footerSubmitBtnText}>Preview Items</Text>
          <Feather name="eye" size={15} color="#FAF8F5" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#FAF8F5" 
  },
  scroll: { 
    flex: 1, 
    backgroundColor: "#FAF8F5" 
  },
  scrollContent: { 
    paddingBottom: 140 
  },
  heroContainer: { 
    position: "relative", 
    width: "100%", 
    height: 270,
    backgroundColor: "#E5ECE8",
  },
  heroImage: { 
    width: "100%", 
    height: "100%" 
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 38, 29, 0.25)",
  },
  floatingImageBackBtn: { 
    position: "absolute", 
    left: 18, 
    zIndex: 10 
  },
  backBtnCircle: { 
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
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  mainCardView: { 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    marginTop: -28, 
    paddingHorizontal: 20, 
    paddingTop: 24, 
    backgroundColor: "#FAF8F5" 
  },
  titleRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    marginBottom: 14 
  },
  planTitle: { 
    fontSize: 24, 
    fontWeight: "900", 
    color: "#0B261D", 
    letterSpacing: -0.5,
    flex: 1,
    marginRight: 12,
  },
  popularBadge: { 
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 56, 42, 0.08)", 
    borderRadius: 14, 
    paddingHorizontal: 10, 
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.15)",
  },
  popularText: { 
    fontSize: 10, 
    fontWeight: "800", 
    color: "#0F382A",
    letterSpacing: 0.6,
  },
  priceRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#FFFFFF", 
    borderRadius: 16, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    marginBottom: 18, 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  priceMetaLeft: {
    justifyContent: "center",
  },
  priceLabel: { 
    fontSize: 13, 
    fontWeight: "700", 
    color: "#0B261D" 
  },
  priceSubHint: {
    fontSize: 11,
    color: "#5B756C",
    fontWeight: "500",
    marginTop: 2,
  },
  priceValue: { 
    fontSize: 20, 
    fontWeight: "900", 
    color: "#0F382A",
    letterSpacing: -0.3,
  },
  summaryContainerBox: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#FFFFFF", 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.08)", 
    borderRadius: 20, 
    paddingVertical: 14, 
    paddingHorizontal: 6, 
    marginBottom: 24,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryColumn: { 
    flex: 1, 
    alignItems: "center",
    justifyContent: "center",
  },
  summaryIconCircle: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: "rgba(15, 56, 42, 0.06)", 
    alignItems: "center", 
    justifyContent: "center", 
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
  },
  summaryValueText: { 
    fontSize: 11.5, 
    fontWeight: "800", 
    color: "#0B261D",
    textAlign: "center",
  },
  summaryLabelText: { 
    fontSize: 10, 
    color: "#5B756C", 
    marginTop: 2,
    fontWeight: "500",
    textAlign: "center",
  },
  summaryDividerLine: { 
    width: 1, 
    height: 36, 
    backgroundColor: "rgba(15, 56, 42, 0.08)" 
  },
  whatsInPlateSection: { 
    marginBottom: 24 
  },
  sectionHeaderRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    marginBottom: 14 
  },
  sectionHeaderTitle: { 
    fontSize: 11.5, 
    fontWeight: "900", 
    color: "#0F382A", 
    letterSpacing: 0.8, 
    marginRight: 10 
  },
  sectionHeaderLine: { 
    flex: 1, 
    height: 1, 
    backgroundColor: "rgba(15, 56, 42, 0.12)" 
  },
  dishesHorizontalScroll: { 
    flexDirection: "row", 
    gap: 14, 
    paddingRight: 16 
  },
  dishCardItem: { 
    width: 66, 
    alignItems: "center" 
  },
  dishOuterCircle: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: "#FFFFFF", 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.12)", 
    alignItems: "center", 
    justifyContent: "center", 
    marginBottom: 6,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  dishAvatarImage: { 
    width: "100%", 
    height: "100%", 
    borderRadius: 24 
  },
  moreItemsOuterCircle: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: "rgba(15, 56, 42, 0.08)", 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.15)", 
    alignItems: "center", 
    justifyContent: "center", 
    marginBottom: 6 
  },
  moreItemsCountText: { 
    fontSize: 13, 
    fontWeight: "800", 
    color: "#0F382A" 
  },
  dishItemLabel: { 
    fontSize: 10.5, 
    fontWeight: "700", 
    color: "#0B261D", 
    textAlign: "center",
    lineHeight: 13,
  },
  customizeCateringSection: { 
    marginBottom: 14 
  },
  customizeCateringTitle: { 
    fontSize: 18, 
    fontWeight: "900", 
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  customizeCateringSubtitle: { 
    fontSize: 12.5, 
    color: "#5B756C", 
    marginTop: 4,
    fontWeight: "500",
  },
  mainCustomizerBody: { 
    paddingHorizontal: 20, 
    paddingBottom: 120 
  },
  categoryCardBlock: { 
    backgroundColor: "#FFFFFF", 
    borderRadius: 22, 
    padding: 16, 
    marginBottom: 18, 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
  },
  categoryHeaderRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: 14 
  },
  titleWithBadgeGroup: { 
    flexDirection: "row", 
    alignItems: "center", 
    flex: 1 
  },
  numberBadgeCircle: { 
    width: 26, 
    height: 26, 
    borderRadius: 13, 
    backgroundColor: "#166538", 
    justifyContent: "center", 
    alignItems: "center", 
    marginRight: 10 
  },
  numberBadgeText: { 
    color: "#FAF8F5", 
    fontSize: 12, 
    fontWeight: "900" 
  },
  addonIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#166538",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  categoryHeaderTitleText: { 
    fontSize: 16, 
    fontWeight: "800", 
    color: "#0B261D", 
    letterSpacing: -0.2 
  },
  chooseTagBadge: {
    backgroundColor: "rgba(15, 56, 42, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
  },
  simpleChooseText: { 
    fontSize: 11.5, 
    fontWeight: "800", 
    color: "#0F382A" 
  },
  labelSubTextContainer: { 
    flexDirection: "column" 
  },
  chooseTextLabel: { 
    fontSize: 11.5, 
    color: "#5B756C", 
    marginTop: 2,
    fontWeight: "500",
  },
  itemListGroup: { 
    flexDirection: "column" 
  },
  itemRowWrapper: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: "rgba(15, 56, 42, 0.05)",
  },
  itemRowWrapperActive: {
    backgroundColor: "rgba(15, 56, 42, 0.02)",
    borderRadius: 12,
    paddingHorizontal: 6,
  },
  itemThumbImage: { 
    width: 48, 
    height: 48, 
    borderRadius: 14, 
    marginRight: 14, 
    backgroundColor: "#E5ECE8" 
  },
  itemMetaMiddle: { 
    flex: 1, 
    justifyContent: "center" 
  },
  rowItemNameTitle: { 
    fontSize: 14.5, 
    fontWeight: "700", 
    color: "#0B261D" 
  },
  rowItemNameTitleActive: {
    color: "#0F382A",
    fontWeight: "800",
  },
  rowItemPriceText: { 
    fontSize: 12, 
    color: "#0F382A", 
    marginTop: 2, 
    fontWeight: "800" 
  },
  addButtonWrapper: { 
    justifyContent: "center", 
    alignItems: "center", 
    marginLeft: 10 
  },
  radioButtonCircle: { 
    width: 22, 
    height: 22, 
    borderRadius: 11, 
    borderWidth: 1.5, 
    borderColor: "rgba(15, 56, 42, 0.25)", 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "#FFFFFF" 
  },
  radioButtonCircleSelected: { 
    borderColor: "#0F382A",
    backgroundColor: "#0F382A",
  },
  radioButtonInnerDot: { 
    width: 9, 
    height: 9, 
    borderRadius: 4.5, 
    backgroundColor: "#FAF8F5" 
  },
  categoryFooterHintBox: { 
    flexDirection: "row", 
    alignItems: "center", 
    marginTop: 12, 
    backgroundColor: "rgba(15, 56, 42, 0.06)", 
    padding: 10, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.09)",
  },
  hintBoxMessageText: { 
    fontSize: 12, 
    color: "#0F382A", 
    flex: 1,
    fontWeight: "600",
    lineHeight: 16,
  },
  counterActionControlBox: { 
    flexDirection: "row", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.15)", 
    borderRadius: 18, 
    paddingHorizontal: 4,
    backgroundColor: "#FAF8F5",
  },
  controlBoxBtn: { 
    width: 28, 
    height: 28, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  controlBoxValueTouchable: {
    paddingHorizontal: 8,
    minWidth: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBoxValueText: { 
    fontSize: 13, 
    fontWeight: "800", 
    color: "#0B261D" 
  },
  controlBoxInput: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B261D",
    paddingHorizontal: 4,
    minWidth: 28,
    textAlign: "center",
    paddingVertical: 2,
  },
  bottomPriceDetailsPopover: {
    position: "absolute",
    bottom: 84,
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.1)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 998,
  },
  popoverScrollArea: {
    maxHeight: 180,
  },
  popoverHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  popoverTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  breakdownSectionGroup: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 56, 42, 0.05)",
  },
  breakdownSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#166538",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  popoverRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  popoverLabelCol: {
    flex: 1,
    paddingRight: 8,
  },
  popoverLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B261D",
  },
  popoverItemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0B261D",
  },
  popoverSubDetail: {
    fontSize: 10.5,
    color: "#5B756C",
    marginTop: 1,
    fontWeight: "500",
  },
  popoverValue: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0B261D",
  },
  popoverExtraValue: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#166538",
  },
  popoverDivider: {
    height: 1,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    marginVertical: 10,
  },
  popoverRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  popoverTotalLabel: {
    fontSize: 14.5,
    fontWeight: "900",
    color: "#0B261D",
  },
  popoverTotalHint: {
    fontSize: 10.5,
    color: "#5B756C",
    fontWeight: "500",
    marginTop: 1,
  },
  popoverTotalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0B261D",
  },
  fixedBottomControlBar: { 
    position: "absolute", 
    bottom: 0, 
    left: 0, 
    right: 0, 
    height: 84, 
    backgroundColor: "#FFFFFF", 
    borderTopWidth: 1, 
    borderTopColor: "rgba(15, 56, 42, 0.08)", 
    paddingHorizontal: 20, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    zIndex: 999,
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  footerPriceMetaColumn: { 
    flexDirection: "column",
    justifyContent: "center",
  },
  footerFinalPriceText: { 
    fontSize: 20, 
    fontWeight: "900", 
    color: "#0B261D",
    letterSpacing: -0.4,
  },
  footerSubUnitText: {
    fontSize: 12,
    color: "#5B756C",
    fontWeight: "600",
  },
  viewDetailsTouchable: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  viewDetailsLinkText: {
    fontSize: 12,
    color: "#166538",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  footerActionSubmitBtn: { 
    backgroundColor: "#166538", 
    height: 48, 
    borderRadius: 24, 
    paddingHorizontal: 22, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  footerSubmitBtnText: { 
    color: "#FAF8F5", 
    fontSize: 14.5, 
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  modalRootOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11, 38, 29, 0.45)",
  },
  modalCenteredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: { 
    width: "84%", 
    backgroundColor: "#FFFFFF", 
    borderRadius: 24, 
    padding: 24, 
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  modalAlertIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(15, 56, 42, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  modalTitle: { 
    fontSize: 19, 
    fontWeight: "900", 
    color: "#0B261D", 
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  modalMessage: { 
    fontSize: 14, 
    color: "#4F6B61", 
    lineHeight: 21, 
    textAlign: "center", 
    marginBottom: 20,
    fontWeight: "500",
  },
  modalButton: { 
    backgroundColor: "#166538", 
    paddingVertical: 13, 
    paddingHorizontal: 36, 
    borderRadius: 20,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  modalButtonText: { 
    color: "#FAF8F5", 
    fontSize: 14.5, 
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  backToTopButton: { 
    position: "absolute", 
    bottom: 96, 
    right: 18, 
    zIndex: 700 
  },
  backToTopTouchable: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#166538", 
    paddingVertical: 9, 
    paddingHorizontal: 14, 
    borderRadius: 24,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  backToTopText: { 
    color: "#FAF8F5", 
    fontSize: 13, 
    fontWeight: "800", 
    marginLeft: 5 
  },
  compactStickyHeader: { 
    position: "absolute", 
    top: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: "#FAF8F5", 
    paddingHorizontal: 16, 
    paddingBottom: 10, 
    zIndex: 500, 
    borderBottomWidth: 1, 
    borderBottomColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  titleRowCompact: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    marginBottom: 8 
  },
  compactBackBtn: { 
    width: 32, 
    height: 32, 
    justifyContent: "center", 
    alignItems: "flex-start" 
  },
  centerTitleWrapper: { 
    flex: 1, 
    alignItems: "center" 
  },
  planTitleCompact: { 
    fontSize: 16, 
    fontWeight: "800", 
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  compactPriceSub: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#166538",
    marginTop: 1,
  },
  compactBackBtnPlaceholder: { 
    width: 32 
  },
  stickyPlateContainer: { 
    paddingHorizontal: 4, 
    gap: 14, 
    flexDirection: "row", 
    alignItems: "center" 
  },
  stickyDishItem: { 
    alignItems: "center", 
    width: 48 
  },
  previewModalContent: { 
    width: "100%", 
    height: "82%", 
    backgroundColor: "#FAF8F5", 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    paddingTop: 16, 
    paddingHorizontal: 18, 
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  previewCloseBtn: { 
    position: "absolute", 
    top: -24, 
    alignSelf: "center", 
    backgroundColor: "#166538", 
    width: 46, 
    height: 46, 
    borderRadius: 23, 
    justifyContent: "center", 
    alignItems: "center", 
    zIndex: 50,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  previewHeaderCard: { 
    backgroundColor: "#FFFFFF", 
    borderRadius: 20, 
    padding: 14, 
    marginTop: 8,
    marginBottom: 14, 
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A", 
    shadowOffset: { width: 0, height: 3 }, 
    shadowOpacity: 0.04, 
    shadowRadius: 8, 
    elevation: 2 
  },
  previewHeaderRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between" 
  },
  previewHeaderImage: { 
    width: 48, 
    height: 48, 
    borderRadius: 14, 
    marginRight: 10,
    backgroundColor: "#E5ECE8",
  },
  previewTitleInline: { 
    flex: 1, 
    marginHorizontal: 6 
  },
  previewMainTitle: { 
    fontSize: 16, 
    fontWeight: "900", 
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  previewSubInline: { 
    fontSize: 12, 
    color: "#5B756C", 
    marginTop: 2,
    fontWeight: "500",
  },
  previewPricePillSmall: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#166538", 
    paddingHorizontal: 12, 
    paddingVertical: 7, 
    borderRadius: 18,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  previewPriceInline: { 
    color: "#FAF8F5", 
    fontSize: 12.5, 
    fontWeight: "800" 
  },
  previewTitle: { 
    fontSize: 18, 
    fontWeight: "900", 
    color: "#0B261D", 
    marginBottom: 12,
    letterSpacing: -0.3,
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
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: 10 
  },
  previewCategoryTitle: { 
    fontSize: 14.5, 
    fontWeight: "800", 
    color: "#0B261D",
    letterSpacing: -0.2,
  },
  previewItemCard: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#FAF8F5", 
    padding: 10, 
    borderRadius: 12, 
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.06)",
  },
  previewItemImage: { 
    width: 38, 
    height: 38, 
    borderRadius: 10, 
    marginRight: 10,
    backgroundColor: "#E5ECE8",
  },
  previewItemName: { 
    fontSize: 13.5, 
    fontWeight: "700",
    color: "#0B261D",
    flex: 1,
  },
  priceBreakdownCard: { 
    marginTop: 4, 
    marginBottom: 14,
    backgroundColor: "#FFFFFF", 
    borderRadius: 18, 
    padding: 14, 
    borderWidth: 1, 
    borderColor: "rgba(15, 56, 42, 0.08)" 
  },
  breakdownTitle: { 
    fontSize: 14.5, 
    fontWeight: "900", 
    marginBottom: 10,
    color: "#0B261D",
  },
  breakdownRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    marginBottom: 6 
  },
  breakdownLabel: { 
    fontSize: 13.5, 
    fontWeight: "600",
    color: "#4F6B61",
  },
  breakdownSubLabel: { 
    fontSize: 13,
    color: "#5B756C",
    fontWeight: "500",
  },
  breakdownValue: { 
    fontSize: 13.5, 
    fontWeight: "700",
    color: "#0B261D",
  },
  extraValue: { 
    fontSize: 13, 
    fontWeight: "800", 
    color: "#0F382A" 
  },
  totalLabel: { 
    fontSize: 14.5, 
    fontWeight: "900",
    color: "#0B261D",
  },
  extraTag: { 
    backgroundColor: "rgba(15, 56, 42, 0.08)", 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 8, 
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.12)",
  },
  extraTagText: { 
    fontSize: 10.5, 
    fontWeight: "800", 
    color: "#0F382A" 
  },
  extraSectionTitle: { 
    fontSize: 12, 
    fontWeight: "800", 
    color: "#0F382A", 
    marginTop: 6, 
    marginBottom: 6, 
    marginLeft: 2 
  },
  previewContinueButton: { 
    marginTop: 10, 
    backgroundColor: "#166538", 
    paddingVertical: 14, 
    borderRadius: 24, 
    alignItems: "center", 
    width: "100%",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  previewContinueText: { 
    color: "#FAF8F5", 
    fontSize: 15, 
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  divider: { 
    height: 1, 
    backgroundColor: "rgba(15, 56, 42, 0.08)", 
    marginVertical: 10 
  },
  totalValue: { 
    fontSize: 15, 
    fontWeight: "900", 
    color: "#0B261D" 
  },
  flyImage: { 
    position: "absolute", 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    top: 360, 
    left: width / 232, 
    zIndex: 900 
  },
});