import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  Easing,
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ionicons,
  Feather,
  MaterialCommunityIcons,
  Octicons,
} from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Audio } from 'expo-av';
import Constants, { AppOwnership } from 'expo-constants';
import api from '@/src/lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { socket } from '@/src/lib/socket';

const { width, height } = Dimensions.get('window');

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

let Notifications: any = null;
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch (err) {
    console.log('expo-notifications module not loaded:', err);
  }
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (err) {
    console.log('Error initializing notification handler:', err);
  }
}

const MONTHS_MAP: { [key: string]: number } = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

const parseDateParts = (dateStr: string) => {
  if (!dateStr) return { dayName: "MON", dayNumber: "17", month: "JUN", fullString: "Mon, 17 Jun" };
  const cleanedStr = dateStr.includes('–') ? dateStr.split('–')[0].trim() : dateStr.trim();
  const parts = cleanedStr.replace(/,/g, '').split(/\s+/);
  if (parts.length >= 2) {
    const dayName = parts[0].substring(0, 3).toUpperCase();
    const dayNumber = parts[1];
    const month = parts[2] ? parts[2].substring(0, 3).toUpperCase() : "JUN";
    return { dayName, dayNumber, month, fullString: cleanedStr };
  }
  return { dayName: "DAY", dayNumber: "1", month: "JUN", fullString: cleanedStr };
};

// ✅ NEW HELPER — Validate coordinates coming from the order document
const hasValidCoords = (lat: any, lng: any): boolean => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    !(nLat === 0 && nLng === 0)
  );
};

// ✅ NEW HELPER — Compact coordinate label (e.g. "12.97160, 77.59460")
const formatCoordLabel = (lat: any, lng: any): string => {
  if (!hasValidCoords(lat, lng)) return '';
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
};

/* ─── COUNTDOWN TIMER WIDGET (ADMIN BLUE THEME) ─── */
function DeliverySlotCountdownWidget({
  deliveryDate,
  timeSlot,
  isDelivered,
  deliveredDateTitle,
}: {
  deliveryDate: string;
  timeSlot: string;
  isDelivered: boolean;
  deliveredDateTitle?: string;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isExtended, setIsExtended] = useState<boolean>(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const calculateRemainingSeconds = useCallback(() => {
    try {
      const now = new Date();
      let targetYear = now.getFullYear();
      let targetMonth = now.getMonth();
      let targetDay = now.getDate();

      if (deliveryDate) {
        const cleanedDate = deliveryDate.includes('–') ? deliveryDate.split('–')[0].trim() : deliveryDate.trim();
        const dateParts = cleanedDate.replace(/,/g, '').split(/\s+/);
        let foundDay = -1;
        let foundMonth = -1;
        let foundYear = -1;

        dateParts.forEach((part) => {
          const num = parseInt(part, 10);
          if (!isNaN(num) && num > 1900) foundYear = num;
          else if (!isNaN(num) && num >= 1 && num <= 31 && foundDay === -1) foundDay = num;
          else {
            const mKey = part.substring(0, 3).toUpperCase();
            if (MONTHS_MAP[mKey] !== undefined) foundMonth = MONTHS_MAP[mKey];
          }
        });

        if (foundMonth !== -1) targetMonth = foundMonth;
        if (foundDay !== -1) targetDay = foundDay;
        if (foundYear !== -1) targetYear = foundYear;
      }

      let hour = 21;
      let minute = 0;
      if (timeSlot) {
        const slotToParse = timeSlot.includes('-') ? timeSlot.split('-')[1].trim() : timeSlot.trim();
        const timeMatch = slotToParse.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);
        if (timeMatch) {
          hour = parseInt(timeMatch[1], 10);
          minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          const meridiem = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
          if (meridiem === 'PM' && hour < 12) hour += 12;
          if (meridiem === 'AM' && hour === 12) hour = 0;
        }
      }

      const targetDate = new Date(targetYear, targetMonth, targetDay, hour, minute, 0, 0);
      const diffSecs = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
      if (diffSecs > 0) {
        setIsExtended(false);
        return diffSecs;
      } else {
        setIsExtended(true);
        return 300;
      }
    } catch {
      return 1800;
    }
  }, [deliveryDate, timeSlot]);

  useEffect(() => {
    if (isDelivered) return;
    setSecondsRemaining(calculateRemainingSeconds());
  }, [calculateRemainingSeconds, isDelivered]);

  useEffect(() => {
    if (isDelivered) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsExtended(true);
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isDelivered]);

  const formatTimerDisplay = (totalSecs: number) => {
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
    if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (isDelivered) {
    return (
      <View style={styles.timerCard}>
        <View style={styles.timerSuccessCircle}>
          <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.timerTitle}>
            Delivered{deliveredDateTitle ? `: ${deliveredDateTitle}` : ' on time'}
          </Text>
          <Text style={styles.timerSubtitle}>Delivery completed successfully</Text>
        </View>
        <View style={styles.successBadgePill}>
          <Text style={styles.successBadgePillText}>Completed</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.timerCard}>
      <Animated.View style={[styles.timerIconCircle, { transform: [{ scale: pulseAnim }] }]}>
        <Ionicons name="timer-outline" size={20} color="#2563EB" />
      </Animated.View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.timerTitle}>Delivery Slot Timer</Text>
          {isExtended && (
            <View style={styles.extendedBadge}>
              <Text style={styles.extendedBadgeText}>+5m Extended</Text>
            </View>
          )}
        </View>
        <Text style={styles.timerSubtitle}>Scheduled: {deliveryDate} • {timeSlot}</Text>
      </View>

      <View style={styles.timerDisplayBox}>
        <Text style={styles.timerDigits}>{formatTimerDisplay(secondsRemaining)}</Text>
        <Text style={styles.timerUnit}>remaining</Text>
      </View>
    </View>
  );
}

/* ─── MAIN ADMIN SCREEN ─── */
export default function AdminAllOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(0);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Filter tabs
  const [statusFilter, setStatusFilter] = useState<'All' | 'Placed' | 'Accepted' | 'Preparing' | 'Delivered' | 'Cancelled'>('All');

  // Status dropdowns
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);
  const [activeScheduleDropdownDate, setActiveScheduleDropdownDate] = useState<string | null>(null);

  // Price breakdown expander
  const [isPriceExpanded, setIsPriceExpanded] = useState<boolean>(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;

  // Preview modal
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewActiveDay, setPreviewActiveDay] = useState<string>('');
  const sheetAnim = useRef(new Animated.Value(400)).current;

  // Alarm refs
  const soundRef = useRef<Audio.Sound | null>(null);
  const alarmIntervalRef = useRef<any>(null);
  const alarmStopTimeoutRef = useRef<any>(null);
  const isAlarmPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    async function setupNotifications() {
      if (!Notifications) return;
      try {
        if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
          await Notifications.setNotificationChannelAsync('admin_orders', {
            name: 'Platform Admin Alerts',
            importance: Notifications.AndroidImportance?.MAX ?? 5,
            vibrationPattern: [0, 500, 250, 500],
            lightColor: '#2563EB',
            sound: 'default',
            enableVibrate: true,
          });
        }
        if (Notifications.getPermissionsAsync && Notifications.requestPermissionsAsync) {
          const { status } = await Notifications.getPermissionsAsync();
          if (status !== 'granted') {
            await Notifications.requestPermissionsAsync();
          }
        }
      } catch (err) {
        console.log('Notification channel setup error:', err);
      }
    }
    setupNotifications();
  }, []);

  const triggerAdminPushNotification = async (orderItem: any) => {
    if (!Notifications || !Notifications.scheduleNotificationAsync) return;
    try {
      const orderIdStr = orderItem?.orderId ? `#${orderItem.orderId}` : 'New Order';
      const custName = orderItem?.userName || 'Customer';
      const chefName = orderItem?.chefName || orderItem?.restaurantName || 'Kitchen Partner';
      const total = orderItem?.totalAmount ? `₹${orderItem.totalAmount}` : '';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🚨 New Platform Order ${orderIdStr}`,
          body: `${custName} → ${chefName} (${total}). Review now!`,
          data: { orderId: orderItem?.orderId },
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.MAX,
        },
        trigger: null,
      });
    } catch (err) {
      console.log('Error triggering admin push notification:', err);
    }
  };

  const startOrderAlarmSound = async () => {
    try {
      if (isAlarmPlayingRef.current) return;
      isAlarmPlayingRef.current = true;

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
      await sound.playAsync();

      Vibration.vibrate([0, 600, 300, 600, 300], true);

      if (alarmStopTimeoutRef.current) clearTimeout(alarmStopTimeoutRef.current);
      alarmStopTimeoutRef.current = setTimeout(async () => {
        await stopOrderAlarmSoundOnly();
      }, 10000);
    } catch (err) {
      console.log('Error playing alarm sound:', err);
    }
  };

  const stopOrderAlarmSoundOnly = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      Vibration.cancel();
      isAlarmPlayingRef.current = false;
    } catch (err) {
      console.log('Error stopping sound:', err);
    }
  };

  const clearAlarmAndSnoozeCycle = async () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (alarmStopTimeoutRef.current) {
      clearTimeout(alarmStopTimeoutRef.current);
      alarmStopTimeoutRef.current = null;
    }
    await stopOrderAlarmSoundOnly();
  };

  const initAlarmCycleForPendingOrder = (orderItem: any) => {
    clearAlarmAndSnoozeCycle();
    startOrderAlarmSound();
    triggerAdminPushNotification(orderItem);

    alarmIntervalRef.current = setInterval(() => {
      startOrderAlarmSound();
      triggerAdminPushNotification(orderItem);
    }, 180000);
  };

  const togglePriceDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const toValue = isPriceExpanded ? 0 : 1;
    Animated.timing(chevronAnim, { toValue, duration: 200, useNativeDriver: true }).start();
    setIsPriceExpanded(!isPriceExpanded);
  };

  const chevronRotation = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const fetchAllOrders = async () => {
    try {
      const res = await api.get('/api/orders/all');
      if (res.data && res.data.success) {
        const fetched = res.data.orders || [];
        setOrders(fetched);

        const hasPending = fetched.find(
          (o: any) => (o.orderStatus || 'Placed').toLowerCase() === 'placed'
        );
        if (hasPending) {
          initAlarmCycleForPendingOrder(hasPending);
        } else {
          clearAlarmAndSnoozeCycle();
        }
      }
    } catch (err: any) {
      console.log('Error fetching admin orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ─── Real-time socket listeners ───
  useEffect(() => {
    fetchAllOrders();

    const handleNewOrder = (newOrder: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders((prev) => [newOrder, ...prev]);
      initAlarmCycleForPendingOrder(newOrder);
    };

    const handleOrderUpdated = (updatedOrder: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders((prev) =>
        prev.map((o) => (o.orderId === updatedOrder.orderId ? { ...o, ...updatedOrder } : o))
      );
    };

    const handleScheduleStatusUpdated = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
    };

    const handleOrderDeliveryPaused = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
    };

    const handleOrderDeliveryUnpaused = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
    };

    const handleOrderDeliveryRescheduled = (data: any) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOrders((prev) =>
        prev.map((o) => (o.orderId === data.orderId ? { ...o, ...data.order } : o))
      );
    };

    if (socket) {
      socket.on('new_order_placed', handleNewOrder);
      socket.on('new_chef_order', handleNewOrder);
      socket.on('order_updated', handleOrderUpdated);
      socket.on('order_status_updated', handleOrderUpdated);
      socket.on('schedule_status_updated', handleScheduleStatusUpdated);
      socket.on('order_delivery_paused', handleOrderDeliveryPaused);
      socket.on('order_delivery_unpaused', handleOrderDeliveryUnpaused);
      socket.on('order_delivery_rescheduled', handleOrderDeliveryRescheduled);
    }

    return () => {
      clearAlarmAndSnoozeCycle();
      if (socket) {
        socket.off('new_order_placed', handleNewOrder);
        socket.off('new_chef_order', handleNewOrder);
        socket.off('order_updated', handleOrderUpdated);
        socket.off('order_status_updated', handleOrderUpdated);
        socket.off('schedule_status_updated', handleScheduleStatusUpdated);
        socket.off('order_delivery_paused', handleOrderDeliveryPaused);
        socket.off('order_delivery_unpaused', handleOrderDeliveryUnpaused);
        socket.off('order_delivery_rescheduled', handleOrderDeliveryRescheduled);
      }
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllOrders();
  }, []);

  // ─── Filtered orders ───
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'All') return orders;
    return orders.filter(
      (o) => (o.orderStatus || 'Placed').toLowerCase() === statusFilter.toLowerCase()
    );
  }, [orders, statusFilter]);

  const activeOrder = filteredOrders[selectedOrderIndex] || filteredOrders[0] || null;

  useEffect(() => {
    if (selectedOrderIndex >= filteredOrders.length) {
      setSelectedOrderIndex(0);
    }
  }, [filteredOrders.length]);

  const orderTimeFormatted = activeOrder?.createdAt
    ? new Date(activeOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Today';

  const parsedSelections = useMemo(() => {
    if (!activeOrder?.selections) return null;
    try {
      return typeof activeOrder.selections === 'string'
        ? JSON.parse(activeOrder.selections)
        : activeOrder.selections;
    } catch (e) {
      return null;
    }
  }, [activeOrder?.selections]);

  const parsedItems = useMemo(() => {
    if (!activeOrder?.items) return [];
    try {
      return typeof activeOrder.items === 'string'
        ? JSON.parse(activeOrder.items)
        : activeOrder.items;
    } catch (e) {
      return [];
    }
  }, [activeOrder?.items]);

  const parsedAddons = useMemo(() => {
    if (!activeOrder?.addons) return [];
    try {
      return typeof activeOrder.addons === 'string'
        ? JSON.parse(activeOrder.addons)
        : activeOrder.addons;
    } catch (e) {
      return [];
    }
  }, [activeOrder?.addons]);

  useEffect(() => {
    if (parsedSelections && typeof parsedSelections === 'object' && !Array.isArray(parsedSelections)) {
      const keys = Object.keys(parsedSelections).filter((k) => k !== 'pausedDates');
      if (keys.length > 0) setPreviewActiveDay(keys[0]);
    }
  }, [parsedSelections]);

  const openPreviewSheet = (day?: string) => {
    if (day) setPreviewActiveDay(day);
    else if (parsedSelections && typeof parsedSelections === 'object' && !Array.isArray(parsedSelections)) {
      const keys = Object.keys(parsedSelections).filter((k) => k !== 'pausedDates');
      if (keys.length > 0 && !previewActiveDay) setPreviewActiveDay(keys[0]);
    }
    setShowPreviewModal(true);
    sheetAnim.setValue(400);
    Animated.timing(sheetAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  };

  const closePreviewSheet = () => {
    Animated.timing(sheetAnim, { toValue: 400, duration: 250, useNativeDriver: true }).start(() => {
      setShowPreviewModal(false);
    });
  };

  const openPreviewForSchedule = (dateStr: string) => {
    if (!parsedSelections || typeof parsedSelections !== 'object' || Array.isArray(parsedSelections)) {
      openPreviewSheet();
      return;
    }
    const { dayName } = parseDateParts(dateStr);
    const keys = Object.keys(parsedSelections).filter((k) => k !== 'pausedDates');
    const matchKey = keys.find((k) => k.toLowerCase() === dayName.toLowerCase());
    if (matchKey) openPreviewSheet(matchKey);
    else if (keys.length > 0) openPreviewSheet(keys[0]);
    else openPreviewSheet();
  };

  const isHomemadeFlow = activeOrder?.serviceType === 'homemade';
  const isCateringFlow = activeOrder?.serviceType === 'catering';
  const isMealBoxFlow =
    activeOrder?.serviceType === 'mealbox' ||
    (!isCateringFlow && !isHomemadeFlow && parsedSelections && !Array.isArray(parsedSelections));

  const customerPhone =
    activeOrder?.userPhone ||
    activeOrder?.phone ||
    activeOrder?.customerPhone ||
    activeOrder?.orderDetails?.contactPhone ||
    activeOrder?.userId?.phone ||
    '';

  const customerAlternatePhone =
    activeOrder?.alternatePhone ||
    activeOrder?.orderDetails?.alternatePhone ||
    activeOrder?.altPhone ||
    '';

  const chefPhone =
    activeOrder?.chefPhone ||
    activeOrder?.restaurantPhone ||
    activeOrder?.chefContactPhone ||
    activeOrder?.orderDetails?.chefPhone ||
    activeOrder?.chef?.phone ||
    activeOrder?.chef?.userPhone ||
    activeOrder?.chefDetails?.phone ||
    '';

  const chefAlternatePhone =
    activeOrder?.chefAlternatePhone ||
    activeOrder?.restaurantAlternatePhone ||
    activeOrder?.orderDetails?.chefAlternatePhone ||
    activeOrder?.chef?.alternatePhone ||
    activeOrder?.chefDetails?.alternatePhone ||
    '';

  const customerAddress =
    activeOrder?.deliveryAddress ||
    activeOrder?.addressDetails ||
    'Address not provided';

  const customerCity = customerAddress
    ? customerAddress.split(',').slice(-2).join(', ').trim()
    : 'Hyderabad, Telangana';

  const addonTotalCalculated = parsedAddons.reduce(
    (acc: number, cur: any) => acc + Number(cur.price || 0) * Number(cur.count || 1),
    0
  );

  const totalAmountNum = Number(activeOrder?.totalAmount || 0);
  const subtotalNum = Number(activeOrder?.subtotal || totalAmountNum);
  const deliveryPriceNum = Number(activeOrder?.deliveryPrice || 0);
  const discountNum = Number(activeOrder?.discount || 0);
  const pricePerPlateNum = Number(activeOrder?.pricePerPlate || 0);
  const guestsCount = Number(activeOrder?.guests || 0);
  const couponAppliedCode = activeOrder?.appliedCoupon || '';
  const paymentMethodType = activeOrder?.paymentMethod || 'cod';
  const isPaymentCod = String(paymentMethodType).toLowerCase() === 'cod';

  const currentStatus = activeOrder?.orderStatus || 'Placed';
  const isCurrentOrderAccepted =
    currentStatus.toLowerCase() !== 'placed' && currentStatus.toLowerCase() !== 'cancelled';
  const isCurrentOrderDelivered = currentStatus.toLowerCase() === 'delivered';

  const isCashCollected =
    (activeOrder?.paymentStatus || '').toLowerCase() === 'collected' ||
    (activeOrder?.paymentStatus || '').toLowerCase() === 'paid' ||
    currentStatus.toLowerCase().includes('cash collected') ||
    currentStatus.toLowerCase().includes('amount collected');

  const allMealboxSchedules: Array<{
    date: string;
    status: string;
    timeSlot: string;
    address: string;
    isPaused: boolean;
    latitude?: number;
    longitude?: number;
  }> = useMemo(() => {
    if (!isMealBoxFlow || !activeOrder) return [];

    const explicitSchedules = Array.isArray(activeOrder.deliverySchedules) ? activeOrder.deliverySchedules : [];
    const upcomingList = Array.isArray(activeOrder.upcomingDeliveries) ? activeOrder.upcomingDeliveries : [];
    const pausedList = Array.isArray(activeOrder.pausedDates) ? activeOrder.pausedDates : [];

    const dateKeys = Array.from(new Set([
      ...explicitSchedules.map((s: any) => s.date),
      ...upcomingList,
    ])).filter(Boolean);

    return dateKeys.map((dateStr) => {
      const match = explicitSchedules.find((s: any) => s.date === dateStr);
      const isPaused = pausedList.includes(dateStr) || match?.status === 'Paused';
      const status = isPaused ? 'Paused' : (match?.status || 'Scheduled');
      const timeSlot = match?.timeSlot || activeOrder.deliveryTimeSlot || '7:00 PM - 9:00 PM';
      const address = match?.address || activeOrder.addressDetails || activeOrder.deliveryAddress || customerAddress;

      // ✅ Prefer per-schedule coords, fall back to order-level coords.
      const sLat = match?.latitude ?? activeOrder?.latitude;
      const sLng = match?.longitude ?? activeOrder?.longitude;

      return {
        date: dateStr,
        status,
        timeSlot,
        address,
        isPaused,
        latitude: sLat !== undefined && sLat !== null ? Number(sLat) : undefined,
        longitude: sLng !== undefined && sLng !== null ? Number(sLng) : undefined,
      };
    });
  }, [isMealBoxFlow, activeOrder, customerAddress]);

  const deliveredScheduleInfo = useMemo(() => {
    if (!isMealBoxFlow) return null;
    return allMealboxSchedules.find((s) => s.status.toLowerCase() === 'delivered') || null;
  }, [isMealBoxFlow, allMealboxSchedules]);

  const isWidgetDelivered = isCurrentOrderDelivered || (isMealBoxFlow && !!deliveredScheduleInfo);
  const widgetDeliveredDate = isMealBoxFlow && deliveredScheduleInfo ? deliveredScheduleInfo.date : '';

  const stepperActiveIndex = useMemo(() => {
    const s = currentStatus.toLowerCase();
    const p = (activeOrder?.paymentStatus || '').toLowerCase();
    if (p === 'collected' || p === 'paid' || s.includes('amount collected')) return 4;
    if (s === 'delivered' || s === 'completed') return 4;
    if (s.includes('out') || s.includes('delivery')) return 3;
    if (s.includes('pack') || s.includes('prepared & packing') || s.includes('prepared and packing')) return 2;
    if (s.includes('prep') || s.includes('preparing')) return 1;
    return 0;
  }, [currentStatus, activeOrder?.paymentStatus]);

  const defaultDishImage =
    parsedItems[0]?.image ||
    activeOrder?.menuImage ||
    activeOrder?.restaurantImage ||
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80';

  // ✅ QuickBites detection — robust: true if either the flag is set OR
  //    the order carries a persisted estimatedDeliveryAt timestamp.
  //    Only applies to homemade orders.
  const isQuickBitesFlow = useMemo(() => {
    if (!activeOrder) return false;
    if (!isHomemadeFlow) return false;
    const flagSet =
      activeOrder?.isQuickBites === true ||
      String(activeOrder?.isQuickBites).toLowerCase() === 'true';
    const hasEstimated = !!activeOrder?.estimatedDeliveryAt;
    return flagSet || hasEstimated;
  }, [activeOrder, isHomemadeFlow]);

  // ✅ QuickBites window in minutes — defaults to 75
  const quickBitesWindowMinutes = useMemo(() => {
    const w = Number(activeOrder?.deliveryWindowMinutes);
    return Number.isFinite(w) && w > 0 ? w : 75;
  }, [activeOrder?.deliveryWindowMinutes]);

  // ✅ Compute dynamic QuickBites date/time from MongoDB's `estimatedDeliveryAt`
  //    For QuickBites the delivery date is ALWAYS "Today" (same-day).
  const quickBitesDateTime = useMemo(() => {
    if (!isQuickBitesFlow || !activeOrder?.estimatedDeliveryAt) return null;
    const d = new Date(activeOrder.estimatedDeliveryAt);
    if (isNaN(d.getTime())) return null;

    const now = new Date();
    const dayNum = d.getDate();
    const monthShort = d.toLocaleDateString('en-US', { month: 'short' });

    // ✅ QuickBites: force same-day "Today" label
    const displayDate = `Today, ${dayNum} ${monthShort}`;
    const timerDate = `Today, ${dayNum} ${monthShort}`;

    const timeStr = d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Remaining minutes until estimated delivery
    const diffMs = d.getTime() - now.getTime();
    const remainingMin = Math.max(0, Math.round(diffMs / (60 * 1000)));

    return { displayDate, timerDate, timeStr, remainingMin };
  }, [isQuickBitesFlow, activeOrder?.estimatedDeliveryAt]);

  // ✅ HOMEMADE ONLY: resolve delivery date & slot from the persisted order document.
  //    • For QuickBites: computed live from `estimatedDeliveryAt` (same day).
  //    • For non-QuickBites: prefers the new top-level `deliverySlot` field,
  //      falls back to legacy `deliveryTimeSlot`.
  const homemadeDeliveryDateResolved = useMemo(() => {
    if (!isHomemadeFlow) return '';
    if (isQuickBitesFlow && quickBitesDateTime) {
      return quickBitesDateTime.timerDate;
    }
    return String(activeOrder?.deliveryDate || '').trim();
  }, [
    activeOrder?.deliveryDate,
    isHomemadeFlow,
    isQuickBitesFlow,
    quickBitesDateTime,
  ]);

  const homemadeDeliverySlotResolved = useMemo(() => {
    if (!isHomemadeFlow) return '';
    if (isQuickBitesFlow && quickBitesDateTime) {
      return `By ${quickBitesDateTime.timeStr}`;
    }
    return String(
      activeOrder?.deliverySlot ||
      activeOrder?.deliveryTimeSlot ||
      ''
    ).trim();
  }, [
    activeOrder?.deliverySlot,
    activeOrder?.deliveryTimeSlot,
    isHomemadeFlow,
    isQuickBitesFlow,
    quickBitesDateTime,
  ]);

  // ✅ Human-friendly display date specifically for headers/cards.
  //    For QuickBites it is ALWAYS "Today, <day> <month>".
  const homemadeDeliveryDateDisplay = useMemo(() => {
    if (!isHomemadeFlow) return '';
    if (isQuickBitesFlow && quickBitesDateTime) {
      return quickBitesDateTime.displayDate;
    }
    return String(activeOrder?.deliveryDate || '').trim();
  }, [
    activeOrder?.deliveryDate,
    isHomemadeFlow,
    isQuickBitesFlow,
    quickBitesDateTime,
  ]);

  const orderData = {
    orderId: activeOrder?.orderId ? `#${activeOrder.orderId}` : '#KATBOX12345',
    orderTime: activeOrder?.createdAt
      ? `${new Date(activeOrder.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${orderTimeFormatted}`
      : 'Today',
    // ✅ For homemade QuickBites: always "Today, ..." (same-day).
    //    For non-QuickBites homemade: use the persisted value.
    //    For mealbox/catering: keep original behaviour.
    deliveryDate:
      isHomemadeFlow
        ? (homemadeDeliveryDateDisplay || homemadeDeliveryDateResolved || 'Today')
        : (activeOrder?.deliveryDate ||
           activeOrder?.eventDate ||
           'Mon, 17 Jun 2024'),
    deliveryTimeSlot:
      isHomemadeFlow
        ? (homemadeDeliverySlotResolved || '30–45 min')
        : (activeOrder?.deliveryTimeSlot ||
           activeOrder?.eventTime ||
           '7:00 PM - 9:00 PM'),
    customer: {
      name: activeOrder?.userName || 'Customer',
      phone: customerPhone || 'N/A',
      alternatePhone: customerAlternatePhone,
      city: customerCity,
    },
    chef: {
      name: activeOrder?.chefName || activeOrder?.restaurantName || 'Kitchen Partner',
      phone: chefPhone || 'N/A',
      alternatePhone: chefAlternatePhone,
      serviceType: activeOrder?.serviceType || 'mealbox',
    },
    meal: {
      name:
        activeOrder?.menuName ||
        (isHomemadeFlow
          ? parsedItems.map((i: any) => i.name).join(', ') || 'Fresh Homemade Food'
          : 'Classic Lunch'),
      packageSubtitle: isHomemadeFlow
        ? `${parsedItems.length} Dishes • Freshly Cooked`
        : activeOrder?.durationType ||
          (isCateringFlow
            ? `${activeOrder?.guests || 50} Guests (${activeOrder?.occasion || 'Banquet'})`
            : '1 Meal / Day  •  6 Meals / Week'),
      planType: isHomemadeFlow
        ? (isQuickBitesFlow ? '⚡ QuickBites' : 'Homemade Kitchen')
        : isCateringFlow
        ? `${activeOrder?.occasion || 'Catering'} Event`
        : activeOrder?.durationType || 'Meal Plan',
      daysRange: isHomemadeFlow
        ? (isQuickBitesFlow ? 'Same Day Delivery' : 'Today')
        : activeOrder?.deliveryDate || activeOrder?.eventDate || 'Mon to Fri',
      timingDetails: isHomemadeFlow
        ? (isQuickBitesFlow
            ? `Prepared & Delivered within ${quickBitesWindowMinutes} min`
            : 'Fast Prep & Delivery • 30–45 min')
        : activeOrder?.deliveryTimeSlot || activeOrder?.eventTime || 'Lunch Only  •  1 Meal / Day',
      totalAmount: `₹${totalAmountNum}`,
      image: defaultDishImage,
    },
    deliveryAddress: customerAddress,
    status: isCashCollected ? 'Cash Collected' : currentStatus,
  };

  const handleCopyOrderId = () => {
    Alert.alert('Order ID', `Order ID: ${orderData.orderId}`);
  };

  const triggerCall = (phoneStr: string) => {
    const cleanNumber = phoneStr.replace(/[^0-9+]/g, '');
    const url = `tel:${cleanNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Dialer Error', `Cannot dial ${phoneStr} from this device.`);
        }
      })
      .catch((err) => Alert.alert('Error', err.message));
  };

  const triggerSMS = (phoneStr: string) => {
    const cleanNumber = phoneStr.replace(/[^0-9+]/g, '');
    const url = `sms:${cleanNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Message Error', `Cannot message ${phoneStr} from this device.`);
        }
      })
      .catch((err) => Alert.alert('Error', err.message));
  };

  const handleCallCustomer = () => {
    const primary = customerPhone || orderData.customer.phone;
    const alt = customerAlternatePhone;

    if (!primary && !alt) {
      Alert.alert('No Phone', 'Customer phone number is not available for this order.');
      return;
    }

    if (primary && alt) {
      Alert.alert('Call Customer', 'Choose phone number to dial:', [
        { text: `Primary: ${primary}`, onPress: () => triggerCall(primary) },
        { text: `Alternative: ${alt}`, onPress: () => triggerCall(alt) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      triggerCall(primary || alt);
    }
  };

  const handleMessageCustomer = () => {
    const primary = customerPhone || orderData.customer.phone;
    const alt = customerAlternatePhone;

    if (!primary && !alt) {
      Alert.alert('No Phone', 'Customer phone number is not available.');
      return;
    }

    if (primary && alt) {
      Alert.alert('Message Customer', 'Choose recipient number:', [
        { text: `Primary: ${primary}`, onPress: () => triggerSMS(primary) },
        { text: `Alternative: ${alt}`, onPress: () => triggerSMS(alt) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      triggerSMS(primary || alt);
    }
  };

  const handleCallChef = () => {
    const primary = chefPhone || orderData.chef.phone;
    const alt = chefAlternatePhone;

    if (!primary && !alt) {
      Alert.alert('No Phone', 'Chef phone number is not available for this order.');
      return;
    }

    if (primary && alt) {
      Alert.alert('Call Chef', 'Choose phone number to dial:', [
        { text: `Primary: ${primary}`, onPress: () => triggerCall(primary) },
        { text: `Alternative: ${alt}`, onPress: () => triggerCall(alt) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      triggerCall(primary || alt);
    }
  };

  const handleMessageChef = () => {
    const primary = chefPhone || orderData.chef.phone;
    const alt = chefAlternatePhone;

    if (!primary && !alt) {
      Alert.alert('No Phone', 'Chef phone number is not available.');
      return;
    }

    if (primary && alt) {
      Alert.alert('Message Chef', 'Choose recipient number:', [
        { text: `Primary: ${primary}`, onPress: () => triggerSMS(primary) },
        { text: `Alternative: ${alt}`, onPress: () => triggerSMS(alt) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      triggerSMS(primary || alt);
    }
  };

  // ✅ Prefers coordinates for exact pin placement, falls back to address.
  //    Works for every flow — catering, mealbox, quickbite, homemade.
  const handleOpenMap = (
    addressOverride?: string,
    latOverride?: any,
    lngOverride?: any
  ) => {
    const lat =
      latOverride !== undefined && latOverride !== null
        ? Number(latOverride)
        : Number(activeOrder?.latitude);
    const lng =
      lngOverride !== undefined && lngOverride !== null
        ? Number(lngOverride)
        : Number(activeOrder?.longitude);
    const coordsValid =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0);

    const targetAddr = addressOverride || customerAddress;
    const safeAddr =
      targetAddr && targetAddr.trim() !== '' ? targetAddr : 'Delivery Location';
    const label = encodeURIComponent(
      safeAddr.replace(/\n/g, ' ').substring(0, 120)
    );

    let mapUrl = '';
    if (coordsValid) {
      mapUrl =
        Platform.select({
          ios: `maps:0,0?q=${label}@${lat},${lng}`,
          android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
        }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else {
      if (!targetAddr || targetAddr.trim() === '' || targetAddr === 'Address not provided') {
        Alert.alert(
          'No Location',
          'Delivery coordinates are not available for this order.'
        );
        return;
      }
      const query = encodeURIComponent(targetAddr.replace(/\n/g, ' '));
      mapUrl =
        Platform.select({
          ios: `maps:0,0?q=${query}`,
          android: `geo:0,0?q=${query}`,
        }) || `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    const fallbackUrl = coordsValid
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          targetAddr || ''
        )}`;

    Linking.canOpenURL(mapUrl)
      .then((supported) => {
        if (supported) return Linking.openURL(mapUrl);
        return Linking.openURL(fallbackUrl);
      })
      .catch(() => {
        Linking.openURL(fallbackUrl);
      });
  };

  const handleAdminUpdateStatus = async (newStatus: string) => {
    if (!activeOrder) return;
    setShowStatusDropdown(false);

    try {
      setActionLoading(true);
      const res = await api.patch(`/api/orders/${activeOrder.orderId}/status`, { status: newStatus });

      if (res.data && res.data.success) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOrders((prev) =>
          prev.map((o) => (o.orderId === activeOrder.orderId ? { ...o, ...res.data.order } : o))
        );
        Alert.alert('Status Updated', `Order is now marked as: ${newStatus}`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update order status');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── ADMIN VERIFY ADVANCE / PAYMENT RECEIVED ACTION ───
  const handleVerifyAdvancePayment = async () => {
    if (!activeOrder) return;

    try {
      setActionLoading(true);
      const res = await api.patch(`/api/orders/${activeOrder.orderId}/verify-advance`);

      if (res.data && res.data.success) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOrders((prev) =>
          prev.map((o) => (o.orderId === activeOrder.orderId ? { ...o, ...res.data.order } : o))
        );
        Alert.alert('Success', 'Payment received & advance verified successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to verify advance payment.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateIndividualScheduleStatus = async (dateStr: string, newStatus: string) => {
    if (!activeOrder) return;
    setActiveScheduleDropdownDate(null);

    try {
      setActionLoading(true);
      const res = await api.patch(`/api/orders/${activeOrder.orderId}/schedule-status`, {
        dateStr,
        status: newStatus,
      });
      if (res.data && res.data.success) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOrders((prev) =>
          prev.map((o) => (o.orderId === activeOrder.orderId ? { ...o, ...res.data.order } : o))
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update schedule status');
    } finally {
      setActionLoading(false);
    }
  };

  const getGroupedMealBoxItems = (items: any[]) => {
    const map: Record<string, any[]> = { STARTERS: [], MAINS: [], "ADD ON'S": [] };
    if (!Array.isArray(items)) return map;
    items.forEach((item) => {
      const sect = String(item.section || '').toUpperCase();
      if (sect.includes('STARTER')) map['STARTERS'].push(item);
      else if (sect.includes('ADDON') || sect.includes('ADD ON') || item.type === 'addon') map["ADD ON'S"].push(item);
      else map['MAINS'].push(item);
    });
    return map;
  };

  const currentDayItems =
    parsedSelections && previewActiveDay && !Array.isArray(parsedSelections)
      ? parsedSelections[previewActiveDay] || []
      : [];
  const groupedPreviewItems = getGroupedMealBoxItems(currentDayItems);

  const hasAnyItemsToPreview =
    (parsedSelections && Object.keys(parsedSelections).length > 0) ||
    parsedItems.length > 0 ||
    parsedAddons.length > 0;

  const stepperStages = [
    { label: 'Accepted', icon: 'checkmark-outline', type: 'ionicons' },
    { label: 'Prep', icon: 'chef-hat', type: 'material' },
    { label: 'Packing', icon: 'cube-outline', type: 'ionicons' },
    { label: 'Delivery', icon: 'moped', type: 'material' },
    { label: 'Completed', icon: 'sparkles-outline', type: 'ionicons' },
  ];

  const filterTabs: Array<'All' | 'Placed' | 'Accepted' | 'Preparing' | 'Delivered' | 'Cancelled'> = [
    'All', 'Placed', 'Accepted', 'Preparing', 'Delivered', 'Cancelled',
  ];

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ color: '#94A3B8', marginTop: 12, fontWeight: '600', fontSize: 14 }}>
          Loading Platform Orders...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* ─── ADMIN HEADER ─── */}
      <LinearGradient colors={['#0F172A', '#1E293B', '#0F172A']} style={styles.darkHeader}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerBrandCol}>
                <View style={styles.eyebrowRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.headerEyebrow}>ADMIN OVERSIGHT COMMAND</Text>
                </View>
                <Text style={styles.headerTitle}>Platform Orders</Text>
                <Text style={styles.headerSubtitle}>
                  Monitoring <Text style={styles.headerSubtitleBold}>{orders.length}</Text> total system orders in real time
                </Text>
              </View>

              <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.8} onPress={fetchAllOrders}>
                <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
                {orders.length > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{orders.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Filter Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
            >
              {filterTabs.map((tab) => {
                const isActive = statusFilter === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.filterTabPill, isActive && styles.filterTabPillActive]}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setStatusFilter(tab);
                      setSelectedOrderIndex(0);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>{tab}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Order Pill Strip */}
            {filteredOrders.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabStripScroll}
                contentContainerStyle={{ gap: 8 }}
              >
                {filteredOrders.map((o: any, idx: number) => {
                  const isSelected = selectedOrderIndex === idx;
                  const status = (o.orderStatus || 'Placed').toLowerCase();
                  const pStatus = (o.paymentStatus || '').toLowerCase();

                  let pillStyle = styles.orderTabPillPending;
                  let dotStyle = styles.tabIndicatorDotPending;
                  let textStyle = styles.orderTabPillTextPending;

                  const isDelivered =
                    status === 'delivered' ||
                    status === 'completed' ||
                    pStatus === 'collected' ||
                    pStatus === 'paid' ||
                    status.includes('amount collected') ||
                    status.includes('cash collected');

                  if (isDelivered) {
                    pillStyle = styles.orderTabPillDelivered;
                    dotStyle = styles.tabIndicatorDotDelivered;
                    textStyle = styles.orderTabPillTextDelivered;
                  } else if (status === 'cancelled') {
                    pillStyle = styles.orderTabPillCancelled;
                    dotStyle = styles.tabIndicatorDotCancelled;
                    textStyle = styles.orderTabPillTextCancelled;
                  } else if (status !== 'placed') {
                    pillStyle = styles.orderTabPillAccepted;
                    dotStyle = styles.tabIndicatorDotAccepted;
                    textStyle = styles.orderTabPillTextAccepted;
                  }

                  return (
                    <TouchableOpacity
                      key={`tab-${o.orderId || idx}`}
                      activeOpacity={0.85}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setSelectedOrderIndex(idx);
                      }}
                      style={[
                        styles.orderTabPillBase,
                        pillStyle,
                        isSelected && styles.orderTabPillSelectedBorder,
                      ]}
                    >
                      <View style={[styles.tabIndicatorDotBase, dotStyle]} />
                      <Text style={[styles.orderTabPillTextBase, textStyle]}>
                        #{o.orderId?.slice(-6) || 'ORDER'} • ₹{o.totalAmount}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ─── BODY CONTAINER ─── */}
      <View style={styles.bodyCard}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
        >
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={40} color="#2563EB" />
              </View>
              <Text style={styles.emptyTitle}>No Orders Found</Text>
              <Text style={styles.emptySubtitle}>
                No orders match the selected filter. Tap refresh to reload.
              </Text>
            </View>
          ) : (
            <>
              {/* ─── ADVANCE PAYMENT VERIFICATION BANNER ─── */}
              {activeOrder && (
                <View style={styles.card}>
                  <Text style={styles.cardSectionHeading}>Advance Payment Verification</Text>
                  <View style={styles.advancePaymentBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.advanceLabelText}>40% Advance Amount:</Text>
                      <Text style={styles.advanceAmountText}>₹{activeOrder.advancePaidAmount || Math.round(Number(activeOrder.totalAmount || 0) * 0.40)}</Text>
                      {activeOrder.utrNumber ? (
                        <Text style={styles.advanceMetaText}>UTR Ref: {activeOrder.utrNumber}</Text>
                      ) : null}
                      <Text style={[styles.advanceStatusBadge, activeOrder.isAdvanceVerified ? styles.statusVerified : styles.statusPending]}>
                        {activeOrder.isAdvanceVerified ? '✓ Verified & Received' : '⏳ Verification Pending'}
                      </Text>
                    </View>

                    {!activeOrder.isAdvanceVerified && (
                      <TouchableOpacity
                        style={styles.verifyPaymentBtn}
                        activeOpacity={0.85}
                        onPress={handleVerifyAdvancePayment}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.verifyPaymentBtnText}>Payment Received</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* ✅ QUICK BITES SAME-DAY BANNER (only for QuickBites flow) */}
              {isQuickBitesFlow && (
                <View style={styles.quickBitesBannerCard}>
                  <View style={styles.quickBitesBannerIconBox}>
                    <Ionicons name="flash" size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.quickBitesBannerTitle}>⚡ QuickBites Order</Text>
                    <Text style={styles.quickBitesBannerSubtitle}>
                      Same-day delivery • Prepared & Delivered within {quickBitesWindowMinutes} min
                    </Text>
                  </View>
                  {quickBitesDateTime && (
                    <View style={styles.quickBitesRemainingBox}>
                      <Text style={styles.quickBitesRemainingNumber}>
                        {quickBitesDateTime.remainingMin}
                      </Text>
                      <Text style={styles.quickBitesRemainingUnit}>min left</Text>
                    </View>
                  )}
                </View>
              )}

              {/* ─── STEPPER HERO (if accepted) ─── */}
              {isCurrentOrderAccepted && (
                <View style={styles.successHeroCard}>
                  <View style={styles.successOuterGlowCircle}>
                    <View style={styles.successInnerCircle}>
                      <Ionicons name="checkmark-sharp" size={38} color="#FFFFFF" />
                    </View>
                  </View>

                  <Text style={styles.successHeroTitle}>Order In Fulfillment</Text>
                  <Text style={styles.successHeroSubtitle}>
                    Order <Text style={styles.successHeroOrderId}>{orderData.orderId}</Text> is currently under live platform fulfillment.
                  </Text>

                  {/* Admin Status Override Dropdown */}
                  <View style={styles.adminStatusSelectorBox}>
                    <Text style={styles.adminSelectorTitle}>Admin Status Override:</Text>
                    {isCashCollected ? (
                      <View style={styles.cashCollectedLockedCard}>
                        <Ionicons name="lock-closed" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                        <Text style={styles.cashCollectedLockedText}>Payment Settled • Cash Collected</Text>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.adminDropdownButton}
                          activeOpacity={0.85}
                          onPress={() => setShowStatusDropdown(!showStatusDropdown)}
                        >
                          <View style={styles.dropdownStatusIndicatorRow}>
                            <View style={styles.dropdownActiveDot} />
                            <Text style={styles.dropdownCurrentText}>{orderData.status}</Text>
                          </View>
                          <Ionicons
                            name={showStatusDropdown ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color="#2563EB"
                          />
                        </TouchableOpacity>

                        {showStatusDropdown && (
                          <View style={styles.dropdownMenuCard}>
                            {[
                              { label: 'Accepted', value: 'Accepted', icon: 'checkmark-circle-outline' },
                              { label: 'Preparing', value: 'Preparing', icon: 'flame-outline' },
                              { label: 'Prepared & Packing', value: 'Prepared & Packing', icon: 'cube-outline' },
                              { label: 'Out for Delivery', value: 'Out for Delivery', icon: 'bicycle-outline' },
                              { label: 'Delivered', value: 'Delivered', icon: 'checkmark-done-outline' },
                              { label: 'Cash on Delivery Amount Collected', value: 'Cash Collected', icon: 'cash-outline' },
                              { label: 'Cancelled', value: 'Cancelled', icon: 'close-circle-outline' },
                            ].map((item) => (
                              <TouchableOpacity
                                key={item.label}
                                style={[
                                  styles.dropdownMenuItem,
                                  orderData.status === item.value && styles.dropdownMenuItemSelected,
                                ]}
                                activeOpacity={0.8}
                                onPress={() => handleAdminUpdateStatus(item.value)}
                              >
                                <Ionicons
                                  name={item.icon as any}
                                  size={16}
                                  color="#2563EB"
                                  style={{ marginRight: 8 }}
                                />
                                <Text
                                  style={[
                                    styles.dropdownMenuItemText,
                                    orderData.status === item.value && styles.dropdownMenuItemTextSelected,
                                  ]}
                                >
                                  {item.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {/* 5-Stage Horizontal Stepper */}
                  <View style={styles.horizontalStepperContainer}>
                    {stepperStages.map((stage, idx) => {
                      const isPast = stepperActiveIndex > idx;
                      const isCurrent = stepperActiveIndex === idx;
                      const isLast = idx === stepperStages.length - 1;
                      return (
                        <React.Fragment key={`stepper-stage-${idx}`}>
                          <View style={styles.horizStepNode}>
                            <View
                              style={[
                                styles.horizStepCircle,
                                isPast && styles.horizStepCircleDone,
                                isCurrent && styles.horizStepCircleActive,
                                !isPast && !isCurrent && styles.horizStepCircleInactive,
                              ]}
                            >
                              <Ionicons
                                name={stage.icon as any}
                                size={13}
                                color={isPast || isCurrent ? '#FFFFFF' : '#94A3B8'}
                              />
                            </View>
                            <Text
                              style={[
                                styles.horizStepLabel,
                                isPast && styles.horizStepLabelDone,
                                isCurrent && styles.horizStepLabelActive,
                                !isPast && !isCurrent && styles.horizStepLabelInactive,
                              ]}
                              numberOfLines={1}
                            >
                              {stage.label}
                            </Text>
                          </View>
                          {!isLast && (
                            <View
                              style={[
                                styles.horizConnectorBar,
                                stepperActiveIndex > idx ? styles.horizConnectorDone : styles.horizConnectorInactive,
                              ]}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Timer */}
              {isCurrentOrderAccepted && (
                <DeliverySlotCountdownWidget
                  deliveryDate={orderData.deliveryDate}
                  timeSlot={orderData.deliveryTimeSlot}
                  isDelivered={isWidgetDelivered}
                  deliveredDateTitle={widgetDeliveredDate}
                />
              )}

              {/* 1. ORDER IDENTIFIER */}
              <View style={styles.card}>
                <View style={styles.orderIdTopRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.smallSectionLabel}>ADMIN ORDER IDENTIFIER</Text>
                    <View style={styles.orderIdCodeRow}>
                      <Text style={styles.orderIdCodeText}>{orderData.orderId}</Text>
                      <TouchableOpacity onPress={handleCopyOrderId} activeOpacity={0.7} style={styles.copyIconHitbox}>
                        <Feather name="copy" size={14} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusBadgePill,
                      isCurrentOrderAccepted && { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
                      orderData.status === 'Cancelled' && { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' },
                      !isCurrentOrderAccepted && orderData.status !== 'Cancelled' && { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7' },
                    ]}
                  >
                    <Ionicons
                      name={
                        isCurrentOrderAccepted
                          ? 'checkmark-circle'
                          : orderData.status === 'Cancelled'
                          ? 'close-circle'
                          : 'time-outline'
                      }
                      size={12}
                      color={
                        isCurrentOrderAccepted
                          ? '#2563EB'
                          : orderData.status === 'Cancelled'
                          ? '#DC2626'
                          : '#D97706'
                      }
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isCurrentOrderAccepted && { color: '#2563EB' },
                        orderData.status === 'Cancelled' && { color: '#DC2626' },
                        !isCurrentOrderAccepted && orderData.status !== 'Cancelled' && { color: '#D97706' },
                      ]}
                    >
                      {orderData.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.dividerLine} />

                <View style={styles.orderMetaGridRow}>
                  <View style={styles.orderMetaColumn}>
                    <View style={styles.metaLabelRow}>
                      <Feather name="clock" size={12} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.metaLabelText}>PLACED AT</Text>
                    </View>
                    <Text style={styles.metaValueText}>{orderData.orderTime}</Text>
                  </View>

                  <View style={styles.verticalSplitter} />

                  <View style={[styles.orderMetaColumn, { paddingLeft: 12 }]}>
                    <View style={styles.metaLabelRow}>
                      <Ionicons name="restaurant-outline" size={12} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.metaLabelText}>SERVICE TYPE</Text>
                    </View>
                    <Text style={styles.metaValueTextBold}>
                      {String(orderData.chef.serviceType).toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2. CUSTOMER + CHEF PROFILE */}
              <View style={styles.card}>
                <Text style={styles.cardSectionHeading}>Customer & Chef</Text>

                <View style={styles.customerInfoRow}>
                  <View style={styles.customerAvatarIconBox}>
                    <Ionicons name="person" size={24} color="#2563EB" />
                  </View>

                  <View style={styles.customerDetailsCol}>
                    <Text style={styles.customerName}>{orderData.customer.name}</Text>
                    <View style={styles.customerMetaRow}>
                      <Feather name="phone" size={11} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.customerMetaText}>{orderData.customer.phone}</Text>
                    </View>
                    {orderData.customer.alternatePhone ? (
                      <View style={styles.customerMetaRow}>
                        <Feather name="phone-call" size={11} color="#D97706" style={{ marginRight: 4 }} />
                        <Text style={styles.customerMetaAltText}>Alt: {orderData.customer.alternatePhone}</Text>
                      </View>
                    ) : null}
                    <View style={styles.customerMetaRow}>
                      <Ionicons name="location-outline" size={12} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.customerMetaText}>{orderData.customer.city}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.customerActionsRow}>
                  <TouchableOpacity style={styles.actionOutlineBtn} activeOpacity={0.85} onPress={handleCallCustomer}>
                    <Feather name="phone-call" size={13} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={styles.actionOutlineBtnText}>Call Customer</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionOutlineBtn} activeOpacity={0.85} onPress={handleMessageCustomer}>
                    <MaterialCommunityIcons name="message-processing-outline" size={15} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={styles.actionOutlineBtnText}>Message Customer</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dividerLine} />

                <View style={styles.chefRow}>
                  <View style={styles.chefIconBox}>
                    <MaterialCommunityIcons name="chef-hat" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.chefLabel}>ASSIGNED CHEF</Text>
                    <Text style={styles.chefName}>{orderData.chef.name}</Text>
                    <View style={styles.customerMetaRow}>
                      <Feather name="phone" size={11} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.customerMetaText}>{orderData.chef.phone}</Text>
                    </View>
                    {orderData.chef.alternatePhone ? (
                      <View style={styles.customerMetaRow}>
                        <Feather name="phone-call" size={11} color="#D97706" style={{ marginRight: 4 }} />
                        <Text style={styles.customerMetaAltText}>Alt: {orderData.chef.alternatePhone}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.customerActionsRow}>
                  <TouchableOpacity style={styles.actionOutlineBtn} activeOpacity={0.85} onPress={handleCallChef}>
                    <Feather name="phone-call" size={13} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={styles.actionOutlineBtnText}>Call Chef</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionOutlineBtn} activeOpacity={0.85} onPress={handleMessageChef}>
                    <MaterialCommunityIcons name="message-processing-outline" size={15} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={styles.actionOutlineBtnText}>Message Chef</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3. ORDER SUMMARY */}
              <View style={styles.card}>
                <Text style={styles.cardSectionHeading}>Order Summary</Text>

                <View style={styles.mealHeaderRow}>
                  <Image source={{ uri: orderData.meal.image }} style={styles.mealThumbnail} />
                  <View style={styles.mealHeaderDetailsCol}>
                    <View style={styles.mealTitleRow}>
                      <Text style={styles.mealTitleName} numberOfLines={2}>{orderData.meal.name}</Text>
                      <Ionicons name="checkmark-circle" size={15} color="#2563EB" style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={styles.mealPackageSubtitle}>{orderData.meal.packageSubtitle}</Text>
                  </View>
                </View>

                <View style={styles.simplePlanInfoContainer}>
                  <View style={styles.simplePlanTopRow}>
                    <Text style={styles.simplePlanTitleText}>{orderData.meal.planType}</Text>
                    <Text style={styles.simplePlanDaysText}>{orderData.meal.daysRange}</Text>
                  </View>
                  <Text style={styles.simplePlanDetailsText}>{orderData.meal.timingDetails}</Text>
                </View>

                {hasAnyItemsToPreview && (
                  <View style={styles.centeredPreviewContainer}>
                    <TouchableOpacity
                      style={styles.previewMenuCenteredCTA}
                      activeOpacity={0.85}
                      onPress={() => openPreviewSheet()}
                    >
                      <Ionicons name="restaurant-outline" size={14} color="#2563EB" style={{ marginRight: 6 }} />
                      <Text style={styles.previewMenuCenteredCTAText}>
                        {isHomemadeFlow ? 'View Ordered Dishes' : 'Customer Selected Items'}
                      </Text>
                      <Feather name="eye" size={13} color="#2563EB" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.dividerLine} />

                <View style={styles.totalAmountRow}>
                  <View>
                    <Text style={styles.totalAmountLabel}>Total Order Amount</Text>
                    <Text style={styles.taxInclusiveSubtext}>(All inclusive)</Text>
                  </View>
                  <Text style={styles.totalAmountValue}>{orderData.meal.totalAmount}</Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={togglePriceDetails}
                  style={styles.simpleInlineToggleBtn}
                >
                  <Text style={styles.simpleInlineToggleText}>
                    {isPriceExpanded ? 'Hide Details' : 'View Details'}
                  </Text>
                  <Animated.View style={{ transform: [{ rotate: chevronRotation }], marginLeft: 4 }}>
                    <Ionicons name="chevron-down" size={14} color="#2563EB" />
                  </Animated.View>
                </TouchableOpacity>

                {isPriceExpanded && (
                  <View style={styles.priceBreakdownFrame}>
                    {isCateringFlow && pricePerPlateNum > 0 && (
                      <View style={styles.priceDescriptionRow}>
                        <Text style={styles.priceDescriptionLabel}>Price Per Plate</Text>
                        <Text style={styles.priceDescriptionValue}>₹{pricePerPlateNum}</Text>
                      </View>
                    )}
                    {isCateringFlow && guestsCount > 0 && (
                      <View style={styles.priceDescriptionRow}>
                        <Text style={styles.priceDescriptionLabel}>Number of Guests</Text>
                        <Text style={styles.priceDescriptionValue}>× {guestsCount}</Text>
                      </View>
                    )}
                    <View style={styles.priceDescriptionRow}>
                      <Text style={styles.priceDescriptionLabel}>Base Subtotal</Text>
                      <Text style={styles.priceDescriptionValue}>₹{subtotalNum}</Text>
                    </View>
                    {addonTotalCalculated > 0 && (
                      <View style={styles.priceDescriptionRow}>
                        <Text style={styles.priceDescriptionLabel}>Add-ons</Text>
                        <Text style={styles.priceDescriptionValue}>+₹{addonTotalCalculated}</Text>
                      </View>
                    )}
                    <View style={styles.priceDescriptionRow}>
                      <Text style={styles.priceDescriptionLabel}>Delivery & Kitchen</Text>
                      <Text style={[styles.priceDescriptionValue, deliveryPriceNum === 0 && styles.freeTextHighlight]}>
                        {deliveryPriceNum === 0 ? 'FREE' : `+₹${deliveryPriceNum}`}
                      </Text>
                    </View>
                    {discountNum > 0 && (
                      <View style={styles.priceDescriptionRow}>
                        <Text style={styles.priceDescriptionLabel}>
                          Coupon Discount {couponAppliedCode ? `(${couponAppliedCode})` : ''}
                        </Text>
                        <Text style={styles.discountValueText}>-₹{discountNum}</Text>
                      </View>
                    )}
                    <View style={styles.paymentModeStrip}>
                      <Text style={styles.paymentModeLabel}>Payment</Text>
                      <View
                        style={[
                          styles.paymentMethodPill,
                          isPaymentCod && !isCashCollected ? styles.paymentCodPill : styles.paymentOnlinePill,
                        ]}
                      >
                        <Text
                          style={[
                            styles.paymentMethodPillText,
                            isPaymentCod && !isCashCollected ? styles.paymentCodPillText : styles.paymentOnlinePillText,
                          ]}
                        >
                          {isCashCollected
                            ? 'Cash Collected (Paid)'
                            : isPaymentCod
                            ? 'Cash on Delivery (40% Advance)'
                            : 'Online Paid (UPI/Card)'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* ─── MEALBOX SCHEDULES ─── */}
              {isMealBoxFlow && allMealboxSchedules.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.scheduleHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={styles.cardSectionHeading}>Delivery Schedules</Text>
                      <Text style={styles.scheduleHeaderSubtitle}>
                        Live per-date status, address & map for every scheduled delivery.
                      </Text>
                    </View>
                    <View style={styles.mergedCountBadge}>
                      <Text style={styles.mergedCountBadgeText}>{allMealboxSchedules.length} Deliveries</Text>
                    </View>
                  </View>

                  <View style={{ gap: 12, marginTop: 10 }}>
                    {allMealboxSchedules.map((scheduleItem, sIdx) => {
                      const isDropdownOpen = activeScheduleDropdownDate === scheduleItem.date;
                      const isItemDelivered = scheduleItem.status.toLowerCase() === 'delivered';
                      const isItemPaused = scheduleItem.isPaused;

                      return (
                        <View key={`sched-${scheduleItem.date}-${sIdx}`} style={styles.scheduleCardBlock}>
                          <View style={styles.scheduleTopRow}>
                            <View style={styles.scheduleDateBadge}>
                              <Ionicons name="calendar-outline" size={14} color="#2563EB" />
                              <Text style={styles.scheduleDateBadgeText}>{scheduleItem.date}</Text>
                            </View>

                            <View
                              style={[
                                styles.scheduleStatusTag,
                                isItemPaused && styles.tagPaused,
                                isItemDelivered && styles.tagDelivered,
                                scheduleItem.status.toLowerCase().includes('prep') && styles.tagPreparing,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.scheduleStatusTagText,
                                  isItemPaused && styles.tagTextPaused,
                                  isItemDelivered && styles.tagTextDelivered,
                                  scheduleItem.status.toLowerCase().includes('prep') && styles.tagTextPreparing,
                                ]}
                              >
                                {scheduleItem.status}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.scheduleAddressRow}>
                            <Ionicons name="location-sharp" size={14} color="#2563EB" style={{ marginTop: 2 }} />
                            <View style={{ flex: 1, paddingRight: 6 }}>
                              <Text style={styles.scheduleAddressText} numberOfLines={2}>
                                {scheduleItem.address}
                              </Text>
                              {hasValidCoords(scheduleItem.latitude, scheduleItem.longitude) && (
                                <Text style={styles.scheduleCoordText} numberOfLines={1}>
                                  📍 {formatCoordLabel(scheduleItem.latitude, scheduleItem.longitude)}
                                </Text>
                              )}
                            </View>
                            <TouchableOpacity
                              style={styles.scheduleMapBtn}
                              activeOpacity={0.8}
                              onPress={() =>
                                handleOpenMap(
                                  scheduleItem.address,
                                  scheduleItem.latitude,
                                  scheduleItem.longitude
                                )
                              }
                            >
                              <MaterialCommunityIcons
                                name="map-marker-radius"
                                size={13}
                                color="#2563EB"
                                style={{ marginRight: 3 }}
                              />
                              <Text style={styles.scheduleMapBtnText}>
                                {hasValidCoords(scheduleItem.latitude, scheduleItem.longitude)
                                  ? 'Pin'
                                  : 'Map'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.schedulePreviewRow}>
                            <TouchableOpacity
                              style={styles.schedulePreviewBtn}
                              activeOpacity={0.8}
                              onPress={() => openPreviewForSchedule(scheduleItem.date)}
                            >
                              <Ionicons name="restaurant-outline" size={14} color="#2563EB" style={{ marginRight: 6 }} />
                              <Text style={styles.schedulePreviewBtnText}>Menu Preview</Text>
                              <Feather name="eye" size={13} color="#2563EB" style={{ marginLeft: 6 }} />
                            </TouchableOpacity>
                          </View>

                          {!isItemPaused && !isCashCollected && (
                            <View style={{ marginTop: 10 }}>
                              <TouchableOpacity
                                style={styles.individualStatusTrigger}
                                activeOpacity={0.8}
                                onPress={() =>
                                  setActiveScheduleDropdownDate(isDropdownOpen ? null : scheduleItem.date)
                                }
                              >
                                <Text style={styles.individualStatusTriggerLabel}>
                                  Update Status for {scheduleItem.date}:
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={styles.individualStatusTriggerValue}>{scheduleItem.status}</Text>
                                  <Ionicons
                                    name={isDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                    size={14}
                                    color="#2563EB"
                                  />
                                </View>
                              </TouchableOpacity>

                              {isDropdownOpen && (
                                <View style={styles.individualDropdownMenu}>
                                  {['Preparing', 'Prepared & Packing', 'Out for Delivery', 'Delivered'].map((statusOption) => (
                                    <TouchableOpacity
                                      key={statusOption}
                                      style={[
                                        styles.individualDropdownOption,
                                        scheduleItem.status === statusOption && styles.individualDropdownOptionActive,
                                      ]}
                                      onPress={() =>
                                        handleUpdateIndividualScheduleStatus(scheduleItem.date, statusOption)
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.individualDropdownOptionText,
                                          scheduleItem.status === statusOption && styles.individualDropdownOptionTextActive,
                                        ]}
                                      >
                                        {statusOption}
                                      </Text>
                                      {scheduleItem.status === statusOption && (
                                        <Ionicons name="checkmark-circle" size={15} color="#2563EB" />
                                      )}
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* 4. DELIVERY ADDRESS */}
              <View style={styles.card}>
                <View style={styles.addressRow}>
                  <View style={styles.addressLeftCol}>
                    <View style={styles.addressTitleRow}>
                      <Ionicons name="location" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.addressHeaderTitle}>Delivery Address</Text>
                    </View>
                    <Text style={styles.addressBodyText}>{orderData.deliveryAddress}</Text>
                    {hasValidCoords(activeOrder?.latitude, activeOrder?.longitude) && (
                      <Text style={styles.addressCoordText}>
                        📍 {formatCoordLabel(activeOrder?.latitude, activeOrder?.longitude)}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.viewOnMapBtn}
                    activeOpacity={0.8}
                    onPress={() => handleOpenMap()}
                  >
                    <MaterialCommunityIcons
                      name="map-marker-radius"
                      size={14}
                      color="#2563EB"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.viewOnMapBtnText}>
                      {hasValidCoords(activeOrder?.latitude, activeOrder?.longitude)
                        ? 'Pinned'
                        : 'Map'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {!isCurrentOrderAccepted && currentStatus.toLowerCase() === 'placed' && (
                <View style={styles.timerBannerCard}>
                  <View style={styles.timerBannerIcon}>
                    <Feather name="clock" size={16} color="#D97706" />
                  </View>
                  <View style={styles.timerTextContainer}>
                    <Text style={styles.timerMainHeading}>
                      Awaiting chef acceptance from{' '}
                      <Text style={styles.timerHighlightBold}>{orderData.chef.name}</Text>
                    </Text>
                    <Text style={styles.timerSubHeading}>Admin can override status using the dropdown above.</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>

      {/* ─── PREVIEW MODAL ─── */}
      <Modal visible={showPreviewModal} transparent animationType="none" onRequestClose={closePreviewSheet}>
        <BlurView intensity={35} tint="dark" style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePreviewSheet} />

          <Animated.View
            style={[
              styles.previewModalContent,
              { transform: [{ translateY: sheetAnim }], height: '82%' },
            ]}
          >
            <View style={styles.drawerHandle} />
            <TouchableOpacity style={styles.previewCloseBtn} onPress={closePreviewSheet} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.previewHeaderCentered}>
              <Text style={styles.previewTitle}>
                {isHomemadeFlow ? 'Ordered Dishes' : 'Customer Selected Items'}
              </Text>
              <Text style={styles.previewSubtitle}>
                {isHomemadeFlow
                  ? (isQuickBitesFlow
                      ? `⚡ QuickBites • Same-day delivery within ${quickBitesWindowMinutes} min`
                      : 'All items cooked fresh for this order')
                  : isCateringFlow
                  ? 'Confirmed platter dishes & course selections'
                  : 'Customized meal plan details'}
              </Text>
            </View>

            {isMealBoxFlow && parsedSelections && !Array.isArray(parsedSelections) && (
              <View style={styles.pillTabsWrapperBlock}>
                {Object.keys(parsedSelections)
                  .filter((k) => k !== 'pausedDates')
                  .map((dayKey) => {
                    const dayItemsCount = parsedSelections[dayKey]?.length || 0;
                    const isTabPillSelected = previewActiveDay.toLowerCase() === dayKey.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={`admin-tab-pill-${dayKey}`}
                        activeOpacity={0.8}
                        onPress={() => setPreviewActiveDay(dayKey)}
                        style={[
                          styles.tabPillContainerItem,
                          isTabPillSelected ? styles.tabPillContainerItemActive : styles.tabPillContainerItemInactive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabPillTextString,
                            isTabPillSelected ? styles.tabPillTextStringActive : styles.tabPillTextStringInactive,
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

            <ScrollView style={{ width: '100%', marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {isHomemadeFlow ? (
                <View style={styles.previewCategoryCard}>
                  <View style={styles.previewCategoryHeader}>
                    <Text style={styles.previewCategoryTitle}>Ordered Homemade Items ({parsedItems.length})</Text>
                  </View>
                  {parsedItems.length > 0 ? (
                    parsedItems.map((dishItem: any, idx: number) => (
                      <View key={`admin-preview-home-${idx}`} style={styles.previewItemCard}>
                        <Image
                          source={{
                            uri:
                              dishItem.image ||
                              'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100',
                          }}
                          style={styles.previewItemImage}
                        />
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.previewItemName}>{dishItem.name}</Text>
                          <Text style={{ fontSize: 11.5, color: '#5B756C', marginTop: 2, fontWeight: '600' }}>
                            {dishItem.selectedQtyConfig || 'Standard Serving'} • Qty: {dishItem.quantity || 1}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 14.5, fontWeight: '900', color: '#2563EB', marginLeft: 8 }}>
                          ₹{(Number(dishItem.price) || 0) * (Number(dishItem.quantity) || 1)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyItemsText}>No items found for this order.</Text>
                  )}
                </View>
              ) : isCateringFlow ? (
                <>
                  {Array.isArray(parsedSelections) &&
                    parsedSelections.map((cat: any, index: number) => {
                      const allSelected = [...(cat.selected || []), ...(cat.extraSelected || [])];
                      if (!allSelected.length) return null;
                      return (
                        <View key={`admin-prev-cat-${index}`} style={styles.previewCategoryCard}>
                          <View style={styles.previewCategoryHeader}>
                            <Text style={styles.previewCategoryTitle}>{cat.category}</Text>
                          </View>
                          {allSelected.map((item: any, i: number) => {
                            const isExtra = cat.max ? i >= cat.max : false;
                            return (
                              <View key={`admin-prev-cat-item-${i}`} style={styles.previewItemCard}>
                                <Image
                                  source={{
                                    uri:
                                      item.imageUrl ||
                                      item.image ||
                                      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100',
                                  }}
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
                                  color={isExtra ? '#F59E0B' : '#2563EB'}
                                  style={{ marginLeft: 'auto' }}
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
                        <Text style={styles.previewCategoryTitle}>Event Add-ons</Text>
                      </View>
                      {parsedAddons.map((addon: any, idx: number) => (
                        <View key={`admin-prev-addon-${idx}`} style={styles.previewItemCard}>
                          <Image
                            source={{
                              uri:
                                addon.imageUrl ||
                                addon.image ||
                                'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100',
                            }}
                            style={styles.previewItemImage}
                          />
                          <Text style={styles.previewItemName}>
                            {addon.name} × {addon.count}
                          </Text>
                          <View style={styles.extraTag}>
                            <Text style={styles.extraTagText}>+₹{addon.price * addon.count}</Text>
                          </View>
                          <Ionicons name="checkmark-circle" size={18} color="#2563EB" style={{ marginLeft: 'auto' }} />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : isMealBoxFlow && parsedSelections && !Array.isArray(parsedSelections) ? (
                <View style={styles.premiumMealBoxContentCardFrame}>
                  <View style={styles.subCardHeaderStripLabel}>
                    <Text style={styles.subCardHeaderStripLabelText}>
                      {previewActiveDay} MENU SELECTION
                    </Text>
                  </View>

                  {currentDayItems.length === 0 ? (
                    <Text style={styles.emptyItemsText}>No items configured for this weekday.</Text>
                  ) : (
                    Object.entries(groupedPreviewItems).map(([sectionTitle, dishesGroupArray]) => {
                      if (!dishesGroupArray || dishesGroupArray.length === 0) return null;
                      return (
                        <View key={`admin-prev-sec-${sectionTitle}`} style={{ marginTop: 12 }}>
                          <View style={styles.sectionHeaderLabelContainerTag}>
                            <Text style={styles.sectionHeaderLabelContainerTagText}>{sectionTitle}</Text>
                          </View>
                          {dishesGroupArray.map((dishItem: any, idx: number) => {
                            const isExtraItemAddon = sectionTitle === "ADD ON'S" || dishItem.type === 'addon';
                            return (
                              <View key={`admin-dish-item-${idx}`} style={styles.previewSelectionRowItemBlock}>
                                <Image
                                  source={
                                    dishItem.image
                                      ? { uri: dishItem.image }
                                      : { uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100' }
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
                                      : 'Included'}
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
                  <View key={`admin-prev-item-${idx}`} style={styles.previewSelectionRowItemBlock}>
                    <Image
                      source={
                        item.image
                          ? { uri: item.image }
                          : { uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100' }
                      }
                      style={styles.modalCircularFoodThumbGraphic}
                    />
                    <View style={{ flex: 1, paddingLeft: 12 }}>
                      <Text style={styles.modalItemNameTextString}>{item.name}</Text>
                    </View>
                    <View style={styles.includedBadgePillBoxStandard}>
                      <Text style={styles.includedBadgePillBoxTextStandard}>Qty: {item.quantity || 1}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalAbsoluteFooterCTAWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={closePreviewSheet}
                style={styles.modalAbsoluteFooterCTAButtonSolid}
              >
                <Text style={styles.modalAbsoluteFooterCTAButtonSolidText}>Close Summary</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </Modal>
    </View>
  );
}

/* ─── ADMIN BLUE THEME STYLES ─── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  darkHeader: { paddingBottom: 16 },
  headerInner: { paddingHorizontal: 18, paddingTop: 6 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerBrandCol: { flex: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3B82F6', marginRight: 6 },
  headerEyebrow: { fontSize: 9.5, fontWeight: '800', color: '#93C5FD', letterSpacing: 1.2 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '500' },
  headerSubtitleBold: { color: '#60A5FA', fontWeight: '800' },
  headerIconButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', position: 'relative',
  },
  notificationBadge: {
    position: 'absolute', top: 3, right: 3,
    backgroundColor: '#2563EB', minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#0F172A', paddingHorizontal: 2,
  },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '900' },

  filterTabPill: { paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  filterTabPillActive: { backgroundColor: '#2563EB' },
  filterTabText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  filterTabTextActive: { color: '#FFFFFF', fontWeight: '800' },

  tabStripScroll: { marginTop: 12 },
  orderTabPillBase: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  orderTabPillSelectedBorder: { borderWidth: 1.5, borderColor: '#FFFFFF' },
  orderTabPillPending: { backgroundColor: 'rgba(239, 68, 68, 0.22)', borderColor: '#DC2626' },
  tabIndicatorDotPending: { backgroundColor: '#EF4444' },
  orderTabPillTextPending: { color: '#F87171' },
  orderTabPillAccepted: { backgroundColor: 'rgba(234, 179, 8, 0.22)', borderColor: '#EAB308' },
  tabIndicatorDotAccepted: { backgroundColor: '#EAB308' },
  orderTabPillTextAccepted: { color: '#FDE047' },
  orderTabPillDelivered: { backgroundColor: 'rgba(37, 99, 235, 0.24)', borderColor: '#2563EB' },
  tabIndicatorDotDelivered: { backgroundColor: '#60A5FA' },
  orderTabPillTextDelivered: { color: '#93C5FD' },
  orderTabPillCancelled: { backgroundColor: 'rgba(100, 116, 139, 0.2)', borderColor: '#64748B' },
  tabIndicatorDotCancelled: { backgroundColor: '#94A3B8' },
  orderTabPillTextCancelled: { color: '#94A3B8' },
  tabIndicatorDotBase: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  orderTabPillTextBase: { fontSize: 12, fontWeight: '700' },

  bodyCard: { flex: 1, backgroundColor: '#F8FAFC', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 90, paddingHorizontal: 20 },
  emptyIconCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', fontWeight: '500' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
    position: 'relative', overflow: 'hidden',
  },

  advancePaymentBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E2E8F0'
  },
  advanceLabelText: { fontSize: 11.5, fontWeight: '600', color: '#64748B' },
  advanceAmountText: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginVertical: 2 },
  advanceMetaText: { fontSize: 11, color: '#334155', fontWeight: '600', marginBottom: 4 },
  advanceStatusBadge: { fontSize: 10.5, fontWeight: '800', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  statusPending: { backgroundColor: '#FEF3C7', color: '#B45309' },
  statusVerified: { backgroundColor: '#DCFCE7', color: '#166534' },
  verifyPaymentBtn: { backgroundColor: '#166534', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  verifyPaymentBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },

  // ✅ NEW: QuickBites banner styles (admin blue theme)
  quickBitesBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  quickBitesBannerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  quickBitesBannerTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: -0.2,
  },
  quickBitesBannerSubtitle: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 15,
  },
  quickBitesRemainingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    minWidth: 58,
  },
  quickBitesRemainingNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: -0.3,
  },
  quickBitesRemainingUnit: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },

  successHeroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  successOuterGlowCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  successInnerCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  successHeroTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
  successHeroSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19, paddingHorizontal: 10, fontWeight: '500' },
  successHeroOrderId: { color: '#2563EB', fontWeight: '800' },

  adminStatusSelectorBox: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  adminSelectorTitle: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  cashCollectedLockedCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#2563EB', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  cashCollectedLockedText: { fontSize: 13.5, fontWeight: '800', color: '#2563EB' },
  adminDropdownButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#2563EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownStatusIndicatorRow: { flexDirection: 'row', alignItems: 'center' },
  dropdownActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', marginRight: 8 },
  dropdownCurrentText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  dropdownMenuCard: { backgroundColor: '#FFFFFF', borderRadius: 14, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  dropdownMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dropdownMenuItemSelected: { backgroundColor: '#EFF6FF' },
  dropdownMenuItemText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  dropdownMenuItemTextSelected: { color: '#2563EB', fontWeight: '800' },

  horizontalStepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 18, paddingHorizontal: 4 },
  horizStepNode: { alignItems: 'center', justifyContent: 'center', width: 52 },
  horizStepCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  horizStepCircleDone: { backgroundColor: '#2563EB' },
  horizStepCircleActive: { backgroundColor: '#2563EB', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 5, elevation: 4 },
  horizStepCircleInactive: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  horizConnectorBar: { flex: 1, height: 2.5, marginBottom: 14, marginHorizontal: -2, borderRadius: 2, zIndex: 1 },
  horizConnectorDone: { backgroundColor: '#2563EB' },
  horizConnectorInactive: { backgroundColor: '#E2E8F0' },
  horizStepLabel: { fontSize: 9.5, marginTop: 4, textAlign: 'center' },
  horizStepLabelDone: { color: '#2563EB', fontWeight: '700' },
  horizStepLabelActive: { color: '#0F172A', fontWeight: '900' },
  horizStepLabelInactive: { color: '#94A3B8', fontWeight: '500' },

  timerCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  timerIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  timerSuccessCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  timerTitle: { fontSize: 13.5, fontWeight: '800', color: '#0F172A' },
  timerSubtitle: { fontSize: 11.5, color: '#64748B', fontWeight: '500', marginTop: 1 },
  timerDisplayBox: { alignItems: 'flex-end', backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  timerDigits: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.4 },
  timerUnit: { fontSize: 8.5, fontWeight: '700', color: '#DBEAFE', textTransform: 'uppercase', marginTop: 1 },
  extendedBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 },
  extendedBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#B45309' },
  successBadgePill: { backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  successBadgePillText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },

  orderIdTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallSectionLabel: { fontSize: 9.5, color: '#64748B', fontWeight: '800', letterSpacing: 0.6 },
  orderIdCodeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  orderIdCodeText: { fontSize: 17, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 },
  copyIconHitbox: { marginLeft: 8, padding: 4 },
  statusBadgePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  dividerLine: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14 },
  orderMetaGridRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderMetaColumn: { flex: 1 },
  verticalSplitter: { width: 1, height: 40, backgroundColor: '#E2E8F0' },
  metaLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  metaLabelText: { fontSize: 9.5, color: '#64748B', fontWeight: '800', letterSpacing: 0.4 },
  metaValueText: { fontSize: 12.5, color: '#0F172A', fontWeight: '700' },
  metaValueTextBold: { fontSize: 12.5, color: '#0F172A', fontWeight: '800' },

  cardSectionHeading: { fontSize: 15.5, fontWeight: '800', color: '#0F172A', marginBottom: 12, letterSpacing: -0.2 },

  customerInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customerAvatarIconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  customerDetailsCol: { flex: 1 },
  customerName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  customerMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  customerMetaText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  customerMetaAltText: { fontSize: 12, color: '#B45309', fontWeight: '700' },

  chefRow: { flexDirection: 'row', alignItems: 'center' },
  chefIconBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  chefLabel: { fontSize: 9.5, color: '#64748B', fontWeight: '800', letterSpacing: 0.4 },
  chefName: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 2 },

  customerActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10 },
  actionOutlineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 14, paddingVertical: 10, backgroundColor: '#FFFFFF' },
  actionOutlineBtnText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },

  mealHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mealThumbnail: { width: 52, height: 52, borderRadius: 14, marginRight: 12, backgroundColor: '#F1F5F9' },
  mealHeaderDetailsCol: { flex: 1 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'center' },
  mealTitleName: { fontSize: 15.5, fontWeight: '800', color: '#0F172A', lineHeight: 20, flexShrink: 1 },
  mealPackageSubtitle: { fontSize: 11.5, color: '#64748B', fontWeight: '600', marginTop: 2, lineHeight: 16 },

  simplePlanInfoContainer: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginBottom: 10 },
  simplePlanTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simplePlanTitleText: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  simplePlanDaysText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  simplePlanDetailsText: { fontSize: 12, color: '#64748B', fontWeight: '500', marginTop: 2 },

  centeredPreviewContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  previewMenuCenteredCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  previewMenuCenteredCTAText: { fontSize: 12.5, fontWeight: '800', color: '#2563EB' },

  totalAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalAmountLabel: { fontSize: 14.5, fontWeight: '800', color: '#0F172A' },
  taxInclusiveSubtext: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 1 },
  totalAmountValue: { fontSize: 20, fontWeight: '900', color: '#2563EB' },
  simpleInlineToggleBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 6, paddingVertical: 4 },
  simpleInlineToggleText: { fontSize: 12.5, fontWeight: '700', color: '#2563EB' },

  priceBreakdownFrame: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 10 },
  priceDescriptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3.5 },
  priceDescriptionLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  priceDescriptionValue: { fontSize: 12.5, color: '#0F172A', fontWeight: '700' },
  freeTextHighlight: { color: '#2563EB', fontWeight: '800' },
  discountValueText: { fontSize: 12.5, color: '#2563EB', fontWeight: '800' },
  paymentModeStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  paymentModeLabel: { fontSize: 11.5, fontWeight: '600', color: '#334155' },
  paymentMethodPill: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 },
  paymentCodPill: { backgroundColor: '#FEF3C7' },
  paymentOnlinePill: { backgroundColor: '#DBEAFE' },
  paymentMethodPillText: { fontSize: 10.5, fontWeight: '800' },
  paymentCodPillText: { color: '#B45309' },
  paymentOnlinePillText: { color: '#2563EB' },

  scheduleHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginBottom: 4, position: 'relative' },
  scheduleHeaderSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  mergedCountBadge: { position: 'absolute', top: -16, right: -16, backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 5, borderBottomLeftRadius: 14, borderTopRightRadius: 22, borderWidth: 1, borderColor: '#BFDBFE', borderTopWidth: 0, borderRightWidth: 0, zIndex: 10 },
  mergedCountBadgeText: { fontSize: 11, fontWeight: '800', color: '#2563EB', letterSpacing: 0.2 },
  scheduleCardBlock: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  scheduleTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleDateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#DBEAFE', gap: 6 },
  scheduleDateBadgeText: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  scheduleStatusTag: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  scheduleStatusTagText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  tagPaused: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  tagTextPaused: { color: '#B45309' },
  tagDelivered: { backgroundColor: '#DBEAFE', borderColor: '#BFDBFE' },
  tagTextDelivered: { color: '#2563EB' },
  tagPreparing: { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' },
  tagTextPreparing: { color: '#2563EB' },

  scheduleAddressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 2, gap: 5 },
  scheduleAddressText: { flex: 1, fontSize: 12, color: '#475569', fontWeight: '500', lineHeight: 16 },
  // ✅ coordinate label style (blue theme)
  scheduleCoordText: {
    fontSize: 10.5,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.2,
  },
  // ✅ primary-address coordinate label style (blue theme)
  addressCoordText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  scheduleMapBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1' },
  scheduleMapBtnText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
  schedulePreviewRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'flex-start' },
  schedulePreviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14, alignSelf: 'flex-start' },
  schedulePreviewBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  individualStatusTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  individualStatusTriggerLabel: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },
  individualStatusTriggerValue: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  individualDropdownMenu: { backgroundColor: '#FFFFFF', borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  individualDropdownOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  individualDropdownOptionActive: { backgroundColor: '#EFF6FF' },
  individualDropdownOptionText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  individualDropdownOptionTextActive: { color: '#2563EB', fontWeight: '800' },

  addressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addressLeftCol: { flex: 1, marginRight: 10 },
  addressTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  addressHeaderTitle: { fontSize: 12.5, fontWeight: '800', color: '#0F172A' },
  addressBodyText: { fontSize: 12, color: '#475569', lineHeight: 18, fontWeight: '500' },
  viewOnMapBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  viewOnMapBtnText: { color: '#2563EB', fontSize: 11.5, fontWeight: '800' },

  timerBannerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#FEF3C7', marginBottom: 16 },
  timerBannerIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  timerTextContainer: { flex: 1 },
  timerMainHeading: { fontSize: 12.5, color: '#1E293B', fontWeight: '700', lineHeight: 17 },
  timerHighlightBold: { color: '#D97706', fontWeight: '900' },
  timerSubHeading: { fontSize: 11.5, color: '#64748B', marginTop: 2, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  previewModalContent: { width: '100%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 25 },
  drawerHandle: { width: 44, height: 5, backgroundColor: '#CBD5E1', borderRadius: 10, alignSelf: 'center', marginBottom: 16 },
  previewCloseBtn: { position: 'absolute', top: 18, right: 20, backgroundColor: '#0F172A', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  previewHeaderCentered: { alignItems: 'center', justifyContent: 'center', marginBottom: 12, paddingHorizontal: 30 },
  previewTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: -0.4, textAlign: 'center' },
  previewSubtitle: { fontSize: 12.5, color: '#64748B', marginTop: 3, fontWeight: '500', textAlign: 'center', lineHeight: 17 },

  pillTabsWrapperBlock: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F1F5F9', padding: 6, borderRadius: 16, marginBottom: 14, marginTop: 8 },
  tabPillContainerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6 },
  tabPillContainerItemActive: { backgroundColor: '#2563EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabPillContainerItemInactive: { backgroundColor: 'transparent' },
  tabPillTextString: { fontSize: 13, fontWeight: '600' },
  tabPillTextStringActive: { color: '#FFFFFF', fontWeight: '800' },
  tabPillTextStringInactive: { color: '#64748B' },
  tabPillCounterBadgeGlow: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center', justifyContent: 'center' },
  tabPillCounterBadgeGlowActive: { backgroundColor: '#FFFFFF' },
  tabPillCounterBadgeGlowInactive: { backgroundColor: '#E2E8F0' },
  tabPillCounterBadgeText: { fontSize: 10, fontWeight: '800' },
  tabPillCounterBadgeTextActive: { color: '#2563EB' },
  tabPillCounterBadgeTextInactive: { color: '#475569' },

  premiumMealBoxContentCardFrame: { backgroundColor: '#F8FAFC', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 90 },
  subCardHeaderStripLabel: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 10, marginBottom: 8 },
  subCardHeaderStripLabelText: { fontSize: 13.5, fontWeight: '900', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  emptyItemsText: { textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', paddingVertical: 30 },
  sectionHeaderLabelContainerTag: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start', marginTop: 14, marginBottom: 8 },
  sectionHeaderLabelContainerTagText: { fontSize: 11, fontWeight: '900', color: '#D97706', letterSpacing: 0.8 },
  previewSelectionRowItemBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalCircularFoodThumbGraphic: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#F1F5F9' },
  modalItemNameTextString: { fontSize: 14.5, fontWeight: '800', color: '#0F172A', flexShrink: 1 },
  includedBadgePillBox: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  includedBadgePillBoxStandard: { backgroundColor: '#F1F5F9' },
  includedBadgePillBoxExtra: { backgroundColor: '#FFEDD5' },
  includedBadgePillBoxText: { fontSize: 11, fontWeight: '800' },
  includedBadgePillBoxTextStandard: { color: '#334155' },
  includedBadgePillBoxTextExtra: { color: '#C2410C' },

  previewCategoryCard: { backgroundColor: '#F8FAFC', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  previewCategoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  previewCategoryTitle: { fontSize: 15.5, fontWeight: '800', color: '#0F172A' },
  previewItemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  previewItemImage: { width: 44, height: 44, borderRadius: 12, marginRight: 12 },
  previewItemName: { fontSize: 14, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
  extraTag: { backgroundColor: '#FFEDD5', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, marginLeft: 8 },
  extraTagText: { fontSize: 11, fontWeight: '800', color: '#C2410C' },

  modalAbsoluteFooterCTAWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 20, zIndex: 99 },
  modalAbsoluteFooterCTAButtonSolid: { backgroundColor: '#2563EB', paddingVertical: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  modalAbsoluteFooterButtonSolidText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  modalAbsoluteFooterCTAButtonSolidText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});