// KatBoxAssistant.tsx
//
// KatBox Assistant — chat-native, hub-aware, multilingual customer assistant.
//
// Visual design now matches the reference mock exactly:
//   • Light theme (not dark)
//   • Centered title header with 3-dot menu
//   • Large chef avatar + welcome heading + subtitle
//   • 4 large action cards (Catering / Meal Boxes / Common Questions / My Orders)
//     each with a colored icon tile on the left
//   • Composer field with a green arrow send button
//   • Language pills (English / తెలుగు / हिंदी) BELOW the composer
//
// All previous functionality remains:
//   • Hub card inside the chat stream
//   • Inline catering form / mealbox form / chef search form
//   • FAQ topic chips + answers
//   • Order history via GET /api/orders/my-orders
//   • Localized responses in English / Telugu / Hindi
//   • Persistence via GET/PUT /api/assistant/conversation + /messages
//   • Byte-for-byte preserved CateringMenuItemScreen navigation payload
//
// What was preserved verbatim from the previous version:
//   • getRecords / getChefId / getChefName / getMenuName / getMenuPrice /
//     getImageUri / getMenuImage / textForMenu / matchesServiceType / menuMealText
//   • Chef + menu backend endpoints
//   • Dev-only connection tester
//   • Welcome message + quick prompts
//   • Language switcher behaviour
//   • CateringMenuItemScreen navigation contract

import React, { useEffect, useRef, useState } from "react";
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
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import api from "@/src/lib/api";
import {
  AssistantLanguage,
  AssistantMessage,
  AssistantMessageKind,
  ChefWithMenus,
  ServiceType,
} from "@/src/lib/assistantTypes";
import {
  FAQ_TOPICS,
  FaqTopicKey,
  getFaqByKey,
  matchFaqTopic,
} from "@/src/lib/assistantFaq";

// ─── Confirmed endpoints & constants ────────────────────────────────────
const ORDERS_ENDPOINT = "/api/orders/my-orders";
const CHEFS_ENDPOINT = "/api/chefs";
const CHEF_MENUS_ENDPOINT = (chefId: string) =>
  `/api/chef-categories/menu/chef/${encodeURIComponent(chefId)}`;

// ─── Colors — matching the reference image ─────────────────────────────
const COLORS = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F5F9",
  primary: "#7C5CFC", // lavender-blue accent used by the mock
  primarySoft: "#EEF2FF",
  success: "#22C55E",
  text: "#0F172A",
  textMuted: "#64748B",
  textFaint: "#94A3B8",
  border: "#E2E8F0",
  danger: "#DC2626",
  // Icon tile palettes for the 4 big action cards
  cateringBg: "#FFF4E6",
  cateringIcon: "#F97316",
  mealBoxBg: "#EAF8EE",
  mealBoxIcon: "#16A34A",
  faqBg: "#EFE8FF",
  faqIcon: "#7C3AED",
  ordersBg: "#E6F0FF",
  ordersIcon: "#2563EB",
  // User bubble
  userBubble: "#E0E7FF",
  userBubbleText: "#1E1B4B",
};

// ─── Localized strings ──────────────────────────────────────────────────
type LanguagePack = {
  headerTitle: string;
  introHeading: string;
  introSubtitle: string;
  actions: {
    catering: { title: string; subtitle: string };
    mealBoxes: { title: string; subtitle: string };
    faq: { title: string; subtitle: string };
    orders: { title: string; subtitle: string };
  };
  composerPlaceholder: string;
  hubIntro: string;
  hubTitle: string;
  hubActions: {
    catering: { label: string; description: string };
    mealbox: { label: string; description: string };
    orders: { label: string; description: string };
    faq: { label: string; description: string };
    chefSearch: { label: string; description: string };
  };
  cateringForm: {
    title: string;
    budgetLabel: string;
    budgetPlaceholder: string;
    guestsLabel: string;
    guestsPlaceholder: string;
    mealLabel: string;
    findPlans: string;
    cancel: string;
    validationBudget: string;
    validationGuests: string;
  };
  mealboxForm: {
    title: string;
    budgetLabel: string;
    budgetPlaceholder: string;
    mealLabel: string;
    findPlans: string;
    cancel: string;
    validationBudget: string;
    validationMeals: string;
  };
  chefSearchForm: {
    title: string;
    chefNameLabel: string;
    chefNamePlaceholder: string;
    findChefs: string;
    cancel: string;
    validationName: string;
  };
  results: {
    headerOne: string;
    headerMany: string;
    empty: string;
    error: string;
    openPlatter: string;
    noPrice: string;
    chefsPlural: string;
    chefsSingular: string;
  };
  orders: {
    header: string;
    empty: string;
    error: string;
    statusLabel: string;
    totalLabel: string;
  };
  faqTopics: {
    title: string;
    subtitle: string;
  };
  fallback: string;
  errors: {
    ordersUnauthenticated: string;
    genericNetwork: string;
  };
};

const EN: LanguagePack = {
  headerTitle: "KatBox Assistant",
  introHeading: "Hi! I'm KatBox Assistant",
  introSubtitle:
    "I can help you with catering platters, meal-box plans, common questions, and your orders.",
  actions: {
    catering: {
      title: "Find Catering Platters",
      subtitle: "Tell me guest count, budget, and preferences",
    },
    mealBoxes: {
      title: "Explore Meal-Box Plans",
      subtitle: "Find plans for lunch or dinner",
    },
    faq: {
      title: "Common Questions",
      subtitle: "Get answers to FAQs",
    },
    orders: {
      title: "My Orders",
      subtitle: "Check your recent or all orders",
    },
  },
  composerPlaceholder: "Type your question...",
  hubIntro: "Sure! What are you looking for?",
  hubTitle: "What would you like to do?",
  hubActions: {
    catering: { label: "Catering", description: "Events & gatherings" },
    mealbox: { label: "Meal Boxes", description: "Everyday meal plans" },
    orders: { label: "My Orders", description: "Track your orders" },
    faq: { label: "Help & FAQs", description: "Payments, delivery & more" },
    chefSearch: { label: "Find a Chef", description: "Search by chef name" },
  },
  cateringForm: {
    title: "Tell me about your catering event.",
    budgetLabel: "Total budget (₹)",
    budgetPlaceholder: "e.g. 5000",
    guestsLabel: "Number of guests",
    guestsPlaceholder: "e.g. 25",
    mealLabel: "Preferred meal",
    findPlans: "Find matching plans",
    cancel: "Cancel",
    validationBudget: "Please enter a valid budget in rupees.",
    validationGuests: "Please enter the number of guests.",
  },
  mealboxForm: {
    title: "Tell me about your meal-box needs.",
    budgetLabel: "Total budget (₹)",
    budgetPlaceholder: "e.g. 3000",
    mealLabel: "Meal preferences",
    findPlans: "Find matching plans",
    cancel: "Cancel",
    validationBudget: "Please enter a valid budget in rupees.",
    validationMeals: "Please select at least one meal preference.",
  },
  chefSearchForm: {
    title: "Who would you like to explore?",
    chefNameLabel: "Chef name",
    chefNamePlaceholder: "e.g. Ramesh",
    findChefs: "Search chef's platters",
    cancel: "Cancel",
    validationName: "Please enter a chef name.",
  },
  results: {
    headerOne: "Here is 1 matching plan:",
    headerMany: "Here are the matching plans:",
    empty:
      "No plans matched all your preferences. Try increasing your budget or changing your meal selection.",
    error:
      "We could not load chefs right now. Please check your connection and try again.",
    openPlatter: "View platter",
    noPrice: "Price shown in plan details",
    chefsPlural: "chefs",
    chefsSingular: "chef",
  },
  orders: {
    header: "Here are your most recent orders:",
    empty:
      "You have no orders yet. Once you place an order, you'll see it here.",
    error:
      "We could not load your orders right now. Please try again in a moment.",
    statusLabel: "Status",
    totalLabel: "Total",
  },
  faqTopics: {
    title: "Pick a topic:",
    subtitle: "Or just type your question below.",
  },
  fallback:
    "I'm here to help you explore KatBox catering platters and meal-box plans, answer common questions, and check your orders. Could you tell me a little more about what you need?",
  errors: {
    ordersUnauthenticated:
      "Please sign in to see your own orders. Order information is only available to the signed-in customer who placed them.",
    genericNetwork: "Something went wrong. Please try again.",
  },
};

const TE: LanguagePack = {
  headerTitle: "KatBox Assistant",
  introHeading: "హాయ్! నేను KatBox Assistant",
  introSubtitle:
    "క్యాటరింగ్ ప్లాటర్లు, మీల్-బాక్స్ ప్లాన్‌లు, సాధారణ ప్రశ్నలు మరియు మీ ఆర్డర్లలో నేను సహాయం చేస్తాను.",
  actions: {
    catering: {
      title: "క్యాటరింగ్ ప్లాటర్లు కనుగొనండి",
      subtitle: "అతిథుల సంఖ్య, బడ్జెట్ మరియు ప్రాధాన్యతలు చెప్పండి",
    },
    mealBoxes: {
      title: "మీల్-బాక్స్ ప్లాన్‌లు అన్వేషించండి",
      subtitle: "లంచ్ లేదా డిన్నర్ కోసం ప్లాన్‌లు కనుగొనండి",
    },
    faq: {
      title: "సాధారణ ప్రశ్నలు",
      subtitle: "FAQ లకు సమాధానాలు పొందండి",
    },
    orders: {
      title: "నా ఆర్డర్లు",
      subtitle: "మీ ఇటీవలి లేదా అన్ని ఆర్డర్లను తనిఖీ చేయండి",
    },
  },
  composerPlaceholder: "మీ ప్రశ్న టైప్ చేయండి...",
  hubIntro: "తప్పకుండా! మీరు ఏమి చూస్తున్నారు?",
  hubTitle: "మీరు ఏమి చేయాలనుకుంటున్నారు?",
  hubActions: {
    catering: { label: "క్యాటరింగ్", description: "ఈవెంట్లు & సమావేశాలు" },
    mealbox: { label: "మీల్ బాక్స్‌లు", description: "రోజువారీ మీల్ ప్లాన్‌లు" },
    orders: { label: "నా ఆర్డర్లు", description: "మీ ఆర్డర్‌లను ట్రాక్ చేయండి" },
    faq: {
      label: "సహాయం & ప్రశ్నలు",
      description: "చెల్లింపులు, డెలివరీ & మరిన్ని",
    },
    chefSearch: {
      label: "చెఫ్‌ను కనుగొనండి",
      description: "చెఫ్ పేరు ద్వారా వెతకండి",
    },
  },
  cateringForm: {
    title: "మీ క్యాటరింగ్ ఈవెంట్ గురించి చెప్పండి.",
    budgetLabel: "మొత్తం బడ్జెట్ (₹)",
    budgetPlaceholder: "ఉదా. 5000",
    guestsLabel: "అతిథుల సంఖ్య",
    guestsPlaceholder: "ఉదా. 25",
    mealLabel: "ఇష్టపడే భోజనం",
    findPlans: "సరిపోలే ప్లాన్‌లను కనుగొనండి",
    cancel: "రద్దు",
    validationBudget: "దయచేసి చెల్లుబాటు అయ్యే బడ్జెట్‌ను రూపాయలలో నమోదు చేయండి.",
    validationGuests: "దయచేసి అతిథుల సంఖ్యను నమోదు చేయండి.",
  },
  mealboxForm: {
    title: "మీ మీల్-బాక్స్ అవసరాల గురించి చెప్పండి.",
    budgetLabel: "మొత్తం బడ్జెట్ (₹)",
    budgetPlaceholder: "ఉదా. 3000",
    mealLabel: "భోజన ప్రాధాన్యతలు",
    findPlans: "సరిపోలే ప్లాన్‌లను కనుగొనండి",
    cancel: "రద్దు",
    validationBudget: "దయచేసి చెల్లుబాటు అయ్యే బడ్జెట్‌ను రూపాయలలో నమోదు చేయండి.",
    validationMeals: "దయచేసి కనీసం ఒక భోజన ప్రాధాన్యతను ఎంచుకోండి.",
  },
  chefSearchForm: {
    title: "మీరు ఎవరిని అన్వేషించాలనుకుంటున్నారు?",
    chefNameLabel: "చెఫ్ పేరు",
    chefNamePlaceholder: "ఉదా. రమేష్",
    findChefs: "చెఫ్ ప్లాటర్లను వెతకండి",
    cancel: "రద్దు",
    validationName: "దయచేసి చెఫ్ పేరును నమోదు చేయండి.",
  },
  results: {
    headerOne: "1 సరిపోలే ప్లాన్ ఇక్కడ ఉంది:",
    headerMany: "సరిపోలే ప్లాన్‌లు ఇక్కడ ఉన్నాయి:",
    empty:
      "మీ ప్రాధాన్యతలన్నింటికీ సరిపోలే ప్లాన్‌లు లేవు. మీ బడ్జెట్‌ను పెంచడానికి లేదా మీ భోజన ఎంపికను మార్చడానికి ప్రయత్నించండి.",
    error:
      "మేము ఇప్పుడు చెఫ్‌లను లోడ్ చేయలేకపోయాము. దయచేసి మీ కనెక్షన్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.",
    openPlatter: "ప్లాటర్ చూడండి",
    noPrice: "ధర ప్లాన్ వివరాలలో చూపబడుతుంది",
    chefsPlural: "చెఫ్‌లు",
    chefsSingular: "చెఫ్",
  },
  orders: {
    header: "మీ ఇటీవలి ఆర్డర్‌లు ఇక్కడ ఉన్నాయి:",
    empty:
      "మీకు ఇంకా ఆర్డర్‌లు లేవు. మీరు ఆర్డర్ చేసిన తర్వాత, అది ఇక్కడ కనిపిస్తుంది.",
    error:
      "మేము ఇప్పుడు మీ ఆర్డర్‌లను లోడ్ చేయలేకపోయాము. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    statusLabel: "స్థితి",
    totalLabel: "మొత్తం",
  },
  faqTopics: {
    title: "ఒక అంశాన్ని ఎంచుకోండి:",
    subtitle: "లేదా క్రింద మీ ప్రశ్నను టైప్ చేయండి.",
  },
  fallback:
    "KatBox క్యాటరింగ్ ప్లాటర్లు, మీల్ బాక్స్ ప్లాన్‌లు, సాధారణ సందేహాలు మరియు మీ ఆర్డర్ల వివరాల్లో సహాయం చేయగలను. మీకు ఏ విషయంలో సహాయం కావాలో కొంచెం వివరంగా చెప్పగలరా?",
  errors: {
    ordersUnauthenticated:
      "మీ స్వంత ఆర్డర్‌లను చూడటానికి దయచేసి సైన్ ఇన్ చేయండి. ఆర్డర్ సమాచారం ఆర్డర్ చేసిన సైన్-ఇన్ కస్టమర్‌కు మాత్రమే అందుబాటులో ఉంటుంది.",
    genericNetwork: "ఏదో తప్పు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
  },
};

const HI: LanguagePack = {
  headerTitle: "KatBox Assistant",
  introHeading: "नमस्ते! मैं KatBox Assistant हूँ",
  introSubtitle:
    "मैं कैटरिंग प्लैटर, मील-बॉक्स प्लान, सामान्य सवालों और आपके ऑर्डर में मदद कर सकता हूँ।",
  actions: {
    catering: {
      title: "कैटरिंग प्लैटर खोजें",
      subtitle: "मेहमानों की संख्या, बजट और प्राथमिकताएँ बताएं",
    },
    mealBoxes: {
      title: "मील-बॉक्स प्लान देखें",
      subtitle: "दोपहर या रात के लिए प्लान खोजें",
    },
    faq: {
      title: "सामान्य प्रश्न",
      subtitle: "FAQ के जवाब पाएं",
    },
    orders: {
      title: "मेरे ऑर्डर",
      subtitle: "अपने हाल के या सभी ऑर्डर देखें",
    },
  },
  composerPlaceholder: "अपना सवाल टाइप करें...",
  hubIntro: "ज़रूर! आप क्या ढूंढ रहे हैं?",
  hubTitle: "आप क्या करना चाहेंगे?",
  hubActions: {
    catering: { label: "कैटरिंग", description: "इवेंट और समारोह" },
    mealbox: { label: "मील बॉक्स", description: "रोज़ के मील प्लान" },
    orders: { label: "मेरे ऑर्डर", description: "अपने ऑर्डर ट्रैक करें" },
    faq: { label: "सहायता और FAQ", description: "भुगतान, डिलीवरी और अधिक" },
    chefSearch: { label: "शेफ खोजें", description: "शेफ के नाम से खोजें" },
  },
  cateringForm: {
    title: "अपने कैटरिंग इवेंट के बारे में बताएं।",
    budgetLabel: "कुल बजट (₹)",
    budgetPlaceholder: "जैसे 5000",
    guestsLabel: "मेहमानों की संख्या",
    guestsPlaceholder: "जैसे 25",
    mealLabel: "पसंदीदा भोजन",
    findPlans: "मेल खाते प्लान खोजें",
    cancel: "रद्द करें",
    validationBudget: "कृपया रुपये में मान्य बजट दर्ज करें।",
    validationGuests: "कृपया मेहमानों की संख्या दर्ज करें।",
  },
  mealboxForm: {
    title: "अपनी मील-बॉक्स ज़रूरतों के बारे में बताएं।",
    budgetLabel: "कुल बजट (₹)",
    budgetPlaceholder: "जैसे 3000",
    mealLabel: "भोजन प्राथमिकताएँ",
    findPlans: "मेल खाते प्लान खोजें",
    cancel: "रद्द करें",
    validationBudget: "कृपया रुपये में मान्य बजट दर्ज करें।",
    validationMeals: "कृपया कम से कम एक भोजन प्राथमिकता चुनें।",
  },
  chefSearchForm: {
    title: "आप किसे खोजना चाहेंगे?",
    chefNameLabel: "शेफ का नाम",
    chefNamePlaceholder: "जैसे रमेश",
    findChefs: "शेफ के प्लैटर खोजें",
    cancel: "रद्द करें",
    validationName: "कृपया शेफ का नाम दर्ज करें।",
  },
  results: {
    headerOne: "यहाँ 1 मेल खाता प्लान है:",
    headerMany: "यहाँ मेल खाते प्लान हैं:",
    empty:
      "आपकी सभी प्राथमिकताओं से मेल खाता कोई प्लान नहीं मिला। अपना बजट बढ़ाएँ या भोजन चयन बदलें।",
    error:
      "हम अभी शेफ लोड नहीं कर सके। कृपया अपना कनेक्शन जाँचें और पुनः प्रयास करें।",
    openPlatter: "प्लैटर देखें",
    noPrice: "मूल्य प्लान विवरण में दिखाया गया है",
    chefsPlural: "शेफ",
    chefsSingular: "शेफ",
  },
  orders: {
    header: "यहाँ आपके हाल के ऑर्डर हैं:",
    empty:
      "आपके कोई ऑर्डर नहीं हैं। ऑर्डर करने के बाद यहाँ दिखाई देंगे।",
    error:
      "हम अभी आपके ऑर्डर लोड नहीं कर सके। कृपया थोड़ी देर बाद पुनः प्रयास करें।",
    statusLabel: "स्थिति",
    totalLabel: "कुल",
  },
  faqTopics: {
    title: "एक विषय चुनें:",
    subtitle: "या नीचे अपना सवाल टाइप करें।",
  },
  fallback:
    "मैं KatBox के कैटरिंग प्लैटर, मील-बॉक्स प्लान, सामान्य सवालों और आपके ऑर्डर की जानकारी में मदद कर सकता हूँ। कृपया बताएं कि आपको किस चीज़ में सहायता चाहिए।",
  errors: {
    ordersUnauthenticated:
      "अपने स्वयं के ऑर्डर देखने के लिए कृपया साइन इन करें। ऑर्डर जानकारी केवल उसी साइन-इन ग्राहक को उपलब्ध है जिसने ऑर्डर किया है।",
    genericNetwork: "कुछ गलत हो गया। कृपया पुनः प्रयास करें।",
  },
};

const LANGUAGE_PACKS: Record<AssistantLanguage, LanguagePack> = {
  English: EN,
  తెలుగు: TE,
  हिंदी: HI,
};

// ─── Backend / menu helpers (preserved) ────────────────────────────────
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

const getChefId = (chef: any): string =>
  String(chef?._id || chef?.id || chef?.chefId || "");

const getChefName = (chef: any): string =>
  String(
    chef?.name || chef?.chefName || chef?.businessName || "KatBox Chef"
  );

const getMenuName = (menu: any): string =>
  String(
    menu?.name || menu?.title || menu?.planName || menu?.menuName || "Food Plan"
  );

const getMenuPrice = (menu: any): number | null => {
  const raw =
    menu?.price ??
    menu?.planPrice ??
    menu?.pricePerPlate ??
    menu?.originalBasePrice;
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const getImageUri = (value: any): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && typeof value.uri === "string")
    return value.uri;
  return null;
};

const getMenuImage = (menu: any, chef: any): string | null =>
  getImageUri(menu?.heroImageUrl) ||
  getImageUri(menu?.imageUrl) ||
  getImageUri(menu?.image) ||
  getImageUri(menu?.coverImage) ||
  getImageUri(chef?.coverImage) ||
  getImageUri(chef?.avatar) ||
  getImageUri(chef?.profileImage) ||
  getImageUri(chef?.image);

const textForMenu = (menu: any): string => {
  const values = [
    menu?.category,
    menu?.mealType,
    menu?.serviceType,
    menu?.type,
    menu?.selectedCategoryName,
    menu?.planType,
    menu?.menuType,
    menu?.name,
    menu?.title,
    menu?.description,
  ];
  return values
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(" ");
};

const matchesServiceType = (menu: any, serviceType: ServiceType): boolean => {
  const text = textForMenu(menu);
  const saysMealBox = /meal\s?box|mealbox|weekly plan|meal plan/.test(text);
  const saysCatering = /catering|platter|event|party/.test(text);
  if (serviceType === "mealbox" && saysCatering && !saysMealBox) return false;
  if (serviceType === "catering" && saysMealBox && !saysCatering) return false;
  return true;
};

const menuMealText = (menu: any): string => {
  const raw = [
    menu?.category,
    menu?.mealType,
    menu?.meals,
    menu?.mealPreferences,
    menu?.availableMeals,
    menu?.tags,
  ]
    .filter(Boolean)
    .map((v) => (Array.isArray(v) ? v.join(" ") : String(v)))
    .join(" ")
    .toLowerCase();
  return raw;
};

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Message factories ──────────────────────────────────────────────────
const makeTextMessage = (
  sender: "user" | "assistant",
  text: string
): AssistantMessage => ({
  id: makeId(sender),
  text,
  sender,
  kind: "text",
  createdAt: new Date().toISOString(),
});

const makeHubMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("hub"),
  text: pack.hubIntro,
  sender: "assistant",
  kind: "hub",
  createdAt: new Date().toISOString(),
});

const makeCateringFormMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("catering-form"),
  text: pack.cateringForm.title,
  sender: "assistant",
  kind: "catering_form",
  payload: { budget: "", guests: "", meal: "Lunch", validation: "" },
  createdAt: new Date().toISOString(),
});

const makeMealboxFormMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("mealbox-form"),
  text: pack.mealboxForm.title,
  sender: "assistant",
  kind: "mealbox_form",
  payload: { budget: "", meals: ["Lunch"], validation: "" },
  createdAt: new Date().toISOString(),
});

const makeChefSearchFormMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("chef-search"),
  text: pack.chefSearchForm.title,
  sender: "assistant",
  kind: "chef_search",
  payload: { chefName: "", validation: "" },
  createdAt: new Date().toISOString(),
});

const makeFaqTopicsMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("faq-topics"),
  text: pack.faqTopics.title,
  sender: "assistant",
  kind: "faq_topics",
  createdAt: new Date().toISOString(),
});

const makeFaqAnswerMessage = (
  answer: string,
  topicKey: FaqTopicKey
): AssistantMessage => ({
  id: makeId("faq-answer"),
  text: answer,
  sender: "assistant",
  kind: "faq_answer",
  payload: { topicKey },
  createdAt: new Date().toISOString(),
});

const makeResultsMessage = (
  headerText: string,
  results: ChefWithMenus[],
  serviceType: ServiceType
): AssistantMessage => ({
  id: makeId("results"),
  text: headerText,
  sender: "assistant",
  kind: "results",
  payload: { results, serviceType },
  createdAt: new Date().toISOString(),
});

const makeOrdersMessage = (
  header: string,
  orders: any[]
): AssistantMessage => ({
  id: makeId("orders"),
  text: header,
  sender: "assistant",
  kind: "orders",
  payload: { orders },
  createdAt: new Date().toISOString(),
});

// ─── Component ──────────────────────────────────────────────────────────
export default function KatBoxAssistant() {
  const { width } = useWindowDimensions();

  const [language, setLanguage] = useState<AssistantLanguage>("English");
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [assistantConnectionStatus, setAssistantConnectionStatus] = useState("");
  const [isHydrating, setIsHydrating] = useState(true);
  const [showChat, setShowChat] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pack = LANGUAGE_PACKS[language];
  const maxBubbleWidth = Math.min(width * 0.86, 540);

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      text: LANGUAGE_PACKS.English.introHeading,
      sender: "assistant",
      kind: "text",
      createdAt: new Date().toISOString(),
    },
    makeHubMessage(LANGUAGE_PACKS.English),
  ]);

  // ─── Hydrate conversation on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/assistant/conversation");
        if (cancelled) return;
        const stored = Array.isArray(res.data?.messages)
          ? (res.data.messages as AssistantMessage[])
          : [];
        if (stored.length > 0) {
          setMessages((current) => {
            const withoutWelcomeAndHub = current.filter(
              (m) => m.id !== "welcome" && m.kind !== "hub"
            );
            return [...withoutWelcomeAndHub, ...stored];
          });
          // If there is real conversation history, jump straight to chat.
          setShowChat(true);
        }
      } catch (e) {
        console.log("Assistant conversation hydrate failed:", e);
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Persist conversation after each change (debounced) ──────────────
  const persistMessages = (next: AssistantMessage[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.put("/api/assistant/messages", {
          messages: next.map((m) => ({
            id: m.id,
            text: m.text,
            sender: m.sender,
            kind: m.kind || "text",
            payload: m.payload,
            createdAt: m.createdAt,
          })),
        });
      } catch (e) {
        console.log("Assistant conversation save failed:", e);
      }
    }, 400);
  };

  const appendMessages = (next: AssistantMessage[]) => {
    setMessages((current) => {
      const merged = [...current, ...next];
      persistMessages(merged);
      return merged;
    });
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
  };

  const replaceMessage = (id: string, next: AssistantMessage) => {
    setMessages((current) => {
      const merged = current.map((m) => (m.id === id ? next : m));
      persistMessages(merged);
      return merged;
    });
  };

  const handleLanguageChange = (next: AssistantLanguage) => {
    setLanguage(next);
    const nextPack = LANGUAGE_PACKS[next];
    setMessages((current) => {
      const updated = current.map((m) => {
        if (m.id === "welcome") {
          return { ...m, text: nextPack.introHeading };
        }
        if (m.kind === "hub") {
          return { ...m, text: nextPack.hubIntro };
        }
        return m;
      });
      persistMessages(updated);
      return updated;
    });
  };

  // ─── Hub action taps ─────────────────────────────────────────────────
  const handleHubAction = (
    action: "catering" | "mealbox" | "orders" | "faq" | "chefSearch"
  ) => {
    if (isSending) return;
    setShowChat(true);
    if (action === "catering") {
      appendMessages([makeCateringFormMessage(pack)]);
    } else if (action === "mealbox") {
      appendMessages([makeMealboxFormMessage(pack)]);
    } else if (action === "orders") {
      void handleOrdersLookup();
    } else if (action === "faq") {
      appendMessages([makeFaqTopicsMessage(pack)]);
    } else if (action === "chefSearch") {
      appendMessages([makeChefSearchFormMessage(pack)]);
    }
  };

  // ─── Orders lookup (confirmed endpoint) ──────────────────────────────
  const handleOrdersLookup = async () => {
    setIsSending(true);
    try {
      const res = await api.get(ORDERS_ENDPOINT);
      const orders = getRecords(res.data, ["orders"]);
      if (orders.length === 0) {
        appendMessages([makeTextMessage("assistant", pack.orders.empty)]);
      } else {
        const sorted = [...orders].sort((a, b) => {
          const aT = new Date(a.createdAt || 0).getTime();
          const bT = new Date(b.createdAt || 0).getTime();
          return bT - aT;
        });
        appendMessages([
          makeOrdersMessage(pack.orders.header, sorted.slice(0, 10)),
        ]);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        appendMessages([
          makeTextMessage("assistant", pack.errors.ordersUnauthenticated),
        ]);
      } else {
        appendMessages([makeTextMessage("assistant", pack.orders.error)]);
      }
    } finally {
      setIsSending(false);
    }
  };

  // ─── FAQ topic tap ──────────────────────────────────────────────────
  const handleFaqTopicTap = (topicKey: FaqTopicKey) => {
    const topic = getFaqByKey(topicKey);
    if (!topic) return;
    appendMessages([makeFaqAnswerMessage(topic.answer[language], topicKey)]);
  };

  // ─── Catering / mealbox form submission ─────────────────────────────
  const runSearch = async (opts: {
    serviceType: ServiceType;
    budget: number;
    guests?: number;
    cateringMeal?: string;
    mealBoxMeals?: string[];
    chefNameFilter?: string;
    originMessageId: string;
  }) => {
    const {
      serviceType,
      budget,
      guests,
      cateringMeal,
      mealBoxMeals,
      chefNameFilter,
      originMessageId,
    } = opts;

    setIsSending(true);
    try {
      const chefsResponse = await api.get(CHEFS_ENDPOINT);
      const chefs = getRecords(chefsResponse?.data, ["chefs"]);

      const chefRows = await Promise.all(
        chefs.map(async (chef: any) => {
          const chefId = getChefId(chef);
          if (!chefId) return { chef, menus: [] as any[] };

          if (
            chefNameFilter &&
            !getChefName(chef)
              .toLowerCase()
              .includes(chefNameFilter.toLowerCase())
          ) {
            return { chef, menus: [] as any[] };
          }

          try {
            const menusResponse = await api.get(CHEF_MENUS_ENDPOINT(chefId));
            const menus = getRecords(menusResponse?.data, [
              "menus",
              "chefMenus",
              "categories",
            ]);
            return { chef, menus };
          } catch (error) {
            console.warn(
              "KatBox Assistant: failed to load menus for chef",
              chefId,
              error
            );
            return { chef, menus: [] as any[] };
          }
        })
      );

      const requestedGuests = guests ?? 0;
      const requestedMeals =
        serviceType === "catering"
          ? [(cateringMeal || "Lunch").toLowerCase()]
          : (mealBoxMeals || ["Lunch"]).map((m) => m.toLowerCase());

      const matchedRows = chefRows
        .map(({ chef, menus }) => {
          const matchingMenus = menus.filter((menu: any) => {
            if (!matchesServiceType(menu, serviceType)) return false;

            const price = getMenuPrice(menu);
            if (price !== null) {
              const priceMode = String(
                menu?.pricingType || menu?.priceType || menu?.priceUnit || ""
              ).toLowerCase();
              const perPlate =
                menu?.pricePerPlate !== undefined ||
                /per.?plate|per.?person|per.?guest/.test(priceMode);
              const estimatedMenuCost =
                serviceType === "catering" && perPlate
                  ? price * requestedGuests
                  : price;
              if (estimatedMenuCost > budget) return false;
            }

            if (serviceType === "catering") {
              const minGuests = Number(
                menu?.minGuests ?? menu?.minimumGuests ?? menu?.minGuestCount ?? 0
              );
              const maxGuests = Number(
                menu?.maxGuests ?? menu?.maximumGuests ?? menu?.maxGuestCount ?? 0
              );
              if (minGuests > 0 && requestedGuests < minGuests) return false;
              if (maxGuests > 0 && requestedGuests > maxGuests) return false;
              const mealsText = menuMealText(menu);
              if (
                mealsText &&
                /breakfast|lunch|dinner/.test(mealsText) &&
                !mealsText.includes((cateringMeal || "Lunch").toLowerCase())
              )
                return false;
            } else {
              const mealsText = menuMealText(menu);
              if (
                mealsText &&
                /breakfast|lunch|dinner|snacks/.test(mealsText)
              ) {
                const hasSelectedMeal = requestedMeals.some((meal) =>
                  mealsText.includes(meal)
                );
                if (!hasSelectedMeal) return false;
              }
            }
            return true;
          });
          return { chef, menus: matchingMenus };
        })
        .filter((row) => row.menus.length > 0);

      if (matchedRows.length === 0) {
        appendMessages([makeTextMessage("assistant", pack.results.empty)]);
      } else {
        const header =
          matchedRows.length === 1
            ? pack.results.headerOne
            : pack.results.headerMany;
        appendMessages([makeResultsMessage(header, matchedRows, serviceType)]);
      }
    } catch (error: any) {
      console.error("KatBox Assistant search failed:", error);
      appendMessages([makeTextMessage("assistant", pack.results.error)]);
    } finally {
      setIsSending(false);
      setMessages((current) => {
        const cleaned = current.filter((m) => m.id !== originMessageId);
        persistMessages(cleaned);
        return cleaned;
      });
    }
  };

  // ─── Open a menu item (byte-for-byte preserved navigation) ───────────
  const handleOpenMenu = (
    chef: any,
    menu: any,
    serviceType: ServiceType
  ) => {
    const chefId = getChefId(chef);
    if (!chefId) {
      appendMessages([
        makeTextMessage(
          "assistant",
          "This chef does not have a valid profile ID, so the plan cannot be opened."
        ),
      ]);
      return;
    }
    const chefName = getChefName(chef);
    const category = serviceType === "mealbox" ? "Meal Box" : "Catering";
    const menuImage = getMenuImage(menu, chef) || "";
    const normalizedMenu = {
      ...menu,
      category: menu.category || category,
      selectedCategoryName: category,
    };
    const chefObject = {
      ...chef,
      id: chefId,
      chefId,
      name: chefName,
      chefName,
      image:
        getImageUri(chef.image) ||
        getImageUri(chef.avatar) ||
        getImageUri(chef.coverImage) ||
        menuImage,
      selectedCategoryName: category,
    };

    router.push({
      pathname: "/screens/CateringMenuItemScreen" as any,
      params: {
        id: chefId,
        chefId,
        chefName,
        name: chefName,
        planId: String(menu._id || menu.id || ""),
        planName: getMenuName(menu),
        planPrice: String(getMenuPrice(menu) ?? ""),
        planImage: menuImage,
        category,
        fromCategory: category,
        menu: JSON.stringify(normalizedMenu),
        chef: JSON.stringify(chefObject),
      },
    });
  };

  // ─── Free-text message handler ───────────────────────────────────────
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setShowChat(true);
    appendMessages([makeTextMessage("user", trimmed)]);
    setInput("");

    const normalized = trimmed.toLowerCase();

    if (
      /^(hi|hello|hey|start|menu|help|నమస్తే|హాయ్|नमस्ते|हाय)[\s!.?]*$/i.test(
        trimmed
      ) ||
      /what can you do|ఏమి చేయగలరు|क्या कर सकते/.test(normalized)
    ) {
      appendMessages([makeHubMessage(pack)]);
      return;
    }

    if (/cater|platter|క్యాటరింగ్|ప్లాటర్|कैटरिंग|प्लैटर/.test(normalized)) {
      appendMessages([makeCateringFormMessage(pack)]);
      return;
    }

    if (/meal.?box|mealbox|మీల్ బాక్స్|मील बॉक्स/.test(normalized)) {
      appendMessages([makeMealboxFormMessage(pack)]);
      return;
    }

    if (/order|ఆర్డర్|ऑर्डर/.test(normalized)) {
      await handleOrdersLookup();
      return;
    }

    if (
      /faq|question|help me|how do|policy|refund|cancel|payment|delivery|support/.test(
        normalized
      ) &&
      !/cater|platter|meal.?box/.test(normalized)
    ) {
      const topic = matchFaqTopic(trimmed);
      if (topic) {
        appendMessages([
          makeFaqAnswerMessage(topic.answer[language], topic.key),
        ]);
      } else {
        appendMessages([makeFaqTopicsMessage(pack)]);
      }
      return;
    }

    if (/chef|find.*chef|చెఫ్|शेफ/.test(normalized)) {
      appendMessages([makeChefSearchFormMessage(pack)]);
      return;
    }

    const topic = matchFaqTopic(trimmed);
    if (topic) {
      appendMessages([makeFaqAnswerMessage(topic.answer[language], topic.key)]);
      return;
    }

    appendMessages([makeTextMessage("assistant", pack.fallback)]);
  };

  // ─── Reset to the welcome screen (3-dot menu, "New chat") ────────────
  const handleResetChat = () => {
    setShowChat(false);
    setInput("");
    setMessages([
      {
        id: "welcome",
        text: pack.introHeading,
        sender: "assistant",
        kind: "text",
        createdAt: new Date().toISOString(),
      },
      makeHubMessage(pack),
    ]);
    persistMessages([]);
  };

  // ─── Dev-only connection tester (preserved) ──────────────────────────
  const testAssistantConnection = async () => {
    setAssistantConnectionStatus("Testing assistant connection...");
    try {
      const response = await api.get("/api/assistant/conversation");
      console.log("✅ Assistant API status:", response.status);
      console.log("✅ Assistant conversation:", response.data);
      setAssistantConnectionStatus(
        `Connected successfully (HTTP ${response.status}).`
      );
    } catch (error: any) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.message || error?.message || "Unknown error";
      console.log("❌ Assistant API status:", status ?? "No HTTP response");
      console.log("❌ Assistant API error:", message);
      setAssistantConnectionStatus(
        `Connection failed${status ? ` (HTTP ${status})` : ""}: ${message}`
      );
    }
  };

  // ─── Big-action card handler ─────────────────────────────────────────
  const handleBigActionTap = (
    action: "catering" | "mealboxes" | "faq" | "orders"
  ) => {
    if (action === "catering") return handleHubAction("catering");
    if (action === "mealboxes") return handleHubAction("mealbox");
    if (action === "faq") return handleHubAction("faq");
    if (action === "orders") return handleHubAction("orders");
  };

  // ─── Render a single bubble ──────────────────────────────────────────
  const renderBubble = (message: AssistantMessage) => {
    const isUser = message.sender === "user";
    if (isUser) {
      return (
        <View
          key={message.id}
          style={[styles.messageRow, styles.userMessageRow]}
        >
          <View
            style={[
              styles.messageBubble,
              styles.userBubble,
              { maxWidth: maxBubbleWidth },
            ]}
          >
            <Text style={[styles.messageText, styles.userMessageText]}>
              {message.text}
            </Text>
          </View>
        </View>
      );
    }

    const kind: AssistantMessageKind = message.kind || "text";
    return (
      <View key={message.id} style={styles.messageRow}>
        <View style={styles.messageAvatar}>
          <Text style={styles.avatarEmoji}>👨‍🍳</Text>
        </View>
        <View
          style={[styles.assistantBubbleWrap, { maxWidth: maxBubbleWidth }]}
        >
          {kind === "hub" && renderHubCard(message.text)}
          {kind === "catering_form" && renderCateringForm(message)}
          {kind === "mealbox_form" && renderMealboxForm(message)}
          {kind === "chef_search" && renderChefSearchForm(message)}
          {kind === "faq_topics" && renderFaqTopics(message.text)}
          {kind === "faq_answer" && (
            <View style={styles.assistantBubble}>
              <Text style={styles.messageText}>{message.text}</Text>
            </View>
          )}
          {kind === "results" && renderResults(message)}
          {kind === "orders" && renderOrders(message)}
          {kind === "text" && (
            <View style={styles.assistantBubble}>
              <Text style={styles.messageText}>{message.text}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderHubCard = (intro: string) => (
    <View style={styles.hubCard}>
      <Text style={styles.hubIntro}>{intro}</Text>
      <Text style={styles.hubTitle}>{pack.hubTitle}</Text>
      {(
        [
          { key: "catering", icon: "restaurant-outline" },
          { key: "mealbox", icon: "fast-food-outline" },
          { key: "orders", icon: "receipt-outline" },
          { key: "faq", icon: "help-circle-outline" },
          { key: "chefSearch", icon: "person-outline" },
        ] as const
      ).map(({ key, icon }) => (
        <TouchableOpacity
          key={key}
          style={styles.hubRow}
          activeOpacity={0.85}
          onPress={() => handleHubAction(key)}
          disabled={isSending}
        >
          <View style={styles.hubIconWrap}>
            <Ionicons name={icon as any} size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hubRowLabel}>
              {pack.hubActions[key].label}
            </Text>
            <Text style={styles.hubRowDesc}>
              {pack.hubActions[key].description}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textFaint} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCateringForm = (message: AssistantMessage) => {
    const payload = message.payload || {};
    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{message.text}</Text>
        <Text style={styles.fieldLabel}>{pack.cateringForm.budgetLabel}</Text>
        <TextInput
          style={styles.formInput}
          value={payload.budget}
          onChangeText={(v) =>
            replaceMessage(message.id, {
              ...message,
              payload: { ...payload, budget: v, validation: "" },
            })
          }
          placeholder={pack.cateringForm.budgetPlaceholder}
          placeholderTextColor={COLORS.textFaint}
          keyboardType="numeric"
        />
        <Text style={styles.fieldLabel}>{pack.cateringForm.guestsLabel}</Text>
        <TextInput
          style={styles.formInput}
          value={payload.guests}
          onChangeText={(v) =>
            replaceMessage(message.id, {
              ...message,
              payload: { ...payload, guests: v, validation: "" },
            })
          }
          placeholder={pack.cateringForm.guestsPlaceholder}
          placeholderTextColor={COLORS.textFaint}
          keyboardType="number-pad"
        />
        <Text style={styles.fieldLabel}>{pack.cateringForm.mealLabel}</Text>
        <View style={styles.chipRow}>
          {(["Breakfast", "Lunch", "Dinner"] as const).map((meal) => {
            const selected = payload.meal === meal;
            return (
              <TouchableOpacity
                key={meal}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() =>
                  replaceMessage(message.id, {
                    ...message,
                    payload: { ...payload, meal, validation: "" },
                  })
                }
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {meal}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!!payload.validation && (
          <Text style={styles.formError}>{payload.validation}</Text>
        )}
        <View style={styles.formActionsRow}>
          <TouchableOpacity
            style={styles.formCancelBtn}
            onPress={() =>
              setMessages((current) => {
                const cleaned = current.filter((m) => m.id !== message.id);
                persistMessages(cleaned);
                return cleaned;
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.formCancelText}>
              {pack.cateringForm.cancel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              const budget = Number(String(payload.budget).trim());
              const guests = Number(String(payload.guests).trim());
              if (!Number.isFinite(budget) || budget <= 0) {
                replaceMessage(message.id, {
                  ...message,
                  payload: {
                    ...payload,
                    validation: pack.cateringForm.validationBudget,
                  },
                });
                return;
              }
              if (!Number.isFinite(guests) || guests < 1) {
                replaceMessage(message.id, {
                  ...message,
                  payload: {
                    ...payload,
                    validation: pack.cateringForm.validationGuests,
                  },
                });
                return;
              }
              void runSearch({
                serviceType: "catering",
                budget,
                guests,
                cateringMeal: payload.meal,
                originMessageId: message.id,
              });
            }}
          >
            <Text style={styles.formPrimaryText}>
              {pack.cateringForm.findPlans}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMealboxForm = (message: AssistantMessage) => {
    const payload = message.payload || { meals: [] };
    const selectedMeals: string[] = Array.isArray(payload.meals)
      ? payload.meals
      : [];
    const toggleMeal = (meal: string) => {
      const next = selectedMeals.includes(meal)
        ? selectedMeals.filter((m) => m !== meal)
        : [...selectedMeals, meal];
      replaceMessage(message.id, {
        ...message,
        payload: { ...payload, meals: next, validation: "" },
      });
    };
    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{message.text}</Text>
        <Text style={styles.fieldLabel}>{pack.mealboxForm.budgetLabel}</Text>
        <TextInput
          style={styles.formInput}
          value={payload.budget}
          onChangeText={(v) =>
            replaceMessage(message.id, {
              ...message,
              payload: { ...payload, budget: v, validation: "" },
            })
          }
          placeholder={pack.mealboxForm.budgetPlaceholder}
          placeholderTextColor={COLORS.textFaint}
          keyboardType="numeric"
        />
        <Text style={styles.fieldLabel}>{pack.mealboxForm.mealLabel}</Text>
        <View style={styles.chipRow}>
          {["Breakfast", "Lunch", "Dinner", "Snacks"].map((meal) => {
            const selected = selectedMeals.includes(meal);
            return (
              <TouchableOpacity
                key={meal}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleMeal(meal)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {meal}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!!payload.validation && (
          <Text style={styles.formError}>{payload.validation}</Text>
        )}
        <View style={styles.formActionsRow}>
          <TouchableOpacity
            style={styles.formCancelBtn}
            onPress={() =>
              setMessages((current) => {
                const cleaned = current.filter((m) => m.id !== message.id);
                persistMessages(cleaned);
                return cleaned;
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.formCancelText}>
              {pack.mealboxForm.cancel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              const budget = Number(String(payload.budget).trim());
              if (!Number.isFinite(budget) || budget <= 0) {
                replaceMessage(message.id, {
                  ...message,
                  payload: {
                    ...payload,
                    validation: pack.mealboxForm.validationBudget,
                  },
                });
                return;
              }
              if (selectedMeals.length === 0) {
                replaceMessage(message.id, {
                  ...message,
                  payload: {
                    ...payload,
                    validation: pack.mealboxForm.validationMeals,
                  },
                });
                return;
              }
              void runSearch({
                serviceType: "mealbox",
                budget,
                mealBoxMeals: selectedMeals,
                originMessageId: message.id,
              });
            }}
          >
            <Text style={styles.formPrimaryText}>
              {pack.mealboxForm.findPlans}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderChefSearchForm = (message: AssistantMessage) => {
    const payload = message.payload || {};
    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{message.text}</Text>
        <Text style={styles.fieldLabel}>
          {pack.chefSearchForm.chefNameLabel}
        </Text>
        <TextInput
          style={styles.formInput}
          value={payload.chefName}
          onChangeText={(v) =>
            replaceMessage(message.id, {
              ...message,
              payload: { ...payload, chefName: v, validation: "" },
            })
          }
          placeholder={pack.chefSearchForm.chefNamePlaceholder}
          placeholderTextColor={COLORS.textFaint}
        />
        {!!payload.validation && (
          <Text style={styles.formError}>{payload.validation}</Text>
        )}
        <View style={styles.formActionsRow}>
          <TouchableOpacity
            style={styles.formCancelBtn}
            onPress={() =>
              setMessages((current) => {
                const cleaned = current.filter((m) => m.id !== message.id);
                persistMessages(cleaned);
                return cleaned;
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.formCancelText}>
              {pack.chefSearchForm.cancel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              const name = String(payload.chefName || "").trim();
              if (!name) {
                replaceMessage(message.id, {
                  ...message,
                  payload: {
                    ...payload,
                    validation: pack.chefSearchForm.validationName,
                  },
                });
                return;
              }
              void runSearch({
                serviceType: "catering",
                budget: Number.MAX_SAFE_INTEGER,
                guests: 1,
                chefNameFilter: name,
                originMessageId: message.id,
              });
            }}
          >
            <Text style={styles.formPrimaryText}>
              {pack.chefSearchForm.findChefs}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFaqTopics = (intro: string) => (
    <View style={styles.faqCard}>
      <Text style={styles.formTitle}>{intro}</Text>
      <Text style={styles.faqSubtitle}>{pack.faqTopics.subtitle}</Text>
      <View style={styles.faqTopicsGrid}>
        {FAQ_TOPICS.map((topic) => (
          <TouchableOpacity
            key={topic.key}
            style={styles.faqChip}
            onPress={() => handleFaqTopicTap(topic.key)}
            activeOpacity={0.85}
          >
            <Text style={styles.faqChipText}>{topic.label[language]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderResults = (message: AssistantMessage) => {
    const payload = message.payload || {};
    const results: ChefWithMenus[] = payload.results || [];
    const serviceType: ServiceType = payload.serviceType || "catering";

    return (
      <View style={styles.resultsWrap}>
        <View style={styles.assistantBubble}>
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
        {results.map(({ chef, menus }) => (
          <View key={getChefId(chef)} style={styles.chefResultCard}>
            <View style={styles.chefHeaderRow}>
              {getImageUri(chef.avatar) ||
              getImageUri(chef.profileImage) ||
              getImageUri(chef.image) ||
              getImageUri(chef.coverImage) ? (
                <Image
                  source={{
                    uri:
                      getImageUri(chef.avatar) ||
                      getImageUri(chef.profileImage) ||
                      getImageUri(chef.image) ||
                      getImageUri(chef.coverImage) ||
                      "",
                  }}
                  style={styles.chefAvatar}
                />
              ) : (
                <View style={styles.chefAvatarFallback}>
                  <Text style={styles.avatarEmoji}>👨‍🍳</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.chefName}>{getChefName(chef)}</Text>
                {!!(chef.location || chef.address) && (
                  <Text style={styles.chefLocation} numberOfLines={1}>
                    {String(chef.location || chef.address)}
                  </Text>
                )}
                <Text style={styles.chefCount}>
                  {menus.length}{" "}
                  {menus.length === 1
                    ? pack.results.chefsSingular
                    : pack.results.chefsPlural}
                </Text>
              </View>
            </View>
            {menus.map((menu: any) => {
              const imageUri = getMenuImage(menu, chef);
              const price = getMenuPrice(menu);
              return (
                <TouchableOpacity
                  key={String(menu._id || menu.id || getMenuName(menu))}
                  style={styles.menuRow}
                  activeOpacity={0.85}
                  onPress={() => handleOpenMenu(chef, menu, serviceType)}
                >
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.menuImage}
                    />
                  ) : (
                    <View style={styles.menuImageFallback}>
                      <Ionicons
                        name="restaurant-outline"
                        size={22}
                        color={COLORS.primary}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuName} numberOfLines={2}>
                      {getMenuName(menu)}
                    </Text>
                    {!!menu.description && (
                      <Text style={styles.menuDesc} numberOfLines={2}>
                        {String(menu.description)}
                      </Text>
                    )}
                    <Text style={styles.menuPrice}>
                      {price === null
                        ? pack.results.noPrice
                        : `₹${price.toLocaleString("en-IN")}`}
                    </Text>
                  </View>
                  <View style={styles.menuArrow}>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={COLORS.primary}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const renderOrders = (message: AssistantMessage) => {
    const orders: any[] = (message.payload && message.payload.orders) || [];
    return (
      <View style={styles.ordersWrap}>
        <View style={styles.assistantBubble}>
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
        {orders.map((order) => {
          const id = String(order.orderId || order._id || "");
          const status = String(order.orderStatus || "");
          const total = Number(order.totalAmount || 0);
          const created = order.createdAt
            ? new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "";
          return (
            <View key={id} style={styles.orderCard}>
              <View style={styles.orderHeaderRow}>
                <Text style={styles.orderId}>#{id}</Text>
                <Text style={styles.orderDate}>{created}</Text>
              </View>
              <View style={styles.orderMetaRow}>
                <Text style={styles.orderMetaLabel}>
                  {pack.orders.statusLabel}:
                </Text>
                <Text style={styles.orderMetaValue}>{status || "—"}</Text>
              </View>
              <View style={styles.orderMetaRow}>
                <Text style={styles.orderMetaLabel}>
                  {pack.orders.totalLabel}:
                </Text>
                <Text style={styles.orderMetaValue}>
                  ₹{total.toLocaleString("en-IN")}
                </Text>
              </View>
              {!!order.chefName && (
                <Text style={styles.orderChef} numberOfLines={1}>
                  👨‍🍳 {String(order.chefName)}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ─── Welcome screen (matches reference image) ────────────────────────
  const renderWelcomeScreen = () => (
    <ScrollView
      style={styles.welcomeScroll}
      contentContainerStyle={styles.welcomeContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Chef avatar */}
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarEmojiLarge}>👨‍🍳</Text>
      </View>

      {/* Heading + subtitle */}
      <Text style={styles.welcomeHeading}>{pack.introHeading}</Text>
      <Text style={styles.welcomeSubtitle}>{pack.introSubtitle}</Text>

      {/* 4 big action cards */}
      <View style={styles.actionsList}>
        <TouchableOpacity
          style={styles.bigActionCard}
          activeOpacity={0.85}
          onPress={() => handleBigActionTap("catering")}
        >
          <View
            style={[
              styles.bigActionIconWrap,
              { backgroundColor: COLORS.cateringBg },
            ]}
          >
            <Ionicons
              name="restaurant"
              size={24}
              color={COLORS.cateringIcon}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigActionTitle}>
              {pack.actions.catering.title}
            </Text>
            <Text style={styles.bigActionSubtitle}>
              {pack.actions.catering.subtitle}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bigActionCard}
          activeOpacity={0.85}
          onPress={() => handleBigActionTap("mealboxes")}
        >
          <View
            style={[
              styles.bigActionIconWrap,
              { backgroundColor: COLORS.mealBoxBg },
            ]}
          >
            <Ionicons name="cube" size={24} color={COLORS.mealBoxIcon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigActionTitle}>
              {pack.actions.mealBoxes.title}
            </Text>
            <Text style={styles.bigActionSubtitle}>
              {pack.actions.mealBoxes.subtitle}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bigActionCard}
          activeOpacity={0.85}
          onPress={() => handleBigActionTap("faq")}
        >
          <View
            style={[styles.bigActionIconWrap, { backgroundColor: COLORS.faqBg }]}
          >
            <Ionicons
              name="document-text"
              size={24}
              color={COLORS.faqIcon}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigActionTitle}>
              {pack.actions.faq.title}
            </Text>
            <Text style={styles.bigActionSubtitle}>
              {pack.actions.faq.subtitle}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bigActionCard}
          activeOpacity={0.85}
          onPress={() => handleBigActionTap("orders")}
        >
          <View
            style={[
              styles.bigActionIconWrap,
              { backgroundColor: COLORS.ordersBg },
            ]}
          >
            <Ionicons name="receipt" size={24} color={COLORS.ordersIcon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigActionTitle}>
              {pack.actions.orders.title}
            </Text>
            <Text style={styles.bigActionSubtitle}>
              {pack.actions.orders.subtitle}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {__DEV__ && (
        <View style={{ marginTop: 16, alignItems: "center" }}>
          <TouchableOpacity
            onPress={testAssistantConnection}
            activeOpacity={0.8}
            style={styles.devTestBtn}
          >
            <Text style={styles.devTestBtnText}>
              Test Assistant Connection
            </Text>
          </TouchableOpacity>
          {!!assistantConnectionStatus && (
            <Text style={styles.devTestStatus}>{assistantConnectionStatus}</Text>
          )}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );

  // ─── Chat stream ──────────────────────────────────────────────────────
  const renderChatStream = () => (
    <ScrollView
      ref={scrollRef}
      style={styles.chatScroll}
      contentContainerStyle={styles.chatContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() =>
        scrollRef.current?.scrollToEnd({ animated: true })
      }
    >
      {isHydrating && (
        <View style={styles.hydratingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.hydratingText}>Loading your chat…</Text>
        </View>
      )}

      {messages
        .filter((m) => m.id !== "welcome")
        .map(renderBubble)}
    </ScrollView>
  );

  // ─── UI ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {/* ─── HEADER (matches reference image) ─────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.headerIconBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{pack.headerTitle}</Text>
          <TouchableOpacity
            accessibilityLabel="More options"
            onPress={handleResetChat}
            style={styles.headerIconBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* ─── MAIN CONTENT ──────────────────────────────────────────── */}
        {!showChat ? renderWelcomeScreen() : renderChatStream()}

        {/* ─── COMPOSER ─────────────────────────────────────────────── */}
        <View style={styles.composerContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={pack.composerPlaceholder}
              placeholderTextColor={COLORS.textFaint}
              multiline
              maxLength={500}
              editable={!isSending}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                !input.trim() && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={!input.trim() || isSending}
              activeOpacity={0.85}
              accessibilityLabel="Send message"
            >
              {isSending ? (
                <ActivityIndicator size="small" color={COLORS.surface} />
              ) : (
                <Ionicons name="send" size={18} color={COLORS.surface} />
              )}
            </TouchableOpacity>
          </View>

          {/* ─── LANGUAGE PILLS (below composer, matching reference) ── */}
          <View style={styles.languageRow}>
            {(["English", "తెలుగు", "हिंदी"] as AssistantLanguage[]).map(
              (lang) => {
                const selected = language === lang;
                return (
                  <TouchableOpacity
                    key={lang}
                    onPress={() => handleLanguageChange(lang)}
                    style={[
                      styles.languagePill,
                      selected && styles.languagePillSelected,
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.languagePillText,
                        selected && styles.languagePillTextSelected,
                      ]}
                    >
                      {lang}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.surface },
  keyboardContainer: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceMuted,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.1,
  },

  // Welcome screen
  welcomeScroll: { flex: 1, backgroundColor: COLORS.background },
  welcomeContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    alignItems: "center",
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 3,
    borderColor: COLORS.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarEmojiLarge: { fontSize: 44 },
  avatarEmoji: { fontSize: 20 },
  welcomeHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  welcomeSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  actionsList: {
    width: "100%",
    gap: 12,
  },
  bigActionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  bigActionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  bigActionTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 3,
  },
  bigActionSubtitle: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    lineHeight: 17,
  },

  // Chat stream
  chatScroll: { flex: 1, backgroundColor: COLORS.background },
  chatContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
  },
  hydratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  hydratingText: { color: COLORS.textMuted, fontSize: 12 },

  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  userMessageRow: { justifyContent: "flex-end" },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginTop: 2,
  },
  assistantBubbleWrap: { flex: 1, minWidth: 0 },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  assistantBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderTopRightRadius: 4,
  },
  messageText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: COLORS.userBubbleText,
    fontWeight: "600",
  },

  // Hub
  hubCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 6,
  },
  hubIntro: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  hubTitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  hubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: COLORS.background,
  },
  hubIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  hubRowLabel: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
  },
  hubRowDesc: { color: COLORS.textMuted, fontSize: 11.5, marginTop: 2 },

  // Forms
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 6,
  },
  formTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  fieldLabel: {
    color: COLORS.text,
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 6,
  },
  formInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 13.5,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  chipText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextSelected: { color: COLORS.primary, fontWeight: "800" },
  formError: { color: COLORS.danger, fontSize: 12, marginTop: 8 },
  formActionsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  formCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  formCancelText: { color: COLORS.textMuted, fontSize: 12.5, fontWeight: "700" },
  formPrimaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  formPrimaryText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: "900",
  },

  // FAQ
  faqCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 6,
  },
  faqSubtitle: { color: COLORS.textMuted, fontSize: 12, marginBottom: 10 },
  faqTopicsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  faqChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  faqChipText: { color: COLORS.text, fontSize: 12, fontWeight: "700" },

  // Results
  resultsWrap: { marginBottom: 6 },
  chefResultCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  chefHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  chefAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    marginRight: 10,
  },
  chefAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  chefName: { color: COLORS.text, fontSize: 14.5, fontWeight: "900" },
  chefLocation: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
  chefCount: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceMuted,
    gap: 10,
  },
  menuImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  menuImageFallback: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  menuDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  menuPrice: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },
  menuArrow: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  // Orders
  ordersWrap: { marginBottom: 6 },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  orderHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  orderId: { color: COLORS.text, fontSize: 13, fontWeight: "900" },
  orderDate: { color: COLORS.textMuted, fontSize: 11 },
  orderMetaRow: { flexDirection: "row", marginTop: 3 },
  orderMetaLabel: { color: COLORS.textMuted, fontSize: 12, marginRight: 6 },
  orderMetaValue: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  orderChef: { color: COLORS.primary, fontSize: 11.5, marginTop: 6 },

  // Composer
  composerContainer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 6 : 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceMuted,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 16,
    paddingRight: 6,
    minHeight: 46,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 0,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  sendBtnDisabled: { opacity: 0.45 },
  languageRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  languagePill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  languagePillSelected: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  languagePillText: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  languagePillTextSelected: {
    color: COLORS.primary,
    fontWeight: "800",
  },

  // Dev test
  devTestBtn: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  devTestBtnText: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: "700",
  },
  devTestStatus: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
});