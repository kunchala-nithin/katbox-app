import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { BlurView } from "expo-blur";
import { Alert, TouchableWithoutFeedback, LayoutChangeEvent } from "react-native";
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
// ✅ The scroll position where the sticky header is considered fully
//    settled. The collapse animation is anchored to this window so that
//    opacity, scale, and margin all resolve at exactly the same moment.
const STICKY_SETTLE_START = HEADER_COLLAPSE_THRESHOLD - 80;
const STICKY_SETTLE_END = HEADER_COLLAPSE_THRESHOLD;
// ✅ Fallback height of the sticky header content (title row + dish strip).
//    The real height is measured via onLayout on the sticky header and stored
//    in `stickyHeaderHeightRef`; this constant is only used before that
//    measurement is available.
const STICKY_CONTENT_HEIGHT = 130;
// ✅ Approximate rendered height of the "WHAT'S IN THE PLATTER" section.
//    Used as the reserved-space height so we can animate it away via
//    `scaleY` (GPU-only) without ever touching layout.
const WHATS_IN_PLATE_RESERVED_HEIGHT = 120;
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
  // ✅ Track the exact item that triggered the limit modal so we can activate it immediately
  const [triggeredItemId, setTriggeredItemId] = useState<string | null>(null);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // ✅ Track which items were added as "extra" (paid beyond the base max).
  //    These items will render an "Undo" button instead of the radio circle,
  //    and display a small "Extra Item" label at the top-right of the card.
  //    Key format: `${catIndex}_${itemId}`
  const [extraAddedItems, setExtraAddedItems] = useState<Set<string>>(new Set());

  // ✅ Throttle refs so we don't call setState on every scroll tick.
  //    We only flip React state when the boolean actually changes, and we
  //    skip redundant sets inside the same frame.
  const stickyActiveRef = useRef(false);
  const backToTopRef = useRef(false);

  // ✅ Measured height of the "WHAT'S IN THE PLATTER" section so we can
  //    size its reserved space exactly. Measured once on layout.
  const [whatsInPlateHeight, setWhatsInPlateHeight] = useState(0);
  const handleWhatsInPlateLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - whatsInPlateHeight) > 1) {
      setWhatsInPlateHeight(h);
    }
  }, [whatsInPlateHeight]);

  // ✅ Refs for each category card so we can scroll to an unselected
  //    category when the customer taps "Select all (X/Y)".
  const categoryRefs = useRef<Record<number, View | null>>({});
  const categoryYPositions = useRef<Record<number, number>>({});

  // ✅ The category card's layout.y is relative to its PARENT
  //    (`mainCustomizerBody`), NOT to the scroll content. To scroll to it
  //    accurately we also need the y-offset of `mainCustomizerBody` inside
  //    the ScrollView content. It is measured here.
  const customizerBodyYRef = useRef(0);
  const handleCustomizerBodyLayout = useCallback((e: LayoutChangeEvent) => {
    customizerBodyYRef.current = e.nativeEvent.layout.y;
  }, []);

  // ✅ Real measured height of the sticky header (safe-area + title row +
  //    dish strip). Used to place the target category right below it so the
  //    whole category card is visible and never hidden behind the header.
  const stickyHeaderHeightRef = useRef(0);
  const handleStickyHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      stickyHeaderHeightRef.current = h;
    }
  }, []);

  const handleCategoryLayout = useCallback((catIndex: number, e: LayoutChangeEvent) => {
    // Store the y position relative to the parent (mainCustomizerBody).
    const y = e.nativeEvent.layout.y;
    if (y >= 0) {
      categoryYPositions.current[catIndex] = y;
    }
  }, []);

  // ✅ Track which category is currently being highlighted so we can
  //    stop its pulse animation once the customer interacts with it.
  const [pulseCategoryIndex, setPulseCategoryIndex] = useState<number | null>(null);
  const categoryPulseAnims = useRef<Record<number, Animated.Value>>({}).current;
  const categoryPulseLoops = useRef<Record<number, Animated.CompositeAnimation | null>>({}).current;
  const getCategoryPulseAnim = (catIndex: number) => {
    if (!categoryPulseAnims[catIndex]) {
      categoryPulseAnims[catIndex] = new Animated.Value(0);
    }
    return categoryPulseAnims[catIndex];
  };

  // ─── Read incoming address params (forwarded from CateringMealPlans) ───
  // These are the final hops toward CateringOrderReview.
  const incomingActiveAddressParam =
    typeof params.activeAddressParam === "string" ? (params.activeAddressParam as string) : "";
  const incomingSavedAddressesParam =
    typeof params.savedAddressesParam === "string" ? (params.savedAddressesParam as string) : "";

  const forwardAddressParams = () => ({
    activeAddressParam: incomingActiveAddressParam,
    savedAddressesParam: incomingSavedAddressesParam,
  });

  const itemScaleAnims = useRef<Record<string, Animated.Value>>({}).current;

  const getItemScaleAnim = (id: string) => {
    if (!itemScaleAnims[id]) {
      itemScaleAnims[id] = new Animated.Value(1);
    }
    return itemScaleAnims[id];
  };

  // ✅ Per-category animated value used to shake / pulse the "Choose any N" pill
  //    whenever the user tries to push a zero-priced dish into the paid extra slot.
  const choosePillAnims = useRef<Record<number, Animated.Value>>({}).current;

  const getChoosePillAnim = (catIndex: number) => {
    if (!choosePillAnims[catIndex]) {
      choosePillAnims[catIndex] = new Animated.Value(0);
    }
    return choosePillAnims[catIndex];
  };

  const triggerChoosePillShake = (catIndex: number) => {
    const anim = getChoosePillAnim(catIndex);
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  };

  let menuParam: any = null;
  let chef: any = null;
  let incomingCategoryName = params.category as string | undefined;
  try {
    if (params.menu) menuParam = JSON.parse(params.menu as string);
    if (params.chef) chef = JSON.parse(params.chef as string);
  } catch (e) { }

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
  } catch (e) { }

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

  // ✅ Resolves the *effective* per-plate extra price for a dish.
  //    A dish explicitly priced at 0 (or "0"/"0.00") stays at ₹0 instead of
  //    falling back to the plan level `extraPrice`. This is what lets us
  //    detect "free" extra dishes and refuse to push them into a paid slot.
  const getItemExtraPrice = (item: any): number => {
    if (!item) return safeParsePrice(extraPrice);
    const raw = item.price;
    if (raw === null || raw === undefined || raw === "") return safeParsePrice(extraPrice);
    return safeParsePrice(raw);
  };

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

  // ✅ Gate the "Continue" action behind full completion of every course.
  //    A category is considered "complete" once its base max selection count is reached.
  const requiredCategoryCount = daawathCategories.length;
  const completedCategoryCount = daawathCategories.reduce((count: number, _cat: any, index: number) => {
    const selectedForCategory = selections[index]?.size || 0;
    return count + (selectedForCategory >= getMaxForCategory(index) ? 1 : 0);
  }, 0);
  // Vacuously true when there are no categories to select from.
  const allCategoriesAtMax = completedCategoryCount >= requiredCategoryCount;

  // ✅ The first category index that hasn't reached its base max yet.
  //    Used by the "Select all (X/Y)" footer button to jump to the next
  //    category the customer needs to complete.
  const firstIncompleteCategoryIndex = useMemo(() => {
    for (let i = 0; i < daawathCategories.length; i++) {
      const selectedForCategory = selections[i]?.size || 0;
      if (selectedForCategory < getMaxForCategory(i)) {
        return i;
      }
    }
    return -1;
  }, [selections, daawathCategories]);

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
      } catch (_) { }
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

  // ✅ We now render ALL platter items dynamically.
  //    The old `VISIBLE_PLATE_COUNT = 4` slice + `overflowCount` "+N More" pill
  //    has been removed so every item is available in both the compact sticky
  //    header (horizontally scrollable) and the main "What's in the Platter"
  //    horizontal strip.
  const allPlateItems = parseDynamicPlateItems();

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

  // ✅ Helper to check if an item was added as an "extra" paid item
  const isExtraAddedItem = (catIndex: number, itemId: string): boolean => {
    return extraAddedItems.has(`${catIndex}_${itemId}`);
  };

  // ✅ Remove an extra added item (Undo action)
  const handleUndoExtraItem = (catIndex: number, itemId: string) => {
    const cat = daawathCategories[catIndex];
    const items = cat?.items || [];
    const item = items.find((p: any, i: number) => (p.id || i.toString()) === itemId);
    const itemExtraPrice = getItemExtraPrice(item);

    // Remove from selections
    setSelections((prev) => {
      const curr = prev[catIndex] || new Set<string>();
      const newSet = new Set(curr);
      newSet.delete(itemId);
      return { ...prev, [catIndex]: newSet };
    });

    // Decrement extra items count for this category
    setExtraItemsCount((prev) => ({
      ...prev,
      [catIndex]: Math.max(0, (prev[catIndex] || 0) - 1),
    }));

    // Subtract the price
    setTotalExtraPrice((prev) => Math.max(0, safeParsePrice(prev) - itemExtraPrice));

    // Remove from extraAddedItems set
    setExtraAddedItems((prev) => {
      const newSet = new Set(prev);
      newSet.delete(`${catIndex}_${itemId}`);
      return newSet;
    });

    // Reset limit acknowledgment if we're now at or below base max
    const remainingCount = (selections[catIndex]?.size || 0) - 1;
    if (remainingCount <= getMaxForCategory(catIndex)) {
      setLimitAcknowledged((prevAck) => ({
        ...prevAck,
        [catIndex]: false,
      }));
    }
  };

  // ✅ Accepts an optional `forceAck` flag.
  //    When true, the acknowledgment gate is bypassed so the item is added
  //    immediately (used by the "Continue Adding" button in the limit modal).
  //
  // ✅ ZERO-PRICE GUARD:
  //    If the course limit is already reached AND the tapped dish resolves to a
  //    ₹0 extra price, we do NOT open the limit modal and we do NOT add the dish.
  //    Instead we shake the "Choose any N" pill of that category so the user
  //    understands they must pick from the already-allowed selection.
  const toggleAdded = (catIndex: number, itemId: string, forceAck: boolean = false) => {
    const scaleAnim = getItemScaleAnim(itemId);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 90, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
    ]).start();

    // ✅ Stop the pulse highlight once the customer interacts with this category.
    if (pulseCategoryIndex === catIndex) {
      // Stop any active loop for this category.
      const loop = categoryPulseLoops[catIndex];
      if (loop) {
        loop.stop();
        categoryPulseLoops[catIndex] = null;
      }
      const anim = getCategoryPulseAnim(catIndex);
      anim.setValue(0);
      setPulseCategoryIndex(null);
    }

    const cat = daawathCategories[catIndex];
    const baseMax = getMaxForCategory(catIndex);
    const extraCountLocal = extraItemsCount[catIndex] || 0;
    const max = baseMax + extraCountLocal;
    const currentSet = selections[catIndex] || new Set<string>();
    const items = cat.items || [];

    const item = items.find((p: any, i: number) => (p.id || i.toString()) === itemId);
    const itemExtraPrice = getItemExtraPrice(item);

    if (!currentSet.has(itemId) && currentSet.size >= max) {
      // ✅ Zero-priced dishes can never be promoted into the paid "extra" slot.
      if (itemExtraPrice <= 0) {
        setSelectedCategoryIndex(catIndex);
        triggerChoosePillShake(catIndex);
        return;
      }

      const isAcked = forceAck || !!limitAcknowledged[catIndex];
      if (!isAcked) {
        setTriggeredItemPrice(itemExtraPrice);
        // ✅ Store the exact item that needs to be activated on Continue
        setTriggeredItemId(itemId);
        setSelectedCategoryIndex(catIndex);
        setShowLimitModal(true);
        return;
      } else {
        setExtraItemsCount((prev) => ({
          ...prev,
          [catIndex]: (prev[catIndex] || 0) + 1,
        }));
        setTotalExtraPrice((prev) => safeParsePrice(prev) + itemExtraPrice);
        // ✅ Mark this item as an "extra added" item so it shows Undo + "Extra Item" label
        setExtraAddedItems((prev) => {
          const newSet = new Set(prev);
          newSet.add(`${catIndex}_${itemId}`);
          return newSet;
        });
      }
    }

    setSelections((prev) => {
      const curr = prev[catIndex] || new Set<string>();
      const newSet = new Set(curr);

      if (newSet.has(itemId)) {
        const prevSize = newSet.size;
        newSet.delete(itemId);
        const removedItemPrice = getItemExtraPrice(item);
        if (prevSize > baseMax) {
          setExtraItemsCount((prevExtra) => ({
            ...prevExtra,
            [catIndex]: Math.max(0, (prevExtra[catIndex] || 0) - 1),
          }));
          setTotalExtraPrice((prevExtraTotal) => Math.max(0, safeParsePrice(prevExtraTotal) - removedItemPrice));
          // ✅ Remove from extraAddedItems set when unselected
          setExtraAddedItems((prevSet) => {
            const newSet2 = new Set(prevSet);
            newSet2.delete(`${catIndex}_${itemId}`);
            return newSet2;
          });
        }
        if (newSet.size <= baseMax) {
          setLimitAcknowledged((prevAck) => ({
            ...prevAck,
            [catIndex]: false,
          }));
        }
      } else {
        newSet.add(itemId);
        if (item?.imageUrl) {
          triggerCartFlyAnimation(item.imageUrl);
        }
      }
      return { ...prev, [catIndex]: newSet };
    });
  };

  // ✅ Centralised dismiss handler that also clears the trigger state.
  const dismissLimitModal = () => {
    setShowLimitModal(false);
    setTriggeredItemPrice(0);
    setTriggeredItemId(null);
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

  // ✅ Toggle handler for the simple Add / Remove button on the addon rows.
  //    First tap → adds the addon price to the base, flips the button to Remove.
  //    Second tap → subtracts the price, flips the button back to Add.
  const toggleAddonOnce = (addonId: string, price: number) => {
    const safeItemPrice = safeParsePrice(price);
    setExtraItemsCount((prev) => {
      const currentVal = prev[addonId as any] || 0;
      const isCurrentlyAdded = currentVal > 0;
      const newVal = isCurrentlyAdded ? 0 : 1;
      if (!isCurrentlyAdded) {
        setTotalExtraPrice((p) => safeParsePrice(p) + safeItemPrice);
      } else {
        setTotalExtraPrice((p) => Math.max(0, safeParsePrice(p) - safeItemPrice));
      }
      return { ...prev, [addonId as any]: newVal };
    });
  };

  const scrollToTop = () => {
    productScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // ✅ JS-side scroll handler. Runs alongside the native-driven Animated.event
  //    (via its `listener` option) so the UI-thread animation stays smooth
  //    while React state is only flipped when a boolean actually changes.
  //    - `isStickyActive` enables touches on the sticky header (so its
  //      horizontal dish strip can be scrolled) and disables touches on the
  //      main "What's in the platter" strip once it has collapsed.
  //    - The back-to-top button fades in/out past the threshold.
  const handleScrollEvent = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;

    const shouldStickyBeActive = y >= HEADER_COLLAPSE_THRESHOLD - 40;
    if (shouldStickyBeActive !== stickyActiveRef.current) {
      stickyActiveRef.current = shouldStickyBeActive;
      setIsStickyActive(shouldStickyBeActive);
    }

    const shouldShowBackToTop = y > SHOW_BACK_TO_TOP_THRESHOLD;
    if (shouldShowBackToTop !== backToTopRef.current) {
      backToTopRef.current = shouldShowBackToTop;
      setShowBackToTop(shouldShowBackToTop);
      Animated.timing(backToTopOpacity, {
        toValue: shouldShowBackToTop ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, []);

  // ✅ Scroll to a specific category card within the ScrollView.
  //    Target = (offset of the customizer body inside the scroll content)
  //           + (offset of the category inside the customizer body)
  //           − (real sticky header height) − small breathing gap.
  //    This lands the category's top edge just below the sticky header, so the
  //    entire category card is visible and never tucked underneath it.
  const scrollToCategory = useCallback((catIndex: number) => {
    const catY = categoryYPositions.current[catIndex];
    if (catY === undefined || catY === null) return;
    const stickyHeight =
      stickyHeaderHeightRef.current > 0
        ? stickyHeaderHeightRef.current
        : Math.max(insets.top, 12) + STICKY_CONTENT_HEIGHT;
    const targetY = Math.max(
      0,
      customizerBodyYRef.current + catY - stickyHeight - 12
    );
    productScrollRef.current?.scrollTo({ y: targetY, animated: true });
  }, [insets.top]);

  // ✅ Pulse a category's "Choose any N" pill so the customer notices
  //    which category still needs attention. The pulse runs continuously
  //    until the customer taps a dish in that category.
  const startCategoryPulse = useCallback((catIndex: number) => {
    // Stop any previously running loop first.
    Object.keys(categoryPulseLoops).forEach((key) => {
      const loop = categoryPulseLoops[Number(key)];
      if (loop) {
        loop.stop();
        categoryPulseLoops[Number(key)] = null;
      }
    });
    const anim = getCategoryPulseAnim(catIndex);
    anim.setValue(0);
    setPulseCategoryIndex(catIndex);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    categoryPulseLoops[catIndex] = loop;
    loop.start();
  }, []);

  // ✅ Handle the "Select all (X/Y)" button tap.
  //    Scrolls to the first incomplete category and starts its pulse so the
  //    customer immediately sees which course still needs a selection.
  const handleSelectAllPrompt = useCallback(() => {
    if (firstIncompleteCategoryIndex < 0) return;
    // Close the price popover if it's open so it doesn't cover the category.
    setShowFooterPriceDetails(false);
    scrollToCategory(firstIncompleteCategoryIndex);
    // Delay slightly so the scroll animation settles before the pulse kicks in,
    // making the pulse feel like a "you are here" cue.
    setTimeout(() => {
      startCategoryPulse(firstIncompleteCategoryIndex);
    }, 450);
  }, [firstIncompleteCategoryIndex, scrollToCategory, startCategoryPulse]);

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
            price: getItemExtraPrice(item),
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
    const newExtraAddedSet = new Set<string>();
    incomingSelections.forEach((cat: any, index: number) => {
      const baseMaxLocal = getMaxForCategory(index);
      const selectedItems = cat.selected || [];
      if (selectedItems.length > baseMaxLocal) {
        const extra = selectedItems.length - baseMaxLocal;
        extraCounts[index] = extra;
        selectedItems.slice(baseMaxLocal).forEach((item: any) => {
          totalExtra += getItemExtraPrice(item);
          const itemId = item._id || item.id || "";
          if (itemId) {
            newExtraAddedSet.add(`${index}_${itemId}`);
          }
        });
      }
    });
    setExtraItemsCount(extraCounts);
    setTotalExtraPrice(totalExtra);
    setExtraAddedItems(newExtraAddedSet);
  };

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

  // Delay threshold: only show skeleton if loading exceeds 200ms (avoids flash on fast responses)
  useEffect(() => {
    const isLoading = menuLoading || loadingItems;
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [menuLoading, loadingItems]);

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
        // Forward address params back so the chain stays intact
        ...forwardAddressParams(),
      },
    });
  };

  if (showSkeleton || !effectiveMenu || !chef) {
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

  // ✅ SMOOTH COLLAPSE — opacity + scaleY share the same input range so both
  //    resolve in perfect lockstep. We ONLY animate transform + opacity,
  //    which are GPU-only properties — no layout pass, no jank.
  const whatsInPlateOpacity = scrollY.interpolate({
    inputRange: [STICKY_SETTLE_START, STICKY_SETTLE_END],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // ✅ SMOOTH COLLAPSE — scaleY collapses the section visually without ever
  //    triggering a layout pass. The outer wrapper reserves a fixed height so
  //    the surrounding content never reflows during the animation.
  const whatsInPlateScaleY = scrollY.interpolate({
    inputRange: [STICKY_SETTLE_START, STICKY_SETTLE_END],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // ✅ SMOOTH COLLAPSE — the reserved outer wrapper's height shrinks via a
  //    static style that is only re-measured once on layout. We use a
  //    transform-driven inner collapse and clip overflow on the outer wrapper
  //    so no layout thrash ever happens.
  const reservedHeight = whatsInPlateHeight > 0 ? whatsInPlateHeight : WHATS_IN_PLATE_RESERVED_HEIGHT;

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
        pointerEvents={showBackToTop ? "auto" : "none"}
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
        onLayout={handleStickyHeaderLayout}
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
        {/* ✅ Every platter item is rendered here in a horizontally scrollable strip.
            No more "+N More" overflow pill. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stickyPlateContainer}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          overScrollMode="never"
        >
          {allPlateItems.map((dish) => (
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
        </ScrollView>
      </Animated.View>

      {/* CORE SCROLL CONTAINER */}
      <Animated.ScrollView
        ref={productScrollRef as any}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            // ✅ useNativeDriver: true lets the animation run entirely on the
            //    UI thread — this is the single biggest fix for scroll lag.
            //    The `listener` runs on the JS thread and only flips React
            //    state when a boolean changes (sticky active / back-to-top).
            useNativeDriver: true,
            listener: handleScrollEvent,
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

          {/* ✅ "WHAT'S IN THE PLATTER" — SMOOTH GPU-ONLY COLLAPSE.
              The outer wrapper reserves a FIXED height (measured once) so the
              surrounding content NEVER reflows during the animation. Inside,
              an inner Animated.View collapses via `scaleY` + `opacity` — both
              GPU-only, both use the native driver, both perfectly smooth.
              The outer wrapper clips overflow so the scaled content doesn't
              bleed into neighboring views.

              ✅ FIX: pointerEvents used to be permanently "none", which
              blocked the horizontal dish strip from receiving swipes. It is
              now "auto" while the section is visible and only switches to
              "none" once it has collapsed into the sticky header. */}
          <View
            style={{
              height: reservedHeight,
              marginBottom: 24,
              overflow: "hidden",
            }}
            pointerEvents={isStickyActive ? "none" : "auto"}
          >
            <Animated.View
              style={{
                opacity: whatsInPlateOpacity,
                transform: [{ scaleY: whatsInPlateScaleY }],
                // ✅ Anchor the scale at the top so the section collapses
                //    upward toward the sticky header.
                transformOrigin: "top",
              }}
              onLayout={handleWhatsInPlateLayout}
            >
              <View style={styles.whatsInPlateSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderTitle}>WHAT'S IN THE PLATTER</Text>
                  <View style={styles.sectionHeaderLine} />
                </View>
                {loadingItems ? (
                  <ActivityIndicator size="small" color="#0F382A" style={{ marginVertical: 14 }} />
                ) : (
                  /* ✅ Shows ALL platter items in a horizontal scroll — no truncation. */
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dishesHorizontalScroll}
                    scrollEnabled={true}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                    overScrollMode="never"
                  >
                    {allPlateItems.map((dish) => (
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
                  </ScrollView>
                )}
              </View>
            </Animated.View>
          </View>

          <View style={styles.customizeCateringSection}>
            <Text style={styles.customizeCateringTitle}>Customize Platter Items</Text>
            <Text style={styles.customizeCateringSubtitle}>
              Select dishes from each category to build your custom platter
            </Text>
          </View>
        </View>

        {/* CUSTOMIZER CONFIGURATION BODY SECTION
            ✅ NOTE: We intentionally do NOT add any extra top padding here.
            The collapse of "WHAT'S IN THE PLATTER" already reclaims all the
            vertical space, so "Customize Platter Items" sits flush right
            below the sticky header with zero gap.
            ✅ onLayout captures this body's y-offset inside the scroll
            content so "Select all" can compute an accurate scroll target. */}
        <View style={styles.mainCustomizerBody} onLayout={handleCustomizerBodyLayout}>
          {daawathCategories.map((category: any, catIndex: number) => {
            const maxCount = getMaxForCategory(catIndex);
            const items = category.items || [];
            const currentSelections = selections[catIndex] || new Set<string>();
            const selectedArray = Array.from(currentSelections);
            const extraSelectedIds = new Set(selectedArray.slice(maxCount));
            const scaleAnim = getItemScaleAnim;
            // ✅ animated value driving the shake / pulse of the "Choose any N" pill
            const choosePillAnim = getChoosePillAnim(catIndex);
            // ✅ animated value driving the continuous highlight pulse when
            //    the customer taps "Select all (X/Y)" and lands on this category.
            const categoryPulseAnim = getCategoryPulseAnim(catIndex);
            const isPulsing = pulseCategoryIndex === catIndex;

            return (
              <View
                key={catIndex}
                ref={(r) => { categoryRefs.current[catIndex] = r; }}
                onLayout={(e) => handleCategoryLayout(catIndex, e)}
                style={styles.categoryCardBlock}
              >
                <View style={styles.categoryHeaderRow}>
                  <View style={styles.titleWithBadgeGroup}>
                    <View style={styles.numberBadgeCircle}>
                      <MaterialIcons name="room-service" size={14} color="#FAF8F5" />
                    </View>
                    <Text style={styles.categoryHeaderTitleText}>{category.name}</Text>
                  </View>
                  {/* ✅ Animated "Choose any N" pill.
                      - Shakes when a ₹0 extra dish is tapped.
                      - Pulses continuously (scale + glow border) when the
                        customer lands here via "Select all (X/Y)". */}
                  <Animated.View
                    style={[
                      styles.chooseTagBadge,
                      isPulsing && styles.chooseTagBadgePulsing,
                      {
                        transform: [
                          {
                            translateX: choosePillAnim.interpolate({
                              inputRange: [-1, 1],
                              outputRange: [-6, 6],
                            }),
                          },
                          {
                            scale: Animated.multiply(
                              choosePillAnim.interpolate({
                                inputRange: [-1, 0, 1],
                                outputRange: [1.06, 1, 1.06],
                              }),
                              categoryPulseAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.12],
                              })
                            ),
                          },
                        ],
                        opacity: isPulsing
                          ? categoryPulseAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 0.85],
                            })
                          : 1,
                      },
                    ]}
                  >
                    <Text style={styles.simpleChooseText}>Choose any {maxCount}</Text>
                  </Animated.View>
                </View>

                <View style={styles.itemListGroup}>
                  {items.map((item: any, index: number) => {
                    const itemId = item._id || item.id || index.toString();
                    const isAdded = currentSelections.has(itemId);
                    const isExtraItem = isAdded && extraSelectedIds.has(itemId);
                    // ✅ Check if this item was added as an "extra" paid item via "Continue Adding"
                    const isExtraAdded = isExtraAddedItem(catIndex, itemId);
                    const itemPrice = getItemExtraPrice(item);
                    const itemScale = scaleAnim(itemId);

                    return (
                      <TouchableOpacity
                        key={itemId}
                        activeOpacity={0.75}
                        onPress={() => {
                          // ✅ If it's an extra added item, do NOT toggle on row press.
                          //    The user must use the Undo button.
                          if (isExtraAdded) return;
                          toggleAdded(catIndex, itemId);
                        }}
                        style={[
                          styles.itemRowWrapper,
                          isAdded && styles.itemRowWrapperActive,
                          isExtraAdded && styles.itemRowWrapperExtraAdded,
                        ]}
                      >
                        {/* ✅ Small "Extra Item" label at the top-right of the card */}
                        {isExtraAdded && (
                          <View style={styles.extraItemCornerTag}>
                            <Text style={styles.extraItemCornerTagText}>Extra Item</Text>
                          </View>
                        )}
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
                          {/* ✅ If this is an extra added item, show smaller Undo button without icon */}
                          {isExtraAdded ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => handleUndoExtraItem(catIndex, itemId)}
                              style={styles.undoButtonStyle}
                            >
                              <Text style={styles.undoButtonText}>Undo</Text>
                            </TouchableOpacity>
                          ) : (
                            <Animated.View style={{ transform: [{ scale: itemScale }] }}>
                              <View style={[styles.radioButtonCircle, isAdded && styles.radioButtonCircleSelected]}>
                                {isAdded && <View style={styles.radioButtonInnerDot} />}
                              </View>
                            </Animated.View>
                          )}
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

          {/* ✅ SINGLE ADD-ONS CARD
              — One heading: "Add-Ons"
              — Below it, ALL dynamic addons render as rows with simple
                Add / Remove toggle buttons.
              — This replaces the previous two-card layout (Vanilla Ice Cream
                and Water Bottles sections). */}
          {daawathAddons.length > 0 && (
            <View style={styles.categoryCardBlock}>
              <View style={styles.categoryHeaderRow}>
                <View style={styles.titleWithBadgeGroup}>
                  <View style={styles.addonIconCircle}>
                    <Feather name="plus" size={13} color="#FAF8F5" />
                  </View>
                  <View style={styles.labelSubTextContainer}>
                    <Text style={styles.categoryHeaderTitleText}>Add-Ons</Text>
                    <Text style={styles.chooseTextLabel}>Optional add-ons for your platter</Text>
                  </View>
                </View>
              </View>

              <View style={styles.itemListGroup}>
                {daawathAddons.map((addon: any, aIdx: number) => {
                  const addonId = addon._id || addon.id || `addon-${aIdx}`;
                  const addonPrice = safeParsePrice(addon.price);
                  const currentCount = extraItemsCount[addonId as any] || 0;
                  const isAdded = currentCount > 0;

                  return (
                    <View key={addonId} style={styles.itemRowWrapper}>
                      <Image
                        source={{ uri: addon.imageUrl || "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=100" }}
                        style={styles.itemThumbImage}
                      />
                      <View style={styles.itemMetaMiddle}>
                        <Text style={styles.rowItemNameTitle}>{addon.name}</Text>
                        {addonPrice > 0 ? (
                          <Text style={styles.rowItemPriceText}>+₹{addonPrice} / Plate</Text>
                        ) : null}
                      </View>

                      {/* ✅ Simple Add / Remove toggle button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => toggleAddonOnce(addonId, addonPrice)}
                        style={[
                          styles.simpleAddToggleBtn,
                          isAdded && styles.simpleAddToggleBtnAdded,
                        ]}
                      >
                        <Feather
                          name={isAdded ? "check" : "plus"}
                          size={14}
                          color={isAdded ? "#FAF8F5" : "#166538"}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.simpleAddToggleText,
                            isAdded && styles.simpleAddToggleTextAdded,
                          ]}
                        >
                          {isAdded ? "Remove" : "Add"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* LIMIT MODAL */}
      <Modal
        visible={showLimitModal}
        transparent
        animationType="fade"
        onRequestClose={dismissLimitModal}
      >
        <View style={styles.modalRootOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <TouchableWithoutFeedback onPress={dismissLimitModal}>
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
                      // ✅ 1. Close modal & acknowledge the category
                      setShowLimitModal(false);
                      setLimitAcknowledged((prev) => ({ ...prev, [selectedCategoryIndex]: true }));

                      // ✅ 2. Immediately activate the triggered item as an extra
                      if (triggeredItemId) {
                        toggleAdded(selectedCategoryIndex, triggeredItemId, true);
                      }

                      // ✅ 3. Reset trigger state
                      setTriggeredItemPrice(0);
                      setTriggeredItemId(null);
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
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              contentContainerStyle={{ paddingBottom: 120 }}
            >
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
                                <Text style={styles.extraTagText}>+₹{getItemExtraPrice(item)}/plate</Text>
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
                        <Image                          source={{ uri: addon.imageUrl }}
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
                      // Forward address params down the chain
                      ...forwardAddressParams(),
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
                      // Forward address params down the chain
                      ...forwardAddressParams(),
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

            {/* ✅ MERGED: Extra course dishes AND addons are now shown together
                under one section so every paid extra is named in detail. */}
            {(detailedExtraItems.length > 0 || detailedAddons.length > 0) && (
              <View style={styles.breakdownSectionGroup}>
                <Text style={styles.breakdownSectionTitle}>Extra Items & Add-Ons</Text>

                {detailedExtraItems.map((item, idx) => (
                  <View key={`extra-breakdown-${idx}`} style={styles.popoverRow}>
                    <View style={styles.popoverLabelCol}>
                      <Text style={styles.popoverItemName}>{item.name}</Text>
                      <Text style={styles.popoverSubDetail}>{item.categoryName}</Text>
                    </View>
                    <Text style={styles.popoverExtraValue}>+₹{item.price}</Text>
                  </View>
                ))}

                {detailedAddons.map((addon, aIdx) => (
                  <View key={`addon-breakdown-${aIdx}`} style={styles.popoverRow}>
                    <View style={styles.popoverLabelCol}>
                      <Text style={styles.popoverItemName}>
                        {addon.name}{addon.count > 1 ? ` × ${addon.count}` : ""}
                      </Text>
                      <Text style={styles.popoverSubDetail}>
                        {addon.count > 1 ? `₹${addon.price} each` : "Add-on"}
                      </Text>
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

        {/* ✅ UPDATED: When all categories are complete → "Continue"
            (opens preview). When incomplete → "Select all (X/Y)" which now
            auto-navigates to the first incomplete category and pulses its
            "Choose any N" pill so the customer instantly sees what's missing. */}
        <TouchableOpacity
          style={[
            styles.footerActionSubmitBtn,
            !allCategoriesAtMax && styles.footerActionSubmitBtnDisabled,
          ]}
          onPress={() => {
            if (allCategoriesAtMax) {
              setShowPreviewModal(true);
            } else {
              handleSelectAllPrompt();
            }
          }}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={allCategoriesAtMax ? "Continue" : "Select all courses to preview"}
        >
          <Text
            style={[
              styles.footerSubmitBtnText,
              !allCategoriesAtMax && styles.footerSubmitBtnTextDisabled,
            ]}
          >
            {allCategoriesAtMax
              ? "Continue"
              : `Select all (${completedCategoryCount}/${requiredCategoryCount})`}
          </Text>
          <Feather
            name={allCategoriesAtMax ? "eye" : "arrow-down-right"}
            size={15}
            color={allCategoriesAtMax ? "#FAF8F5" : "#7A8F86"}
            style={{ marginLeft: 8 }}
          />
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
    marginBottom: 0
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
  // ✅ Highlighted variant of the "Choose any N" pill. Applied while
  //    the category is pulsing after the customer taps "Select all (X/Y)".
  chooseTagBadgePulsing: {
    backgroundColor: "rgba(22, 101, 56, 0.14)",
    borderColor: "#166538",
    borderWidth: 1.5,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
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
  // ✅ Visual highlight for items added as "extra" paid items
  itemRowWrapperExtraAdded: {
    backgroundColor: "rgba(22, 101, 56, 0.06)",
    borderRadius: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.18)",
    borderBottomWidth: 1,
    marginVertical: 4,
    position: "relative",
  },
  // ✅ Small "Extra Item" tag pinned to the top-right of the card
  extraItemCornerTag: {
    position: "absolute",
    top: -8,
    left: 8,
    backgroundColor: "#166538",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 10,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  extraItemCornerTagText: {
    fontSize: 8.5,
    fontWeight: "900",
    color: "#FAF8F5",
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
  // ✅ Smaller Undo button (no icon) for extra-added items
  undoButtonStyle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#166538",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  undoButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FAF8F5",
    letterSpacing: 0.3,
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
  /* ✅ Simple Add / Remove toggle button used by the Add-Ons section */
  simpleAddToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.25)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 10,
  },
  simpleAddToggleBtnAdded: {
    backgroundColor: "#166538",
    borderColor: "#166538",
  },
  simpleAddToggleText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#166538",
    letterSpacing: 0.2,
  },
  simpleAddToggleTextAdded: {
    color: "#FAF8F5",
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
  // ✅ Disabled visual state for the gated "Continue" button.
  //    NOTE: The button is still tappable — tapping it navigates to the
  //    first incomplete category instead of opening the preview.
  footerActionSubmitBtnDisabled: {
    backgroundColor: "#E3EAE6",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  footerSubmitBtnText: {
    color: "#FAF8F5",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  // ✅ Disabled text state for the gated "Continue" button
  footerSubmitBtnTextDisabled: {
    color: "#7A8F86",
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