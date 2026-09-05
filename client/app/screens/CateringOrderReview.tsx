import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Image,
  TouchableWithoutFeedback,
  FlatList,
  Dimensions,
  Animated,
  ActivityIndicator,
  Easing,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { BlurView } from "expo-blur";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "@/src/lib/api";
import {
  getUser,
  refreshUser,
  updateUserAddress,
  SavedAddress,
  ActiveAddress,
} from "@/src/lib/authStorage";
import { useNavigationStore } from "@/src/store/navigationStore";

const { width, height } = Dimensions.get("window");

// Daawath Theme Colors matching MealBoxItemScreen.tsx
const theme = {
  primaryPurple: "#166538",
  lightPurple: "rgba(22, 101, 56, 0.08)",
  white: "#FFFFFF",
  lightGray: "#FAF8F5",
  mediumGray: "rgba(15, 56, 42, 0.12)",
  darkGray: "#5B756C",
  black: "#0B261D",
  background: "#FAF8F5",
  textGray: "#9EA8A3",
};

const formatAddressDisplay = (addr: ActiveAddress | SavedAddress | null | undefined): string => {
  if (!addr) return "";
  if (addr.houseDetails && String(addr.houseDetails).trim().length > 0) {
    return `${addr.houseDetails}, ${addr.fullAddress}`;
  }
  return addr.fullAddress || "";
};

// Updated Stepper with Real Titles - Made Clickable
const OrderStepper = ({ 
  progressSteps, 
  titles,
  onStepPress 
}: { 
  progressSteps: { complete: boolean; optional?: boolean }[]; 
  titles: string[];
  onStepPress?: (index: number) => void;
}) => {
  return (
    <View style={styles.stepperContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepperScrollContent}
      >
        {progressSteps.map((step, index) => {
          const isCompleted = step.complete;

          return (
            <TouchableOpacity 
              key={index} 
              style={styles.stepWrapper}
              onPress={() => onStepPress?.(index)}
              activeOpacity={0.7}
            >
              {/* Connector */}
              {index > 0 && (
                <View
                  style={[
                    styles.stepConnector,
                    isCompleted && styles.stepConnectorCompleted,
                  ]}
                />
              )}

              {/* Step Circle */}
              <View
                style={[
                  styles.stepCircle,
                  isCompleted && styles.stepCircleCompleted,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={16} color="#FAF8F5" />
                ) : (
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                )}
              </View>

              {/* Real Title */}
              <Text
                style={[
                  styles.stepLabel,
                  isCompleted && styles.stepLabelCompleted,
                ]}
                numberOfLines={1}
              >
                {titles[index] || `Step ${index + 1}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default function ChefOrderReviewScreen() {
  const params = useLocalSearchParams();

  let menu: any = null;
  let chef: any = null;
  let selections: any = null;
  let addons: any[] = [];
  let totalItems: number = 0;
  let orderDetails: any = null;

  try {
    if (params.menu) menu = JSON.parse(params.menu as string);
    if (params.chef) chef = JSON.parse(params.chef as string);
    if (params.selections) selections = JSON.parse(params.selections as string);
    if (params.addons) addons = JSON.parse(params.addons as string);
    if (params.totalItems) totalItems = Number(params.totalItems);
    if (params.orderDetails) orderDetails = JSON.parse(params.orderDetails as string);
  } catch (e) {
    console.log("Parse error in ChefOrderReviewScreen", e);
  }

  // Fallback to state context if not explicitly passed through parameters
  const storeContext = useNavigationStore((state) => state.currentContext as any);
  if (!addons || addons.length === 0) {
    addons = storeContext?.addons || [];
  }

  const effectiveChefId = (params.chefId as string) || chef?.id || chef?._id || storeContext?.restaurantOrChef?.id || storeContext?.restaurantOrChef?._id || "";
  const effectiveChefName = (params.chefName as string) || chef?.name || storeContext?.restaurantOrChef?.name || "Expert Chef";
  const effectiveUserId = (params.userId as string) || chef?.userId || storeContext?.restaurantOrChef?.userId || "";
  const effectiveUserName = (params.userName as string) || chef?.userName || storeContext?.restaurantOrChef?.userName || "";

  const finalPlatePrice = Number(params.finalPrice) || menu?.price || 0;

  const getExtraItemsCount = () => {
    if (!selections || selections.length === 0) return 0;
    let total = 0;
    selections.forEach((cat: any) => {
      let count = 0;
      (cat.selected || []).forEach((_: any) => {
        count++;
        if (cat.max && count > cat.max) total++;
      });
    });
    return total;
  };

  const extraItemsCountFromUI = getExtraItemsCount();
  const extraPriceFromMenu = Number(params.extraPrice) || 0;
  const today = new Date();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const formatDateDisplay = (date: Date) => {
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // ────────────────────────────────────────────────
  // 14-HOUR MINIMUM LEAD TIME LOGIC (PREMIUM)
  // ────────────────────────────────────────────────
  const MIN_LEAD_HOURS = 14;
  const earliestAllowed = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000);

  // Human-readable earliest time (e.g. "2 Sep, 7:30 AM")
  const formatEarliestAllowed = () => {
    const d = earliestAllowed;
    const day = d.getDate();
    const month = monthNames[d.getMonth()];
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${day} ${month}, ${hours}:${minStr} ${ampm}`;
  };

  const earliestAllowedDisplay = formatEarliestAllowed();

  // Convert "04:00 AM" / "01:30 PM" → hours + minutes (24h)
  const parseTimeSlot = (slot: string): { hours: number; minutes: number } => {
    const [timePart, period] = slot.split(" ");
    let [h, m] = timePart.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return { hours: h, minutes: m || 0 };
  };

  // Build a full Date object for a given calendar day + time slot
  const getSlotDateTime = (date: Date, slot: string): Date => {
    const { hours, minutes } = parseTimeSlot(slot);
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  // Is this date+slot allowed under the 14-hour rule?
  const isSlotAllowed = (date: Date, slot: string): boolean => {
    return getSlotDateTime(date, slot).getTime() >= earliestAllowed.getTime();
  };

  // Earliest selectable calendar date (string for react-native-calendars)
  const minSelectableDateStr = earliestAllowed.toISOString().split("T")[0];

  // Check if selected date is the earliest possible day
  const isEarliestDay = (date: Date) => {
    return date.toISOString().split("T")[0] === minSelectableDateStr;
  };

  // Simple and understandable instruction text for Date modal
  const getDateModalInstruction = () => {
    return `Orders need 14 hours advance notice. Earliest available: ${earliestAllowedDisplay}.`;
  };

  // Simple and understandable instruction text for Time modal
  const getTimeModalInstruction = () => {
    if (!dateDisplay) {
      return "Please select a date first.";
    }
    if (isEarliestDay(selectedDate)) {
      return `For ${dateDisplay}, only slots after ${earliestAllowedDisplay.split(", ")[1]} are available due to our 14-hour prep time.`;
    }
    return `All time slots are available for ${dateDisplay}.`;
  };

  const [occasion, setOccasion] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [dateDisplay, setDateDisplay] = useState("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [delivery, setDelivery] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedItemsSummary, setSelectedItemsSummary] = useState<any[]>([]);
  const [selectedSpice, setSelectedSpice] = useState("");
  const [noOnionsGarlic, setNoOnionsGarlic] = useState(false);
  const [selectedSession, setSelectedSession] = useState("Morning");
  const [occasionModal, setOccasionModal] = useState(false);
  const [dateModal, setDateModal] = useState(false);
  const [timeModal, setTimeModal] = useState(false);
  const [guestModal, setGuestModal] = useState(false);
  const [addressModal, setAddressModal] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPriceDetails, setShowPriceDetails] = useState(false);

  // ─── Add to Cart Blast Animation States ───
  const [showBlastAnimation, setShowBlastAnimation] = useState(false);
  const blastScaleAnim = useRef(new Animated.Value(0.2)).current;
  const blastOpacityAnim = useRef(new Animated.Value(0)).current;

  // ─── Dynamic Active + Saved Addresses (same source as Home.tsx) ───
  const [activeAddress, setActiveAddress] = useState<ActiveAddress | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(true);

  // Manual add-address form (optional override – sets active only, does not auto-push to saved)
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [newFlatNo, setNewFlatNo] = useState("");
  const [newBuilding, setNewBuilding] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newCity, setNewCity] = useState("");

  const [hasGuestSelected, setHasGuestSelected] = useState(false);
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");

  const [guests, setGuests] = useState(10);

  // Scroll Refs for stepper navigation
  const mainScrollRef = useRef<ScrollView>(null);
  const phoneInputRef = useRef<View>(null);
  const altPhoneInputRef = useRef<View>(null);

  // Zustand Navigation Context
  const { setNavigationContext } = useNavigationStore();

  // Prevent infinite loop - set context ONLY ONCE on mount
  const hasSetContext = useRef(false);

  // Apply active address into the string field used by the rest of the form
  const applyActiveAddressToUI = (addr: ActiveAddress | SavedAddress | null) => {
    if (!addr || !addr.fullAddress) {
      setActiveAddress(null);
      setAddress("");
      setSelectedAddressId("");
      return;
    }
    const asActive: ActiveAddress = {
      id: addr.id,
      title: addr.title || "Delivery",
      houseDetails: addr.houseDetails || "",
      fullAddress: addr.fullAddress,
      latitude: addr.latitude || 0,
      longitude: addr.longitude || 0,
      tag: addr.tag || "Home",
      updatedAt: (addr as ActiveAddress).updatedAt || new Date().toISOString(),
    };
    setActiveAddress(asActive);
    setAddress(formatAddressDisplay(asActive));
    if (addr.id) setSelectedAddressId(addr.id);
  };

  // Load user + activeAddress + savedAddresses (same as Home / MealBoxOrderReview)
  useFocusEffect(
    useCallback(() => {
      const loadUserAndAddresses = async () => {
        setIsLoadingAddress(true);
        try {
          const cached = await getUser();
          if (cached) {
            if (cached.phone && !phone) {
              setPhone(String(cached.phone).replace(/[^0-9]/g, "").slice(-10));
            }
            if (cached.activeAddress && cached.activeAddress.fullAddress) {
              applyActiveAddressToUI(cached.activeAddress);
            } else if (cached.address && String(cached.address).trim().length > 0) {
              setAddress(String(cached.address).trim());
            }
            if (Array.isArray(cached.savedAddresses)) {
              setSavedAddresses(cached.savedAddresses);
            }
          }

          const freshUser = await refreshUser();
          if (freshUser) {
            if (freshUser.phone) {
              setPhone(String(freshUser.phone).replace(/[^0-9]/g, "").slice(-10));
            }
            if (freshUser.activeAddress && freshUser.activeAddress.fullAddress) {
              applyActiveAddressToUI(freshUser.activeAddress);
            } else if (freshUser.address && String(freshUser.address).trim().length > 0) {
              setAddress(String(freshUser.address).trim());
            }
            if (Array.isArray(freshUser.savedAddresses)) {
              setSavedAddresses(freshUser.savedAddresses);
            }
          }
        } catch (err) {
          console.log("Failed to load user / addresses:", err);
        } finally {
          setIsLoadingAddress(false);
        }
      };
      loadUserAndAddresses();
    }, [])
  );

  // PREFILL ALL FIELDS WHEN COMING BACK FROM CART EDIT
  useEffect(() => {
    if (orderDetails && Object.keys(orderDetails).length > 0) {
      setOccasion(orderDetails.occasion || "");
      setDateDisplay(orderDetails.date || "");
      setTime(orderDetails.time || "");
      if (orderDetails.activeAddress && orderDetails.activeAddress.fullAddress) {
        applyActiveAddressToUI(orderDetails.activeAddress);
      } else if (orderDetails.address) {
        setAddress(orderDetails.address);
      }
      setDelivery(orderDetails.delivery || "");
      setSelectedSpice(orderDetails.selectedSpice || "");
      setNoOnionsGarlic(!!orderDetails.noOnionsGarlic);
      setNotes(orderDetails.notes || "");
      setGuests(orderDetails.guests || 10);
      setPhone(orderDetails.phone || "");
      setAltPhone(orderDetails.altPhone || "");

      if (orderDetails.guests) {
        setHasGuestSelected(true);
      }
    }

    if (selections && selections.length > 0) {
      setSelectedItemsSummary(selections);
    }
  }, []);

  // Set navigation context only once (prevents infinite loop)
  useEffect(() => {
    if (!hasSetContext.current && chef) {
      hasSetContext.current = true;
      setNavigationContext({
        serviceType: "homemade",
        previousScreen: "ChefOrderReviewScreen",
        restaurantOrChef: {
          ...chef,
          id: effectiveChefId,
          name: effectiveChefName,
          userId: effectiveUserId,
          userName: effectiveUserName,
        },
        menu: menu,
        selections: selections,
        orderDetails: orderDetails || null,
        type: params.type as any,
      });
    }
  }, []);

  const getDeliveryPrice = (delivery: string) => {
    if (!delivery) return 0;
    if (delivery === "Standard") return 290;
    if (delivery === "Doorstep") return 800;
    if (delivery === "Doorstep + Service") return 1500;
    return 0;
  };

  const deliveryPrice = getDeliveryPrice(delivery);
  const totalPrice = (guests * finalPlatePrice) + deliveryPrice;

  const occasions = [
    { id: 1, name: "Birthday Party", image: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80" },
    { id: 2, name: "House Party", image: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=600&auto=format&fit=crop&q=80" },
    { id: 3, name: "Family Get-Together", image: "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=600&auto=format&fit=crop&q=80" },
    { id: 4, name: "Kitty Party", image: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80" },
    { id: 5, name: "Corporate Events", image: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600&auto=format&fit=crop&q=80" },
    { id: 6, name: "Puja", image: "https://images.unsplash.com/photo-1609137144813-7d9452362b66?w=600&auto=format&fit=crop&q=80" },
    { id: 7, name: "House Warming", image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&auto=format&fit=crop&q=80" },
    { id: 8, name: "Farm House Party", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&auto=format&fit=crop&q=80" },
    { id: 9, name: "Workshops", image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&auto=format&fit=crop&q=80" },
    { id: 10, name: "Other", image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80" },
  ];

  const services = [
    {
      id: 1,
      name: "Standard",
      desc: "Order delivered to your building gate or apartment entrance.",
      price: "₹290.32",
      emoji: "📦",
    },
    {
      id: 2,
      name: "Doorstep",
      desc: "Delivered to your doorstep, any floor, no extra hassle.",
      price: "₹803.77",
      emoji: "🚪",
    },
    {
      id: 3,
      name: "Doorstep + Service",
      desc: "End to end support: our staff will deliver, take care of setup, and serve for 3 hours",
      price: "₹1025.73",
      emoji: "🛎️",
    },
  ];

  const cleanPhone = phone.replace(/^(\+91)/, "");
  const cleanAltPhone = altPhone.replace(/^(\+91)/, "");

  const isPhoneValid = /^[6-9]\d{9}$/.test(cleanPhone);
  const isAltPhoneValid =
    cleanAltPhone.length === 0 || /^[6-9]\d{9}$/.test(cleanAltPhone);

  const isOccasionComplete = !!occasion;
  const isDateComplete = !!dateDisplay;
  const isTimeComplete = !!time && isSlotAllowed(selectedDate, time);
  const isGuestsComplete = hasGuestSelected && guests >= 10;
  const isAddressComplete = !!address && address.trim().length > 0;
  const isDeliveryComplete = !!delivery;

  const shouldShowPhoneTick = isAddressComplete && isPhoneValid;

  const isFormComplete =
    isOccasionComplete &&
    isDateComplete &&
    isTimeComplete &&
    isGuestsComplete &&
    isAddressComplete &&
    isPhoneValid &&
    isAltPhoneValid;

  const progressSteps = [
    { complete: isOccasionComplete },
    { complete: isDateComplete },
    { complete: isTimeComplete },
    { complete: isGuestsComplete },
    { complete: isAddressComplete },
    { complete: shouldShowPhoneTick },
    { complete: false },
    { complete: isDeliveryComplete, optional: true },
  ];

  const stepTitles = [
    "Occasion",
    "Date",
    "Time",
    "Guests",
    "Address",
    "Phone",
    "Alt Phone",
    "Delivery"
  ];

  const handleStepPress = (index: number) => {
    switch (index) {
      case 0:
        setOccasionModal(true);
        break;
      case 1:
        setDateModal(true);
        break;
      case 2:
        setTimeModal(true);
        break;
      case 3:
        setGuestModal(true);
        break;
      case 4:
        setAddressModal(true);
        break;
      case 5:
        phoneInputRef.current?.measure((fx, fy, w, h, px, py) => {
          mainScrollRef.current?.scrollTo({ y: py - 100, animated: true });
        });
        break;
      case 6:
        altPhoneInputRef.current?.measure((fx, fy, w, h, px, py) => {
          mainScrollRef.current?.scrollTo({ y: py - 100, animated: true });
        });
        break;
      case 7:
        setDeliveryModal(true);
        break;
      default:
        break;
    }
  };

  const handleDayPress = (day: DateData) => {
    const newDate = new Date(day.dateString);
    setSelectedDate(newDate);
    setDateDisplay(formatDateDisplay(newDate));

    if (time && !isSlotAllowed(newDate, time)) {
      setTime("");
    }
    setDateModal(false);
  };

  const allMorningSlots = ["04:00 AM", "05:00 AM", "06:00 AM", "07:00 AM", "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM"];
  const allAfternoonSlots = ["11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM", "03:00 PM"];
  const allEveningSlots = ["04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM", "08:00 PM", "09:00 PM", "10:00 PM"];

  const getSlotsForSession = (session: string) => {
    if (session === "Morning") return allMorningSlots;
    if (session === "Afternoon") return allAfternoonSlots;
    return allEveningSlots;
  };

  const renderOccasionItem = ({ item }: { item: { id: number; name: string; image: string } }) => (
    <TouchableOpacity
      style={styles.optionCard}
      onPress={() => {
        setOccasion(item.name);
        setOccasionModal(false);
      }}
      activeOpacity={0.85}
    >
      <View style={styles.optionImgContainer}>
        <Image source={{ uri: item.image }} style={styles.optionImg} resizeMode="cover" />
      </View>
      <Text style={styles.optionText} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );

  const renderService = ({ item }: { item: typeof services[0] }) => (
    <TouchableOpacity
      style={[
        styles.deliveryCard,
        delivery === item.name && { backgroundColor: theme.primaryPurple, borderColor: theme.primaryPurple },
      ]}
      onPress={() => {
        setDelivery(item.name);
        setDeliveryModal(false);
      }}
      activeOpacity={0.9}
    >
      <View style={styles.deliveryEmojiCircle}>
        <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={[styles.deliveryTitle, delivery === item.name && { color: theme.white }]}>{item.name}</Text>
        <Text style={[styles.deliveryDesc, delivery === item.name && { color: "rgba(250, 248, 245, 0.8)" }]}>{item.desc}</Text>
        <Text style={[styles.deliveryPrice, delivery === item.name && { color: theme.white }]}>{item.price}</Text>
      </View>
    </TouchableOpacity>
  );

  const handleSelectSavedAddress = async (item: SavedAddress) => {
    const newActive: ActiveAddress = {
      id: item.id,
      title: item.title,
      houseDetails: item.houseDetails || "",
      fullAddress: item.fullAddress,
      latitude: item.latitude,
      longitude: item.longitude,
      tag: item.tag,
      updatedAt: new Date().toISOString(),
    };

    applyActiveAddressToUI(newActive);
    setAddressModal(false);
    setShowAddAddressForm(false);

    await updateUserAddress({
      activeAddress: newActive,
      address: formatAddressDisplay(newActive),
    });
  };

  const handleKeepCurrentActive = () => {
    setAddressModal(false);
    setShowAddAddressForm(false);
  };

  const handleSaveNewAddress = async () => {
    if (!newFlatNo.trim() || !newBuilding.trim() || !newStreet.trim() || !newCity.trim()) return;

    const fullAddress = `${newStreet.trim()}, ${newCity.trim()}`;
    const houseDetails = `Flat ${newFlatNo.trim()}, ${newBuilding.trim()}`;

    const manualActive: ActiveAddress = {
      id: `manual_${Date.now()}`,
      title: "Other",
      houseDetails,
      fullAddress,
      latitude: 0,
      longitude: 0,
      tag: "Other",
      updatedAt: new Date().toISOString(),
    };

    applyActiveAddressToUI(manualActive);
    setShowAddAddressForm(false);
    setAddressModal(false);

    setNewFlatNo("");
    setNewBuilding("");
    setNewStreet("");
    setNewCity("");

    await updateUserAddress({
      activeAddress: manualActive,
      address: formatAddressDisplay(manualActive),
    });
  };

  const handleBack = () => {
    router.replace({
      pathname: "/screens/CateringMenuItemScreen",
      params: {
        menu: JSON.stringify(menu),
        chef: JSON.stringify(chef),
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        userId: effectiveUserId,
        userName: effectiveUserName,
        selections: JSON.stringify(selectedItemsSummary),
        addons: JSON.stringify(addons),
        orderDetails: JSON.stringify({
          occasion,
          date: dateDisplay,
          time,
          guests,
          address,
          activeAddress,
          delivery,
          selectedSpice,
          noOnionsGarlic,
          notes,
          phone,
          altPhone,
        }),
        type: params.type || "veg",
      },
    });
  };

  const reviewOrder = async () => {
    if (!isFormComplete) return;

    const basePrice = menu?.price || 0;
    const extraPriceTotal = Number(params.extraPrice) || 0;
    const finalPlatePrice = Number(params.finalPrice) || basePrice;

    const selectedService = services.find(s => s.name === delivery);
    const deliveryPriceCalc = selectedService
      ? Number(selectedService.price.replace(/[^\d.]/g, ""))
      : 0;

    const updatedSelections = selectedItemsSummary.map((cat: any) => {
      let count = 0;
      const normalItems: any[] = [];
      const extraItemsArr: any[] = [];

      cat.selected?.forEach((item: any) => {
        count++;
        if (cat.max && count > cat.max) {
          extraItemsArr.push({
            name: item.name,
            imageUrl: item.imageUrl,
            price: item.price || 0,
          });
        } else {
          normalItems.push({
            name: item.name,
            imageUrl: item.imageUrl,
          });
        }
      });

      return {
        category: cat.category,
        max: cat.max,
        selected: normalItems,
        extraSelected: extraItemsArr,
      };
    });

    const extraItems = updatedSelections.reduce(
      (sum: number, cat: any) => sum + (cat.extraSelected?.length || 0),
      0
    );

    const totalItemsCount = updatedSelections.reduce(
      (acc: number, cat: any) =>
        acc + (cat.selected?.length || 0) + (cat.extraSelected?.length || 0),
      0
    );

    const orderDetailsPayload = {
      occasion,
      date: dateDisplay,
      time,
      guests,
      phone,
      altPhone,
      address,
      activeAddress,
      delivery,
      selectedSpice,
      noOnionsGarlic,
      notes,
    };

    const cartPayload = {
      serviceType: "catering",
      chefId: effectiveChefId,
      chefName: effectiveChefName,
      userId: effectiveUserId,
      userName: effectiveUserName,
      menu: {
        ...menu,
        price: basePrice,
        extraPrice: extraPriceTotal,
        finalPrice: finalPlatePrice,
      },
      restaurant: {
        ...chef,
        id: effectiveChefId,
        name: effectiveChefName,
      },
      selections: updatedSelections,
      addons: addons || [],
      totalItems: totalItemsCount,
      orderDetails: orderDetailsPayload,
      finalPrice: finalPlatePrice,
      deliveryPrice: deliveryPriceCalc,
      extraItems,
      type:
        params.type ||
        (updatedSelections?.some((cat: any) =>
          [...(cat.selected || []), ...(cat.extraSelected || [])].some(
            (item: any) => item.type === "nonveg"
          )
        )
          ? "nonveg"
          : "veg"),
    };

    try {
      await api.post("/api/cart/add", cartPayload);
    } catch (error: any) {
      console.error(error);
    }

    router.push({
      pathname: "/screens/CartScreen",
      params: {
        serviceType: "catering",
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        userId: effectiveUserId,
        userName: effectiveUserName,
      }
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        {/* FIXED HEADER + STEPPER + MENU CARD */}
        <View>
          <View style={styles.headerContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.75}
            >
              <Feather name="chevron-left" size={24} color="#0D2E22" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Fill Details</Text>
            <View style={styles.headerPlaceholder} />
          </View>

          {/* Stepper with Real Titles */}
          <OrderStepper 
            progressSteps={progressSteps} 
            titles={stepTitles} 
            onStepPress={handleStepPress}
          />

          {menu && (
            <TouchableOpacity style={styles.menuBox} activeOpacity={0.85} onPress={() => setShowPreviewModal(true)}>
              <Image
                source={{
                  uri: menu?.heroImageUrl ?? "https://marketplace.canva.com/EAFUPJtDaI4/2/0/1600w/canva-white-gold-simple-restaurant-food-menu-UEGWL_wAlQ0.jpg",
                }}
                style={styles.menuImg}
              />
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuTitle} numberOfLines={1}>{menu?.name ?? "Chef Menu"}</Text>
                  <View style={styles.itemsBadge}>
                    <Text style={styles.menuSub}>{totalItems || 0} Selected Items</Text>
                    <Ionicons name="chevron-down" size={13} color="#5B756C" style={styles.badgeIcon} />
                  </View>
                </View>
                <View style={styles.priceBadge}>
                  <Text style={styles.priceValue}>₹{finalPlatePrice}</Text>
                  <Text style={styles.priceLabel}>/ plate</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* SCROLLABLE FORM */}
        <ScrollView
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.inputBox} onPress={() => setOccasionModal(true)} activeOpacity={0.8}>
            <View style={styles.inputRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="gift-outline" size={16} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Occasion</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Text style={occasion ? styles.filledPlaceholder : styles.placeholder}>
                  {occasion || "Select occasion"}
                </Text>
                <Ionicons name="chevron-down" size={15} color="#5B756C" />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.inputBox} onPress={() => setDateModal(true)} activeOpacity={0.8}>
            <View style={styles.inputRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="calendar-outline" size={16} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Date</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Text style={dateDisplay ? styles.filledPlaceholder : styles.placeholder}>
                  {dateDisplay || "Select date"}
                </Text>
                <Ionicons name="chevron-down" size={15} color="#5B756C" />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.inputBox} onPress={() => setTimeModal(true)} activeOpacity={0.8}>
            <View style={styles.inputRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="time-outline" size={16} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Delivery time</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Text style={time ? styles.filledPlaceholder : styles.placeholder}>
                  {time || "Select time"}
                </Text>
                <Ionicons name="chevron-down" size={15} color="#5B756C" />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.inputBox} onPress={() => setGuestModal(true)} activeOpacity={0.8}>
            <View style={styles.inputRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="people-outline" size={16} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Guest count</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Text style={hasGuestSelected ? styles.filledPlaceholder : styles.placeholder}>
                  {hasGuestSelected ? `${guests} guests` : "Select guest count"}
                </Text>
                <Ionicons name="chevron-down" size={15} color="#5B756C" />
              </View>
            </View>
          </TouchableOpacity>

          {/* SELECT ADDRESS – shows dynamic activeAddress from Home/MongoDB */}
          <TouchableOpacity style={styles.inputBox} onPress={() => setAddressModal(true)} activeOpacity={0.8}>
            <View style={styles.inputRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="location-outline" size={16} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Select address</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                {isLoadingAddress ? (
                  <ActivityIndicator size="small" color={theme.primaryPurple} style={{ marginRight: 8 }} />
                ) : (
                  <Text style={address ? styles.filledPlaceholder : styles.placeholder} numberOfLines={2}>
                    {address || "Select address"}
                  </Text>
                )}
                <Ionicons name="chevron-down" size={15} color="#5B756C" />
              </View>
            </View>
          </TouchableOpacity>

          {/* Phone Number */}
          <View style={styles.inputBox} ref={phoneInputRef}>
            <View style={styles.inputRow}>
              <View style={styles.inputLeft}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="call-outline" size={15} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Phone Number</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Enter your number"
                  value={phone}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/[^0-9]/g, "");
                    setPhone(cleaned);
                  }}
                  keyboardType="numeric"
                  maxLength={10}
                  placeholderTextColor={theme.textGray}
                />
              </View>
            </View>
          </View>

          {/* Alternative Phone Number */}
          <View style={styles.inputBox} ref={altPhoneInputRef}>
            <View style={styles.inputRow}>
              <View style={styles.inputLeft}>
                <View style={[styles.iconCircleWrapper, { backgroundColor: "rgba(15, 56, 42, 0.04)" }]}>
                  <Ionicons name="call-outline" size={15} color={theme.primaryPurple} />
                </View>
                <View>
                  <Text style={styles.inputTitle}>Alternative Phone</Text>
                  <Text style={styles.optionalFieldSubLabel}>(Optional)</Text>
                </View>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Enter alt number"
                  value={altPhone}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/[^0-9]/g, "");
                    setAltPhone(cleaned);
                  }}
                  keyboardType="numeric"
                  maxLength={10}
                  placeholderTextColor={theme.textGray}
                />
              </View>
            </View>
            {altPhone.length > 0 && !/^[6-9]\d{9}$/.test(altPhone) && (
              <Text style={styles.errorText}>Enter a valid alternative number</Text>
            )}
          </View>

          <TouchableOpacity style={styles.inputBox} onPress={() => setDeliveryModal(true)} activeOpacity={0.8}>
            <View style={styles.inputRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="car-outline" size={16} color={theme.primaryPurple} />
                </View>
                <Text style={styles.inputTitle}>Delivery service</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Text style={delivery ? styles.filledPlaceholder : styles.placeholder}>
                  {delivery || "Select option"}
                </Text>
                <Ionicons name="chevron-down" size={15} color="#5B756C" />
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.notesBox}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={styles.iconCircleWrapper}>
                <Ionicons name="document-text-outline" size={15} color={theme.primaryPurple} />
              </View>
              <Text style={styles.notesTitle}>Special instructions</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 }}>
              <TouchableOpacity
                style={[styles.spiceOption, selectedSpice === "Less spicy" && styles.spiceOptionActive]}
                onPress={() => setSelectedSpice("Less spicy")}
                activeOpacity={0.75}
              >
                <Text style={[styles.spiceText, selectedSpice === "Less spicy" && styles.spiceTextActive]}>🧊 Less spicy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spiceOption, selectedSpice === "Medium spicy" && styles.spiceOptionActive]}
                onPress={() => setSelectedSpice("Medium spicy")}
                activeOpacity={0.75}
              >
                <Text style={[styles.spiceText, selectedSpice === "Medium spicy" && styles.spiceTextActive]}>🌶 Medium spicy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spiceOption, selectedSpice === "Very spicy" && styles.spiceOptionActive]}
                onPress={() => setSelectedSpice("Very spicy")}
                activeOpacity={0.75}
              >
                <Text style={[styles.spiceText, selectedSpice === "Very spicy" && styles.spiceTextActive]}>🔥 Very spicy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spiceOption, noOnionsGarlic && styles.spiceOptionActive]}
                onPress={() => setNoOnionsGarlic(!noOnionsGarlic)}
                activeOpacity={0.75}
              >
                <Text style={[styles.spiceText, noOnionsGarlic && styles.spiceTextActive]}>🚫🧄 No onion & garlic</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Add a note for our chefs if you have any special requests..."
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={theme.textGray}
              style={styles.textArea}
            />
            <Text style={styles.notesDisclaimer}>
              Our chefs will try their best to follow your requests. However, refunds or cancellations in this regard won't be possible.
            </Text>
          </View>
        </ScrollView>

        {/* BOTTOM BUTTONS */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.cartBtn, !isFormComplete && { opacity: 0.45 }]}
            disabled={!isFormComplete}
            activeOpacity={0.85}
            onPress={async () => {
              if (!isFormComplete) return;

              // Trigger Add to Cart Blast Animation First
              setShowBlastAnimation(true);
              blastScaleAnim.setValue(0.2);
              blastOpacityAnim.setValue(0);

              Animated.parallel([
                Animated.timing(blastScaleAnim, {
                  toValue: 1.15,
                  duration: 400,
                  easing: Easing.bezier(0.25, 1, 0.5, 1.2),
                  useNativeDriver: true,
                }),
                Animated.timing(blastOpacityAnim, {
                  toValue: 1,
                  duration: 250,
                  useNativeDriver: true,
                }),
              ]).start();

              const basePrice = menu?.price || 0;
              const extraPriceTotal = Number(params.extraPrice) || 0;
              const finalPlatePrice = Number(params.finalPrice) || basePrice;

              const selectedService = services.find(s => s.name === delivery);
              const deliveryPriceCalc = selectedService
                ? Number(selectedService.price.replace(/[^\d.]/g, ""))
                : 0;

              const updatedSelections = selectedItemsSummary.map((cat: any) => {
                let count = 0;
                const normalItems: any[] = [];
                const extraItemsArr: any[] = [];

                cat.selected?.forEach((item: any) => {
                  count++;
                  if (cat.max && count > cat.max) {
                    extraItemsArr.push({
                      name: item.name,
                      imageUrl: item.imageUrl,
                      price: item.price || 0,
                    });
                  } else {
                    normalItems.push({
                      name: item.name,
                      imageUrl: item.imageUrl,
                    });
                  }
                });

                return {
                  category: cat.category,
                  max: cat.max,
                  selected: normalItems,
                  extraSelected: extraItemsArr,
                };
              });

              const extraItems = updatedSelections.reduce(
                (sum: number, cat: any) => sum + (cat.extraSelected?.length || 0),
                0
              );

              const totalItemsCount = updatedSelections.reduce(
                (acc: number, cat: any) =>
                  acc + (cat.selected?.length || 0) + (cat.extraSelected?.length || 0),
                0
              );

              const orderDetailsPayload = {
                occasion,
                date: dateDisplay,
                time,
                guests,
                phone,
                altPhone,
                address,
                activeAddress,
                delivery,
                selectedSpice,
                noOnionsGarlic,
                notes,
              };

              const cartPayload = {
                serviceType: "catering",
                chefId: effectiveChefId,
                chefName: effectiveChefName,
                userId: effectiveUserId,
                userName: effectiveUserName,
                menu: {
                  ...menu,
                  price: basePrice,
                  extraPrice: extraPriceTotal,
                  finalPrice: finalPlatePrice,
                },
                restaurant: {
                  ...chef,
                  id: effectiveChefId,
                  name: effectiveChefName,
                },
                selections: updatedSelections,
                addons: addons || [],
                totalItems: totalItemsCount,
                orderDetails: orderDetailsPayload,
                finalPrice: finalPlatePrice,
                deliveryPrice: deliveryPriceCalc,
                extraItems,
                type: params.type || "veg",
              };

              try {
                await api.post("/api/cart/add", cartPayload);
              } catch (error: any) {
                console.error(error);
              }

              setTimeout(() => {
                setShowBlastAnimation(false);
                router.replace("/(tabs)/Home");
              }, 700);
            }}
          >
            <Text style={styles.cartTxt}>Add to cart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reviewBtn, !isFormComplete && { opacity: 0.45 }]}
            disabled={!isFormComplete}
            activeOpacity={0.88}
            onPress={reviewOrder}
          >
            <Text style={styles.reviewTxt}>Review order</Text>
          </TouchableOpacity>
        </View>

        {/* ADD TO CART BLAST ANIMATION OVERLAY */}
        {showBlastAnimation && (
          <View style={styles.blastOverlay}>
            <Animated.View
              style={[
                styles.blastCard,
                {
                  opacity: blastOpacityAnim,
                  transform: [{ scale: blastScaleAnim }],
                },
              ]}
            >
              <View style={styles.blastIconCircle}>
                <Ionicons name="cart" size={38} color="#FAF8F5" />
              </View>
              <Text style={styles.blastTitle}>Added to Cart! 🎉</Text>
              <Text style={styles.blastSubtitle}>Taking you home...</Text>
            </Animated.View>
          </View>
        )}

        {/* DATE MODAL */}
        <Modal visible={dateModal} animationType="fade" transparent onRequestClose={() => setDateModal(false)}>
          <View style={styles.modalRootOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableWithoutFeedback onPress={() => setDateModal(false)}>
              <View style={styles.modalOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.modalClosePillButton} onPress={() => setDateModal(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.modalSheetHeaderRow}>
                <Text style={styles.modalTitle}>Select Delivery Date</Text>
              </View>

              <View style={styles.instructionBox}>
                <Ionicons name="information-circle" size={17} color={theme.primaryPurple} style={{ marginRight: 6 }} />
                <Text style={styles.instructionTextSimple}>{getDateModalInstruction()}</Text>
              </View>

              <Calendar
                current={minSelectableDateStr}
                onDayPress={handleDayPress}
                markedDates={{
                  [selectedDate.toISOString().split("T")[0]]: {
                    selected: true,
                    selectedColor: theme.primaryPurple,
                  },
                }}
                theme={{
                  selectedDayBackgroundColor: theme.primaryPurple,
                  todayTextColor: theme.primaryPurple,
                  dayTextColor: theme.black,
                  monthTextColor: theme.black,
                  textDayHeaderFontWeight: "700",
                  textMonthFontWeight: "800",
                  textDayFontSize: 14.5,
                  textMonthFontSize: 15.5,
                  textDisabledColor: "#CBD5E1",
                  disabledArrowColor: "#CBD5E1",
                }}
                minDate={minSelectableDateStr}
                style={{ height: 320, borderRadius: 16 }}
              />
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: theme.primaryPurple, marginTop: 14 }]}
                onPress={() => setDateModal(false)}
                activeOpacity={0.88}
              >
                <Text style={{ color: theme.white, fontWeight: "800", fontSize: 14.5 }}>Confirm Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* OCCASION MODAL */}
        <Modal visible={occasionModal} animationType="fade" transparent onRequestClose={() => setOccasionModal(false)}>
          <View style={styles.modalRootOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableWithoutFeedback onPress={() => setOccasionModal(false)}>
              <View style={styles.modalOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={[styles.modalBox, { maxHeight: height * 0.78 }]}>
              <TouchableOpacity style={styles.modalClosePillButton} onPress={() => setOccasionModal(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.modalSheetHeaderRow}>
                <Text style={styles.modalTitle}>Select Occasion</Text>
              </View>
              <Text style={{ color: theme.darkGray, marginBottom: 14, fontSize: 12.5, fontWeight: "500" }}>Knowing this helps us curate your banquet layout</Text>
              <FlatList 
                data={occasions} 
                renderItem={renderOccasionItem} 
                numColumns={2} 
                keyExtractor={(item) => item.id.toString()} 
                contentContainerStyle={styles.gridContainer}
                showsVerticalScrollIndicator={false}
                columnWrapperStyle={styles.columnWrapper}
              />
            </View>
          </View>
        </Modal>

        {/* TIME MODAL */}
        <Modal visible={timeModal} animationType="fade" transparent onRequestClose={() => setTimeModal(false)}>
          <View style={styles.modalRootOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableWithoutFeedback onPress={() => setTimeModal(false)}>
              <View style={styles.modalOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.modalClosePillButton} onPress={() => setTimeModal(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.modalSheetHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.modalTitle}>Delivery Time</Text>
                </View>
              </View>

              <View style={styles.instructionBox}>
                <Ionicons name="time-outline" size={17} color={theme.primaryPurple} style={{ marginRight: 6 }} />
                <Text style={styles.instructionTextSimple}>{getTimeModalInstruction()}</Text>
              </View>

              <View style={styles.divider} />
              <View style={styles.sessionTabs}>
                {["Morning", "Afternoon", "Evening"].map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.sessionTab, selectedSession === item && styles.activeSessionTab]}
                    onPress={() => setSelectedSession(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.sessionText, selectedSession === item && styles.activeSessionText]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.timeGrid}>
                {getSlotsForSession(selectedSession).map((slot) => {
                  const allowed = isSlotAllowed(selectedDate, slot);
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[
                        styles.timeSlot,
                        time === slot && styles.selectedTimeSlot,
                        !allowed && styles.timeSlotDisabled,
                      ]}
                      disabled={!allowed}
                      onPress={() => {
                        if (allowed) {
                          setTime(slot);
                          setTimeModal(false);
                        }
                      }}
                      activeOpacity={allowed ? 0.75 : 1}
                    >
                      <Text
                        style={[
                          styles.timeSlotText,
                          time === slot && styles.selectedTimeSlotText,
                          !allowed && styles.timeSlotTextDisabled,
                        ]}
                      >
                        {slot}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>

        {/* GUEST MODAL */}
        <Modal visible={guestModal} animationType="fade" transparent onRequestClose={() => setGuestModal(false)}>
          <View style={styles.modalRootOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableWithoutFeedback onPress={() => setGuestModal(false)}>
              <View style={styles.modalOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.modalClosePillButton} onPress={() => setGuestModal(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.modalSheetHeaderRow}>
                <Text style={styles.modalTitle}>Total Guests</Text>
              </View>
              <FlatList 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                data={Array.from({ length: 100 }, (_, i) => (i + 1) * 10)} 
                keyExtractor={(item) => item.toString()} 
                contentContainerStyle={{ paddingVertical: 10 }} 
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.guestPresetBtn, guests === item && styles.guestPresetBtnActive]} 
                    onPress={() => setGuests(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.guestPresetText, guests === item && styles.guestPresetTextActive]}>{item}</Text>
                  </TouchableOpacity>
                )} 
              />
              <View style={styles.guestStepper}>
                <TouchableOpacity 
                  style={styles.stepperBtn} 
                  onPress={() => { if (guests > 10) setGuests(guests - 10); }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="remove" size={20} color="#0B261D" />
                </TouchableOpacity>
                <TextInput 
                  style={styles.guestNumberInput} 
                  keyboardType="numeric" 
                  value={String(guests)} 
                  onChangeText={(val) => { const num = parseInt(val); if (!isNaN(num)) setGuests(num); }} 
                />
                <TouchableOpacity 
                  style={styles.stepperBtn} 
                  onPress={() => setGuests(guests + 10)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={20} color="#0B261D" />
                </TouchableOpacity>
              </View>
              <Text style={styles.minimumText}>Minimum catering order: 10 guests</Text>
              <View style={styles.totalCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Price per plate</Text>
                  <Text style={styles.totalValue}>₹{finalPlatePrice}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Guests</Text>
                  <Text style={styles.totalValue}>{guests}</Text>
                </View>
                <View style={styles.totalDivider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalFinalLabel}>Estimated Total</Text>
                  <Text style={styles.totalFinalValue}>₹{totalPrice.toLocaleString()}</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.confirmBtn, { backgroundColor: theme.primaryPurple, marginTop: 14 }]} 
                onPress={() => { setHasGuestSelected(true); setGuestModal(false); }}
                activeOpacity={0.88}
              >
                <Text style={{ color: theme.white, fontWeight: "800", fontSize: 14.5 }}>Confirm Guest Count</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* SELECT ADDRESS MODAL */}
        <Modal visible={addressModal} animationType="fade" transparent onRequestClose={() => setAddressModal(false)}>
          <View style={styles.modalRootOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableWithoutFeedback onPress={() => setAddressModal(false)}>
              <View style={styles.modalOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={[styles.modalBox, { maxHeight: height * 0.74 }]}>
              <TouchableOpacity style={styles.modalClosePillButton} onPress={() => setAddressModal(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              {showAddAddressForm ? (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
                    <TouchableOpacity onPress={() => setShowAddAddressForm(false)} style={{ marginRight: 10 }}>
                      <Ionicons name="arrow-back" size={22} color={theme.primaryPurple} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Add Delivery Address</Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Flat No. / Floor</Text>
                    <TextInput style={styles.formInput} placeholder="e.g. 101" value={newFlatNo} onChangeText={setNewFlatNo} placeholderTextColor={theme.textGray} />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Apartment / Building Name</Text>
                    <TextInput style={styles.formInput} placeholder="e.g. Sunshine Towers" value={newBuilding} onChangeText={setNewBuilding} placeholderTextColor={theme.textGray} />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Street Name</Text>
                    <TextInput style={styles.formInput} placeholder="e.g. Main Road, Nizampet" value={newStreet} onChangeText={setNewStreet} placeholderTextColor={theme.textGray} />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>City / Location</Text>
                    <TextInput style={styles.formInput} placeholder="e.g. Hyderabad, Telangana" value={newCity} onChangeText={setNewCity} placeholderTextColor={theme.textGray} />
                  </View>
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: theme.primaryPurple, marginTop: 10 }]} onPress={handleSaveNewAddress} activeOpacity={0.88}>
                    <Text style={{ color: theme.white, fontWeight: "800", fontSize: 14.5 }}>Save & Use This Address</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.modalSheetHeaderRow}>
                    <View>
                      <Text style={styles.modalTitle}>Select Address</Text>
                      <Text style={{ fontSize: 12, color: theme.darkGray, marginTop: 2, fontWeight: "500" }}>Choose from your saved locations</Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.5 }}>
                    {/* ACTIVE ADDRESS */}
                    {activeAddress && activeAddress.fullAddress ? (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.sectionLabelCaps}>ACTIVE ADDRESS</Text>
                        <TouchableOpacity
                          style={[styles.addressCardItem, styles.addressCardItemActive]}
                          activeOpacity={0.85}
                          onPress={handleKeepCurrentActive}
                        >
                          <View style={[styles.addressIconCircle, styles.addressIconCircleActive]}>
                            <Ionicons name="navigate" size={16} color="#FAF8F5" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Text style={styles.addressCardTitle}>{activeAddress.title || "Current"}</Text>
                              <View style={styles.activePill}>
                                <Ionicons name="checkmark-circle" size={11} color="#0F382A" />
                                <Text style={styles.activePillText}>Active</Text>
                              </View>
                            </View>
                            {activeAddress.houseDetails ? (
                              <Text style={styles.addressCardHouse} numberOfLines={1}>{activeAddress.houseDetails}</Text>
                            ) : null}
                            <Text style={styles.addressCardFull} numberOfLines={2}>{activeAddress.fullAddress}</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {/* SAVED ADDRESSES */}
                    <Text style={styles.sectionLabelCaps}>SAVED ADDRESSES</Text>
                    {isLoadingAddress ? (
                      <View style={{ paddingVertical: 20, alignItems: "center" }}>
                        <ActivityIndicator size="small" color={theme.primaryPurple} />
                      </View>
                    ) : savedAddresses.length > 0 ? (
                      savedAddresses.map((item) => {
                        const isSelected =
                          selectedAddressId === item.id ||
                          (activeAddress && activeAddress.id === item.id);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.addressCardItem, isSelected && styles.addressCardItemActive]}
                            activeOpacity={0.85}
                            onPress={() => handleSelectSavedAddress(item)}
                          >
                            <View style={[styles.addressIconCircle, isSelected && styles.addressIconCircleActive]}>
                              {item.tag === "Home" && (
                                <Ionicons name="home" size={16} color={isSelected ? "#FAF8F5" : theme.primaryPurple} />
                              )}
                              {item.tag === "Work" && (
                                <Ionicons name="briefcase" size={16} color={isSelected ? "#FAF8F5" : theme.primaryPurple} />
                              )}
                              {item.tag === "Other" && (
                                <Ionicons name="bookmark" size={16} color={isSelected ? "#FAF8F5" : theme.primaryPurple} />
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={styles.addressCardTitle}>{item.title}</Text>
                                {isSelected && (
                                  <View style={styles.activePill}>
                                    <Ionicons name="checkmark-circle" size={11} color="#0F382A" />
                                    <Text style={styles.activePillText}>Active</Text>
                                  </View>
                                )}
                              </View>
                              {item.houseDetails ? (
                                <Text style={styles.addressCardHouse} numberOfLines={1}>{item.houseDetails}</Text>
                              ) : null}
                              <Text style={styles.addressCardFull} numberOfLines={2}>{item.fullAddress}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <View style={styles.emptySavedBox}>
                        <Ionicons name="location-outline" size={26} color="#9EA8A3" style={{ marginBottom: 6 }} />
                        <Text style={styles.emptySavedTitle}>No saved addresses yet</Text>
                        <Text style={styles.emptySavedSubtitle}>
                          Save addresses from Home, or add a one-time address below.
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity style={styles.addAddressBtn} onPress={() => setShowAddAddressForm(true)} activeOpacity={0.8}>
                      <Ionicons name="add-circle-outline" size={18} color={theme.primaryPurple} />
                      <Text style={styles.addAddressText}>Enter Address Manually</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* DELIVERY MODAL */}
        <Modal visible={deliveryModal} animationType="fade" transparent onRequestClose={() => setDeliveryModal(false)}>
          <View style={styles.modalRootOverlay}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <TouchableWithoutFeedback onPress={() => setDeliveryModal(false)}>
              <View style={styles.modalOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.modalClosePillButton} onPress={() => setDeliveryModal(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.modalSheetHeaderRow}>
                <Text style={styles.modalTitle}>Delivery & Setup Options</Text>
              </View>
              <FlatList data={services} renderItem={renderService} keyExtractor={(item) => item.id.toString()} />
            </View>
          </View>
        </Modal>

        {/* PREVIEW MODAL (MATCHING MEALBOXITEMSCREEN.TSX STYLE) */}
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
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => setShowPreviewModal(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={20} color="#FAF8F5" />
              </TouchableOpacity>

              <View style={styles.previewHeaderCard}>
                <View style={styles.previewHeaderRow}>
                  <Image
                    source={{
                      uri:
                        menu?.plateItems?.[0]?.imageUrl ||
                        menu?.imageUrl ||
                        "https://picsum.photos/200",
                    }}
                    style={styles.previewHeaderImage}
                  />

                  <View style={styles.previewTitleInline}>
                    <Text style={styles.previewMainTitle} numberOfLines={1}>
                      {effectiveChefName}
                    </Text>
                    <Text style={styles.previewSubInline} numberOfLines={1}>
                      {menu?.name}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.previewPricePillSmall}
                    onPress={() => setShowPriceDetails(prev => !prev)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.previewPriceInline}>
                      ₹{finalPlatePrice}/plate
                    </Text>
                    <Ionicons name={showPriceDetails ? "chevron-up" : "chevron-down"} size={13} color="#FAF8F5" style={{ marginLeft: 3 }} />
                  </TouchableOpacity>
                </View>
              </View>

              {showPriceDetails && (
                <View style={styles.priceBreakdownCard}>
                  <Text style={styles.breakdownTitle}>Price Details</Text>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Base Price</Text>
                    <Text style={styles.breakdownValue}>₹{menu?.price}</Text>
                  </View>
                  {extraPriceFromMenu > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownSubLabel}>Extras</Text>
                      <Text style={styles.extraValue}>+₹{extraPriceFromMenu}</Text>
                    </View>
                  )}
                  {addons && addons.length > 0 && addons.map((addon: any, idx: number) => (
                    <View key={`review-addon-price-${idx}`} style={styles.breakdownRow}>
                      <Text style={styles.breakdownSubLabel}>{addon.name} × {addon.count}</Text>
                      <Text style={styles.extraValue}>+₹{addon.price * addon.count}/plate</Text>
                    </View>
                  ))}
                  <View style={styles.divider} />
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownTotalLabel}>Total per Plate</Text>
                    <Text style={styles.totalValue}>₹{finalPlatePrice}</Text>
                  </View>
                </View>
              )}

              <Text style={styles.previewTitle}>Selected Banquet Items</Text>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {selections?.map((cat: any, index: number) => {
                  if (!cat.selected?.length) return null;
                  let count = 0;
                  return (
                    <View key={index} style={styles.previewCategoryCard}>
                      <View style={styles.previewCategoryHeader}>
                        <Text style={styles.previewCategoryTitle}>
                          {cat.category}
                        </Text>
                      </View>
                      {cat.selected.map((item: any, i: number) => {
                        count++;
                        const isExtra = cat.max && count > cat.max;
                        return (
                          <View key={i}>
                            {isExtra && count === cat.max + 1 && (
                              <Text style={styles.extraSectionTitle}>
                                + Extra Items
                              </Text>
                            )}
                            <View style={styles.previewItemCard}>
                              <Image
                                source={{ uri: item.imageUrl }}
                                style={styles.previewItemImage}
                              />
                              <Text style={styles.previewItemName}>
                                {item.name}
                              </Text>
                              {isExtra && (
                                <View style={styles.extraTag}>
                                  <Text style={styles.extraTagText}>
                                    +₹{item.price || extraPriceFromMenu}/plate
                                  </Text>
                                </View>
                              )}
                              <Ionicons
                                name="checkmark-circle"
                                size={17}
                                color={isExtra ? "#166538" : "#107C41"}
                                style={{ marginLeft: "auto" }}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}

                {/* DYNAMIC ADD-ONS SECTION IN PREVIEW MODAL */}
                {addons && addons.length > 0 && (
                  <View style={styles.previewCategoryCard}>
                    <View style={styles.previewCategoryHeader}>
                      <Text style={styles.previewCategoryTitle}>Add-ons</Text>
                    </View>
                    {addons.map((addon: any, idx: number) => (
                      <View key={`review-addon-item-${idx}`} style={styles.previewItemCard}>
                        <Image
                          source={{ uri: addon.imageUrl }}
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
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FAF8F5" },
  container: { flex: 1, backgroundColor: "#FAF8F5" },
  scrollContent: { paddingBottom: 24, flexGrow: 0 },
  headerContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 20, backgroundColor: "#FAF8F5" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0B261D", flex: 1, textAlign: "center", letterSpacing: -0.3 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.12)", shadowColor: "#0F382A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  headerPlaceholder: { width: 38 },
  
  // Stepper Styles
  stepperContainer: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  stepperScrollContent: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  stepWrapper: {
    alignItems: "center",
    marginHorizontal: 10,
    minWidth: 64,
  },
  stepConnector: {
    position: "absolute",
    height: 2.5,
    backgroundColor: "rgba(15, 56, 42, 0.12)",
    top: 16,
    left: -32,
    right: -32,
    zIndex: -1,
    borderRadius: 2,
  },
  stepConnectorCompleted: {
    backgroundColor: "#166538",
  },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FAF8F5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(15, 56, 42, 0.2)",
  },
  stepCircleCompleted: {
    backgroundColor: "#166538",
    borderColor: "#166538",
  },
  stepNumber: {
    color: "#5B756C",
    fontSize: 13,
    fontWeight: "700",
  },
  stepLabel: {
    fontSize: 10.5,
    color: "#5B756C",
    marginTop: 5,
    fontWeight: "600",
    textAlign: "center",
  },
  stepLabelCompleted: {
    color: "#166538",
    fontWeight: "800",
  },

  menuBox: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#FFFFFF", 
    marginHorizontal: 20, 
    padding: 14, 
    borderRadius: 20, 
    marginTop: 12, 
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A", 
    shadowOpacity: 0.04, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowRadius: 10,
    elevation: 3,
  },
  menuImg: { width: 56, height: 56, borderRadius: 14, marginRight: 14, backgroundColor: "#E5ECE8" },
  menuTitle: { fontSize: 16, fontWeight: "800", color: "#0B261D", letterSpacing: -0.2 },
  itemsBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(15, 56, 42, 0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: "flex-start", marginTop: 4 },
  menuSub: { color: "#4F6B61", fontSize: 11, fontWeight: "700" },
  inputBox: { 
    backgroundColor: "#FFFFFF", 
    marginHorizontal: 20, 
    marginTop: 12, 
    padding: 14, 
    borderRadius: 18, 
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  inputRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inputTitle: { fontSize: 13.5, fontWeight: "800", color: "#0B261D" },
  placeholder: { color: "#5B756C", flex: 1, textAlign: "right", marginRight: 8, fontSize: 13, fontWeight: "500" },
  filledPlaceholder: { color: "#0B261D", flex: 1, textAlign: "right", marginRight: 8, fontSize: 13, fontWeight: "700" },
  notesBox: { 
    backgroundColor: "#FFFFFF", 
    marginHorizontal: 20, 
    marginVertical: 14, 
    padding: 16, 
    borderRadius: 20, 
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  notesTitle: { fontWeight: "800", color: "#0B261D", fontSize: 13.5 },
  textArea: { marginTop: 10, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.12)", borderRadius: 14, padding: 12, height: 86, textAlignVertical: "top", fontSize: 13, color: "#0B261D", backgroundColor: "#FAF8F5", fontWeight: "500" },
  notesDisclaimer: { fontSize: 11, color: "#5B756C", marginTop: 8, lineHeight: 16, fontWeight: "500" },
  bottomBar: { 
    flexDirection: "row", 
    paddingHorizontal: 20, 
    paddingVertical: 14, 
    backgroundColor: "#FFFFFF", 
    borderTopWidth: 1, 
    borderTopColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  cartBtn: { flex: 1, paddingVertical: 14, borderRadius: 24, backgroundColor: "#FAF8F5", alignItems: "center", marginRight: 10, borderWidth: 1, borderColor: "rgba(22, 101, 56, 0.2)" },
  reviewBtn: { flex: 1, paddingVertical: 14, borderRadius: 24, backgroundColor: "#166538", alignItems: "center", shadowColor: "#166538", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
  cartTxt: { fontWeight: "800", color: "#166538", fontSize: 14 },
  reviewTxt: { color: "#FAF8F5", fontWeight: "800", fontSize: 14 },
  modalRootOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11, 38, 29, 0.45)" },
  modalOverlayDismiss: { flex: 1 },
  modalBox: { 
    backgroundColor: "#FAF8F5", 
    paddingTop: 18, 
    paddingHorizontal: 20, 
    paddingBottom: 24, 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    minHeight: Dimensions.get("window").height * 0.35, 
    maxHeight: Dimensions.get("window").height * 0.76,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  modalClosePillButton: {
    position: 'absolute',
    top: -22,
    alignSelf: 'center',
    backgroundColor: '#166538',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#166538',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalSheetHeaderRow: {
    marginTop: 8,
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#0B261D", letterSpacing: -0.3 },
  
  // Occasions Grid Layout Styles
  gridContainer: { paddingBottom: 16, paddingTop: 4 },
  columnWrapper: { justifyContent: "space-between", marginBottom: 12 },
  optionCard: { width: "48%", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 10, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.08)", alignItems: "center", shadowColor: "#0F382A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  optionImgContainer: { width: "100%", height: 86, borderRadius: 12, overflow: "hidden", marginBottom: 8, backgroundColor: "#E5ECE8" },
  optionImg: { width: "100%", height: "100%" },
  optionText: { fontSize: 12.5, fontWeight: "700", textAlign: "center", color: "#0B261D" },

  // Delivery Option Styles
  deliveryCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.08)", borderRadius: 18, marginBottom: 12 },
  deliveryEmojiCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#FAF8F5", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.1)" },
  deliveryTitle: { fontSize: 14.5, fontWeight: "800", color: "#0B261D" },
  deliveryDesc: { color: "#5B756C", marginTop: 2, fontSize: 11.5, lineHeight: 16, fontWeight: "500" },
  deliveryPrice: { marginTop: 5, fontWeight: "800", color: "#166538", fontSize: 13 },

  addAddressBtn: { flexDirection: "row", alignItems: "center", marginTop: 14, padding: 10, justifyContent: "center" },
  addAddressText: { color: "#166538", fontWeight: "800", marginLeft: 6, fontSize: 13 },
  spiceOption: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FAF8F5", borderRadius: 18, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.1)" },
  spiceOptionActive: { backgroundColor: "#166538", borderColor: "#166538" },
  spiceText: { fontSize: 11.5, color: "#4F6B61", fontWeight: "600" },
  spiceTextActive: { color: "#FAF8F5", fontWeight: "800" },
  guestStepper: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 16 },
  stepperBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.12)" },
  guestNumberInput: { fontSize: 24, fontWeight: "900", marginHorizontal: 20, color: "#0B261D", minWidth: 80, textAlign: "center" },
  minimumText: { marginTop: 8, textAlign: "center", fontSize: 11.5, color: "#5B756C", fontWeight: "500" },
  guestPresetBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "#FFFFFF", borderRadius: 12, marginRight: 8, alignItems: "center", borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.1)" },
  guestPresetBtnActive: { backgroundColor: "#166538", borderColor: "#166538" },
  guestPresetText: { fontSize: 13, fontWeight: "700", color: "#4F6B61" },
  guestPresetTextActive: { color: "#FAF8F5", fontWeight: "800" },
  priceBadge: { backgroundColor: "#166538", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignItems: "center", justifyContent: "center", minWidth: 72 },
  priceValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  priceLabel: { color: "rgba(255, 255, 255, 0.8)", fontSize: 9.5, marginTop: -1, fontWeight: "600" },
  confirmBtn: { paddingVertical: 14, alignItems: "center", borderRadius: 24, shadowColor: "#166538", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
  totalCard: { marginTop: 14, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.08)" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalLabel: { fontSize: 13, fontWeight: "600", color: "#5B756C" },
  totalValue: { fontSize: 13, fontWeight: "700", color: "#0B261D" },
  totalDivider: { height: 1, backgroundColor: "rgba(15, 56, 42, 0.08)", marginVertical: 8 },
  totalFinalLabel: { fontSize: 14, fontWeight: "800", color: "#0B261D" },
  totalFinalValue: { fontSize: 17, fontWeight: "900", color: "#166538" },
  divider: { height: 1, backgroundColor: "rgba(15, 56, 42, 0.08)", marginVertical: 10 },
  sessionTabs: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.1)" },
  sessionTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 16 },
  activeSessionTab: { backgroundColor: "#166538" },
  sessionText: { color: "#4F6B61", fontWeight: "700", fontSize: 12 },
  activeSessionText: { color: "#FAF8F5", fontWeight: "800" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  timeSlot: { width: "48%", paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.1)", marginBottom: 10, alignItems: "center", backgroundColor: "#FFFFFF" },
  selectedTimeSlot: { borderColor: "#166538", backgroundColor: "rgba(22, 101, 56, 0.06)", borderWidth: 1.5 },
  timeSlotText: { fontWeight: "700", color: "#0B261D", fontSize: 13 },
  selectedTimeSlotText: { color: "#166538", fontWeight: "800" },

  timeSlotDisabled: {
    backgroundColor: "#F2EFEB",
    borderColor: "#E5E0D8",
    opacity: 0.45,
  },
  timeSlotTextDisabled: {
    color: "#9EA8A3",
    fontWeight: "500",
  },

  instructionBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 101, 56, 0.06)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.1)",
  },
  instructionTextSimple: {
    fontSize: 11.5,
    color: "#166538",
    fontWeight: "600",
    flex: 1,
    lineHeight: 16,
  },

  formGroup: { marginBottom: 14 },
  formLabel: { fontSize: 12.5, fontWeight: "700", color: "#0B261D", marginBottom: 6 },
  formInput: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(15, 56, 42, 0.12)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13.5, color: "#0B261D", fontWeight: "500" },
  inputLeft: { flexDirection: "row", alignItems: "center" },
  phoneInput: { flex: 1, textAlign: "right", fontSize: 13.5, color: "#0B261D", marginRight: 8, fontWeight: "700" },
  errorText: { color: "#D32F2F", marginTop: 4, fontSize: 11, fontWeight: "600", paddingLeft: 38 },
  optionalFieldSubLabel: { fontSize: 10, color: "#5B756C", fontWeight: "500", marginTop: 1 },
  iconCircleWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  // Address chooser (Active + Saved)
  sectionLabelCaps: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#166538",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  addressCardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    marginBottom: 10,
  },
  addressCardItemActive: {
    borderColor: "#166538",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
  },
  addressIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  addressIconCircleActive: {
    backgroundColor: "#166538",
  },
  addressCardTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0B261D",
  },
  addressCardHouse: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0B261D",
    marginTop: 2,
  },
  addressCardFull: {
    fontSize: 11.5,
    color: "#5B756C",
    marginTop: 2,
    lineHeight: 16,
    fontWeight: "500",
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 8,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.12)",
  },
  activePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#166538",
    marginLeft: 2,
  },
  emptySavedBox: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    marginBottom: 8,
  },
  emptySavedTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0B261D",
  },
  emptySavedSubtitle: {
    fontSize: 11.5,
    color: "#5B756C",
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 16,
    fontWeight: "500",
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
    elevation: 2,
  },
  previewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    marginHorizontal: 6,
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
    fontWeight: "800",
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
    borderColor: "rgba(15, 56, 42, 0.08)",
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
    marginBottom: 6,
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
    color: "#166538",
  },
  breakdownTotalLabel: {
    fontSize: 14.5,
    fontWeight: "900",
    color: "#0B261D",
  },
  extraTag: {
    backgroundColor: "rgba(22, 101, 56, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(22, 101, 56, 0.15)",
  },
  extraTagText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#166538",
  },
  extraSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166538",
    marginTop: 6,
    marginBottom: 6,
    marginLeft: 2,
  },
  previewCategoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  badgeIcon: { marginLeft: 4 },

  // Blast Animation Styles
  blastOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 38, 29, 0.55)",
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  blastCard: {
    width: width * 0.76,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  blastIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#166538",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#166538",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  blastTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0B261D",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  blastSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5B756C",
  },
});