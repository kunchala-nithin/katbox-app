import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Alert,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import api from '@/src/lib/api';
import {
  getUser,
  refreshUser,
  updateUserAddress,
  SavedAddress,
  ActiveAddress,
} from '@/src/lib/authStorage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window');

const QUICK_BITES_WINDOW_MINUTES = 75;

const ArrowLeftIcon = () => (
  <Feather name="chevron-left" size={24} color="#0D2E22" />
);

const LeafIcon = () => (
  <Feather name="shield" size={20} color="#0F382A" />
);

interface HomeMadeCartItem {
  id: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  selectedQtyConfig: string;
  isVeg?: boolean;
}

interface DeliveryDateUICard {
  key: string;
  day: string;
  date: string;
  label: string;
  isToday: boolean;
}

interface DeliverySlotUIRow {
  id: string;
  time: string;
  type: string;
}

const buildDeliveryDates = (): DeliveryDateUICard[] => {
  const list: DeliveryDateUICard[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    list.push({
      key: `d_${iso}`,
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: String(d.getDate()),
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: i === 0,
    });
  }
  return list;
};

const STATIC_DELIVERY_DATES: DeliveryDateUICard[] = buildDeliveryDates();

const STATIC_DELIVERY_SLOTS: DeliverySlotUIRow[] = [
  { id: 's1', time: '7:00 AM - 9:00 AM', type: 'Standard Delivery' },
  { id: 's2', time: '9:00 AM - 11:00 AM', type: 'Standard Delivery' },
  { id: 's3', time: '11:00 AM - 1:00 PM', type: 'Standard Delivery' },
  { id: 's4', time: '5:00 PM - 7:00 PM', type: 'Evening Delivery' },
  { id: 's5', time: '7:00 PM - 9:00 PM', type: 'Evening Delivery' },
];

const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
  if (!addr) return '';
  if (addr.houseDetails && String(addr.houseDetails).trim().length > 0) {
    return `${addr.houseDetails}, ${addr.fullAddress}`;
  }
  return addr.fullAddress || '';
};

const formatTimeShort = (d: Date | null): string => {
  if (!d) return '';
  try {
    return d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

const formatTodayShort = (d: Date): string => {
  try {
    const day = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return `${day} ${month}`;
  } catch {
    return '';
  }
};

const HomeMadeOrderReview = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const params = route.params || {};
  const chefId = params.chefId || '';
  const chefName = params.chefName || 'Chef Partner';
  const chefImage = params.chefImage || '';
  const chefRating = params.chefRating || '';
  const chefLocation = params.chefLocation || '';
  const pageTitle = params.pageTitle || 'Home Made Items';
  const itemsParam = params.items || '[]';
  const totalItemsParam = params.totalItems || '0';
  const totalPriceParam = params.totalPrice || '0';
  const userId = params.userId || '';
  const userName = params.userName || '';

  const isQuickBites = useMemo(() => {
    if (String(params.isQuickBites || '').toLowerCase() === 'true') return true;
    const raw = String(params.category || pageTitle || '');
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');
    return normalized === 'quickbites';
  }, [params.isQuickBites, params.category, pageTitle]);

  const [quickBitesDeadline, setQuickBitesDeadline] = useState<Date | null>(null);
  useEffect(() => {
    if (isQuickBites) {
      setQuickBitesDeadline(
        new Date(Date.now() + QUICK_BITES_WINDOW_MINUTES * 60 * 1000)
      );
    } else {
      setQuickBitesDeadline(null);
    }
  }, [isQuickBites]);

  const cartItems: HomeMadeCartItem[] = useMemo(() => {
    try {
      const parsed = typeof itemsParam === 'string' ? JSON.parse(itemsParam) : itemsParam;
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.log('Error parsing homemade cart items:', e);
    }
    return [];
  }, [itemsParam]);

  const [editableItems, setEditableItems] = useState<HomeMadeCartItem[]>(cartItems);

  useEffect(() => {
    setEditableItems(cartItems);
  }, [cartItems]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(true);

  const [activeAddress, setActiveAddress] = useState<ActiveAddress | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');

  const [addressType, setAddressType] = useState<string>('Delivery');
  const [addressDetails, setAddressDetails] = useState<string>('');
  const [addressPhone, setAddressPhone] = useState<string>(params.phone || '');

  const [isAddressSheetVisible, setIsAddressSheetVisible] = useState<boolean>(false);
  const [isAddressModalVisible, setIsAddressModalVisible] = useState<boolean>(false);
  const [inputTitle, setInputTitle] = useState<string>('');
  const [inputDetails, setInputDetails] = useState<string>('');
  const [inputPhone, setInputPhone] = useState<string>('');

  const [selectedInstructionTag, setSelectedInstructionTag] = useState<string>('');
  const [chefNotesText, setChefNotesText] = useState<string>('');
  const [contactPhoneNumber, setContactPhoneNumber] = useState<string>(
    params.phone ? String(params.phone).replace(/[^0-9]/g, '').slice(-10) : ''
  );
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState<string>('');

  const [selectedDeliveryDateKey, setSelectedDeliveryDateKey] = useState<string>(
    (STATIC_DELIVERY_DATES.find((d) => !d.isToday) || STATIC_DELIVERY_DATES[0])?.key || ''
  );
  const [selectedDeliverySlotId, setSelectedDeliverySlotId] = useState<string>(
    STATIC_DELIVERY_SLOTS[0]?.id || ''
  );

  const selectedDeliveryDateLabel = useMemo(() => {
    const match = STATIC_DELIVERY_DATES.find((d) => d.key === selectedDeliveryDateKey);
    if (!match) return '';
    const dayLabel = match.isToday ? 'Today' : match.day;
    return `${dayLabel}, ${match.date} ${match.label}`;
  }, [selectedDeliveryDateKey]);

  const selectedDeliverySlotLabel = useMemo(() => {
    const match = STATIC_DELIVERY_SLOTS.find((s) => s.id === selectedDeliverySlotId);
    return match ? match.time : '';
  }, [selectedDeliverySlotId]);

  const quickBitesDateLabel = useMemo(() => {
    const now = new Date();
    return `Today, ${formatTodayShort(now)}`;
  }, [isQuickBites]);

  const quickBitesSlotLabel = useMemo(() => {
    if (!quickBitesDeadline) return '';
    return formatTimeShort(quickBitesDeadline);
  }, [quickBitesDeadline]);

  const effectiveDeliveryDateLabel = isQuickBites
    ? quickBitesDateLabel
    : selectedDeliveryDateLabel;

  const effectiveDeliverySlotLabel = isQuickBites
    ? quickBitesSlotLabel
    : selectedDeliverySlotLabel;

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const applyActiveAddressToUI = (addr: ActiveAddress | SavedAddress | null) => {
    if (!addr || !addr.fullAddress) {
      setAddressType('Delivery');
      setAddressDetails('');
      setSelectedAddressId('');
      return;
    }
    setActiveAddress({
      id: addr.id,
      title: addr.title || 'Delivery',
      houseDetails: addr.houseDetails || '',
      fullAddress: addr.fullAddress,
      latitude: addr.latitude || 0,
      longitude: addr.longitude || 0,
      tag: addr.tag || 'Home',
      updatedAt: (addr as ActiveAddress).updatedAt || new Date().toISOString(),
    });
    setAddressType(addr.title || addr.tag || 'Home');
    setAddressDetails(formatAddressDisplay(addr));
    if (addr.id) setSelectedAddressId(addr.id);
  };

  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        setIsLoadingAddress(true);
        try {
          const cached = await getUser();
          if (cached) {
            setCurrentUser(cached);
            const userPhone =
              cached.phone || (cached as any).mobile || (cached as any).phoneNumber || '';
            if (userPhone) {
              const cleaned = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
              setContactPhoneNumber(cleaned);
              setAddressPhone((prev) => (prev && prev.length > 0 ? prev : userPhone));
            }
            if (cached.activeAddress && cached.activeAddress.fullAddress) {
              applyActiveAddressToUI(cached.activeAddress);
            } else if (cached.address && String(cached.address).trim().length > 0) {
              setAddressDetails(String(cached.address).trim());
              setAddressType('Delivery');
            }
            if (Array.isArray(cached.savedAddresses)) {
              setSavedAddresses(cached.savedAddresses);
            }
          }

          const freshUser = await refreshUser();
          if (freshUser) {
            setCurrentUser(freshUser);
            const userPhone =
              freshUser.phone || (freshUser as any).mobile || (freshUser as any).phoneNumber || '';
            if (userPhone) {
              const cleaned = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
              setContactPhoneNumber(cleaned);
              setAddressPhone((prev) => (prev && prev.length > 0 ? prev : userPhone));
            }
            if (freshUser.activeAddress && freshUser.activeAddress.fullAddress) {
              applyActiveAddressToUI(freshUser.activeAddress);
            } else if (freshUser.address && String(freshUser.address).trim().length > 0) {
              setAddressDetails(String(freshUser.address).trim());
              setAddressType('Delivery');
            }
            if (Array.isArray(freshUser.savedAddresses)) {
              setSavedAddresses(freshUser.savedAddresses);
            }
          } else {
            try {
              const meRes = await api.get('/auth/me');
              if (meRes.data && meRes.data.user) {
                const user = meRes.data.user;
                setCurrentUser(user);
                const userPhone = user.phone || user.mobile || user.phoneNumber || '';
                if (userPhone) {
                  const cleaned = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
                  setContactPhoneNumber(cleaned);
                  setAddressPhone((prev) => (prev && prev.length > 0 ? prev : userPhone));
                }
                if (user.activeAddress && user.activeAddress.fullAddress) {
                  applyActiveAddressToUI(user.activeAddress);
                } else if (user.address) {
                  setAddressDetails(user.address);
                  setAddressType('Delivery');
                }
                if (Array.isArray(user.savedAddresses)) {
                  setSavedAddresses(user.savedAddresses);
                }
              }
            } catch (e) {
              console.log('api /auth/me fallback error:', e);
            }
          }
        } catch (err) {
          console.log('User load error in HomeMadeOrderReview:', err);
        } finally {
          setIsLoadingAddress(false);
        }
      };
      loadUser();
    }, [])
  );

  const instructionTags = [
    { id: 'less', label: 'Less spicy', icon: '💨' },
    { id: 'medium', label: 'Medium spicy', icon: '🌶️' },
    { id: 'very', label: 'Very spicy', icon: '🔥' },
    { id: 'noonion', label: 'No onion & garlic', icon: '🚫' },
  ];

  const { computedTotalItems, computedTotalPrice } = useMemo(() => {
    let count = 0;
    let price = 0;
    editableItems.forEach((it) => {
      count += it.quantity;
      price += (it.price || 0) * (it.quantity || 0);
    });
    return { computedTotalItems: count, computedTotalPrice: price };
  }, [editableItems]);

  const DELIVERY_FEE = 0;
  const TAX_FEE = 0;
  const grandTotal = computedTotalPrice + DELIVERY_FEE + TAX_FEE;

  const updateEditableItemQuantity = (itemId: string, newQty: number) => {
    if (newQty < 1) return;
    setEditableItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, quantity: newQty } : it))
    );
  };

  const handleBackNavigation = () => {
    if (navigation.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.back();
    }
  };

  const handleSelectSavedAddress = async (item: SavedAddress) => {
    const newActive: ActiveAddress = {
      id: item.id,
      title: item.title,
      houseDetails: item.houseDetails || '',
      fullAddress: item.fullAddress,
      latitude: item.latitude,
      longitude: item.longitude,
      tag: item.tag,
      updatedAt: new Date().toISOString(),
    };

    applyActiveAddressToUI(newActive);
    setIsAddressSheetVisible(false);

    await updateUserAddress({
      activeAddress: newActive,
      address: formatAddressDisplay(newActive),
    });
  };

  const handleKeepCurrentActive = () => {
    setIsAddressSheetVisible(false);
  };

  const handleSaveNewAddress = () => {
    if (inputTitle.trim() && inputDetails.trim()) {
      const manualActive: ActiveAddress = {
        id: `manual_${Date.now()}`,
        title: inputTitle.trim(),
        houseDetails: '',
        fullAddress: inputDetails.trim(),
        latitude: 0,
        longitude: 0,
        tag: 'Other',
        updatedAt: new Date().toISOString(),
      };
      applyActiveAddressToUI(manualActive);
      if (inputPhone.trim()) {
        setAddressPhone(inputPhone.trim());
      }
      setIsAddressModalVisible(false);
      setInputTitle('');
      setInputDetails('');
      setInputPhone('');

      updateUserAddress({
        activeAddress: manualActive,
        address: formatAddressDisplay(manualActive),
      });
    }
  };

  const handleAlternatePhoneChangeText = (text: string) => {
    const numericFilteredText = text.replace(/[^0-9]/g, '');
    if (numericFilteredText.length <= 10) {
      setAlternatePhoneNumber(numericFilteredText);
    }
  };

  const isFormValid = useMemo(() => {
    const dynamicCleanedPhone = contactPhoneNumber.replace(/[^0-9]/g, '');
    return (
      editableItems.length > 0 &&
      dynamicCleanedPhone.length === 10 &&
      addressType.trim().length > 0 &&
      addressDetails.trim().length > 0 &&
      addressPhone.trim().length > 0
    );
  }, [editableItems, contactPhoneNumber, addressType, addressDetails, addressPhone]);

  const handlePlaceOrder = async () => {
    if (!isFormValid || isSubmitting) return;
    try {
      setIsSubmitting(true);

      let finalDeliveryDate = effectiveDeliveryDateLabel;
      let finalDeliverySlot = effectiveDeliverySlotLabel;

      if (isQuickBites) {
        const orderTime = new Date();
        const deadline = new Date(
          orderTime.getTime() + QUICK_BITES_WINDOW_MINUTES * 60 * 1000
        );
        finalDeliveryDate = `Today, ${formatTodayShort(orderTime)}`;
        finalDeliverySlot = formatTimeShort(deadline);
      }

      const payload = {
        serviceType: 'homemade',
        userId: userId || currentUser?.id || currentUser?._id,
        userName: userName || currentUser?.name,
        chefId: chefId,
        chefName: chefName,
        chefImage: chefImage,
        totalItems: computedTotalItems,
        totalPrice: grandTotal,
        items: editableItems.map((it) => ({
          id: it.id,
          name: it.name,
          image: it.image,
          price: it.price,
          quantity: it.quantity,
          selectedQtyConfig: it.selectedQtyConfig,
          isVeg: it.isVeg,
        })),
        deliveryDate: finalDeliveryDate,
        deliverySlot: finalDeliverySlot,
        orderDetails: {
          contactPhone: contactPhoneNumber,
          alternatePhone: alternatePhoneNumber,
          addressType: addressType,
          addressDetails: addressDetails,
          addressPhone: addressPhone,
          activeAddress: activeAddress,
          instructionTag: selectedInstructionTag,
          chefNotes: chefNotesText,
          pageTitle: pageTitle,
          chefRating: chefRating,
          chefLocation: chefLocation,
          deliveryDateKey: selectedDeliveryDateKey,
          deliverySlotId: selectedDeliverySlotId,
          deliveryDate: finalDeliveryDate,
          deliverySlot: finalDeliverySlot,
          deliveryTimeSlot: finalDeliverySlot,
          isQuickBites: isQuickBites ? 'true' : 'false',
        },
      };

      const res = await api.post('/api/cart', payload);
      if (res.data && res.data.success) {
        router.push({
          pathname: '/screens/CartScreen',
          params: {
            serviceType: 'homemade',
            userId: userId || currentUser?.id || currentUser?._id || '',
            userName: userName || currentUser?.name || '',
            chefId,
            chefName,
            phone: contactPhoneNumber,
            alternatePhone: alternatePhoneNumber,
            deliveryDate: finalDeliveryDate,
            deliverySlot: finalDeliverySlot,
            isQuickBites: isQuickBites ? 'true' : 'false',
          },
        });
      } else {
        Alert.alert('Order Failed', (res.data && res.data.message) || 'An issue popped up while placing your order.');
      }
    } catch (err: any) {
      console.log('HomeMade order storage exception:', err);
      Alert.alert('Network Error', 'Unable to place your order right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />

      <View style={styles.rootContainer}>
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.backButtonHitbox}
            onPress={handleBackNavigation}
            activeOpacity={0.75}
          >
            <ArrowLeftIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Order</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollViewContainer}
          contentContainerStyle={styles.scrollContentContainer}
        >
          <View style={styles.chefSummaryCard}>
            <Image
              source={{ uri: chefImage || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400' }}
              style={styles.chefSummaryImage}
              resizeMode="cover"
            />
            <View style={styles.chefSummaryTextContent}>
              <View style={styles.chefSummaryHeaderRow}>
                <View style={styles.chefSummaryTitleWrapper}>
                  <Text style={styles.chefSummaryTitle} numberOfLines={1}>{pageTitle}</Text>
                  <Text style={styles.chefSummaryMetadata} numberOfLines={1}>
                    Crafted by {chefName}
                  </Text>
                </View>
                {!!chefRating && (
                  <View style={styles.chefSummaryRatingBadge}>
                    <Ionicons name="star" size={11} color="#FFFFFF" />
                    <Text style={styles.chefSummaryRatingText}>{chefRating}</Text>
                  </View>
                )}
              </View>

              {!!chefLocation && (
                <View style={styles.chefSummaryLocationRow}>
                  <MaterialIcons name="location-on" size={13} color="#0F382A" />
                  <Text style={styles.chefSummaryLocationText} numberOfLines={1}>
                    {chefLocation}
                  </Text>
                </View>
              )}

              <View style={styles.chefSummaryPillRow}>
                <View style={styles.chefSummaryPill}>
                  <Feather name="shield" size={11} color="#0F382A" />
                  <Text style={styles.chefSummaryPillText}>FSSAI Certified</Text>
                </View>
                <View style={[styles.chefSummaryPill, { marginLeft: 6 }]}>
                  <Feather name="package" size={11} color="#0F382A" />
                  <Text style={styles.chefSummaryPillText}>
                    {computedTotalItems} {computedTotalItems === 1 ? 'Item' : 'Items'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.orderItemsOuterContainer}>
            <View style={styles.sectionHeaderFlexContainer}>
              <Text style={styles.cardSectionMainHeaderLabelTitle}>Your Order</Text>
              <TouchableOpacity
                style={styles.editActionPillButtonBox}
                onPress={handleBackNavigation}
                activeOpacity={0.8}
              >
                <Text style={styles.editActionPillButtonText}>Add More</Text>
              </TouchableOpacity>
            </View>

            {editableItems.length === 0 ? (
              <View style={styles.emptyAddressBox}>
                <Ionicons name="fast-food-outline" size={26} color="#9EA8A3" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyAddressTitle}>Your cart is empty</Text>
                <Text style={styles.emptyAddressSubtitle}>
                  Please go back and add items to place an order.
                </Text>
              </View>
            ) : (
              editableItems.map((item, idx) => (
                <View
                  key={`${item.id}-${idx}`}
                  style={[
                    styles.orderItemRow,
                    idx === editableItems.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <Image
                    source={{ uri: item.image || 'https://via.placeholder.com/80' }}
                    style={styles.orderItemImage}
                  />
                  <View style={styles.orderItemInfoCol}>
                    <View style={styles.orderItemNameRow}>
                      <View
                        style={[
                          styles.vegIndicator,
                          !item.isVeg && styles.nonVegIndicator,
                        ]}
                      >
                        <View
                          style={[
                            styles.vegIndicatorDot,
                            !item.isVeg && styles.nonVegIndicatorDot,
                          ]}
                        />
                      </View>
                      <Text style={styles.orderItemName} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </View>
                    {!!item.selectedQtyConfig && (
                      <Text style={styles.orderItemVariantText}>
                        {item.selectedQtyConfig}
                      </Text>
                    )}
                    <View style={styles.orderItemPriceRow}>
                      <Text style={styles.orderItemPrice}>
                        ₹{item.price}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.orderItemStepper}>
                    <TouchableOpacity
                      style={styles.orderItemStepperBtn}
                      onPress={() => updateEditableItemQuantity(item.id, item.quantity - 1)}
                      activeOpacity={0.8}
                      disabled={item.quantity <= 1}
                    >
                      <Feather
                        name="minus"
                        size={13}
                        color={item.quantity <= 1 ? '#9EA8A3' : '#0F382A'}
                      />
                    </TouchableOpacity>
                    <Text style={styles.orderItemStepperText}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.orderItemStepperBtn}
                      onPress={() => updateEditableItemQuantity(item.id, item.quantity + 1)}
                      activeOpacity={0.8}
                    >
                      <Feather name="plus" size={13} color="#0F382A" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.phoneNumberVerificationOuterContainer}>
            <View style={styles.phoneNumberLeftInfoContentLayoutRow}>
              <View style={styles.iconCircleWrapper}>
                <Feather name="phone" size={14} color="#0F382A" />
              </View>
              <Text style={styles.phoneNumberLabelTextHeadingTitle}>Phone Number</Text>
            </View>
            <TextInput
              style={[styles.phoneNumberInputFieldTextBox, styles.phoneNumberInputFieldReadOnly]}
              placeholder="10 digit number"
              placeholderTextColor="#9EA8A3"
              keyboardType="phone-pad"
              maxLength={10}
              value={contactPhoneNumber}
              editable={false}
            />
          </View>

          <View style={styles.phoneNumberVerificationOuterContainer}>
            <View style={styles.phoneNumberLeftInfoContentLayoutRow}>
              <View style={[styles.iconCircleWrapper, { backgroundColor: 'rgba(15, 56, 42, 0.06)' }]}>
                <Feather name="phone-call" size={14} color="#0F382A" />
              </View>
              <View>
                <Text style={styles.phoneNumberLabelTextHeadingTitle}>Alternative Phone</Text>
                <Text style={styles.optionalFieldSubLabel}>(Optional)</Text>
              </View>
            </View>
            <TextInput
              style={styles.phoneNumberInputFieldTextBox}
              placeholder="Enter alternate number"
              placeholderTextColor="#9EA8A3"
              keyboardType="phone-pad"
              maxLength={10}
              value={alternatePhoneNumber}
              onChangeText={handleAlternatePhoneChangeText}
            />
          </View>

          <View style={styles.deliveryAddressOuterContainer}>
            <View style={styles.sectionHeaderFlexContainer}>
              <Text style={styles.cardSectionMainHeaderLabelTitle}>Delivery Address</Text>
              <TouchableOpacity
                style={styles.editActionPillButtonBox}
                onPress={() => setIsAddressSheetVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.editActionPillButtonText}>Change</Text>
              </TouchableOpacity>
            </View>

            {isLoadingAddress ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#166534" />
                <Text style={{ marginTop: 8, fontSize: 12, color: '#5B756C' }}>
                  Loading your address...
                </Text>
              </View>
            ) : addressDetails.trim().length > 0 ? (
              <View style={styles.addressInteriorDetailsRow}>
                <View style={styles.addressLeftDescriptionBlock}>
                  <View style={styles.addressHeaderRowLine}>
                    <Feather name="map-pin" size={14} color="#0F382A" style={{ marginRight: 6 }} />
                    <Text style={styles.addressLocationTypeBoldTitle}>{addressType}</Text>
                    {activeAddress ? (
                      <View style={styles.activeBadgeOnCard}>
                        <Ionicons name="checkmark-circle" size={11} color="#0F382A" />
                        <Text style={styles.activeBadgeOnCardText}>Active</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.addressParagraphTextDescription}>{addressDetails}</Text>
                  {addressPhone ? (
                    <Text style={styles.addressContactPhoneNumberLabel}>
                      Contact: {addressPhone}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.emptyAddressBox}>
                <Ionicons name="location-outline" size={26} color="#9EA8A3" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyAddressTitle}>No delivery address set</Text>
                <Text style={styles.emptyAddressSubtitle}>
                  Choose from your saved addresses or add a new one.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.addNewAddressDashedLineButtonWrapper}
              onPress={() => setIsAddressSheetVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addNewAddressPlusSymbolText}>
                +{' '}
                <Text style={styles.addNewAddressNormalTextLabel}>
                  {savedAddresses.length > 0 ? 'Select / Change Address' : 'Add or Choose Address'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {isQuickBites ? (
            <View style={styles.deliveryDateSlotOuterContainer}>
              <View style={styles.sectionHeaderFlexContainer}>
                <Text style={styles.cardSectionMainHeaderLabelTitle}>Quick Delivery</Text>
                <View style={styles.quickBitesBadge}>
                  <Feather name="zap" size={11} color="#0F382A" />
                  <Text style={styles.quickBitesBadgeText}>FAST</Text>
                </View>
              </View>

              <View style={styles.quickBitesInfoCard}>
                <View style={styles.quickBitesIconCircle}>
                  <Feather name="zap" size={18} color="#166534" />
                </View>
                <View style={styles.quickBitesTextBlock}>
                  <Text style={styles.quickBitesTitle}>Same Day Delivery</Text>
                  <Text style={styles.quickBitesSubtitle}>
                    Delivered within {QUICK_BITES_WINDOW_MINUTES} minutes of order — includes cooking & delivery
                  </Text>
                  <View style={styles.quickBitesTimePill}>
                    <Feather name="clock" size={12} color="#166534" />
                    <Text style={styles.quickBitesTimeText}>
                      Today by {formatTimeShort(quickBitesDeadline) || '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.deliveryDateSlotOuterContainer}>
                <View style={styles.sectionHeaderFlexContainer}>
                  <Text style={styles.cardSectionMainHeaderLabelTitle}>Choose Delivery Date</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.deliveryDateScrollContent}
                  style={styles.deliveryDateScrollView}
                >
                  {STATIC_DELIVERY_DATES.map((item) => {
                    const isSelected = selectedDeliveryDateKey === item.key;
                    const isDisabled = item.isToday;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        activeOpacity={isDisabled ? 1 : 0.75}
                        disabled={isDisabled}
                        onPress={() => {
                          if (isDisabled) return;
                          setSelectedDeliveryDateKey(item.key);
                        }}
                        style={[
                          styles.deliveryDateCard,
                          isSelected
                            ? styles.deliveryDateCardActive
                            : styles.deliveryDateCardInactive,
                          isDisabled && styles.deliveryDateCardDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.deliveryDateDayText,
                            isSelected
                              ? styles.deliveryDateDayTextActive
                              : styles.deliveryDateDayTextInactive,
                          ]}
                        >
                          {item.isToday ? 'Today' : item.day}
                        </Text>
                        <Text
                          style={[
                            styles.deliveryDateNumberText,
                            isSelected
                              ? styles.deliveryDateNumberTextActive
                              : styles.deliveryDateNumberTextInactive,
                          ]}
                        >
                          {item.date}
                        </Text>
                        <Text
                          style={[
                            styles.deliveryDateMonthText,
                            isSelected
                              ? styles.deliveryDateMonthTextActive
                              : styles.deliveryDateMonthTextInactive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.deliveryDateSlotOuterContainer}>
                <View style={styles.sectionHeaderFlexContainer}>
                  <Text style={styles.cardSectionMainHeaderLabelTitle}>
                    Preferred Delivery Time Slot
                  </Text>
                </View>

                <View style={styles.deliverySlotListWrapper}>
                  {STATIC_DELIVERY_SLOTS.map((slot) => {
                    const isSelected = selectedDeliverySlotId === slot.id;
                    return (
                      <TouchableOpacity
                        key={slot.id}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDeliverySlotId(slot.id)}
                        style={[
                          styles.deliverySlotRow,
                          isSelected
                            ? styles.deliverySlotRowActive
                            : styles.deliverySlotRowInactive,
                        ]}
                      >
                        <View style={styles.deliverySlotLeftCol}>
                          <Text style={styles.deliverySlotMainTimeText}>{slot.time}</Text>
                          <Text style={styles.deliverySlotSubTypeText}>{slot.type}</Text>
                        </View>

                        <View
                          style={[
                            styles.deliverySlotRadioOuter,
                            isSelected
                              ? styles.deliverySlotRadioOuterActive
                              : styles.deliverySlotRadioOuterInactive,
                          ]}
                        >
                          {isSelected && <View style={styles.deliverySlotRadioInner} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          <View style={styles.specialInstructionsOuterContainer}>
            <View style={styles.specialInstructionsHeaderRow}>
              <View style={styles.iconCircleWrapper}>
                <Feather name="file-text" size={14} color="#0F382A" />
              </View>
              <Text style={styles.specialInstructionsMainHeading}>Cooking Preferences</Text>
            </View>

            <View style={styles.instructionsTagRowGrid}>
              {instructionTags.map((tag) => {
                const isTagActiveSelected = selectedInstructionTag === tag.id;
                return (
                  <TouchableOpacity
                    key={tag.id}
                    activeOpacity={0.75}
                    onPress={() =>
                      setSelectedInstructionTag(isTagActiveSelected ? '' : tag.id)
                    }
                    style={[
                      styles.instructionItemPillBadgeFrame,
                      isTagActiveSelected
                        ? styles.instructionItemPillBadgeActive
                        : styles.instructionItemPillBadgeInactive,
                    ]}
                  >
                    <Text style={styles.instructionItemPillBadgeEmojiText}>{tag.icon}</Text>
                    <Text
                      style={[
                        styles.instructionItemPillBadgeLabelString,
                        isTagActiveSelected
                          ? styles.instructionItemPillBadgeLabelStringActive
                          : styles.instructionItemPillBadgeLabelStringInactive,
                      ]}
                    >
                      {tag.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.chefCustomNotesInputTextAreaBox}
              placeholder="Add a note for our chefs if you have any special requests..."
              placeholderTextColor="#9EA8A3"
              multiline={true}
              numberOfLines={4}
              value={chefNotesText}
              onChangeText={setChefNotesText}
            />

            <View style={styles.disclaimerBoxRow}>
              <Feather name="info" size={12} color="#5B756C" style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={styles.chefNotesDisclaimerMutedParagraphText}>
                Our chefs will try their best to follow your requests. However, refunds or cancellations in this regard won't be possible.
              </Text>
            </View>
          </View>

          <View style={styles.billSummaryOuterContainer}>
            <Text style={styles.billSummaryHeading}>Bill Summary</Text>

            <View style={styles.billRow}>
              <Text style={styles.billRowLabel}>
                Item Total ({computedTotalItems} {computedTotalItems === 1 ? 'item' : 'items'})
              </Text>
              <Text style={styles.billRowValue}>₹{computedTotalPrice}</Text>
            </View>

            <View style={styles.billRow}>
              <Text style={styles.billRowLabel}>Delivery Fee</Text>
              <Text style={styles.billRowValueFree}>FREE</Text>
            </View>

            <View style={styles.billRow}>
              <Text style={styles.billRowLabel}>Taxes & Charges</Text>
              <Text style={styles.billRowValue}>₹{TAX_FEE}</Text>
            </View>

            <View style={styles.billDivider} />

            <View style={styles.billRowTotal}>
              <Text style={styles.billRowTotalLabel}>To Pay</Text>
              <Text style={styles.billRowTotalValue}>₹{grandTotal}</Text>
            </View>
          </View>

          <View style={styles.freshnessGuaranteeAlertMessageBannerBoxContainer}>
            <View style={styles.freshnessGuaranteeLeafIconCircleFrameSquareContainer}>
              <LeafIcon />
            </View>
            <Text style={styles.freshnessGuaranteeParagraphBodyTextDescriptionText}>
              Your homemade order is covered by our delivery and high kitchen hygiene guarantees.
            </Text>
          </View>

          <View style={styles.howItWorksPanelBox}>
            <Text style={styles.howItWorksHeaderTitle}>How It Works</Text>
            <View style={styles.howItWorksStepsRow}>
              <View style={styles.howItWorksStepColumn}>
                <View style={styles.emojiCircleBg}>
                  <Text style={styles.howItWorksEmojiGraphic}>🥘</Text>
                </View>
                <Text style={styles.howItWorksStepHeading}>You Order</Text>
                <Text style={styles.howItWorksStepSubParagraph}>
                  Choose your favorite homemade dishes
                </Text>
              </View>

              <View style={styles.howItWorksStepColumn}>
                <View style={styles.emojiCircleBg}>
                  <Text style={styles.howItWorksEmojiGraphic}>👩‍🍳</Text>
                </View>
                <Text style={styles.howItWorksStepHeading}>Chef Cooks</Text>
                <Text style={styles.howItWorksStepSubParagraph}>
                  Freshly prepared in a home kitchen
                </Text>
              </View>

              <View style={styles.howItWorksStepColumn}>
                <View style={styles.emojiCircleBg}>
                  <Text style={styles.howItWorksEmojiGraphic}>🛍</Text>
                </View>
                <Text style={styles.howItWorksStepHeading}>We Deliver</Text>
                <Text style={styles.howItWorksStepSubParagraph}>
                  Hot, hygienic food at your door
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.extraBottomClearancePaddingSpaceLayoutFrameBox} />
        </ScrollView>

        {isFormValid && (
          <View style={styles.floatingFixedActionFooterCTAButtonPanelFrameBoxContainer}>
            <TouchableOpacity
              style={styles.primarySolidGreenCTAActionButtonContainer}
              activeOpacity={0.88}
              onPress={handlePlaceOrder}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FAF8F5" />
              ) : (
                <>
                  <Text style={styles.primarySolidGreenCTAActionButtonText}>
                    Place Order • ₹{grandTotal}
                  </Text>
                  <Feather
                    name="arrow-right"
                    size={15}
                    color="#FAF8F5"
                    style={styles.primarySolidGreenCTAActionButtonRightArrowSymbol}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={isAddressSheetVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsAddressSheetVisible(false)}
        >
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity
              style={styles.sheetBackdropDismiss}
              activeOpacity={1}
              onPress={() => setIsAddressSheetVisible(false)}
            />
            <View style={styles.savedAddressSheetContainer}>
              <View style={styles.sheetHandleBar} />
              <View style={styles.sheetHeaderRow}>
                <View>
                  <Text style={styles.sheetTitle}>Choose Delivery Location</Text>
                  <Text style={styles.sheetSubtitle}>Select from your saved addresses</Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setIsAddressSheetVisible(false)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="close" size={20} color="#0B261D" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.savedAddressList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {activeAddress && activeAddress.fullAddress ? (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.sectionLabelCaps}>ACTIVE ADDRESS</Text>
                    <TouchableOpacity
                      style={[styles.savedAddressItemCard, styles.savedAddressItemCardActive]}
                      activeOpacity={0.85}
                      onPress={handleKeepCurrentActive}
                    >
                      <View style={[styles.savedAddressIconCircle, styles.savedAddressIconCircleActive]}>
                        <Ionicons name="navigate" size={16} color="#FAF8F5" />
                      </View>
                      <View style={styles.savedAddressTextCol}>
                        <View style={styles.savedAddressTitleRow}>
                          <Text style={styles.savedAddressItemTitle}>
                            {activeAddress.title || 'Current'}
                          </Text>
                          <View style={styles.activeCheckPill}>
                            <Ionicons name="checkmark-circle" size={12} color="#0F382A" />
                            <Text style={styles.activeCheckPillText}>Active</Text>
                          </View>
                        </View>
                        {activeAddress.houseDetails ? (
                          <Text style={styles.savedAddressHouseString} numberOfLines={1}>
                            {activeAddress.houseDetails}
                          </Text>
                        ) : null}
                        <Text style={styles.savedAddressFullString} numberOfLines={2}>
                          {activeAddress.fullAddress}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <Text style={styles.sectionLabelCaps}>SAVED ADDRESSES</Text>
                {savedAddresses.length > 0 ? (
                  savedAddresses.map((item) => {
                    const isSelected =
                      selectedAddressId === item.id ||
                      (activeAddress && activeAddress.id === item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.savedAddressItemCard,
                          isSelected && styles.savedAddressItemCardActive,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => handleSelectSavedAddress(item)}
                      >
                        <View
                          style={[
                            styles.savedAddressIconCircle,
                            isSelected && styles.savedAddressIconCircleActive,
                          ]}
                        >
                          {item.tag === 'Home' && (
                            <Ionicons
                              name="home"
                              size={16}
                              color={isSelected ? '#FAF8F5' : '#0F382A'}
                            />
                          )}
                          {item.tag === 'Work' && (
                            <Ionicons
                              name="briefcase"
                              size={16}
                              color={isSelected ? '#FAF8F5' : '#0F382A'}
                            />
                          )}
                          {item.tag === 'Other' && (
                            <Ionicons
                              name="bookmark"
                              size={16}
                              color={isSelected ? '#FAF8F5' : '#0F382A'}
                            />
                          )}
                        </View>
                        <View style={styles.savedAddressTextCol}>
                          <View style={styles.savedAddressTitleRow}>
                            <Text style={styles.savedAddressItemTitle}>{item.title}</Text>
                            {isSelected && (
                              <View style={styles.activeCheckPill}>
                                <Ionicons name="checkmark-circle" size={12} color="#0F382A" />
                                <Text style={styles.activeCheckPillText}>Active</Text>
                              </View>
                            )}
                          </View>
                          {item.houseDetails ? (
                            <Text style={styles.savedAddressHouseString} numberOfLines={1}>
                              {item.houseDetails}
                            </Text>
                          ) : null}
                          <Text style={styles.savedAddressFullString} numberOfLines={2}>
                            {item.fullAddress}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.emptySavedAddressesBox}>
                    <Ionicons name="location-outline" size={26} color="#9EA8A3" style={{ marginBottom: 6 }} />
                    <Text style={styles.emptySavedAddressesTitle}>No saved addresses yet</Text>
                    <Text style={styles.emptySavedAddressesSubtitle}>
                      Save addresses from Home, or add a one-time address below.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.addNewAddressMapBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    setIsAddressSheetVisible(false);
                    setInputTitle('');
                    setInputDetails('');
                    setInputPhone(addressPhone || contactPhoneNumber || '');
                    setIsAddressModalVisible(true);
                  }}
                >
                  <View style={styles.addNewAddressIconBox}>
                    <Ionicons name="add" size={18} color="#0F382A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addNewAddressTitle}>Enter Address Manually</Text>
                    <Text style={styles.addNewAddressSubtitle}>
                      One-time for this order (sets as active)
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#5B756C" />
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isAddressModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsAddressModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsAddressModalVisible(false)}>
            <View style={styles.modalOverlayCenter}>
              <TouchableWithoutFeedback>
                <View style={styles.addressFormContainerBox}>
                  <Text style={styles.addressFormMainHeadingText}>Manage Delivery Address</Text>

                  <Text style={styles.inputLabelFieldTitleText}>Address Type</Text>
                  <TextInput
                    style={styles.addressInputFieldTextBox}
                    placeholder="e.g., Home, Office, Gym"
                    placeholderTextColor="#9EA8A3"
                    value={inputTitle}
                    onChangeText={setInputTitle}
                  />

                  <Text style={styles.inputLabelFieldTitleText}>Full Address Info</Text>
                  <TextInput
                    style={[styles.addressInputFieldTextBox, styles.addressInputFieldMultiLineTextHeight]}
                    placeholder="Enter full suite number, floor building name, area, pin code details"
                    placeholderTextColor="#9EA8A3"
                    multiline={true}
                    numberOfLines={3}
                    value={inputDetails}
                    onChangeText={setInputDetails}
                  />

                  <Text style={styles.inputLabelFieldTitleText}>Contact Mobile Number</Text>
                  <TextInput
                    style={styles.addressInputFieldTextBox}
                    placeholder="e.g., +91 98765 43210"
                    placeholderTextColor="#9EA8A3"
                    keyboardType="phone-pad"
                    value={inputPhone}
                    onChangeText={setInputPhone}
                  />

                  <View style={styles.addressFormActionsRowGridFrame}>
                    <TouchableOpacity
                      style={[styles.addressFormButtonBoxContainer, styles.addressFormCancelButtonBoxBg]}
                      onPress={() => setIsAddressModalVisible(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addressFormCancelButtonTextLabel}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.addressFormButtonBoxContainer, styles.addressFormSaveButtonBoxBg]}
                      onPress={handleSaveNewAddress}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.addressFormSaveButtonTextLabel}>Save Address</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  rootContainer: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FAF8F5',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 56, 42, 0.08)',
  },
  backButtonHitbox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0B261D',
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 38,
  },
  scrollViewContainer: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  scrollContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  chefSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  chefSummaryImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    marginRight: 14,
    backgroundColor: '#E5ECE8',
  },
  chefSummaryTextContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  chefSummaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  chefSummaryTitleWrapper: {
    flex: 1,
    paddingRight: 8,
  },
  chefSummaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  chefSummaryMetadata: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 3,
    fontWeight: '500',
  },
  chefSummaryRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#166534',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  chefSummaryRatingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  chefSummaryLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  chefSummaryLocationText: {
    fontSize: 11.5,
    color: '#4F6B61',
    fontWeight: '600',
    flex: 1,
  },
  chefSummaryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  chefSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  chefSummaryPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F382A',
  },
  orderItemsOuterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 56, 42, 0.06)',
  },
  orderItemImage: {
    width: 54,
    height: 54,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#E5ECE8',
  },
  orderItemInfoCol: {
    flex: 1,
    paddingRight: 8,
  },
  orderItemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vegIndicator: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: '#16A34A',
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    backgroundColor: '#FFFFFF',
  },
  nonVegIndicator: {
    borderColor: '#DC2626',
  },
  vegIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16A34A',
  },
  nonVegIndicatorDot: {
    backgroundColor: '#DC2626',
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B261D',
    flex: 1,
    letterSpacing: -0.1,
  },
  orderItemVariantText: {
    fontSize: 11,
    color: '#5B756C',
    fontWeight: '600',
    marginTop: 3,
    marginLeft: 18,
  },
  orderItemPriceRow: {
    marginTop: 4,
    marginLeft: 18,
  },
  orderItemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F382A',
  },
  orderItemStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.15)',
    borderRadius: 10,
    backgroundColor: '#FAF8F5',
  },
  orderItemStepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemStepperText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0B261D',
    minWidth: 20,
    textAlign: 'center',
  },
  sectionHeaderFlexContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardSectionMainHeaderLabelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  editActionPillButtonBox: {
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  editActionPillButtonText: {
    color: '#0F382A',
    fontSize: 11.5,
    fontWeight: '700',
  },
  phoneNumberVerificationOuterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  phoneNumberLeftInfoContentLayoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneNumberLabelTextHeadingTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  optionalFieldSubLabel: {
    fontSize: 10,
    color: '#5B756C',
    fontWeight: '600',
    marginTop: 1,
  },
  phoneNumberInputFieldTextBox: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0B261D',
    paddingVertical: 4,
    marginLeft: 16,
  },
  phoneNumberInputFieldReadOnly: {
    color: '#5B756C',
  },
  iconCircleWrapper: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  deliveryAddressOuterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  addressInteriorDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  addressLeftDescriptionBlock: {
    flex: 1,
  },
  addressHeaderRowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  addressLocationTypeBoldTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B261D',
  },
  activeBadgeOnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
  },
  activeBadgeOnCardText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F382A',
    marginLeft: 3,
  },
  addressParagraphTextDescription: {
    fontSize: 12.5,
    color: '#4F6B61',
    lineHeight: 18,
    marginLeft: 20,
    fontWeight: '500',
  },
  addressContactPhoneNumberLabel: {
    fontSize: 12,
    color: '#5B756C',
    marginTop: 6,
    marginLeft: 20,
    fontWeight: '600',
  },
  emptyAddressBox: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#FAF8F5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    marginBottom: 4,
  },
  emptyAddressTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B261D',
  },
  emptyAddressSubtitle: {
    fontSize: 11.5,
    color: '#5B756C',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
    fontWeight: '500',
  },
  addNewAddressDashedLineButtonWrapper: {
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.2)',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    backgroundColor: '#FFFFFF',
  },
  addNewAddressPlusSymbolText: {
    fontSize: 13,
    color: '#4F6B61',
    fontWeight: '500',
  },
  addNewAddressNormalTextLabel: {
    color: '#0B261D',
    fontWeight: '700',
  },
  deliveryDateSlotOuterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  deliveryDateScrollView: {
    marginTop: 12,
    marginHorizontal: -16,
  },
  deliveryDateScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  deliveryDateCard: {
    width: 68,
    height: 78,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  deliveryDateCardActive: {
    backgroundColor: '#166534',
    borderColor: '#166534',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  deliveryDateCardInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 56, 42, 0.12)',
  },
  deliveryDateCardDisabled: {
    opacity: 0.4,
    backgroundColor: '#F2EFEB',
    borderColor: '#E5E0D8',
  },
  deliveryDateDayText: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  deliveryDateDayTextActive: {
    color: '#FAF8F5',
  },
  deliveryDateDayTextInactive: {
    color: '#4F6B61',
  },
  deliveryDateNumberText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  deliveryDateNumberTextActive: {
    color: '#FAF8F5',
  },
  deliveryDateNumberTextInactive: {
    color: '#0B261D',
  },
  deliveryDateMonthText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  deliveryDateMonthTextActive: {
    color: '#FAF8F5',
  },
  deliveryDateMonthTextInactive: {
    color: '#5B756C',
  },
  deliverySlotListWrapper: {
    marginTop: 12,
  },
  deliverySlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  deliverySlotRowActive: {
    borderColor: '#166534',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
  },
  deliverySlotRowInactive: {
    borderColor: 'rgba(15, 56, 42, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  deliverySlotLeftCol: {
    flexDirection: 'column',
    flex: 1,
  },
  deliverySlotMainTimeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B261D',
  },
  deliverySlotSubTypeText: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
  },
  deliverySlotRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverySlotRadioOuterActive: {
    borderColor: '#166534',
    backgroundColor: '#166534',
  },
  deliverySlotRadioOuterInactive: {
    borderColor: 'rgba(15, 56, 42, 0.25)',
    backgroundColor: '#FFFFFF',
  },
  deliverySlotRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FAF8F5',
  },
  quickBitesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.18)',
  },
  quickBitesBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F382A',
    letterSpacing: 0.5,
  },
  quickBitesInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.06)',
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.18)',
  },
  quickBitesIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.2)',
  },
  quickBitesTextBlock: {
    flex: 1,
  },
  quickBitesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  quickBitesSubtitle: {
    fontSize: 11.5,
    color: '#4F6B61',
    marginTop: 3,
    fontWeight: '500',
    lineHeight: 16,
  },
  quickBitesTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.15)',
  },
  quickBitesTimeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#166534',
    marginLeft: 5,
    letterSpacing: 0.1,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 38, 29, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetBackdropDismiss: {
    flex: 1,
  },
  savedAddressSheetContainer: {
    backgroundColor: '#FAF8F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: height * 0.72,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandleBar: {
    width: 40,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(15, 56, 42, 0.15)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
  },
  savedAddressList: {
    marginBottom: 10,
  },
  sectionLabelCaps: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F382A',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  emptySavedAddressesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    marginBottom: 12,
  },
  emptySavedAddressesTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0B261D',
  },
  emptySavedAddressesSubtitle: {
    fontSize: 11.5,
    color: '#5B756C',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 16,
    fontWeight: '500',
  },
  savedAddressItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    marginBottom: 10,
  },
  savedAddressItemCardActive: {
    borderColor: '#166534',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
  },
  savedAddressIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  savedAddressIconCircleActive: {
    backgroundColor: '#166534',
  },
  savedAddressTextCol: {
    flex: 1,
    paddingRight: 6,
  },
  savedAddressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedAddressItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0B261D',
  },
  activeCheckPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 8,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
  },
  activeCheckPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0F382A',
    marginLeft: 2,
  },
  savedAddressHouseString: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B261D',
    marginTop: 2,
  },
  savedAddressFullString: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 2,
    lineHeight: 16,
    fontWeight: '500',
  },
  addNewAddressMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#166534',
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 13,
    marginTop: 4,
    marginBottom: 10,
  },
  addNewAddressIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addNewAddressTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F382A',
  },
  addNewAddressSubtitle: {
    fontSize: 11,
    color: '#5B756C',
    marginTop: 1,
    fontWeight: '500',
  },
  specialInstructionsOuterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  specialInstructionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  specialInstructionsMainHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  instructionsTagRowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  instructionItemPillBadgeFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  instructionItemPillBadgeActive: {
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    borderColor: '#0F382A',
  },
  instructionItemPillBadgeInactive: {
    backgroundColor: '#FAF8F5',
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  instructionItemPillBadgeEmojiText: {
    fontSize: 13,
    marginRight: 4,
  },
  instructionItemPillBadgeLabelString: {
    fontSize: 12,
    fontWeight: '600',
  },
  instructionItemPillBadgeLabelStringActive: {
    color: '#0F382A',
    fontWeight: '800',
  },
  instructionItemPillBadgeLabelStringInactive: {
    color: '#4F6B61',
  },
  chefCustomNotesInputTextAreaBox: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    color: '#0B261D',
    height: 84,
    textAlignVertical: 'top',
    marginBottom: 10,
    fontWeight: '500',
  },
  disclaimerBoxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  chefNotesDisclaimerMutedParagraphText: {
    fontSize: 11,
    color: '#5B756C',
    lineHeight: 16,
    flex: 1,
    fontWeight: '500',
  },
  billSummaryOuterContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  billSummaryHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  billRowLabel: {
    fontSize: 12.5,
    color: '#4F6B61',
    fontWeight: '600',
  },
  billRowValue: {
    fontSize: 12.5,
    color: '#0B261D',
    fontWeight: '700',
  },
  billRowValueFree: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  billDivider: {
    height: 1,
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    marginVertical: 10,
  },
  billRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billRowTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
  },
  billRowTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F382A',
    letterSpacing: -0.3,
  },
  freshnessGuaranteeAlertMessageBannerBoxContainer: {
    backgroundColor: 'rgba(15, 56, 42, 0.04)',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
  },
  freshnessGuaranteeLeafIconCircleFrameSquareContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  freshnessGuaranteeParagraphBodyTextDescriptionText: {
    fontSize: 12,
    color: '#0F382A',
    lineHeight: 18,
    fontWeight: '600',
    flex: 1,
  },
  howItWorksPanelBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 40,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  howItWorksHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B261D',
    marginBottom: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  howItWorksStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  howItWorksStepHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B261D',
    textAlign: 'center',
  },
  howItWorksStepSubParagraph: {
    fontSize: 10,
    color: '#5B756C',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
    fontWeight: '500',
  },
  howItWorksStepColumn: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 6,
  },
  emojiCircleBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FAF8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
  },
  howItWorksEmojiGraphic: {
    fontSize: 16,
  },
  extraBottomClearancePaddingSpaceLayoutFrameBox: {
    height: 120,
  },
  floatingFixedActionFooterCTAButtonPanelFrameBoxContainer: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: 'transparent',
    zIndex: 99,
    elevation: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  primarySolidGreenCTAActionButtonContainer: {
    backgroundColor: '#166534',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 200,
  },
  primarySolidGreenCTAActionButtonText: {
    color: '#FAF8F5',
    fontWeight: '800',
    fontSize: 14.5,
    letterSpacing: 0.2,
  },
  primarySolidGreenCTAActionButtonRightArrowSymbol: {
    marginLeft: 8,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(11, 38, 29, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  addressFormContainerBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  addressFormMainHeadingText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0B261D',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  inputLabelFieldTitleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B261D',
    marginBottom: 6,
    marginTop: 8,
  },
  addressInputFieldTextBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13.5,
    color: '#0B261D',
    backgroundColor: '#FAF8F5',
    fontWeight: '500',
  },
  addressInputFieldMultiLineTextHeight: {
    height: 76,
    textAlignVertical: 'top',
  },
  addressFormActionsRowGridFrame: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 22,
  },
  addressFormButtonBoxContainer: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressFormCancelButtonBoxBg: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  addressFormCancelButtonTextLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#4F6B61',
  },
  addressFormSaveButtonBoxBg: {
    backgroundColor: '#166534',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  addressFormSaveButtonTextLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FAF8F5',
  },
});

export default HomeMadeOrderReview;