
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '@/src/lib/api';

type AssistantMessage = {
  id: string;
  text: string;
  sender: 'assistant' | 'user';
};

type AssistantLanguage = 'English' | 'తెలుగు' | 'हिंदी';

type ServiceType = 'catering' | 'mealbox';

type ChefRecord = {
  _id?: string;
  id?: string;
  name?: string;
  chefName?: string;
  userId?: string;
  userName?: string;
  image?: string;
  avatar?: string;
  profileImage?: string;
  coverImage?: string;
  bannerImage?: string;
  rating?: number | string;
  location?: string;
  [key: string]: any;
};

type MenuRecord = {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  planName?: string;
  description?: string;
  price?: number | string;
  planPrice?: number | string;
  pricePerPlate?: number | string;
  heroImageUrl?: string;
  imageUrl?: string;
  image?: string | { uri?: string };
  category?: string;
  mealType?: string;
  serviceType?: string;
  [key: string]: any;
};

type ChefWithMenus = {
  chef: ChefRecord;
  menus: MenuRecord[];
};

const COLORS = {
  background: '#0D1510',
  surface: '#141F17',
  surfaceLight: '#1C2A20',
  primary: '#4ADE80',
  primaryDark: '#166534',
  text: '#F5F7F5',
  muted: '#A2B3A6',
  border: '#2B3B30',
  white: '#FFFFFF',
};

const WELCOME_MESSAGE: Record<AssistantLanguage, string> = {
  English:
    'Hi! Welcome to KatBox Assistant. I can help you explore catering platters by chef name, discover meal boxes, understand KatBox services, and find your orders. What would you like to explore?',
  తెలుగు:
    'హాయ్! KatBox Assistant కు స్వాగతం. చెఫ్ పేరు ఆధారంగా క్యాటరింగ్ ప్లాటర్లు, మీల్ బాక్సులు, KatBox సేవలు మరియు మీ ఆర్డర్ల గురించి తెలుసుకోవడంలో నేను సహాయం చేస్తాను. మీకు ఏమి కావాలి?',
  हिंदी:
    'नमस्ते! KatBox Assistant में आपका स्वागत है। मैं शेफ के नाम से कैटरिंग प्लैटर, मील बॉक्स, KatBox सेवाओं और आपके ऑर्डर खोजने में मदद कर सकता हूँ। आप क्या देखना चाहेंगे?',
};

const QUICK_PROMPTS: Record<AssistantLanguage, string[]> = {
  English: [
    'Explore platters by chef',
    'Recommend a meal box',
    'Help with my orders',
    'Tell me about KatBox',
  ],
  తెలుగు: [
    'చెఫ్ ప్రకారం ప్లాటర్లు',
    'మీల్ బాక్స్ సూచించండి',
    'నా ఆర్డర్లు',
    'KatBox గురించి చెప్పండి',
  ],
  हिंदी: [
    'शेफ के अनुसार प्लैटर',
    'मील बॉक्स सुझाएं',
    'मेरे ऑर्डर',
    'KatBox के बारे में बताएं',
  ],
};


const getRecords = (payload: any, keys: string[] = []): any[] => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.menus)) return payload.data.menus;
  if (Array.isArray(payload?.data?.chefs)) return payload.data.chefs;
  return [];
};

const getChefId = (chef: ChefRecord): string => String(chef._id || chef.id || chef.chefId || '');
const getChefName = (chef: ChefRecord): string => String(chef.name || chef.chefName || chef.businessName || 'KatBox Chef');
const getMenuName = (menu: MenuRecord): string => String(menu.name || menu.title || menu.planName || menu.menuName || 'Food Plan');
const getMenuPrice = (menu: MenuRecord): number | null => {
  const raw = menu.price ?? menu.planPrice ?? menu.pricePerPlate ?? menu.originalBasePrice;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const getImageUri = (value: any): string | null => {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && typeof value.uri === 'string') return value.uri;
  return null;
};
const getMenuImage = (menu: MenuRecord, chef: ChefRecord): string | null =>
  getImageUri(menu.heroImageUrl) || getImageUri(menu.imageUrl) || getImageUri(menu.image) ||
  getImageUri(menu.coverImage) || getImageUri(chef.coverImage) || getImageUri(chef.avatar) ||
  getImageUri(chef.profileImage) || getImageUri(chef.image);

const textForMenu = (menu: MenuRecord): string => {
  const values = [
    menu.category, menu.mealType, menu.serviceType, menu.type,
    menu.selectedCategoryName, menu.planType, menu.menuType,
    menu.name, menu.title, menu.description,
  ];
  return values.filter(Boolean).map((value) => String(value).toLowerCase()).join(' ');
};

const matchesServiceType = (menu: MenuRecord, serviceType: ServiceType): boolean => {
  const text = textForMenu(menu);
  const saysMealBox = /meal\s?box|mealbox|weekly plan|meal plan/.test(text);
  const saysCatering = /catering|platter|event|party/.test(text);
  if (serviceType === 'mealbox' && saysCatering && !saysMealBox) return false;
  if (serviceType === 'catering' && saysMealBox && !saysCatering) return false;
  return true;
};

const menuMealText = (menu: MenuRecord): string => {
  const raw = [menu.category, menu.mealType, menu.meals, menu.mealPreferences, menu.availableMeals, menu.tags]
    .filter(Boolean)
    .map((value) => Array.isArray(value) ? value.join(' ') : String(value))
    .join(' ')
    .toLowerCase();
  return raw;
};

export default function KatBoxAssistant() {
  const [language, setLanguage] =
    useState<AssistantLanguage>('English');

  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      text: WELCOME_MESSAGE.English,
      sender: 'assistant',
    },
  ]);

  const [isSending, setIsSending] = useState(false);
  const [assistantConnectionStatus, setAssistantConnectionStatus] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [budget, setBudget] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [cateringMeal, setCateringMeal] = useState('Lunch');
  const [mealBoxPreferences, setMealBoxPreferences] = useState<string[]>(['Lunch']);
  const [chefResults, setChefResults] = useState<ChefWithMenus[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Temporary development-only check for the authenticated assistant API.
  // The API interceptor attaches the saved JWT automatically; never log the token.
  const testAssistantConnection = async () => {
    setAssistantConnectionStatus('Testing assistant connection...');

    try {
      const response = await api.get('/api/assistant/conversation');
      console.log('✅ Assistant API status:', response.status);
      console.log('✅ Assistant conversation:', response.data);
      setAssistantConnectionStatus(
        `Connected successfully (HTTP ${response.status}). Check Metro logs for the response.`,
      );
    } catch (error: any) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.message || error?.message || 'Unknown error';
      console.log('❌ Assistant API status:', status ?? 'No HTTP response');
      console.log('❌ Assistant API error:', message);
      setAssistantConnectionStatus(
        `Connection failed${status ? ` (HTTP ${status})` : ''}: ${message}`,
      );
    }
  };

  const handleLanguageChange = (
    selectedLanguage: AssistantLanguage,
  ) => {
    setLanguage(selectedLanguage);

    setMessages((currentMessages) => {
      const withoutWelcome = currentMessages.filter(
        (message) => message.id !== 'welcome',
      );

      return [
        {
          id: 'welcome',
          text: WELCOME_MESSAGE[selectedLanguage],
          sender: 'assistant',
        },
        ...withoutWelcome,
      ];
    });
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleServiceSelect = (selectedService: ServiceType) => {
    setServiceType(selectedService);
    setChefResults([]);
    setHasSearched(false);
    setSearchError('');
  };

  const toggleMealBoxPreference = (preference: string) => {
    setMealBoxPreferences((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
  };

  const handleFindPlans = async () => {
    if (!serviceType) {
      setSearchError('Please select Catering or Meal Boxes first.');
      return;
    }

    const budgetValue = Number(budget.trim());
    if (!budget.trim() || !Number.isFinite(budgetValue) || budgetValue <= 0) {
      setSearchError('Please enter a valid budget in rupees.');
      return;
    }

    if (serviceType === 'catering') {
      const guestsValue = Number(guestCount.trim());
      if (!guestCount.trim() || !Number.isFinite(guestsValue) || guestsValue < 1) {
        setSearchError('Please enter the number of guests.');
        return;
      }
    } else if (mealBoxPreferences.length === 0) {
      setSearchError('Please select at least one meal preference.');
      return;
    }

    setIsLoadingResults(true);
    setHasSearched(true);
    setSearchError('');

    try {
      const chefsResponse = await api.get('/api/chefs');
      const chefs = getRecords(chefsResponse?.data, ['chefs']);

      const chefRows = await Promise.all(
        chefs.map(async (chef: ChefRecord) => {
          const chefId = getChefId(chef);
          if (!chefId) return { chef, menus: [] as MenuRecord[] };

          try {
            const menusResponse = await api.get(`/api/chef-categories/menu/chef/${encodeURIComponent(chefId)}`);
            const menus = getRecords(menusResponse?.data, ['menus', 'chefMenus', 'categories']);
            return { chef, menus };
          } catch (error) {
            console.warn('KatBox Assistant: failed to load menus for chef', chefId, error);
            return { chef, menus: [] as MenuRecord[] };
          }
        }),
      );

      const requestedGuests = Number(guestCount);
      const requestedMeals = serviceType === 'catering' ? [cateringMeal.toLowerCase()] : mealBoxPreferences.map((item) => item.toLowerCase());
      const matchedRows = chefRows.map(({ chef, menus }) => {
        const matchingMenus = menus.filter((menu) => {
          if (!matchesServiceType(menu, serviceType)) return false;

          const price = getMenuPrice(menu);
          if (price !== null) {
            const priceMode = String(menu.pricingType || menu.priceType || menu.priceUnit || '').toLowerCase();
            const perPlate = menu.pricePerPlate !== undefined || /per.?plate|per.?person|per.?guest/.test(priceMode);
            const estimatedMenuCost = serviceType === 'catering' && perPlate ? price * requestedGuests : price;
            if (estimatedMenuCost > budgetValue) return false;
          }

          if (serviceType === 'catering') {
            const minGuests = Number(menu.minGuests ?? menu.minimumGuests ?? menu.minGuestCount ?? 0);
            const maxGuests = Number(menu.maxGuests ?? menu.maximumGuests ?? menu.maxGuestCount ?? 0);
            if (minGuests > 0 && requestedGuests < minGuests) return false;
            if (maxGuests > 0 && requestedGuests > maxGuests) return false;
            const mealsText = menuMealText(menu);
            if (mealsText && /breakfast|lunch|dinner/.test(mealsText) && !mealsText.includes(cateringMeal.toLowerCase())) return false;
          } else {
            const mealsText = menuMealText(menu);
            if (mealsText && /breakfast|lunch|dinner|snacks/.test(mealsText)) {
              const hasSelectedMeal = requestedMeals.some((meal) => mealsText.includes(meal));
              if (!hasSelectedMeal) return false;
            }
          }
          return true;
        });
        return { chef, menus: matchingMenus };
      }).filter((row) => row.menus.length > 0);

      setChefResults(matchedRows);
      if (matchedRows.length === 0) {
        setSearchError('No plans matched all the selected preferences. Try increasing your budget or changing your meal preferences.');
      }
    } catch (error: any) {
      console.error('KatBox Assistant failed to load chefs and plans:', error);
      setChefResults([]);
      setSearchError(error?.response?.data?.message || 'We could not load chefs right now. Please check your connection and try again.');
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleOpenMenu = (chef: ChefRecord, menu: MenuRecord) => {
    const chefId = getChefId(chef);
    if (!chefId) {
      setSearchError('This chef does not have a valid profile ID, so the plan cannot be opened.');
      return;
    }
    const chefName = getChefName(chef);
    const category = serviceType === 'mealbox' ? 'Meal Box' : 'Catering';
    const menuImage = getMenuImage(menu, chef) || '';
    const normalizedMenu = { ...menu, category: menu.category || category, selectedCategoryName: category };
    const chefObject = {
      ...chef,
      id: chefId,
      chefId,
      name: chefName,
      chefName,
      image: getImageUri(chef.image) || getImageUri(chef.avatar) || getImageUri(chef.coverImage) || menuImage,
      selectedCategoryName: category,
    };

    router.push({
      pathname: '/screens/CateringMenuItemScreen' as any,
      params: {
        id: chefId,
        chefId,
        chefName,
        name: chefName,
        planId: String(menu._id || menu.id || ''),
        planName: getMenuName(menu),
        planPrice: String(getMenuPrice(menu) ?? ''),
        planImage: menuImage,
        category,
        fromCategory: category,
        menu: JSON.stringify(normalizedMenu),
        chef: JSON.stringify(chefObject),
      },
    });
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isSending) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      text: trimmedInput,
      sender: 'user',
    };
    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setInput('');
    setIsSending(true);

    const normalized = trimmedInput.toLowerCase();
    let response = '';
    if (/meal.?box|mealbox|मील बॉक्स|మీల్ బాక్స్/.test(normalized)) {
      setServiceType('mealbox');
      response = 'I have selected Meal Boxes for you. Enter your budget, choose your meal preferences, and tap “Find matching plans”.';
    } else if (/cater|platter|guest|క్యాటరింగ్|ప్లాటర్|कैटरिंग|प्लैटर/.test(normalized)) {
      setServiceType('catering');
      response = 'I have selected Catering for you. Enter your budget, guest count, and preferred meal, then tap “Find matching plans”.';
    } else if (/order|ఆర్డర్|ऑर्डर/.test(normalized)) {
      response = 'To protect your order information, order lookup needs to be connected to your authenticated customer account. That is a separate step; no order details are being guessed here.';
    } else if (/katbox|service|సేవ|सेवा/.test(normalized)) {
      response = 'KatBox connects customers with independent chefs for catering and meal-box plans. Select a service above to explore available plans from your chefs.';
    } else {
      response = 'I can help you find catering platters or meal-box plans. Choose a service above, enter your preferences, and I will show matching plans from KatBox.';
    }
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: `assistant-${Date.now()}`, text: response, sender: 'assistant' },
    ]);
    setIsSending(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.background}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.75}
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color={COLORS.text}
            />
          </TouchableOpacity>

          <View style={styles.headerIcon}>
            <Ionicons
              name="sparkles"
              size={23}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>
              KatBox Assistant
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                Your food discovery companion
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.languageContainer}>
          {(
            ['English', 'తెలుగు', 'हिंदी'] as AssistantLanguage[]
          ).map((item) => {
            const selected = language === item;

            return (
              <TouchableOpacity
                key={item}
                onPress={() => handleLanguageChange(item)}
                style={[
                  styles.languageButton,
                  selected && styles.languageButtonSelected,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.languageText,
                    selected && styles.languageTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {__DEV__ && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={testAssistantConnection}
              activeOpacity={0.8}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: COLORS.surfaceLight,
                borderColor: COLORS.border,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>
                Test Assistant Connection
              </Text>
            </TouchableOpacity>
            {!!assistantConnectionStatus && (
              <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 6 }}>
                {assistantConnectionStatus}
              </Text>
            )}
          </View>
        )}

        <ScrollView
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introCard}>
            <View style={styles.introIcon}>
              <Ionicons
                name="restaurant-outline"
                size={28}
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.introTitle}>
              Good food starts here.
            </Text>

            <Text style={styles.introDescription}>
              Discover the right food for your family, friends,
              celebrations, or everyday meals.
            </Text>

            <View style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.featureText}>
                Catering and chef-wise platters
              </Text>
            </View>

            <View style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons
                  name="fast-food-outline"
                  size={16}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.featureText}>
                Meal boxes and food discovery
              </Text>
            </View>

            <View style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons
                  name="receipt-outline"
                  size={16}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.featureText}>
                Help finding your orders
              </Text>
            </View>
          </View>

          <View style={styles.serviceCard}>
            <Text style={styles.sectionTitle}>What are you looking for?</Text>
            <Text style={styles.sectionDescription}>Choose a service first, then tell us your budget and meal requirements.</Text>
            <View style={styles.serviceOptionsRow}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => handleServiceSelect('catering')}
                style={[styles.serviceOption, serviceType === 'catering' && styles.serviceOptionSelected]}
              >
                <View style={styles.serviceOptionIcon}>
                  <Ionicons name="restaurant-outline" size={24} color={serviceType === 'catering' ? COLORS.primary : COLORS.muted} />
                </View>
                <Text style={[styles.serviceOptionTitle, serviceType === 'catering' && styles.serviceOptionTitleSelected]}>Catering</Text>
                <Text style={styles.serviceOptionDescription}>Events and gatherings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => handleServiceSelect('mealbox')}
                style={[styles.serviceOption, serviceType === 'mealbox' && styles.serviceOptionSelected]}
              >
                <View style={styles.serviceOptionIcon}>
                  <Ionicons name="fast-food-outline" size={24} color={serviceType === 'mealbox' ? COLORS.primary : COLORS.muted} />
                </View>
                <Text style={[styles.serviceOptionTitle, serviceType === 'mealbox' && styles.serviceOptionTitleSelected]}>Meal Boxes</Text>
                <Text style={styles.serviceOptionDescription}>Everyday meal plans</Text>
              </TouchableOpacity>
            </View>

            {serviceType && (
              <View style={styles.preferencesPanel}>
                <Text style={styles.sectionTitle}>{serviceType === 'catering' ? 'Catering preferences' : 'Meal Box preferences'}</Text>
                <Text style={styles.fieldLabel}>Your total budget (₹)</Text>
                <TextInput
                  style={styles.preferenceInput}
                  value={budget}
                  onChangeText={setBudget}
                  placeholder="Enter budget in rupees"
                  placeholderTextColor="#819087"
                  keyboardType="numeric"
                  accessibilityLabel="Budget in rupees"
                />

                {serviceType === 'catering' ? (
                  <>
                    <Text style={styles.fieldLabel}>Number of guests</Text>
                    <TextInput
                      style={styles.preferenceInput}
                      value={guestCount}
                      onChangeText={setGuestCount}
                      placeholder="e.g. 25"
                      placeholderTextColor="#819087"
                      keyboardType="number-pad"
                      accessibilityLabel="Number of guests"
                    />
                    <Text style={styles.fieldLabel}>Preferred meal</Text>
                    <View style={styles.preferenceChipsRow}>
                      {['Breakfast', 'Lunch', 'Dinner'].map((meal) => (
                        <TouchableOpacity key={meal} onPress={() => setCateringMeal(meal)} style={[styles.preferenceChip, cateringMeal === meal && styles.preferenceChipSelected]} activeOpacity={0.8}>
                          <Text style={[styles.preferenceChipText, cateringMeal === meal && styles.preferenceChipTextSelected]}>{meal}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Meal preferences</Text>
                    <Text style={styles.helperText}>Select one or more meals.</Text>
                    <View style={styles.preferenceChipsRow}>
                      {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map((meal) => {
                        const selected = mealBoxPreferences.includes(meal);
                        return (
                          <TouchableOpacity key={meal} onPress={() => toggleMealBoxPreference(meal)} style={[styles.preferenceChip, selected && styles.preferenceChipSelected]} activeOpacity={0.8}>
                            <Text style={[styles.preferenceChipText, selected && styles.preferenceChipTextSelected]}>{meal}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.deliveryInfoRow}>
                      <Ionicons name="bicycle-outline" size={17} color={COLORS.primary} />
                      <Text style={styles.deliveryInfoText}>Distance-based delivery fees use KatBox’s existing per-kilometre pricing and are confirmed in checkout.</Text>
                    </View>
                  </>
                )}

                {!!searchError && <Text style={styles.errorText}>{searchError}</Text>}
                <TouchableOpacity style={[styles.findPlansButton, isLoadingResults && styles.findPlansButtonDisabled]} onPress={handleFindPlans} disabled={isLoadingResults} activeOpacity={0.85}>
                  {isLoadingResults ? <ActivityIndicator size="small" color={COLORS.background} /> : <Ionicons name="search" size={18} color={COLORS.background} />}
                  <Text style={styles.findPlansButtonText}>{isLoadingResults ? 'Finding plans…' : 'Find matching plans'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {hasSearched && (
            <View style={styles.resultsSection}>
              <Text style={styles.sectionTitle}>Matching {serviceType === 'mealbox' ? 'Meal Box plans' : 'Catering platters'}</Text>
              <Text style={styles.sectionDescription}>Plans are grouped beneath each chef. Prices shown are the plan prices returned by KatBox; delivery is calculated separately using the existing checkout pricing.</Text>
              {isLoadingResults ? (
                <View style={styles.loadingResults}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.helperText}>Loading chefs and plans…</Text></View>
              ) : chefResults.length === 0 ? (
                <View style={styles.emptyResultsCard}>
                  <Ionicons name="search-outline" size={24} color={COLORS.muted} />
                  <Text style={styles.emptyResultsText}>No matching plans to display yet. Try changing your budget or preferences.</Text>
                </View>
              ) : chefResults.map(({ chef, menus }) => (
                <View key={getChefId(chef)} style={styles.chefResultCard}>
                  <View style={styles.chefResultHeader}>
                    {getImageUri(chef.avatar) || getImageUri(chef.profileImage) || getImageUri(chef.image) || getImageUri(chef.coverImage) ? (
                      <Image source={{ uri: getImageUri(chef.avatar) || getImageUri(chef.profileImage) || getImageUri(chef.image) || getImageUri(chef.coverImage) || '' }} style={styles.chefAvatar} />
                    ) : (
                      <View style={styles.chefAvatarFallback}><Ionicons name="person" size={20} color={COLORS.primary} /></View>
                    )}
                    <View style={styles.chefResultNameWrap}>
                      <Text style={styles.chefResultName}>{getChefName(chef)}</Text>
                      {!!(chef.location || chef.address) && <Text style={styles.chefResultLocation} numberOfLines={1}>{String(chef.location || chef.address)}</Text>}
                      <Text style={styles.chefResultCount}>{menus.length} {menus.length === 1 ? 'plan' : 'plans'} match your preferences</Text>
                    </View>
                  </View>
                  {menus.map((menu) => {
                    const imageUri = getMenuImage(menu, chef);
                    const price = getMenuPrice(menu);
                    return (
                      <TouchableOpacity key={String(menu._id || menu.id || getMenuName(menu))} style={styles.menuResultRow} activeOpacity={0.82} onPress={() => handleOpenMenu(chef, menu)}>
                        {imageUri ? <Image source={{ uri: imageUri }} style={styles.menuResultImage} /> : <View style={styles.menuResultImageFallback}><Ionicons name="restaurant-outline" size={23} color={COLORS.primary} /></View>}
                        <View style={styles.menuResultInfo}>
                          <Text style={styles.menuResultName} numberOfLines={2}>{getMenuName(menu)}</Text>
                          {!!menu.description && <Text style={styles.menuResultDescription} numberOfLines={2}>{String(menu.description)}</Text>}
                          <Text style={styles.menuResultPrice}>{price === null ? 'Price shown in plan details' : `₹${price.toLocaleString('en-IN')}`}</Text>
                        </View>
                        <View style={styles.menuResultArrow}><Ionicons name="chevron-forward" size={18} color={COLORS.primary} /></View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {messages.map((message) => {
            const isUser = message.sender === 'user';

            return (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  isUser && styles.userMessageRow,
                ]}
              >
                {!isUser && (
                  <View style={styles.messageAvatar}>
                    <Ionicons
                      name="sparkles"
                      size={16}
                      color={COLORS.primary}
                    />
                  </View>
                )}

                <View
                  style={[
                    styles.messageBubble,
                    isUser
                      ? styles.userBubble
                      : styles.assistantBubble,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isUser && styles.userMessageText,
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
              </View>
            );
          })}

          <Text style={styles.suggestionHeading}>
            TRY ASKING
          </Text>

          <View style={styles.quickPromptsContainer}>
            {QUICK_PROMPTS[language].map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={styles.quickPrompt}
                onPress={() => handleQuickPrompt(prompt)}
                activeOpacity={0.75}
              >
                <Text style={styles.quickPromptText}>
                  {prompt}
                </Text>
                <Ionicons
                  name="arrow-up"
                  size={15}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.stepNote}>
            Recommendations are loaded from KatBox. Delivery fees are calculated separately using the existing checkout pricing.
          </Text>
        </ScrollView>

        <View style={styles.composerContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask KatBox Assistant..."
              placeholderTextColor="#819087"
              multiline
              maxLength={500}
              returnKeyType="default"
              editable={!isSending}
              accessibilityLabel="Message KatBox Assistant"
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                !input.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!input.trim() || isSending}
              activeOpacity={0.8}
              accessibilityLabel="Send message"
            >
              {isSending ? (
                <ActivityIndicator
                  size="small"
                  color={COLORS.background}
                />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={21}
                  color={COLORS.background}
                />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            KatBox · Made for your food journey
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  keyboardContainer: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  headerIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.1,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginRight: 6,
  },

  statusText: {
    color: COLORS.muted,
    fontSize: 11,
  },

  languageContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  languageButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },

  languageButtonSelected: {
    backgroundColor: '#24432D',
    borderColor: COLORS.primary,
  },

  languageText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },

  languageTextSelected: {
    color: COLORS.primary,
    fontWeight: '800',
  },

  chatScroll: {
    flex: 1,
  },

  chatContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 22,
  },

  introCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 22,
  },

  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  introTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 8,
  },

  introDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 17,
  },

  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 11,
  },

  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  featureText: {
    color: '#D6E2D8',
    fontSize: 12,
    flex: 1,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },

  userMessageRow: {
    justifyContent: 'flex-end',
  },

  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },

  messageBubble: {
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 17,
  },

  assistantBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: 5,
  },

  userBubble: {
    backgroundColor: COLORS.primary,
    borderTopRightRadius: 5,
  },

  messageText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
  },

  userMessageText: {
    color: '#102016',
    fontWeight: '600',
  },

  suggestionHeading: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 12,
  },

  quickPromptsContainer: {
    gap: 9,
  },

  quickPrompt: {
    minHeight: 47,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  quickPromptText: {
    color: '#E0EAE2',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },

  serviceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 22,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  sectionDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  serviceOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  serviceOption: {
    flex: 1,
    minHeight: 125,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  serviceOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#1A3021',
  },
  serviceOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#203A29',
    marginBottom: 9,
  },
  serviceOptionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  serviceOptionTitleSelected: {
    color: COLORS.primary,
  },
  serviceOptionDescription: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
    lineHeight: 15,
  },
  preferencesPanel: {
    marginTop: 17,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  fieldLabel: {
    color: '#D6E2D8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 7,
  },
  preferenceInput: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 13,
    color: COLORS.text,
    fontSize: 13,
  },
  preferenceChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3,
  },
  preferenceChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  preferenceChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#24432D',
  },
  preferenceChipText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  preferenceChipTextSelected: {
    color: COLORS.primary,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  deliveryInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 15,
    padding: 11,
    borderRadius: 12,
    backgroundColor: '#18271D',
  },
  deliveryInfoText: {
    flex: 1,
    color: '#C1D0C5',
    fontSize: 10,
    lineHeight: 15,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 11,
  },
  findPlansButton: {
    minHeight: 47,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  findPlansButtonDisabled: {
    opacity: 0.7,
  },
  findPlansButtonText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
  },
  resultsSection: {
    marginBottom: 22,
  },
  loadingResults: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  emptyResultsCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 9,
  },
  emptyResultsText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  chefResultCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 12,
    marginTop: 12,
  },
  chefResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  chefAvatar: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceLight,
    marginRight: 11,
  },
  chefAvatarFallback: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  chefResultNameWrap: {
    flex: 1,
  },
  chefResultName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
  },
  chefResultLocation: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },
  chefResultCount: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  menuResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  menuResultImage: {
    width: 76,
    height: 76,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceLight,
  },
  menuResultImageFallback: {
    width: 76,
    height: 76,
    borderRadius: 13,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuResultInfo: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  menuResultName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  menuResultDescription: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  menuResultPrice: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },
  menuResultArrow: {
    width: 27,
    height: 27,
    borderRadius: 10,
    backgroundColor: '#203A29',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepNote: {
    color: '#819087',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 18,
    textAlign: 'center',
  },

  composerContainer: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 10,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  inputWrapper: {
    minHeight: 52,
    maxHeight: 120,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#34483A',
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 6,
  },

  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: 100,
  },

  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  sendButtonDisabled: {
    opacity: 0.45,
  },

  footerText: {
    color: '#718076',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 9,
  },
});
