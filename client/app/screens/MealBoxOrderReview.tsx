import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import api from '@/src/lib/api';
import {
  getUser,
  refreshUser,
  updateUserAddress,
  SavedAddress,
  ActiveAddress,
} from '@/src/lib/authStorage';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window');

const ArrowLeftIcon = () => (
  <Feather name="chevron-left" size={24} color="#0D2E22" />
);

const ChevronRightIcon = () => (
  <Feather name="chevron-right" size={20} color="#5B756C" />
);

const TruckIcon = () => (
  <Text style={{ fontSize: 20 }}>🚚</Text>
);

const LeafIcon = () => (
  <Feather name="shield" size={20} color="#0F382A" />
);

const FOOD_THUMB = { uri: 'https://via.placeholder.com/80?text=Food' };

interface DeliveryDate {
  day: string;
  date: string;
  label: string;
  fullDateString: string;
  isPastCutoff: boolean;
}

interface FlexibleDayParam {
  dayName: string;
  dayNumber: string;
  monthName: string;
  fullDateString: string;
}

const getOrdinalSuffix = (dayNum: number): string => {
  if (dayNum > 3 && dayNum < 21) return 'th';
  switch (dayNum % 10) {
    case 1:  return 'st';
    case 2:  return 'nd';
    case 3:  return 'rd';
    default: return 'th';
  }
};

const formatReadableDate = (dateStr?: string, fallbackDay = 'Mon'): string => {
  if (!dateStr) {
    return fallbackDay;
  }
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const suffix = getOrdinalSuffix(day);
    return `${day}${suffix} ${monthNames[monthIndex] || ''}`;
  }
  return dateStr;
};

const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
  if (!addr) return '';
  if (addr.houseDetails && String(addr.houseDetails).trim().length > 0) {
    return `${addr.houseDetails}, ${addr.fullAddress}`;
  }
  return addr.fullAddress || '';
};

const MealBoxOrderReview = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const calendarScrollViewRef = useRef<ScrollView>(null);
  
  // Extract custom parameters injected from MealBoxItems screen route params
  const params = route.params || {};
  const planId = params.planId || "";
  const planName = params.planName || "Classic Lunch";
  const planPrice = params.planPrice || "1014";
  const originalBasePrice = params.originalBasePrice || "";
  const mealsPerDay = params.mealsPerDay || "1 Meals / Day";
  const mealsPerWeek = params.mealsPerWeek || "6 Meals / Week";
  const planImage = params.planImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';
  const chefId = params.chefId || "";
  const chefName = params.chefName || "Expert MealBox Chef";
  const userId = params.userId || "";
  const userName = params.userName || "";
  const description = params.description || "";
  const category = params.category || "";
  const selectedSelections = params.selectedSelections || "{}";
  const addonQuantities = params.addonQuantities || "{}";
  const weeklySelectionsParam = params.weeklySelections || "{}";
  const selectedDurationType = params.selectedDurationType || "Weekly Plan";
  const chosenFlexibleDates = params.chosenFlexibleDates || "";

  // Dynamic User State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(true);

  // ─── Active + Saved Addresses (same source as Home.tsx) ───
  const [activeAddress, setActiveAddress] = useState<ActiveAddress | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');

  // Display fields derived from activeAddress
  const [addressType, setAddressType] = useState<string>('Delivery');
  const [addressDetails, setAddressDetails] = useState<string>('');
  const [addressPhone, setAddressPhone] = useState<string>(params.phone || '');
  
  // Address chooser bottom sheet (Active + Saved)
  const [isAddressSheetVisible, setIsAddressSheetVisible] = useState<boolean>(false);

  // Legacy manual address modal (still available for quick override)
  const [isAddressModalVisible, setIsAddressModalVisible] = useState<boolean>(false);
  const [inputTitle, setInputTitle] = useState<string>('');
  const [inputDetails, setInputDetails] = useState<string>('');
  const [inputPhone, setInputPhone] = useState<string>('');

  // Special Instructions & Phone Verification States
  const [selectedInstructionTag, setSelectedInstructionTag] = useState<string>('');
  const [chefNotesText, setChefNotesText] = useState<string>('');
  const [contactPhoneNumber, setContactPhoneNumber] = useState<string>(params.phone ? String(params.phone).replace(/[^0-9]/g, '').slice(-10) : '');
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState<string>('');

  // Apply active address object into the display fields used by the rest of the screen
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

  // Fetch logged in user + activeAddress + savedAddresses (same as Home)
  useFocusEffect(
    useCallback(() => {
      const loadUser = async () => {
        setIsLoadingAddress(true);
        try {
          // 1) Cached session first (fast)
          const cached = await getUser();
          if (cached) {
            setCurrentUser(cached);
            const userPhone = cached.phone || (cached as any).mobile || (cached as any).phoneNumber || "";
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

          // 2) Fresh from server (source of truth)
          const freshUser = await refreshUser();
          if (freshUser) {
            setCurrentUser(freshUser);
            const userPhone = freshUser.phone || (freshUser as any).mobile || (freshUser as any).phoneNumber || "";
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
            // Fallback API
            try {
              const meRes = await api.get("/auth/me");
              if (meRes.data && meRes.data.user) {
                const user = meRes.data.user;
                setCurrentUser(user);
                const userPhone = user.phone || user.mobile || user.phoneNumber || "";
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
              console.log("api /auth/me fallback error:", e);
            }
          }
        } catch (err) {
          console.log("User load error in MealBoxOrderReview:", err);
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

  // Parse the initial incoming flexible or weekly scheduled dates to establish standard list state values
  const initialFlexibleDatesArray = useMemo(() => {
    if ((selectedDurationType === "Weekly Plan" || selectedDurationType === "Flexible Days" || selectedDurationType === "Single Meal") && chosenFlexibleDates) {
      try {
        const parsed: FlexibleDayParam[] = JSON.parse(chosenFlexibleDates);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.log("Error parsing initial flexible parameters matrix:", e);
      }
    }
    return [];
  }, [selectedDurationType, chosenFlexibleDates]);

  // Track state collections list structure mapping actively customized flex/weekly days
  const [customFlexDatesList, setCustomFlexDatesDatesList] = useState<FlexibleDayParam[]>(initialFlexibleDatesArray);

  // Keep state updated in case parameters update asynchronously
  useEffect(() => {
    setCustomFlexDatesDatesList(initialFlexibleDatesArray);
  }, [initialFlexibleDatesArray]);

  // Active lookup set to optimize quick identity sweeps inside view loops
  const flexibleDatesSet = useMemo(() => {
    const datesMap = new Set<string>();
    customFlexDatesList.forEach(d => datesMap.add(d.fullDateString));
    return datesMap;
  }, [customFlexDatesList]);

  // Dynamically generate dates from today through the next month (60 days rolling window) with category-based 4-hour cutoff logic
  const deliveryDays: DeliveryDate[] = useMemo(() => {
    const daysList: DeliveryDate[] = [];
    const today = new Date();
    const currentHour = today.getHours();

    // Determine dynamic cutoff hour based on meal category context (4 hours prior to typical delivery slot)
    let cutoffHour = 10; // Fallback default
    const cat = category.toLowerCase();
    
    if (cat.includes("breakfast")) {
      cutoffHour = 4; // 4:00 AM cutoff for 8:00 AM Delivery
    } else if (cat.includes("lunch") && cat.includes("dinner")) {
      cutoffHour = 9; // 9:00 AM cutoff for combined systems starting with Lunch
    } else if (cat.includes("lunch")) {
      cutoffHour = 9; // 9:00 AM cutoff for 1:00 PM Delivery
    } else if (cat.includes("snack")) {
      cutoffHour = 13; // 1:00 PM cutoff for 5:00 PM Delivery
    } else if (cat.includes("dinner")) {
      cutoffHour = 16; // 4:00 PM cutoff for 8:00 PM Delivery
    }

    // Generate dates for current month remaining days and the entire next month (rolling 60 days)
    const TOTAL_DAYS_TO_SHOW = 60;

    for (let dayOffset = 0; dayOffset < TOTAL_DAYS_TO_SHOW; dayOffset++) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + dayOffset);

      const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = targetDate.toLocaleDateString('en-US', { month: 'short' });
      const dayNumber = String(targetDate.getDate());
      const localIsoString = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
      
      const isToday = dayOffset === 0;
      const isPastCutoff = isToday && currentHour >= cutoffHour;

      daysList.push({
        day: dayName,
        date: dayNumber,
        label: monthName,
        fullDateString: localIsoString,
        isPastCutoff: isPastCutoff,
      });
    }
    return daysList;
  }, [category]);

  // Filter out the timeline dynamically to only display scheduled days if the type is Weekly Plan
  const displayFilteredDeliveryDays = useMemo(() => {
    if (selectedDurationType === "Weekly Plan") {
      return deliveryDays.filter(d => flexibleDatesSet.has(d.fullDateString));
    }
    return deliveryDays;
  }, [deliveryDays, selectedDurationType, flexibleDatesSet]);

  // Compute dynamic pre-selected slot context baseline mapping parameters safely matching exact elements
  const initialSelectedDateString = useMemo(() => {
    if ((selectedDurationType === "Weekly Plan" || selectedDurationType === "Flexible Days" || selectedDurationType === "Single Meal") && customFlexDatesList.length > 0) {
      const matchedDay = deliveryDays.find(d => d.fullDateString === customFlexDatesList[0].fullDateString && !d.isPastCutoff);
      if (matchedDay) {
        return `${matchedDay.day}, ${matchedDay.date} ${matchedDay.label}`;
      }
    }
    
    // Fallback selection framework guaranteeing available windows
    const firstAvailableDay = deliveryDays.find(d => !d.isPastCutoff);
    return firstAvailableDay ? `${firstAvailableDay.day}, ${firstAvailableDay.date} ${firstAvailableDay.label}` : '';
  }, [selectedDurationType, customFlexDatesList, deliveryDays]);

  const [selectedDate, setSelectedDate] = useState<string>(initialSelectedDateString);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // Sync state cleanly whenever incoming structure updates dynamically
  useEffect(() => {
    if (initialSelectedDateString) {
      setSelectedDate(initialSelectedDateString);
    }
  }, [initialSelectedDateString]);

  // Auto-scroll logic targeting the first scheduled or chosen delivery date box inside the row frame
  useEffect(() => {
    if (selectedDurationType !== "Weekly Plan" && customFlexDatesList.length > 0 && displayFilteredDeliveryDays.length > 0) {
      const targetIndex = displayFilteredDeliveryDays.findIndex(
        d => d.fullDateString === customFlexDatesList[0].fullDateString
      );
      if (targetIndex !== -1) {
        const itemWidth = (width - 32 - 32) / 4.2;
        const totalGapSpacing = 8;
        const computedScrollXOffset = targetIndex * (itemWidth + totalGapSpacing);
        
        setTimeout(() => {
          calendarScrollViewRef.current?.scrollTo({
            x: computedScrollXOffset,
            y: 0,
            animated: true,
          });
        }, 150);
      }
    }
  }, [customFlexDatesList, displayFilteredDeliveryDays, selectedDurationType]);

  // Comprehensive static global list containing all possible structural operations targets
  const timeSlots = [
    { id: '1', time: '7:00 AM - 9:00 AM', type: 'Standard Delivery', cutoffHour: 3, mealType: 'breakfast' },
    { id: '2', time: '9:00 AM - 11:00 AM', type: 'Standard Delivery', cutoffHour: 5, mealType: 'breakfast' },
    { id: '3', time: '11:00 AM - 1:00 PM', type: 'Standard Delivery', cutoffHour: 7, mealType: 'lunch' },
    { id: '4', time: '5:00 PM - 7:00 PM', type: 'Evening Delivery', cutoffHour: 13, mealType: 'snack' },
    { id: '5', time: '7:00 PM - 9:00 PM', type: 'Evening Delivery', cutoffHour: 15, mealType: 'dinner' }
  ];

  // Auto-select the first available time slot that isn't expired when the selected date changes
  useEffect(() => {
    const today = new Date();
    const currentHour = today.getHours();
    const activeDayObj = deliveryDays.find(d => `${d.day}, ${d.date} ${d.label}` === selectedDate);
    const isTargetingToday = activeDayObj && activeDayObj.fullDateString === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const cat = category.toLowerCase();

    const defaultSlot = timeSlots.find(slot => {
      let isCategoryMatch = false;
      if (cat.includes("breakfast")) isCategoryMatch = slot.mealType === 'breakfast';
      else if (cat.includes("lunch") && cat.includes("dinner")) isCategoryMatch = slot.mealType === 'lunch' || slot.mealType === 'dinner';
      else if (cat.includes("lunch")) isCategoryMatch = slot.mealType === 'lunch';
      else if (cat.includes("snack")) isCategoryMatch = slot.mealType === 'snack';
      else if (cat.includes("dinner")) isCategoryMatch = slot.mealType === 'dinner';
      
      return isCategoryMatch && (!isTargetingToday || currentHour < slot.cutoffHour);
    });

    if (defaultSlot) {
      setSelectedSlot(defaultSlot.time);
    } else {
      setSelectedSlot('');
    }
  }, [selectedDate, deliveryDays, category]);

  // State to manage bottom sheet menu summary modal visibility
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [modalActiveDay, setModalActiveDay] = useState<string>('Mon');

  // Safe parsing of items for display inside the menu selection summary popup
  let parsedSelections: any = {};
  let parsedAddons: any = {};
  let parsedWeeklySelections: Record<string, any[]> = {};

  try {
    parsedSelections = typeof selectedSelections === 'string' ? JSON.parse(selectedSelections) : selectedSelections;
    parsedAddons = typeof addonQuantities === 'string' ? JSON.parse(addonQuantities) : addonQuantities;
    parsedWeeklySelections = typeof weeklySelectionsParam === 'string' ? JSON.parse(weeklySelectionsParam) : weeklySelectionsParam;
  } catch (e) {
    parsedSelections = {};
    parsedAddons = {};
    parsedWeeklySelections = {};
  }

  // Derived array list properties matching exactly out custom dynamic duration profile segments configuration mapping
  const activeDaysToRender = useMemo(() => {
    const keysList = Object.keys(parsedWeeklySelections);
    if (keysList.length > 0) return keysList;
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  }, [parsedWeeklySelections]);

  // Sync current active day selection with the newly derived dynamically incoming list indices parameters
  useMemo(() => {
    if (activeDaysToRender.length > 0 && !activeDaysToRender.includes(modalActiveDay)) {
      setModalActiveDay(activeDaysToRender[0]);
    }
  }, [activeDaysToRender]);

  const groupSelectionsBySectionCategory = (flatItemsList: any[]) => {
    const categoriesMap: Record<string, any[]> = {};
    if (!Array.isArray(flatItemsList)) return categoriesMap;
    flatItemsList.forEach((item) => {
      if (!categoriesMap[item.section]) {
        categoriesMap[item.section] = [];
      }
      categoriesMap[item.section].push(item);
    });
    return categoriesMap;
  };

  // Dynamic selector routine parsing insertion toggle properties context safely
  const handleCalendarDaySelectionPress = (item: DeliveryDate) => {
    if (item.isPastCutoff) {
      Alert.alert("Cutoff Time Passed", "Today's preparation and booking window has closed for this specific category slot due to the 4-hour advanced scheduling constraint.");
      return;
    }
    
    const uniqueKeyId = `${item.day}, ${item.date} ${item.label}`;
    
    if (flexibleDatesSet.has(item.fullDateString) || selectedDurationType === "Single Meal" || selectedDurationType === "Flexible Days") {
      setSelectedDate(uniqueKeyId);
    }
  };

  const handleBackNavigation = () => {
    navigation.navigate('MealBoxItems', {
      planId,
      planName,
      planPrice: params.planPrice, 
      originalBasePrice: originalBasePrice,
      description,
      mealsPerDay,
      mealsPerWeek,
      category,
      planImage,
      chefId,
      chefName,
      userId,
      userName,
      phone: contactPhoneNumber,
      alternatePhone: alternatePhoneNumber,
      location: params.location || '',
      chefImage: params.chefImage || '',
      avatar: params.avatar || '',
      rating: params.rating || '',
      returnSelectedSelections: selectedSelections,
      returnAddonQuantities: addonQuantities,
      selectedDurationType: selectedDurationType,
      chosenFlexibleDates: JSON.stringify(customFlexDatesList),
      returnPlanPrice: originalBasePrice 
    });
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

  const handleReviewOrderSubmit = async () => {
    try {
      const scheduledDatesListFormatted = customFlexDatesList.map(item => {
        return `${item.dayName}, ${item.dayNumber} ${item.monthName}`;
      });

      const payload = {
        serviceType: 'mealbox',
        userId: userId || currentUser?.id || currentUser?._id,
        userName: userName || currentUser?.name,
        chefId: chefId,
        chefName: chefName,
        totalItems: activeDaysToRender.length,
        totalPrice: Number(planPrice),
        menu: {
          id: planId,
          name: planName,
          price: planPrice,
          originalBasePrice: originalBasePrice,
          imageUrl: planImage,
          mealsPerDay: mealsPerDay,
          mealsPerWeek: mealsPerWeek,
          description: description,
          category: category,
          durationType: selectedDurationType
        },
        selections: parsedWeeklySelections,
        addons: parsedAddons,
        orderDetails: {
          contactPhone: contactPhoneNumber,
          alternatePhone: alternatePhoneNumber,
          addressType: addressType,
          addressDetails: addressDetails,
          addressPhone: addressPhone,
          activeAddress: activeAddress,
          deliveryDate: selectedDate,
          deliveryTimeSlot: selectedSlot,
          scheduledDatesList: customFlexDatesList,
          scheduledDatesFormatted: scheduledDatesListFormatted,
          instructionTag: selectedInstructionTag,
          chefNotes: chefNotesText,
          selectedDurationType: selectedDurationType
        }
      };

      const res = await api.post('/api/cart', payload);
      if (res.data.success) {
        router.push({
          pathname: "/screens/CartScreen",
          params: { 
            serviceType: 'mealbox', 
            userId: userId || currentUser?.id || currentUser?._id || "", 
            userName: userName || currentUser?.name || "", 
            chefId, 
            chefName,
            phone: contactPhoneNumber,
            alternatePhone: alternatePhoneNumber
          }
        });
      } else {
        Alert.alert("Execution Stopped", res.data.message || "An issue popped up transferring your data.");
      }
    } catch (err: any) {
      console.log("MealBox order storage exception errors:", err);
      Alert.alert("Network Error", "Unable to securely cache order parameters into remote cloud storage.");
    }
  };

  const activeDayItemsList = parsedWeeklySelections[modalActiveDay] || [];
  const groupedModalItems = groupSelectionsBySectionCategory(activeDayItemsList);

  const displayPricingUnitLabel = useMemo(() => {
    if (selectedDurationType === "Flexible Days") {
      return `/ ${activeDaysToRender.length} days`;
    }
    if (selectedDurationType === "Single Meal") {
      return "/ box";
    }
    return "/ wk";
  }, [selectedDurationType, activeDaysToRender]);

  const isFormValid = useMemo(() => {
    const dynamicCleanedPhone = contactPhoneNumber.replace(/[^0-9]/g, '');
    return (
      dynamicCleanedPhone.length === 10 &&
      addressType.trim().length > 0 &&
      addressDetails.trim().length > 0 &&
      addressPhone.trim().length > 0 &&
      selectedDate.trim().length > 0 &&
      selectedSlot.trim().length > 0
    );
  }, [contactPhoneNumber, addressType, addressDetails, addressPhone, selectedDate, selectedSlot]);

  const handleAlternatePhoneChangeText = (text: string) => {
    const numericFilteredText = text.replace(/[^0-9]/g, '');
    if (numericFilteredText.length <= 10) {
      setAlternatePhoneNumber(numericFilteredText);
    }
  };

  const isSingleDay = activeDaysToRender.length === 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      
      {/* Root Layout Wrapper */}
      <View style={styles.rootContainer}>
        
        {/* Top Header Section */}
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
          {/* MEAL PLAN PACKAGE CARD */}
          <View style={styles.mealPackageCard}>
            <Image 
              source={{ 
                uri: planImage 
              }} 
              style={styles.mealImage} 
              resizeMode="cover"
            />
            <View style={styles.mealCardTextContent}>
              <View style={styles.mealCardHeaderRow}>
                <View style={styles.mealTitleWrapper}>
                  <Text style={styles.mealTitle} numberOfLines={1}>{planName}</Text>
                  <Text style={styles.mealMetadata}>{mealsPerDay}  •  {mealsPerWeek}</Text>
                </View>
                <View style={styles.mealPriceWrapper}>
                  <Text style={styles.mealPricing}>
                    ₹{planPrice} <Text style={styles.mealPricingSubText}>{displayPricingUnitLabel}</Text>
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity 
                style={styles.selectedItemsButton} 
                onPress={() => setIsModalVisible(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.selectedItemsButtonText}>View Menu Selections</Text>
                <Feather name="chevron-down" size={13} color="#0F382A" style={styles.selectedItemsChevronIcon} />
              </TouchableOpacity>
            </View>
          </View>

          {/* PRIMARY PHONE NUMBER (READ-ONLY / NON-EDITABLE) */}
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

          {/* ALTERNATIVE MOBILE NUMBER (OPTIONAL / USER INPUT ENABLED) */}
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

          {/* DELIVERY ADDRESS CARD */}
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
                <Text style={{ marginTop: 8, fontSize: 12, color: '#5B756C' }}>Loading your address...</Text>
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
                    <Text style={styles.addressContactPhoneNumberLabel}>Contact: {addressPhone}</Text>
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
                +  <Text style={styles.addNewAddressNormalTextLabel}>
                  {savedAddresses.length > 0 ? 'Select / Change Address' : 'Add or Choose Address'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* CHOOSE DELIVERY SLOT SEGMENT */}
          <View style={styles.sectionSpacingBlock}>
            <View style={styles.slotHeaderLabelLineRow}>
              <Text style={styles.chooseDeliverySlotPrimaryLabelTitleText}>
                {(selectedDurationType === "Weekly Plan" || selectedDurationType === "Flexible Days" || selectedDurationType === "Single Meal") 
                  ? "Scheduled Delivery Date" 
                  : "Choose Delivery Date"}
              </Text>
            </View>

            {/* Horizontally Scrollable Calendar Dates Segment Container */}
            <ScrollView 
              ref={calendarScrollViewRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalCalendarScrollContainer}
              style={styles.horizontalCalendarScrollView}
            >
              {displayFilteredDeliveryDays.map((item) => {
                const uniqueKeyId = `${item.day}, ${item.date} ${item.label}`;
                
                const isSelectedDayState = (selectedDurationType === "Weekly Plan" || selectedDurationType === "Flexible Days" || selectedDurationType === "Single Meal")
                  ? flexibleDatesSet.has(item.fullDateString)
                  : selectedDate === uniqueKeyId;
                
                const isFlexActive = selectedDurationType === "Flexible Days" || selectedDurationType === "Single Meal" || selectedDurationType === "Weekly Plan";
                const isDayAllowed = !isFlexActive || (flexibleDatesSet.has(item.fullDateString) && !item.isPastCutoff);
                const isBoxDisabled = item.isPastCutoff || !isDayAllowed;

                return (
                  <TouchableOpacity
                    key={item.fullDateString}
                    activeOpacity={isSelectedDayState ? 1 : 0.7}
                    disabled={isBoxDisabled}
                    onPress={() => handleCalendarDaySelectionPress(item)}
                    style={[
                      styles.calendarColumnItemDayBoxCard,
                      isSelectedDayState ? styles.calendarColumnItemDayBoxCardActiveSelected : styles.calendarColumnItemDayBoxCardInactive,
                      isBoxDisabled && { opacity: 0.35, backgroundColor: '#F2EFEB', borderColor: '#E5E0D8' }
                    ]}
                  >
                    <Text style={[styles.calendarColumnTopDayTextLabel, isSelectedDayState ? styles.calendarColumnTopDayTextLabelActive : styles.calendarColumnTopDayTextLabelInactive]}>
                      {item.day}
                    </Text>
                    <Text style={[styles.calendarColumnMiddleDateValueNumber, isSelectedDayState ? styles.calendarColumnMiddleDateValueNumberActive : styles.calendarColumnMiddleDateValueNumberInactive]}>
                      {item.date}
                    </Text>
                    <Text style={[styles.calendarColumnBottomMonthLabelText, isSelectedDayState ? styles.calendarColumnBottomMonthLabelTextActive : styles.calendarColumnBottomMonthLabelTextInactive]}>
                      {item.isPastCutoff ? "Closed" : item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.slotHeaderLabelLineRow, { marginTop: 6 }]}>
              <Text style={styles.chooseDeliverySlotPrimaryLabelTitleText}>Preferred Delivery Time Slot</Text>
            </View>

            {/* Time Slots Radio Group List */}
            <View style={styles.timeSlotsVerticalRadioListWrapperBlockContainer}>
              {timeSlots.map((slot) => {
                const today = new Date();
                const currentHour = today.getHours();
                const cat = category.toLowerCase();
                
                const activeDayObj = deliveryDays.find(d => `${d.day}, ${d.date} ${d.label}` === selectedDate);
                const isTargetingToday = activeDayObj && activeDayObj.fullDateString === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                
                let isCategoryMismatch = false;
                if (cat.includes("breakfast")) isCategoryMismatch = slot.mealType !== 'breakfast';
                else if (cat.includes("lunch") && cat.includes("dinner")) isCategoryMismatch = slot.mealType !== 'lunch' && slot.mealType !== 'dinner';
                else if (cat.includes("lunch")) isCategoryMismatch = slot.mealType !== 'lunch';
                else if (cat.includes("snack")) isCategoryMismatch = slot.mealType !== 'snack';
                else if (cat.includes("dinner")) isCategoryMismatch = slot.mealType !== 'dinner';

                const isSlotExpired = (isTargetingToday && currentHour >= slot.cutoffHour) || isCategoryMismatch;
                const isSlotActiveChecked = selectedSlot === slot.time;
                
                return (
                  <TouchableOpacity
                    key={slot.id}
                    activeOpacity={0.8}
                    disabled={isSlotExpired}
                    onPress={() => setSelectedSlot(slot.time)}
                    style={[
                      styles.timeSlotRadioRowItemContainerFrame,
                      isSlotActiveChecked ? styles.timeSlotRadioRowItemContainerFrameActiveSelectedBorder : styles.timeSlotRadioRowItemContainerFrameInactiveBorder,
                      isSlotExpired && { opacity: 0.35, backgroundColor: '#F2EFEB', borderColor: '#E5E0D8' }
                    ]}
                  >
                    <View style={styles.timeSlotRadioRowLeftTextDetailsLayout}>
                      <Text style={[styles.timeSlotRadioMainTimeBoldValueLabel, isSlotExpired && { color: '#9EA8A3' }]}>
                        {slot.time} {isSlotExpired && (isCategoryMismatch ? "(Unavailable)" : "(Expired)")}
                      </Text>
                      <Text style={styles.timeSlotRadioSubcategoryMutedTypeLabel}>{slot.type}</Text>
                    </View>
                    
                    <View style={[
                      styles.customRadioOuterCircleIndicatorFrame,
                      isSlotActiveChecked ? styles.customRadioOuterCircleIndicatorFrameActiveGreen : styles.customRadioOuterCircleIndicatorFrameInactiveGrey,
                      isSlotExpired && { borderColor: '#E5E0D8' }
                    ]}>
                      {isSlotActiveChecked && !isSlotExpired && <View style={styles.customRadioInnerCirclePointDotActiveSolidGreen} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* SPECIAL INSTRUCTIONS SEGMENT */}
          <View style={styles.specialInstructionsOuterContainer}>
            <View style={styles.specialInstructionsHeaderRow}>
              <View style={styles.iconCircleWrapper}>
                <Feather name="file-text" size={14} color="#0F382A" />
              </View>
              <Text style={styles.specialInstructionsMainHeading}>Cooking Preferences</Text>
            </View>

            {/* Horizontal Grid Selection Array for Spicy Preferences */}
            <View style={styles.instructionsTagRowGrid}>
              {instructionTags.map((tag) => {
                const isTagActiveSelected = selectedInstructionTag === tag.id;
                return (
                  <TouchableOpacity
                    key={tag.id}
                    activeOpacity={0.75}
                    onPress={() => setSelectedInstructionTag(isTagActiveSelected ? '' : tag.id)}
                    style={[
                      styles.instructionItemPillBadgeFrame,
                      isTagActiveSelected ? styles.instructionItemPillBadgeActive : styles.instructionItemPillBadgeInactive
                    ]}
                  >
                    <Text style={styles.instructionItemPillBadgeEmojiText}>{tag.icon}</Text>
                    <Text style={[
                      styles.instructionItemPillBadgeLabelString,
                      isTagActiveSelected ? styles.instructionItemPillBadgeLabelStringActive : styles.instructionItemPillBadgeLabelStringInactive
                    ]}>
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

          {/* Freshness Guarantee Banner */}
          <View style={styles.freshnessGuaranteeAlertMessageBannerBoxContainer}>
            <View style={styles.freshnessGuaranteeLeafIconCircleFrameSquareContainer}>
              <LeafIcon />
            </View>
            <Text style={styles.freshnessGuaranteeParagraphBodyTextDescriptionText}>
              Your fresh daily meal subscription is covered by our delivery and high kitchen hygiene guarantees.
            </Text>
          </View>

          {/* HOW IT WORKS PANEL BOX */}
          <View style={styles.howItWorksPanelBox}>
            <Text style={styles.howItWorksHeaderTitle}>How It Works</Text>
            <View style={styles.howItWorksStepsRow}>
              <View style={styles.howItWorksStepColumn}>
                <View style={styles.emojiCircleBg}>
                  <Text style={styles.howItWorksEmojiGraphic}>📆</Text>
                </View>
                <Text style={styles.howItWorksStepHeading}>Select Days</Text>
                <Text style={styles.howItWorksStepSubParagraph}>
                  Choose the days you want delivery
                </Text>
              </View>
              
              <View style={styles.howItWorksStepColumn}>
                <View style={styles.emojiCircleBg}>
                  <Text style={styles.howItWorksEmojiGraphic}>🎛</Text>
                </View>
                <Text style={styles.howItWorksStepHeading}>Make Changes</Text>
                <Text style={styles.howItWorksStepSubParagraph}>
                  Pause or add days as per your need
                </Text>
              </View>
              
              <View style={styles.howItWorksStepColumn}>
                <View style={styles.emojiCircleBg}>
                  <Text style={styles.howItWorksEmojiGraphic}>🛍</Text>
                </View>
                <Text style={styles.howItWorksStepHeading}>We Deliver</Text>
                <Text style={styles.howItWorksStepSubParagraph}>
                  Fresh meals on your selected days
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.extraBottomClearancePaddingSpaceLayoutFrameBox} />
        </ScrollView>

        {/* Floating Bottom Sticky Action CTA Button */}
        {isFormValid && (
          <View style={styles.floatingFixedActionFooterCTAButtonPanelFrameBoxContainer}>
            <TouchableOpacity style={styles.primarySolidGreenCTAActionButtonContainer} activeOpacity={0.88} onPress={handleReviewOrderSubmit}>
              <Text style={styles.primarySolidGreenCTAActionButtonText}>Review Order</Text>
              <Feather name="arrow-right" size={15} color="#FAF8F5" style={styles.primarySolidGreenCTAActionButtonRightArrowSymbol} />
            </TouchableOpacity>
          </View>
        )}

        {/* ─── CHOOSE DELIVERY LOCATION SHEET ─── */}
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
                {/* ACTIVE ADDRESS */}
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
                          <Text style={styles.savedAddressItemTitle}>{activeAddress.title || 'Current'}</Text>
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

                {/* SAVED ADDRESSES */}
                <Text style={styles.sectionLabelCaps}>SAVED ADDRESSES</Text>
                {savedAddresses.length > 0 ? (
                  savedAddresses.map((item) => {
                    const isSelected =
                      selectedAddressId === item.id ||
                      (activeAddress && activeAddress.id === item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.savedAddressItemCard, isSelected && styles.savedAddressItemCardActive]}
                        activeOpacity={0.85}
                        onPress={() => handleSelectSavedAddress(item)}
                      >
                        <View style={[styles.savedAddressIconCircle, isSelected && styles.savedAddressIconCircleActive]}>
                          {item.tag === 'Home' && (
                            <Ionicons name="home" size={16} color={isSelected ? '#FAF8F5' : '#0F382A'} />
                          )}
                          {item.tag === 'Work' && (
                            <Ionicons name="briefcase" size={16} color={isSelected ? '#FAF8F5' : '#0F382A'} />
                          )}
                          {item.tag === 'Other' && (
                            <Ionicons name="bookmark" size={16} color={isSelected ? '#FAF8F5' : '#0F382A'} />
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
                    <Text style={styles.addNewAddressSubtitle}>One-time for this order (sets as active)</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#5B756C" />
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* INPUT DYNAMIC ADDRESS INPUT MODAL */}
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

        {/* MENU SELECTION SUMMARY MODAL (MATCHED EXACTLY TO MEALBOXITEMSCREEN.TSX) */}
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />

            <TouchableOpacity 
              style={styles.modalDismissTapArea} 
              activeOpacity={1} 
              onPress={() => setIsModalVisible(false)}
            />
            <View style={[styles.modalBottomSheetContainer, { height: height * 0.82 }]}>
              <TouchableOpacity 
                style={styles.modalClosePillButton} 
                onPress={() => setIsModalVisible(false)}
                activeOpacity={0.85}
              >
                <Feather name="x" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.modalHeaderRow}>
                <View>
                  <Text style={styles.modalHeaderTitle}>Selected Schedule Summary</Text>
                  <Text style={styles.modalHeaderSubtitle}>Review your course selections for each delivery day</Text>
                </View>
              </View>

              <View style={[styles.modalPillContainer, isSingleDay && styles.modalPillContainerSingle]}>
                {activeDaysToRender.map((day, dIdx) => {
                  const dayCount = (parsedWeeklySelections[day] || []).length;
                  const isDaySelected = modalActiveDay === day;
                  return (
                    <TouchableOpacity
                      key={`${day}-modal-${dIdx}`}
                      style={[
                        styles.modalPillItem,
                        isSingleDay && styles.modalPillItemSingle,
                        isDaySelected && styles.modalPillItemActive
                      ]}
                      onPress={() => setModalActiveDay(day)}
                      activeOpacity={0.8}
                    >
                      <Text style={[
                        styles.modalPillText,
                        isDaySelected && styles.modalPillTextActive
                      ]}>
                        {day}
                      </Text>
                      {dayCount > 0 && (
                        <View style={[
                          styles.modalPillCounter,
                          isDaySelected && styles.modalPillCounterActive
                        ]}>
                          <Text style={[
                            styles.modalPillCounterText,
                            isDaySelected && styles.modalPillCounterTextActive
                          ]}>
                            {dayCount}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ScrollView 
                style={styles.modalScrollView} 
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalDaySectionBox}>
                  <View style={styles.modalDayHeaderStrip}>
                    <Text style={styles.modalDayTitleText}>{modalActiveDay} Menu Selections</Text>
                  </View>

                  {activeDayItemsList.length === 0 ? (
                    <Text style={styles.modalEmptyDayText}>No dishes customized or available for {modalActiveDay}.</Text>
                  ) : (
                    Object.entries(groupedModalItems).map(([categoryHeading, selectedItemsGroup], groupIdx) => (
                      <View key={categoryHeading} style={[styles.modalCategoryGroupBlock, groupIdx > 0 && { marginTop: 14 }]}>
                        <View style={styles.modalCategorySectionHeadingBadge}>
                          <Text style={styles.modalCategorySectionHeadingText}>{categoryHeading}</Text>
                        </View>
                        
                        {selectedItemsGroup.map((item: any, keyIdx: number) => (
                          <View key={keyIdx} style={styles.modalSelectionRowItem}>
                            <View style={styles.modalSelectionLeftInfo}>
                              <Image 
                                source={item.image ? { uri: item.image } : FOOD_THUMB} 
                                style={styles.modalCircularFoodThumb} 
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.modalItemNameText}>{item.name}</Text>
                              </View>
                            </View>
                            
                            <View style={styles.modalRightBadgeWrapper}>
                              {item.type === 'addon' ? (
                                <View style={styles.modalAddonPillBadge}>
                                  <Text style={styles.modalAddonBadgeText}>Extra ×{item.qty}</Text>
                                </View>
                              ) : (
                                <View style={styles.modalIncludedPillBadge}>
                                  <Feather name="check-circle" size={12} color="#107C41" style={{ marginRight: 4 }} />
                                  <Text style={styles.modalIncludedBadgeText}>Included</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>

              <View style={styles.modalFooterActionButtonBlock}>
                <TouchableOpacity 
                  style={styles.modalFinalSubmitBtn}
                  onPress={() => setIsModalVisible(false)}
                  activeOpacity={0.88}
                >
                  <Text style={styles.modalFinalSubmitText}>Close Summary</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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

  /* MEAL PLAN PACKAGE CARD */
  mealPackageCard: {
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
  mealImage: {
    width: 84,
    height: 84,
    borderRadius: 14,
    marginRight: 14,
    backgroundColor: '#E5ECE8',
  },
  mealCardTextContent: {
    flex: 1,
    justifyContent: 'space-between',
    height: 84,
    paddingVertical: 2,
  },
  mealCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mealTitleWrapper: {
    flex: 0.72,
  },
  mealPriceWrapper: {
    flex: 0.28,
    alignItems: 'flex-end',
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },
  mealMetadata: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 3,
    fontWeight: '500',
  },
  mealPricing: {
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '900',
    color: '#0F382A',
    letterSpacing: -0.3,
  },
  mealPricingSubText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#5B756C',
  },
  selectedItemsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  selectedItemsButtonText: {
    color: '#0F382A',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedItemsChevronIcon: {
    marginLeft: 4,
    marginTop: 1,
  },

  sectionSpacingBlock: {
    marginTop: 6,
    marginBottom: 12,
  },
  slotHeaderLabelLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
  },
  chooseDeliverySlotPrimaryLabelTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
  },

  /* Calendar Elements Layout */
  horizontalCalendarScrollView: {
    marginBottom: 16,
    width: '100%',
  },
  horizontalCalendarScrollContainer: {
    paddingRight: 16,
    gap: 8,
  },
  calendarColumnItemDayBoxCard: {
    width: (width - 40 - 32) / 4.2, 
    height: 76,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  calendarColumnItemDayBoxCardActiveSelected: {
    backgroundColor: '#166534',
    borderColor: '#166534',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  calendarColumnItemDayBoxCardInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 56, 42, 0.12)',
  },
  calendarColumnTopDayTextLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  calendarColumnTopDayTextLabelActive: {
    color: '#FAF8F5',
  },
  calendarColumnTopDayTextLabelInactive: {
    color: '#4F6B61',
  },
  calendarColumnMiddleDateValueNumber: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  calendarColumnMiddleDateValueNumberActive: {
    color: '#FAF8F5',
  },
  calendarColumnMiddleDateValueNumberInactive: {
    color: '#0B261D',
  },
  calendarColumnBottomMonthLabelText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  calendarColumnBottomMonthLabelTextActive: {
    color: '#FAF8F5',
  },
  calendarColumnBottomMonthLabelTextInactive: {
    color: '#5B756C',
  },

  /* Time Slot List */
  timeSlotsVerticalRadioListWrapperBlockContainer: {
    marginBottom: 6,
  },
  timeSlotRadioRowItemContainerFrame: {
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
  timeSlotRadioRowItemContainerFrameActiveSelectedBorder: {
    borderColor: '#166534',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
  },
  timeSlotRadioRowItemContainerFrameInactiveBorder: {
    borderColor: 'rgba(15, 56, 42, 0.1)',
    backgroundColor: '#FFFFFF',
  },
  timeSlotRadioRowLeftTextDetailsLayout: {
    flexDirection: 'column',
    flex: 1,
  },
  timeSlotRadioMainTimeBoldValueLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B261D',
  },
  timeSlotRadioSubcategoryMutedTypeLabel: {
    fontSize: 11.5,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
  },
  customRadioOuterCircleIndicatorFrame: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customRadioOuterCircleIndicatorFrameActiveGreen: {
    borderColor: '#166534',
    backgroundColor: '#166534',
  },
  customRadioOuterCircleIndicatorFrameInactiveGrey: {
    borderColor: 'rgba(15, 56, 42, 0.25)',
    backgroundColor: '#FFFFFF',
  },
  customRadioInnerCirclePointDotActiveSolidGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FAF8F5',
  },

  /* Delivery Address Card */
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
  sectionHeaderFlexContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardSectionMainHeaderLabelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B261D',
    letterSpacing: -0.2,
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

  /* Address Chooser Sheet */
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

  /* Special Instructions Layout */
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

  /* Phone Number Container Styles */
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

  /* Freshness Banner Notification */
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

  /* HOW IT WORKS PANEL BOX STYLING */
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

  /* Floating Bottom Sticky Action CTA */
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

  /* Center Form Overlay Modal Styles */
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

  /* Bottom Sheet Modal Layout (Matching MealBoxItemScreen.tsx) */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 38, 29, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDismissTapArea: {
    flex: 1,
  },
  modalBottomSheetContainer: {
    backgroundColor: '#FAF8F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  modalClosePillButton: {
    position: 'absolute',
    top: -22,
    alignSelf: 'center',
    backgroundColor: '#166534',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 14,
  },
  modalHeaderTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0B261D',
    letterSpacing: -0.3,
  },
  modalHeaderSubtitle: {
    fontSize: 12,
    color: '#5B756C',
    marginTop: 2,
    fontWeight: '500',
  },
  modalPillContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 4,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  modalPillContainerSingle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  modalPillItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  modalPillItemSingle: {
    flex: 0,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  modalPillItemActive: {
    backgroundColor: '#166534',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  modalPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4F6B61',
  },
  modalPillTextActive: {
    color: '#FAF8F5',
    fontWeight: '800',
  },
  modalPillCounter: {
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPillCounterActive: {
    backgroundColor: 'rgba(250, 248, 245, 0.25)',
  },
  modalPillCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F382A',
  },
  modalPillCounterTextActive: {
    color: '#FAF8F5',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalDaySectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.08)',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  modalDayHeaderStrip: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 56, 42, 0.06)',
    paddingBottom: 8,
    marginBottom: 12,
  },
  modalDayTitleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F382A',
    letterSpacing: 0.4,
  },
  modalCategoryGroupBlock: {
    width: '100%',
  },
  modalCategorySectionHeadingBadge: {
    backgroundColor: 'rgba(15, 56, 42, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.1)',
  },
  modalCategorySectionHeadingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F382A',
    letterSpacing: 0.3,
  },
  modalSelectionRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(15, 56, 42, 0.06)',
  },
  modalSelectionLeftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 0.78,
  },
  modalCircularFoodThumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E5ECE8',
  },
  modalItemNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B261D',
  },
  modalRightBadgeWrapper: {
    alignItems: 'flex-end',
  },
  modalIncludedPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 124, 65, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 65, 0.15)',
  },
  modalIncludedBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#107C41',
  },
  modalAddonPillBadge: {
    backgroundColor: 'rgba(15, 56, 42, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 56, 42, 0.15)',
  },
  modalAddonBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F382A',
  },
  modalEmptyDayText: {
    fontSize: 13,
    color: '#5B756C',
    textAlign: 'center',
    paddingVertical: 24,
    fontWeight: '500',
  },
  modalFooterActionButtonBlock: {
    marginTop: 12,
    width: '100%',
  },
  modalFinalSubmitBtn: {
    backgroundColor: '#166534',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  modalFinalSubmitText: {
    color: '#FAF8F5',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default MealBoxOrderReview;