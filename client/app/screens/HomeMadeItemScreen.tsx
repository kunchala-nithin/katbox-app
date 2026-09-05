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

const { width } = Dimensions.get("window");

const HEADER_HEIGHT = 360;

const HomeMadeItemScreen = () => {
  const params = useLocalSearchParams();
  // Route Params
  const chefId = params.id as string;
  const categoryId = params.categoryId as string;
  const name = params.name as string;
  const image = params.image as string;
  const rating = params.rating as string;
  const location = params.location as string;
  const isAvailable = params.isAvailable !== "false";
  const passedCategory = params.category as string;
  const chefName = params.chefName as string;

  // Dynamic States
  const [menuSections, setMenuSections] = useState<any[]>([]);
  const [pageTitle, setPageTitle] = useState(passedCategory || name || "Home Made Items");
  const [headerImage, setHeaderImage] = useState(
    image || "https://images.unsplash.com/photo-1504674900247-0877df9cc836"
  );
  const [isLoading, setIsLoading] = useState(true);

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

  // NEW: Numeric Cart Quantity State
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

  // Fetch Data from MongoDB
  useEffect(() => {
    const fetchCategoryData = async () => {
      try {
        setIsLoading(true);
        if (!chefId) {
          console.warn("No chefId provided in params");
          setIsLoading(false);
          return;
        }
        const res = await api.get(`/api/chef-categories/chef/${chefId}`);
        const allCategories = res.data;
        let targetCategory = allCategories.find((c: any) => c._id === categoryId);
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
                data: sub.items.map((item: any) => {
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
                  return {
                    id: item._id || Math.random().toString(),
                    name: item.name,
                    image: item.imageUrl,
                    veg: item.isVeg,
                    prices: pricesMap,
                    availableQuantities,
                    defaultQuantity: defaultQty,
                    customisable: item.variants?.length > 0,
                    description: item.description || "A meticulously prepared dish crafted with authentic spices and premium ingredients.",
                    isBestSeller: false,
                    isVeg: item.isVeg, // added structural accuracy
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
  }, [chefId, categoryId]);

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
                <Ionicons name="chevron-down" size={14} color="#0F172A" />
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
              <Ionicons name="add" size={16} color="#fff" />
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
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.counterText}>{cartCount}</Text>

              <TouchableOpacity
                style={styles.counterButton}
                onPress={(e) => {
                  e.stopPropagation();
                  updateItemQuantity(item.id, cartCount + 1);
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ✅ CUSTOM PERSISTENCE AND ROUTING LOGIC FOR HOMEMADE Flow
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

      // POST payload matching extended mongoose specification
      await api.post("/api/cart", {
        serviceType: 'homemade',
        chefId: chefId,
        chefName: chefName || name || "Chef Partner",
        items: cartItemsPayload,
        totalItems: totalCartCount,
        totalPrice: totalCartPrice
      });

      // Route using navigation parameters explicitly indicating service origin
      router.push({
        pathname: "/screens/CartScreen",
        params: { serviceType: 'homemade' }
      });
    } catch (error) {
      console.error("❌ Failed to save homemade cart context:", error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

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
        {!isAvailable && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Currently Unavailable</Text>
          </View>
        )}
      </Animated.View>

      {/* BACK BUTTON */}
      <View style={styles.headerControls}>
        <TouchableOpacity style={styles.circleBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
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
            <Text style={[styles.chefName, !isAvailable && styles.textMuted]}>
              {pageTitle}
            </Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>{rating || "New"}</Text>
            </View>
          </View>

          {/* CHEF NAME OVER LOCATION TEXT CONTAINER */}
          {chefName && (
            <View style={styles.chefNameRow}>
              <MaterialCommunityIcons name="chef-hat" size={18} color="#64748B" />
              <Text style={styles.chefNameText}>By {chefName}</Text>
            </View>
          )}

          <View style={styles.locationRow}>
            <MaterialIcons name="location-on" size={18} color="#18A558" />
            <Text style={[styles.locationText, !isAvailable && styles.textMuted]}>
              {location || "Location not provided"}
            </Text>
          </View>

          {/* LOADING STATE */}
          {isLoading ? (
            <View style={{ marginTop: 60, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#18A558" />
              <Text style={{ marginTop: 16, color: "#64748B", fontSize: 16 }}>Curating the menu...</Text>
            </View>
          ) : filteredSections.length === 0 ? (
            <View style={{ marginTop: 60, alignItems: "center" }}>
              <Ionicons name="fast-food-outline" size={64} color="#CBD5E1" />
              <Text style={{ marginTop: 16, color: "#94A3B8", fontSize: 16, fontWeight: "500" }}>No items found</Text>
            </View>
          ) : (
            filteredSections.map((section, sectionIndex) => (
              <View
                key={`${section.title || "section"}-${sectionIndex}`}
                onLayout={(e) => handleSectionLayout(section.title, e)}
              >
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
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
          <TouchableOpacity onPress={() => router.back()} style={styles.stickyBackButton}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={20} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search in ${pageTitle}...`}
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor="#94A3B8"
            />
          </View>
          <TouchableOpacity style={styles.menuButton}>
            <Ionicons name="ellipsis-vertical" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>
        {!isLoading && filteredSections.length > 0 && (
          <View style={styles.activeCategoryContainer}>
            <Text style={styles.activeCategoryText}>{activeCategory}</Text>
          </View>
        )}
      </Animated.View>

      {/* FIXED FLOATING MENU BUTTON (Disappears when showMenuSheet is active, lifts if checkout bar opens) */}
      {!isLoading && filteredSections.length > 0 && !showMenuSheet && (
        <TouchableOpacity 
          style={[
            styles.floatingMenuButton,
            totalCartCount > 0 && { bottom: 104 } 
          ]}
          onPress={() => setShowMenuSheet(true)}
          activeOpacity={0.9}
        >
          <Ionicons name="restaurant" size={16} color="#fff" />
          <Text style={styles.floatingMenuText}>MENU</Text>
        </TouchableOpacity>
      )}

      {/* DYNAMIC FLOATING BAR FOR CART (Appears only when items are chosen) */}
      {totalCartCount > 0 && (
        <View style={styles.cartFloatingBarContainer}>
          <View style={styles.cartFloatingBar}>
            <View style={styles.cartMetaInfo}>
              <Text style={styles.cartCountTitle}>
                {totalCartCount} {totalCartCount === 1 ? "Item" : "Items"}
              </Text>
              <Text style={styles.cartPriceSubtitle}>₹{totalCartPrice}</Text>
            </View>
            <TouchableOpacity 
              style={styles.cartViewButton}
              activeOpacity={0.8}
              onPress={handleViewCartNavigation}
            >
              <Text style={styles.cartViewText}>View Cart</Text>
              <Ionicons name="bag-handle-outline" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* FLOATING SUBCATEGORIES MENU OVERLAY MATCHING REFERENCE IMAGE EXACTLY */}
      <Modal
        visible={showMenuSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuSheet(false)}
      >
        <View style={styles.menuOverlay}>
          {/* Main Floating Modal Container */}
          <View style={styles.menuPopupContainer}>
            <FlatList
              data={filteredSections}
              keyExtractor={(item, index) => `${item.title}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => {
                const isActive = activeCategory === item.title;
                return (
                  <TouchableOpacity 
                    style={styles.menuPopupRow}
                    onPress={() => scrollToSection(item.title)}
                    activeOpacity={0.6}
                  >
                    <Text style={[
                      styles.menuPopupRowText,
                      isActive && styles.menuPopupRowTextActive
                    ]}>
                      {item.title}
                    </Text>
                    <Text style={[
                      styles.menuCountText,
                      isActive && styles.menuCountTextActive
                    ]}>
                      {item.data.length}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* DOCKED CLOSE BUTTON BELOW WINDOW CONTENT (BOTTOM-RIGHT) */}
          <TouchableOpacity 
            style={styles.menuCloseFloatingButton}
            onPress={() => setShowMenuSheet(false)}
            activeOpacity={0.9}
          >
            <Ionicons name="close" size={20} color="#fff" />
            <Text style={styles.menuCloseFloatingText}>Close</Text>
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
          {/* Floating X Button - Outside & Centered Above Bottom Sheet */}
          <TouchableOpacity 
            style={styles.floatingCloseButton}
            onPress={() => setShowQuantityModal(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.bottomSheet}>
            <View style={styles.handle} />
            {/* Item Image */}
            <View style={styles.bottomSheetImageContainer}>
              <Image
                source={{ uri: selectedItemImage }}
                style={styles.bottomSheetImage}
              />
            </View>

            {/* Item Info */}
            <View style={styles.bottomSheetItemInfo}>
              <Text style={styles.bottomSheetItemName}>{selectedItemName}</Text>
              <Text style={styles.bottomSheetItemDesc}>{selectedItemDescription}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.quantityHeaderRow}>
              <Text style={styles.quantityHeader}>Quantity</Text>
              <Text style={styles.selectOptionBadge}>Required</Text>
            </View>
            <Text style={styles.selectOptionText}>Select any 1 option</Text>

            {/* Quantity Options */}
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
                      style={styles.quantityOptionRow}
                      onPress={() => selectQuantity(qty)}
                      activeOpacity={0.7}
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

            {/* Bottom Action Bar */}
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
                  <Ionicons name="remove" size={20} color="#0F172A" />
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
                  <Ionicons name="add" size={20} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.addToCartButton}
                onPress={confirmQuantitySelection}
                activeOpacity={0.9}
              >
                <Text style={styles.addToCartText}>
                  Add item ₹{dynamicModalTotalPrice}
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
    backgroundColor: "#F8FAFC", 
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
  imageDisabled: {
    opacity: 0.65,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.6)", 
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerControls: {
    position: "absolute",
    top: 50,
    left: 16,
    zIndex: 10,
  },
  circleBtn: {
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 10,
    borderRadius: 30,
  },
  body: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    minHeight: 900,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 10,
  },
  handle: {
    width: 48,
    height: 6,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    borderRadius: 10,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chefName: {
    fontSize: 30,
    fontWeight: "900",
    flex: 1,
    marginRight: 10,
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  textMuted: {
    color: "#94A3B8",
  },
  ratingBadge: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  ratingText: {
    color: "#fff",
    marginLeft: 6,
    fontWeight: "700",
    fontSize: 14,
  },
  chefNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  chefNameText: {
    marginLeft: 6,
    color: "#64748B",
    fontSize: 16,
    fontWeight: "500",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 28,
  },
  locationText: {
    marginLeft: 6,
    color: "#64748B",
    fontSize: 16,
    fontWeight: "500",
  },
  sectionHeader: {
    paddingVertical: 18,
    marginBottom: 10,
  },
  sectionHeaderText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },

  /* ==================== MENU CARD ==================== */
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 24, 
    padding: 16, 
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)", 
    shadowColor: "#0F172A", 
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04, 
    shadowRadius: 20,
    elevation: 4,
  },
  itemDetails: {
    flex: 1,
    paddingRight: 18,
    justifyContent: "center",
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  vegIconWrapper: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: "#16A34A",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  nonVegIconWrapper: {
    borderColor: "#DC2626",
  },
  vegIconDot: {
    width: 10,
    height: 10,
    backgroundColor: "#16A34A",
    borderRadius: 5,
  },
  nonVegIconDot: {
    backgroundColor: "#DC2626",
  },
  itemName: {
    fontSize: 19,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
    letterSpacing: -0.2,
  },
  itemDescription: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
    marginBottom: 12,
  },
  readMore: {
    marginBottom: 12,
  },
  readMoreText: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "600",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemPrice: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  qtyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  qtyText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginRight: 6,
  },

  /* RIGHT SIDE - IMAGE + COUNTER */
  itemImageWrapper: {
    width: 130, 
    height: 130,
    position: "relative",
  },
  itemImageContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    overflow: "hidden",
  },
  menuItemImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  addButtonOnImage: {
    position: "absolute",
    bottom: -16,
    alignSelf: "center", 
    width: "80%",
    backgroundColor: "#E1EEDD", 
    borderColor: "#18A558",
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#18A558",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonText: {
    color: "#18A558", 
    fontSize: 17,
    fontWeight: "800",
    marginRight: 4,
  },

  quantityCounter: {
    position: "absolute",
    bottom: -16,
    alignSelf: "center",
    width: "85%",
    backgroundColor: "#18A558",
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#18A558",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  counterButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  counterText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },

  /* Sticky Header */
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255, 255, 255, 0.98)", 
    zIndex: 100,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 8,
  },
  stickyTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stickyBackButton: {
    padding: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 24, 
    paddingHorizontal: 18,
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#0F172A",
    fontWeight: "500",
  },
  menuButton: {
    padding: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
  },
  activeCategoryContainer: {
    marginTop: 10,
    paddingVertical: 10,
  },
  activeCategoryText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },

  /* Bottom Sheet Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)", 
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 15,
  },
  bottomSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 34, 
    maxHeight: "85%",
    paddingTop: 16,
  },
  bottomSheetImageContainer: {
    width: "100%",
    height: 240,
    marginTop: 8,
  },
  bottomSheetImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  bottomSheetItemInfo: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  bottomSheetItemName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  bottomSheetItemDesc: {
    fontSize: 16,
    color: "#64748B",
    marginTop: 8,
    lineHeight: 24,
  },
  divider: {
    height: 8,
    backgroundColor: "#F1F5F9", 
    width: "100%",
  },
  quantityHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 4,
  },
  quantityHeader: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  selectOptionBadge: {
    backgroundColor: "#FEF2F2", 
    color: "#DC2626", 
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: "700",
    overflow: "hidden",
  },
  selectOptionText: {
    fontSize: 15,
    color: "#64748B",
    paddingHorizontal: 24,
    marginBottom: 16,
    fontWeight: "500",
  },
  optionsScrollContainer: {
    maxHeight: 250,
  },
  optionsContainer: {
    paddingHorizontal: 24,
  },
  quantityOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  quantityOptionTextContainer: {
    flex: 1,
  },
  quantityOptionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 4,
  },
  quantityOptionTextSelected: {
    color: "#18A558", 
  },
  quantityPrice: {
    fontSize: 16,
    fontWeight: "500",
    color: "#64748B",
  },
  radioButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonSelected: {
    borderColor: "#18A558",
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#18A558",
  },

  bottomActionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
    backgroundColor: "#fff", 
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    marginTop: 10,
  },
  miniCounter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  miniCounterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  miniCounterText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    minWidth: 32,
    textAlign: "center",
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: "#18A558", 
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#18A558",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  addToCartText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  /* ==================== FLOATING UI STYLES ==================== */
  floatingMenuButton: {
    position: "absolute",
    bottom: 34,
    left: 24, 
    backgroundColor: "#0F172A",
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 99,
  },
  floatingMenuText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 8,
    letterSpacing: 1.2,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)", 
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 34, 
  },
  menuPopupContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    width: width * 0.85, 
    maxHeight: "55%",
    paddingHorizontal: 24,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
    marginBottom: 16,
  },
  menuPopupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
  },
  menuPopupRowText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#475569", 
    flex: 1,
  },
  menuPopupRowTextActive: {
    color: "#F43F5E", 
    fontWeight: "700",
  },
  menuCountText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
    textAlign: "right",
    minWidth: 30,
  },
  menuCountTextActive: {
    color: "#F43F5E",
    fontWeight: "700",
  },
  menuCloseFloatingButton: {
    flexDirection: "row",
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
    alignSelf: "flex-end", 
    marginRight: width * 0.075,
  },
  menuCloseFloatingText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 6,
  },

  /* NEW PREMIUM CHECKOUT FIXED BAR STYLES */
  cartFloatingBarContainer: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 98,
  },
  cartFloatingBar: {
    flexDirection: "row",
    backgroundColor: "#18A558", 
    width: width * 0.9,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#18A558",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 12,
  },
  cartMetaInfo: {
    flexDirection: "column",
  },
  cartCountTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.9,
  },
  cartPriceSubtitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 2,
  },
  cartViewButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  cartViewText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});