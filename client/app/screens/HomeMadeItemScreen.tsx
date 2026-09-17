import React, { useRef, useState, useEffect } from "react";

import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  FlatList,
} from "react-native";

import { useLocalSearchParams, router } from "expo-router";

import { Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";

import api from "@/src/lib/api";
import HomeMadeItemSkeleton from "@/src/components/skeletons/HomeMadeItemSkeleton";

const { width } = Dimensions.get("window");

const HEADER_HEIGHT = 360;

// ─── KATBOX BRAND PALETTE (Elite Boutique Standard) ───
const KATBOX = {
  bg: "#F9F6F0",
  card: "#FFFFFF",
  cardSoft: "#F4F1EA",
  primary: "#14532D",
  primaryDark: "#0F3E22",
  primaryLight: "#16A34A",
  primaryTint: "#E8F5E9",
  primaryTintSoft: "#F2FBF4",
  border: "#E6E2D6",
  borderSoft: "#EFECE6",
  textPrimary: "#111827",
  textSecondary: "#374151",
  textTertiary: "#6B7280",
  textMuted: "#9CA3AF",
  rating: "#F59E0B",
  ratingDeep: "#D97706",
  danger: "#DC2626",
  dangerTint: "#FEE2E2",
  dangerTintSoft: "#FEF2F2",
  shadow: "#111827",
};

const HomeMadeItemScreen = () => {
  const params = useLocalSearchParams();
  // Route Params
  const id = params.id as string;
  const chefId = params.chefId as string;
  const categoryId = params.categoryId as string;
  const name = params.name as string;
  const image = params.image as string;
  const rating = params.rating as string;
  const location = params.location as string;
  const isAvailable = params.isAvailable !== "false";
  const passedCategory = params.category as string;
  const chefName = params.chefName as string;

  const effectiveChefId = chefId || id || "";
  const effectiveChefName = chefName || name || "Chef Partner";

  // Dynamic States
  const [menuSections, setMenuSections] = useState<any[]>([]);
  const [pageTitle, setPageTitle] = useState(passedCategory || name || "Home Made Items");
  const [headerImage, setHeaderImage] = useState(
    image || "https://images.unsplash.com/photo-1504674900247-0877df9cc836"
  );
  const [isLoading, setIsLoading] = useState(true);

  // ─── SKELETON STATE (200 ms delay threshold) ─────────────────────────
  const [showSkeleton, setShowSkeleton] = useState(false);

  // Scroll & UI States
  const scrollY = useRef(new Animated.Value(0)).current;
  // Main scrollview ref added for section targeting
  const mainScrollViewRef = useRef<ScrollView | null>(null); 
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const activeCategoryRef = useRef("");
  const sectionLayouts = useRef<{ [key: string]: number }>({});
  
  // Floating Menu Sheet State
  const [showMenuSheet, setShowMenuSheet] = useState(false);

  // Quantity Selection States
  const [selectedQuantities, setSelectedQuantities] = useState<{ [key: string]: string }>({});
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState("");
  const [selectedItemImage, setSelectedItemImage] = useState("");
  const [selectedItemDescription, setSelectedItemDescription] = useState("");
  const [selectedItemOptions, setSelectedItemOptions] = useState<string[]>([]);
  const [modalSelectedQty, setModalSelectedQty] = useState("");

  // Numeric Cart Quantity State
  const [itemQuantities, setItemQuantities] = useState<{ [key: string]: number }>({});

  // Expanded Descriptions State
  const [expandedDescriptions, setExpandedDescriptions] = useState<{ [key: string]: boolean }>({});

  const toggleDescription = (itemId: string) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Update Numeric Quantity
  const updateItemQuantity = (itemId: string, newQty: number) => {
    if (newQty < 0) return;

    setItemQuantities((prev) => {
      if (newQty === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: newQty };
    });
  };

  // Fetch Data from MongoDB strictly scoped to this Chef & Category
  useEffect(() => {
    const fetchCategoryData = async () => {
      try {
        setIsLoading(true);
        if (!effectiveChefId) {
          console.warn("No chefId provided in params");
          setIsLoading(false);
          return;
        }

        const res = await api.get(`/api/chef-categories/chef/${effectiveChefId}`);
        const allCategories = res.data || [];

        let targetCategory = null;
        if (categoryId) {
          targetCategory = allCategories.find((c: any) => c._id === categoryId || c.id === categoryId);
        }
        if (!targetCategory && passedCategory) {
          targetCategory = allCategories.find(
            (c: any) => c.name?.trim().toLowerCase() === passedCategory.trim().toLowerCase()
          );
        }
        if (!targetCategory && allCategories.length > 0) {
          targetCategory = allCategories[0];
        }

        if (targetCategory) {
          if (targetCategory.name) setPageTitle(targetCategory.name);
          if (targetCategory.heroImageUrl) setHeaderImage(targetCategory.heroImageUrl);
          if (targetCategory.subCategories) {
            const formatted = targetCategory.subCategories.map((sub: any) => {
              return {
                title: sub.name,
                data: (sub.items || []).map((item: any) => {
                  const pricesMap: Record<string, number> = {};

                  if (item.quantity && item.price !== undefined) {
                    pricesMap[item.quantity] = Number(item.price);
                  }
                  if (item.variants && item.variants.length > 0) {
                    item.variants.forEach((v: any) => {
                      if (v.quantity && v.price !== undefined) {
                        pricesMap[v.quantity] = Number(v.price);
                      }
                    });
                  }
                  const availableQuantities = Object.keys(pricesMap);
                  const defaultQty = item.quantity || availableQuantities[0] || "";
                  const resolvedIsVeg = item.isVeg !== undefined ? item.isVeg : true;
                  return {
                    id: item._id || Math.random().toString(),
                    name: item.name,
                    image: item.imageUrl,
                    veg: resolvedIsVeg,
                    prices: pricesMap,
                    availableQuantities,
                    defaultQuantity: defaultQty,
                    customisable: item.variants?.length > 0,
                    description: item.description || "A meticulously prepared dish crafted with authentic spices and premium ingredients.",
                    isBestSeller: false,
                    isVeg: resolvedIsVeg,
                  };
                }),
              };
            });
            setMenuSections(formatted);

            const initialQuantities: any = {};
            formatted.forEach((sub: any) => {
              sub.data.forEach((item: any) => {
                initialQuantities[item.id] = item.defaultQuantity;
              });
            });
            setSelectedQuantities(initialQuantities);

            if (formatted.length > 0) {
              setActiveCategory(formatted[0].title);
              activeCategoryRef.current = formatted[0].title;
            }
          }
        }
      } catch (err) {
        console.error("Error fetching menu:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategoryData();
  }, [effectiveChefId, categoryId, passedCategory]);

  // ─── 200 ms skeleton delay threshold ──────────────────────────────────
  // Only show the skeleton if the initial load exceeds 200 ms. This avoids
  // a flash of skeleton on fast responses while still providing a graceful
  // loading state on slow networks. Skeleton only applies to the first load.
  useEffect(() => {
    const isInitialLoad = isLoading && menuSections.length === 0;
    if (!isInitialLoad) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [isLoading, menuSections.length]);

  // Animations
  const translateY = scrollY.interpolate({
    inputRange: [-200, 0, HEADER_HEIGHT],
    outputRange: [0, 0, -150],
    extrapolate: "clamp",
  });
  const scale = scrollY.interpolate({
    inputRange: [-200, 0],
    outputRange: [1.4, 1],
    extrapolate: "clamp",
  });
  const stickyOpacity = scrollY.interpolate({
    inputRange: [HEADER_HEIGHT - 140, HEADER_HEIGHT - 60],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyTranslateY = scrollY.interpolate({
    inputRange: [HEADER_HEIGHT - 180, HEADER_HEIGHT - 60],
    outputRange: [-40, 0],
    extrapolate: "clamp",
  });

  // Dynamic Scroll Tracking
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (event: any) => {
        const scrollOffset = event.nativeEvent.contentOffset.y + 120;
        let currentTitle = activeCategoryRef.current;
        const layouts = Object.entries(sectionLayouts.current).sort((a, b) => a[1] - b[1]);

        for (const [title, yPos] of layouts) {
          if (scrollOffset >= yPos) {
            currentTitle = title;
          }
        }
        if (currentTitle && currentTitle !== activeCategoryRef.current) {
          activeCategoryRef.current = currentTitle;
          setActiveCategory(currentTitle);
        }
      },
    }
  );

  const handleSectionLayout = (title: string, event: any) => {
    sectionLayouts.current[title] = event.nativeEvent.layout.y;
  };

  // Menu Navigation Scroll Trigger
  const scrollToSection = (title: string) => {
    setShowMenuSheet(false);
    const targetY = sectionLayouts.current[title];
    if (targetY !== undefined && mainScrollViewRef.current) {
      const scrollTarget = targetY + HEADER_HEIGHT - 40;
      mainScrollViewRef.current.scrollTo({ y: scrollTarget, animated: true });
    }
  };

  // Actions
  const openQuantitySelector = (item: any) => {
    setSelectedItemId(item.id);
    setSelectedItemName(item.name);
    setSelectedItemImage(item.image || "https://via.placeholder.com/150");
    setSelectedItemDescription(item.description);
    setSelectedItemOptions(item.availableQuantities);
    setModalSelectedQty(getSelectedQuantity(item.id) || item.defaultQuantity);
    setShowQuantityModal(true);
  };

  const selectQuantity = (qty: string) => {
    setModalSelectedQty(qty);
  };

  const confirmQuantitySelection = () => {
    if (selectedItemId && modalSelectedQty) {
      setSelectedQuantities((prev) => ({
        ...prev,
        [selectedItemId]: modalSelectedQty,
      }));
      // Auto-add item to counter if it isn't added already
      if (!itemQuantities[selectedItemId]) {
        updateItemQuantity(selectedItemId, 1);
      }
    }
    setShowQuantityModal(false);
  };

  const getSelectedQuantity = (itemId: string) => {
    return selectedQuantities[itemId] || "";
  };

  // Dynamic Search Filter
  const filteredSections = menuSections
    .map((section) => ({
      ...section,
      data: section.data.filter((item: any) =>
        item.name.toLowerCase().includes(searchText.toLowerCase())
      ),
    }))
    .filter((section) => section.data.length > 0);

  // Helper values to calculate total elements added into Cart
  const getCartTotals = () => {
    let count = 0;
    let price = 0;
    
    Object.entries(itemQuantities).forEach(([itemId, qty]) => {
      count += qty;
      const flatItem = menuSections.flatMap(s => s.data).find(i => i.id === itemId);
      if (flatItem) {
        const currentQtyConfig = getSelectedQuantity(itemId) || flatItem.defaultQuantity;
        const basePrice = flatItem.prices[currentQtyConfig] || 0;
        price += basePrice * qty;
      }
    });

    return { totalCartCount: count, totalCartPrice: price };
  };

  const { totalCartCount, totalCartPrice } = getCartTotals();

  // Dynamic price calculation for the Bottom Sheet green CTA button
  const getModalSelectedOptionPrice = () => {
    if (!selectedItemId || !modalSelectedQty) return 0;
    const flatItem = menuSections.flatMap(s => s.data).find(i => i.id === selectedItemId);
    return flatItem ? (flatItem.prices[modalSelectedQty] || 0) : 0;
  };

  const currentModalItemCount = selectedItemId ? (itemQuantities[selectedItemId] || 1) : 1;
  const dynamicModalTotalPrice = getModalSelectedOptionPrice() * currentModalItemCount;

  // Render Item
  const renderItem = (item: any) => {
    const currentQty = getSelectedQuantity(item.id) || item.defaultQuantity;
    const currentPrice = item.prices[currentQty] || 0;
    const isExpanded = expandedDescriptions[item.id] || false;
    const cartCount = itemQuantities[item.id] || 0;

    return (
      <View style={styles.menuItemCard}>
        {/* LEFT: Text Content */}
        <View style={styles.itemDetails}>
          <View style={styles.itemNameRow}>
            <View style={[styles.vegIconWrapper, !item.veg && styles.nonVegIconWrapper]}>
              <View style={[styles.vegIconDot, !item.veg && styles.nonVegIconDot]} />
            </View>
            <Text style={styles.itemName}>{item.name}</Text>
          </View>

          {item.description && (
            <Text
              style={styles.itemDescription}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {item.description}
            </Text>
          )}

          {item.description && (
            <TouchableOpacity onPress={() => toggleDescription(item.id)} style={styles.readMore}>
              <Text style={styles.readMoreText}>
                {isExpanded ? "Read less" : "Read more"}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.itemPrice}>₹{currentPrice}</Text>

            {item.availableQuantities && item.availableQuantities.length > 1 ? (
              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => openQuantitySelector(item)}
              >
                <Text style={styles.qtyText}>{currentQty}</Text>
                <Ionicons name="chevron-down" size={14} color={KATBOX.textPrimary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.qtyButton}>
                <Text style={styles.qtyText}>{currentQty}</Text>
              </View>
            )}
          </View>
        </View>

        {/* RIGHT: Image with ADD / Quantity Counter - Clickable */}
        <TouchableOpacity 
          style={styles.itemImageWrapper}
          onPress={() => openQuantitySelector(item)}
          activeOpacity={0.85}
        >
          <View style={styles.itemImageContainer}>
            <Image
              source={{ uri: item.image || "https://via.placeholder.com/150" }}
              style={styles.menuItemImage}
            />
          </View>

          {cartCount === 0 ? (
            <TouchableOpacity
              style={styles.addButtonOnImage}
              onPress={(e) => {
                e.stopPropagation();
                updateItemQuantity(item.id, 1);
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.addButtonText}>ADD</Text>
              <Ionicons name="add" size={15} color={KATBOX.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.quantityCounter}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={(e) => {
                  e.stopPropagation();
                  updateItemQuantity(item.id, cartCount - 1);
                }}
              >
                <Ionicons name="remove" size={16} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.counterText}>{cartCount}</Text>

              <TouchableOpacity
                style={styles.counterButton}
                onPress={(e) => {
                  e.stopPropagation();
                  updateItemQuantity(item.id, cartCount + 1);
                }}
              >
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // Persist Cart and Navigate
  const handleViewCartNavigation = async () => {
    try {
      const cartItemsPayload = Object.entries(itemQuantities).map(([itemId, qty]) => {
        const flatItem = menuSections.flatMap(s => s.data).find(i => i.id === itemId);
        const chosenConfig = getSelectedQuantity(itemId) || flatItem?.defaultQuantity || "";
        return {
          id: itemId,
          name: flatItem?.name || "",
          image: flatItem?.image || "",
          price: flatItem?.prices[chosenConfig] || 0,
          quantity: qty,
          selectedQtyConfig: chosenConfig
        };
      });

      if (cartItemsPayload.length === 0) return;

      await api.post("/api/cart", {
        serviceType: 'homemade',
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        items: cartItemsPayload,
        totalItems: totalCartCount,
        totalPrice: totalCartPrice
      });

      router.push({
        pathname: "/screens/CartScreen",
        params: { serviceType: 'homemade' }
      });
    } catch (error) {
      console.error("❌ Failed to save homemade cart context:", error);
    }
  };

  // ─── Skeleton early return (only when initial load exceeds 200 ms) ───
  if (showSkeleton) {
    return <HomeMadeItemSkeleton />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* PARALLAX HEADER */}
      <Animated.View
        style={[
          styles.header,
          {
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <Image
          source={{ uri: headerImage }}
          style={[styles.headerImage, !isAvailable && styles.imageDisabled]}
        />
        <View style={styles.headerGradientOverlay} />
        {!isAvailable && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Currently Unavailable</Text>
          </View>
        )}
      </Animated.View>

      {/* BACK BUTTON */}
      <View style={styles.headerControls}>
        <TouchableOpacity style={styles.circleBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={KATBOX.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* MAIN SCROLL */}
      <Animated.ScrollView
        ref={(ref: any) => { mainScrollViewRef.current = ref; }}
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT - 40,
          paddingBottom: totalCartCount > 0 ? 180 : 120, 
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* CHEF INFO */}
          <View style={styles.headerRow}>
            <Text style={[styles.chefName, !isAvailable && styles.textMuted]} numberOfLines={1}>
              {pageTitle}
            </Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#FFFFFF" />
              <Text style={styles.ratingText}>{rating || "4.9"}</Text>
            </View>
          </View>

          {/* CHEF NAME OVER LOCATION TEXT CONTAINER */}
          {effectiveChefName && (
            <View style={styles.chefNameRow}>
              <MaterialCommunityIcons name="chef-hat" size={16} color={KATBOX.primary} />
              <Text style={styles.chefNameText}>Crafted by {effectiveChefName}</Text>
            </View>
          )}

          <View style={styles.locationRow}>
            <MaterialIcons name="location-on" size={16} color={KATBOX.primary} />
            <Text style={[styles.locationText, !isAvailable && styles.textMuted]} numberOfLines={1}>
              {location || "Banjara Hills, Hyderabad"}
            </Text>
          </View>

          <View style={styles.katboxPromiseBanner}>
            <MaterialIcons name="verified-user" size={16} color={KATBOX.primary} />
            <Text style={styles.katboxPromiseText}>100% Homecooked • FSSAI Certified Kitchen</Text>
          </View>

          {/* LOADING STATE */}
          {isLoading ? (
            <View style={{ marginTop: 60, alignItems: "center" }}>
              <ActivityIndicator size="large" color={KATBOX.primary} />
              <Text style={{ marginTop: 16, color: KATBOX.textTertiary, fontSize: 15, fontWeight: "600" }}>Curating master kitchen menu...</Text>
            </View>
          ) : filteredSections.length === 0 ? (
            <View style={{ marginTop: 60, alignItems: "center" }}>
              <Ionicons name="fast-food-outline" size={60} color={KATBOX.textMuted} />
              <Text style={{ marginTop: 16, color: KATBOX.textTertiary, fontSize: 16, fontWeight: "600" }}>No signature items found</Text>
            </View>
          ) : (
            filteredSections.map((section, sectionIndex) => (
              <View
                key={`${section.title || "section"}-${sectionIndex}`}
                onLayout={(e) => handleSectionLayout(section.title, e)}
              >
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                  <View style={styles.sectionHeadingAccent} />
                </View>
                {section.data.map((item: any, itemIndex: number) => (
                  <View key={`${item.id}-${itemIndex}`}>
                    {renderItem(item)}
                  </View>
                ))}
                <View style={{ height: 16 }} />
              </View>
            ))
          )}
        </View>
      </Animated.ScrollView>

      {/* STICKY HEADER */}
      <Animated.View
        style={[
          styles.stickyHeader,
          {
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslateY }],
          },
        ]}
      >
        <View style={styles.stickyTopBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.stickyBackButton} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={20} color={KATBOX.textPrimary} />
          </TouchableOpacity>
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color={KATBOX.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search in ${pageTitle}...`}
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor={KATBOX.textMuted}
            />
          </View>
          <TouchableOpacity style={styles.menuButton} activeOpacity={0.85}>
            <Ionicons name="ellipsis-vertical" size={20} color={KATBOX.textPrimary} />
          </TouchableOpacity>
        </View>
        {!isLoading && filteredSections.length > 0 && (
          <View style={styles.activeCategoryContainer}>
            <Text style={styles.activeCategoryText}>{activeCategory}</Text>
          </View>
        )}
      </Animated.View>

      {/* FIXED FLOATING MENU BUTTON */}
      {!isLoading && filteredSections.length > 0 && !showMenuSheet && (
        <TouchableOpacity 
          style={[
            styles.floatingMenuButton,
            totalCartCount > 0 && { bottom: 104 } 
          ]}
          onPress={() => setShowMenuSheet(true)}
          activeOpacity={0.9}
        >
          <Ionicons name="restaurant-outline" size={15} color="#fff" />
          <Text style={styles.floatingMenuText}>MENU</Text>
        </TouchableOpacity>
      )}

      {/* DYNAMIC FLOATING BAR FOR CART */}
      {totalCartCount > 0 && (
        <View style={styles.cartFloatingBarContainer}>
          <View style={styles.cartFloatingBar}>
            <View style={styles.cartMetaInfo}>
              <Text style={styles.cartCountTitle}>
                {totalCartCount} {totalCartCount === 1 ? "Item" : "Items"} added
              </Text>
              <Text style={styles.cartPriceSubtitle}>₹{totalCartPrice}</Text>
            </View>
            <TouchableOpacity 
              style={styles.cartViewButton}
              activeOpacity={0.85}
              onPress={handleViewCartNavigation}
            >
              <Text style={styles.cartViewText}>View Cart</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* FLOATING SUBCATEGORIES MENU OVERLAY */}
      <Modal
        visible={showMenuSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuSheet(false)}
      >
        <View style={styles.menuOverlay}>
          <View style={styles.menuPopupContainer}>
            <Text style={styles.menuPopupTitle}>Explore Categories</Text>
            <View style={styles.menuPopupDivider} />
            <FlatList
              data={filteredSections}
              keyExtractor={(item, index) => `${item.title}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
              renderItem={({ item }) => {
                const isActive = activeCategory === item.title;
                return (
                  <TouchableOpacity 
                    style={styles.menuPopupRow}
                    onPress={() => scrollToSection(item.title)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.menuPopupRowText,
                      isActive && styles.menuPopupRowTextActive
                    ]}>
                      {item.title}
                    </Text>
                    <View style={[styles.menuPopupCountBadge, isActive && styles.menuPopupCountBadgeActive]}>
                      <Text style={[
                        styles.menuCountText,
                        isActive && styles.menuCountTextActive
                      ]}>
                        {item.data.length}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          <TouchableOpacity 
            style={styles.menuCloseFloatingButton}
            onPress={() => setShowMenuSheet(false)}
            activeOpacity={0.9}
          >
            <Ionicons name="close" size={18} color="#fff" />
            <Text style={styles.menuCloseFloatingText}>Close Menu</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* QUANTITY BOTTOM SHEET */}
      <Modal
        visible={showQuantityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuantityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.floatingCloseButton}
            onPress={() => setShowQuantityModal(false)}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={24} color={KATBOX.textPrimary} />
          </TouchableOpacity>

          <View style={styles.bottomSheet}>
            <View style={styles.handle} />
            <View style={styles.bottomSheetImageContainer}>
              <Image
                source={{ uri: selectedItemImage }}
                style={styles.bottomSheetImage}
              />
              <View style={styles.bottomSheetImageGradient} />
            </View>

            <View style={styles.bottomSheetItemInfo}>
              <Text style={styles.bottomSheetItemName}>{selectedItemName}</Text>
              <Text style={styles.bottomSheetItemDesc}>{selectedItemDescription}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.quantityHeaderRow}>
              <Text style={styles.quantityHeader}>Portion & Size</Text>
              <Text style={styles.selectOptionBadge}>Required</Text>
            </View>
            <Text style={styles.selectOptionText}>Select your preferred serving size</Text>

            <ScrollView style={styles.optionsScrollContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.optionsContainer}>
                {selectedItemOptions.map((qty, index) => {
                  const price = menuSections
                    .flatMap(s => s.data)
                    .find(item => item.id === selectedItemId)?.prices[qty] || 0;
                  const isSelected = modalSelectedQty === qty;

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.quantityOptionRow, isSelected && styles.quantityOptionRowSelected]}
                      onPress={() => selectQuantity(qty)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.quantityOptionTextContainer}>
                        <Text style={[styles.quantityOptionText, isSelected && styles.quantityOptionTextSelected]}>{qty}</Text>
                        <Text style={styles.quantityPrice}>₹{price}</Text>
                      </View>
                      <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.bottomActionBar}>
              <View style={styles.miniCounter}>
                <TouchableOpacity 
                  style={styles.miniCounterBtn}
                  onPress={() => {
                    const current = itemQuantities[selectedItemId || ""] || 0;
                    if (current > 1) {
                      updateItemQuantity(selectedItemId!, current - 1);
                    }
                  }}
                >
                  <Ionicons name="remove" size={18} color={KATBOX.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.miniCounterText}>
                  {currentModalItemCount}
                </Text>
                <TouchableOpacity 
                  style={styles.miniCounterBtn}
                  onPress={() => {
                    const current = itemQuantities[selectedItemId || ""] || 0;
                    updateItemQuantity(selectedItemId!, current === 0 ? 2 : current + 1);
                  }}
                >
                  <Ionicons name="add" size={18} color={KATBOX.textPrimary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.addToCartButton}
                onPress={confirmQuantitySelection}
                activeOpacity={0.9}
              >
                <Text style={styles.addToCartText}>
                  Add item • ₹{dynamicModalTotalPrice}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default HomeMadeItemScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: KATBOX.bg, 
  },
  header: {
    height: HEADER_HEIGHT,
    position: "absolute",
    top: 0,
    width,
  },
  headerImage: {
    width: "100%",
    height: HEADER_HEIGHT,
    resizeMode: "cover",
  },
  headerGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  imageDisabled: {
    opacity: 0.6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.75)", 
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerControls: {
    position: "absolute",
    top: 52,
    left: 18,
    zIndex: 10,
  },
  circleBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: KATBOX.border,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  body: {
    flex: 1,
  },
  sheet: {
    backgroundColor: KATBOX.bg,
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 22,
    minHeight: 900,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: KATBOX.borderSoft,
  },
  handle: {
    width: 40,
    height: 4.5,
    backgroundColor: KATBOX.border,
    alignSelf: "center",
    borderRadius: 2.5,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chefName: {
    fontSize: 26,
    fontWeight: "900",
    flex: 1,
    marginRight: 10,
    color: KATBOX.textPrimary,
    letterSpacing: -0.4,
  },
  textMuted: {
    color: KATBOX.textMuted,
  },
  ratingBadge: {
    backgroundColor: KATBOX.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12.5,
  },
  chefNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 2,
    gap: 6,
  },
  chefNameText: {
    color: KATBOX.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 12,
    gap: 4,
  },
  locationText: {
    color: KATBOX.textTertiary,
    fontSize: 13.5,
    fontWeight: "600",
    flex: 1,
  },
  katboxPromiseBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.primaryTint,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    marginBottom: 24,
  },
  katboxPromiseText: {
    color: KATBOX.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  sectionHeader: {
    paddingVertical: 12,
    marginBottom: 12,
  },
  sectionHeaderText: {
    fontSize: 20,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.3,
  },
  sectionHeadingAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: KATBOX.primary,
    marginTop: 6,
  },

  /* ==================== MENU CARD ==================== */
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: KATBOX.card,
    borderRadius: 18, 
    padding: 14, 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: KATBOX.border, 
    shadowColor: KATBOX.shadow, 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, 
    shadowRadius: 8,
    elevation: 2,
  },
  itemDetails: {
    flex: 1,
    paddingRight: 14,
    justifyContent: "center",
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  vegIconWrapper: {
    width: 14,
    height: 14,
    borderWidth: 1.2,
    borderColor: KATBOX.primaryLight,
    borderRadius: 2.5,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    backgroundColor: KATBOX.card,
  },
  nonVegIconWrapper: {
    borderColor: KATBOX.danger,
  },
  vegIconDot: {
    width: 6,
    height: 6,
    backgroundColor: KATBOX.primaryLight,
    borderRadius: 3,
  },
  nonVegIconDot: {
    backgroundColor: KATBOX.danger,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    flex: 1,
    letterSpacing: -0.2,
  },
  itemDescription: {
    fontSize: 13,
    color: KATBOX.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
    fontWeight: "400",
  },
  readMore: {
    marginBottom: 8,
  },
  readMoreText: {
    fontSize: 12,
    color: KATBOX.primary,
    fontWeight: "700",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 16.5,
    fontWeight: "800",
    color: KATBOX.textPrimary,
  },
  qtyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.cardSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: KATBOX.border,
    gap: 4,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "700",
    color: KATBOX.textPrimary,
  },

  /* RIGHT SIDE - IMAGE + COUNTER */
  itemImageWrapper: {
    width: 110, 
    height: 110,
    position: "relative",
  },
  itemImageContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: KATBOX.borderSoft,
  },
  menuItemImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  addButtonOnImage: {
    position: "absolute",
    bottom: -12,
    alignSelf: "center", 
    width: "78%",
    backgroundColor: KATBOX.card, 
    borderColor: KATBOX.primary,
    borderWidth: 1.2,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: KATBOX.primary, 
    fontSize: 13.5,
    fontWeight: "800",
    marginRight: 2,
    letterSpacing: 0.2,
  },

  quantityCounter: {
    position: "absolute",
    bottom: -12,
    alignSelf: "center",
    width: "84%",
    backgroundColor: KATBOX.primary,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 5,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  counterButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  counterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "center",
  },

  /* Sticky Header */
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(249, 246, 240, 0.98)", 
    zIndex: 100,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: KATBOX.border,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  stickyTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stickyBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: KATBOX.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.card,
    borderRadius: 12, 
    paddingHorizontal: 14,
    height: 42,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: KATBOX.textPrimary,
    fontWeight: "500",
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: KATBOX.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  activeCategoryContainer: {
    marginTop: 8,
    paddingVertical: 2,
  },
  activeCategoryText: {
    fontSize: 16,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    letterSpacing: -0.2,
  },

  /* Bottom Sheet Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.65)", 
    justifyContent: "flex-end",
  },
  floatingCloseButton: {
    position: "absolute",
    top: "12%",
    alignSelf: "center",
    zIndex: 30,
    backgroundColor: "rgba(255,255,255,0.2)", 
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  bottomSheet: {
    backgroundColor: KATBOX.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 32, 
    maxHeight: "85%",
    paddingTop: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  bottomSheetImageContainer: {
    width: "100%",
    height: 220,
    marginTop: 6,
    position: "relative",
  },
  bottomSheetImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  bottomSheetImageGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  bottomSheetItemInfo: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: KATBOX.card,
  },
  bottomSheetItemName: {
    fontSize: 22,
    fontWeight: "900",
    color: KATBOX.textPrimary,
    letterSpacing: -0.4,
  },
  bottomSheetItemDesc: {
    fontSize: 14,
    color: KATBOX.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: KATBOX.borderSoft, 
    width: "100%",
  },
  quantityHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 2,
  },
  quantityHeader: {
    fontSize: 17,
    fontWeight: "800",
    color: KATBOX.textPrimary,
  },
  selectOptionBadge: {
    backgroundColor: KATBOX.dangerTint, 
    color: KATBOX.danger, 
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
  },
  selectOptionText: {
    fontSize: 13,
    color: KATBOX.textTertiary,
    paddingHorizontal: 20,
    marginBottom: 12,
    fontWeight: "600",
  },
  optionsScrollContainer: {
    maxHeight: 220,
  },
  optionsContainer: {
    paddingHorizontal: 20,
  },
  quantityOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: KATBOX.card,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  quantityOptionRowSelected: {
    borderColor: KATBOX.primary,
    backgroundColor: KATBOX.primaryTintSoft,
  },
  quantityOptionTextContainer: {
    flex: 1,
  },
  quantityOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: KATBOX.textPrimary,
    marginBottom: 2,
  },
  quantityOptionTextSelected: {
    color: KATBOX.primary, 
  },
  quantityPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: KATBOX.textSecondary,
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: KATBOX.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonSelected: {
    borderColor: KATBOX.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: KATBOX.primary,
  },

  bottomActionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 12,
    backgroundColor: KATBOX.card, 
    borderTopWidth: 1,
    borderTopColor: KATBOX.border,
    marginTop: 8,
  },
  miniCounter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: KATBOX.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  miniCounterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  miniCounterText: {
    fontSize: 16,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    minWidth: 28,
    textAlign: "center",
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: KATBOX.primary, 
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  addToCartText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  /* ==================== FLOATING UI STYLES ==================== */
  floatingMenuButton: {
    position: "absolute",
    bottom: 30,
    left: 20, 
    backgroundColor: KATBOX.primary,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
    borderWidth: 1,
    borderColor: "#1E6B3B",
  },
  floatingMenuText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
    letterSpacing: 1,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.65)", 
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 30, 
  },
  menuPopupContainer: {
    backgroundColor: KATBOX.card,
    borderRadius: 24,
    width: width * 0.88, 
    maxHeight: "55%",
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: KATBOX.border,
  },
  menuPopupTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: KATBOX.textPrimary,
    marginBottom: 10,
    textAlign: "center",
  },
  menuPopupDivider: {
    height: 1,
    backgroundColor: KATBOX.borderSoft,
    marginBottom: 6,
  },
  menuPopupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: KATBOX.borderSoft,
  },
  menuPopupRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: KATBOX.textSecondary, 
    flex: 1,
  },
  menuPopupRowTextActive: {
    color: KATBOX.primary, 
    fontWeight: "800",
  },
  menuPopupCountBadge: {
    backgroundColor: KATBOX.cardSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  menuPopupCountBadgeActive: {
    backgroundColor: KATBOX.primaryTint,
  },
  menuCountText: {
    fontSize: 13,
    fontWeight: "700",
    color: KATBOX.textTertiary,
    textAlign: "right",
  },
  menuCountTextActive: {
    color: KATBOX.primary,
    fontWeight: "800",
  },
  menuCloseFloatingButton: {
    flexDirection: "row",
    backgroundColor: KATBOX.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    shadowColor: KATBOX.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
    alignSelf: "flex-end", 
    marginRight: width * 0.06,
  },
  menuCloseFloatingText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },

  /* CHECKOUT FIXED BAR STYLES */
  cartFloatingBarContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 98,
  },
  cartFloatingBar: {
    flexDirection: "row",
    backgroundColor: KATBOX.primary, 
    width: width * 0.9,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: KATBOX.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#1E6B3B",
  },
  cartMetaInfo: {
    flexDirection: "column",
  },
  cartCountTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.9,
  },
  cartPriceSubtitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 1,
  },
  cartViewButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  cartViewText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});