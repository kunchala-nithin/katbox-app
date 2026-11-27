// KatBoxAssistant.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
const CHEF_PLANS_ENDPOINT = (chefId: string) =>
  `/api/chef-categories/plans/chef/${encodeURIComponent(chefId)}`;
const CHEF_CATEGORIES_ENDPOINT = (chefId: string) =>
  `/api/chef-categories/chef/${encodeURIComponent(chefId)}`;

// ─── KatBox Theme Colors ───────────────────────────────────────────────
const COLORS = {
  // KatBox brand palette: deep forest green, fresh leaf green, and warm neutrals.
  background: "#F6F8F5",
  surface: "#FFFFFF",
  surfaceMuted: "#EAF0EB",
  primary: "#245C43",
  primarySoft: "#E2F0E7",
  text: "#173528",
  textMuted: "#627568",
  textFaint: "#91A197",
  border: "#DCE7DF",
  danger: "#C62828",
  userBubble: "#347A56",
  userBubbleText: "#FFFFFF",
  // Consistent green-family accents for every assistant action.
  cateringBg: "#EAF3EC",
  cateringIcon: "#245C43",
  mealBoxBg: "#E2F0E7",
  mealBoxIcon: "#347A56",
  faqBg: "#EDF4EF",
  faqIcon: "#3F7658",
  ordersBg: "#E8F1EB",
  ordersIcon: "#2D694B",
};

type AssistantSearchServiceType = ServiceType | "homemade" | "quickbites";

type LanguagePack = {
  headerTitle: string;
  introHeading: string;
  introSubtitle: string;
  composerPlaceholder: string;
  hubTitle: string;
  hubSubtitle: string;
  hubActions: {
    catering: { label: string; description: string };
    mealbox: { label: string; description: string };
    orders: { label: string; description: string };
    faq: { label: string; description: string };
    chefSearch: { label: string; description: string };
    pickles: { label: string; description: string };
    quickBites: { label: string; description: string };
  };
  cateringForm: {
    title: string;
    pricePerPlateLabel: string;
    pricePerPlatePlaceholder: string;
    guestsLabel: string;
    guestsPlaceholder: string;
    mealLabel: string;
    dietLabel: string;
    findPlans: string;
    cancel: string;
    validationPrice: string;
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
  };
};

const EN: LanguagePack = {
  headerTitle: "KatBox Assistant",
  introHeading: "Hi! I'm KatBox Assistant",
  introSubtitle: "I can help you with catering platters, meal-box plans, common questions, and your orders.",
  composerPlaceholder: "Type your question...",
  hubTitle: "Sure! What are you looking for?",
  hubSubtitle: "What would you like to do?",
  hubActions: {
    catering: { label: "Catering", description: "Events & gatherings" },
    mealbox: { label: "Meal Boxes", description: "Everyday meal plans" },
    orders: { label: "My Orders", description: "Track your orders" },
    faq: { label: "Help & FAQs", description: "Payments, delivery & more" },
    chefSearch: { label: "Find a Chef", description: "Search by chef name" },
    pickles: { label: "Homemade Pickles", description: "Pickles, podis & homemade favourites" },
    quickBites: { label: "Quick Bites", description: "Snacks and quick-delivery items" },
  },
  cateringForm: {
    title: "Tell me about your catering event.",
    pricePerPlateLabel: "Price per plate (₹)",
    pricePerPlatePlaceholder: "e.g. 250",
    guestsLabel: "Number of guests",
    guestsPlaceholder: "e.g. 25",
    mealLabel: "Preferred meal",
    dietLabel: "Diet preference",
    findPlans: "Find matching plans",
    cancel: "Cancel",
    validationPrice: "Please enter a valid price per plate in rupees.",
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
    empty: "No plans matched all your preferences. Try changing your budget or meal selection.",
    error: "We could not load chefs right now. Please check your connection and try again.",
    noPrice: "Price shown in details",
    chefsPlural: "chefs",
    chefsSingular: "chef",
  },
  orders: {
    header: "Here are your most recent orders:",
    empty: "You have no orders yet.",
    error: "We could not load your orders right now.",
    statusLabel: "Status",
    totalLabel: "Total",
  },
  faqTopics: { title: "Pick a topic:", subtitle: "Or just type your question below." },
  fallback: "I'm here to help you explore KatBox. Could you tell me a little more about what you need?",
  errors: { ordersUnauthenticated: "Please sign in to see your own orders." },
};

const TE: LanguagePack = {
  headerTitle: "KatBox Assistant",
  introHeading: "హాయ్! నేను KatBox Assistant",
  introSubtitle: "క్యాటరింగ్ ప్లాటర్లు, మీల్-బాక్స్ ప్లాన్‌లు, సాధారణ ప్రశ్నలు మరియు మీ ఆర్డర్లలో నేను సహాయం చేస్తాను.",
  composerPlaceholder: "మీ ప్రశ్న టైప్ చేయండి...",
  hubTitle: "తప్పకుండా! మీరు ఏమి చూస్తున్నారు?",
  hubSubtitle: "మీరు ఏమి చేయాలనుకుంటున్నారు?",
  hubActions: {
    catering: { label: "క్యాటరింగ్", description: "ఈవెంట్లు & సమావేశాలు" },
    mealbox: { label: "మీల్ బాక్స్‌లు", description: "రోజువారీ మీల్ ప్లాన్‌లు" },
    orders: { label: "నా ఆర్డర్లు", description: "మీ ఆర్డర్‌లను ట్రాక్ చేయండి" },
    faq: { label: "సహాయం & ప్రశ్నలు", description: "చెల్లింపులు, డెలివరీ & మరిన్ని" },
    chefSearch: { label: "చెఫ్‌ను కనుగొనండి", description: "చెఫ్ పేరు ద్వారా వెతకండి" },
    pickles: { label: "ఇంటి పచ్చళ్లు", description: "పచ్చళ్లు, పొడులు & ఇంటి రుచులు" },
    quickBites: { label: "క్విక్ బైట్స్", description: "స్నాక్స్ మరియు త్వరిత డెలివరీ" },
  },
  cateringForm: {
    title: "మీ క్యాటరింగ్ ఈవెంట్ గురించి చెప్పండి.",
    pricePerPlateLabel: "ప్లేట్ ధర (₹)",
    pricePerPlatePlaceholder: "ఉదా. 250",
    guestsLabel: "అతిథుల సంఖ్య",
    guestsPlaceholder: "ఉదా. 25",
    mealLabel: "ఇష్టపడే భోజనం",
    dietLabel: "ఆహార ప్రాధాన్యత",
    findPlans: "సరిపోలే ప్లాన్‌లను కనుగొనండి",
    cancel: "రద్దు",
    validationPrice: "దయచేసి ప్లేట్ ధరను రూపాయలలో నమోదు చేయండి.",
    validationGuests: "దయచేసి అతిథుల సంఖ్యను నమోదు చేయండి.",
  },
  mealboxForm: {
    title: "మీ మీల్-బాక్స్ అవసరాల గురించి చెప్పండి.",
    budgetLabel: "మొత్తం బడ్జెట్ (₹)",
    budgetPlaceholder: "ఉదా. 3000",
    mealLabel: "భోజన ప్రాధాన్యతలు",
    findPlans: "సరిపోలే ప్లాన్‌లను కనుగొనండి",
    cancel: "రద్దు",
    validationBudget: "దయచేసి చెల్లుబాటు అయ్యే బడ్జెట్‌ను నమోదు చేయండి.",
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
    empty: "మీ ప్రాధాన్యతలన్నింటికీ సరిపోలే ప్లాన్‌లు లేవు. మీ బడ్జెట్‌ను మార్చడానికి ప్రయత్నించండి.",
    error: "మేము ఇప్పుడు చెఫ్‌లను లోడ్ చేయలేకపోయాము.",
    noPrice: "ధర వివరాలలో చూపబడుతుంది",
    chefsPlural: "చెఫ్‌లు",
    chefsSingular: "చెఫ్",
  },
  orders: {
    header: "మీ ఇటీవలి ఆర్డర్‌లు ఇక్కడ ఉన్నాయి:",
    empty: "మీకు ఇంకా ఆర్డర్‌లు లేవు.",
    error: "మేము ఇప్పుడు మీ ఆర్డర్‌లను లోడ్ చేయలేకపోయాము.",
    statusLabel: "స్థితి",
    totalLabel: "మొత్తం",
  },
  faqTopics: { title: "ఒక అంశాన్ని ఎంచుకోండి:", subtitle: "లేదా క్రింద మీ ప్రశ్నను టైప్ చేయండి." },
  fallback: "KatBox లో సహాయం చేయగలను. మీకు ఏమి కావాలో చెప్పగలరా?",
  errors: { ordersUnauthenticated: "మీ ఆర్డర్లను చూడటానికి దయచేసి సైన్ ఇన్ చేయండి." },
};

const HI: LanguagePack = {
  headerTitle: "KatBox Assistant",
  introHeading: "नमस्ते! मैं KatBox Assistant हूँ",
  introSubtitle: "मैं कैटरिंग प्लैटर, मील-बॉक्स प्लान, सामान्य सवालों और आपके ऑर्डर में मदद कर सकता हूँ।",
  composerPlaceholder: "अपना सवाल टाइप करें...",
  hubTitle: "ज़रूर! आप क्या ढूंढ रहे हैं?",
  hubSubtitle: "आप क्या करना चाहेंगे?",
  hubActions: {
    catering: { label: "कैटरिंग", description: "इवेंट और समारोह" },
    mealbox: { label: "मील बॉक्स", description: "रोज़ के मील प्लान" },
    orders: { label: "मेरे ऑर्डर", description: "अपने ऑर्डर ट्रैक करें" },
    faq: { label: "सहायता और FAQ", description: "भुगतान, डिलीवरी और अधिक" },
    chefSearch: { label: "शेफ खोजें", description: "शेफ के नाम से खोजें" },
    pickles: { label: "घर के अचार", description: "अचार, पोडी और घर के स्वाद" },
    quickBites: { label: "क्विक बाइट्स", description: "स्नैक्स और जल्दी डिलीवरी वाले आइटम" },
  },
  cateringForm: {
    title: "अपने कैटरिंग इवेंट के बारे में बताएं।",
    pricePerPlateLabel: "प्रति प्लेट मूल्य (₹)",
    pricePerPlatePlaceholder: "जैसे 250",
    guestsLabel: "मेहमानों की संख्या",
    guestsPlaceholder: "जैसे 25",
    mealLabel: "पसंदीदा भोजन",
    dietLabel: "आहार प्राथमिकता",
    findPlans: "मेल खाते प्लान खोजें",
    cancel: "रद्द करें",
    validationPrice: "कृपया प्रति प्लेट मूल्य दर्ज करें।",
    validationGuests: "कृपया मेहमानों की संख्या दर्ज करें।",
  },
  mealboxForm: {
    title: "अपनी मील-बॉक्स ज़रूरतों के बारे में बताएं।",
    budgetLabel: "कुल बजट (₹)",
    budgetPlaceholder: "जैसे 3000",
    mealLabel: "भोजन प्राथमिकताएँ",
    findPlans: "मेल खाते प्लान खोजें",
    cancel: "रद्द करें",
    validationBudget: "कृपया मान्य बजट दर्ज करें।",
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
    empty: "आपकी प्राथमिकताओं से मेल खाता कोई प्लान नहीं मिला।",
    error: "हम अभी शेफ लोड नहीं कर सके।",
    noPrice: "मूल्य विवरण में दिखाया गया है",
    chefsPlural: "शेफ",
    chefsSingular: "शेफ",
  },
  orders: {
    header: "यहाँ आपके हाल के ऑर्डर हैं:",
    empty: "आपके कोई ऑर्डर नहीं हैं।",
    error: "हम अभी आपके ऑर्डर लोड नहीं कर सके।",
    statusLabel: "स्थिति",
    totalLabel: "कुल",
  },
  faqTopics: { title: "एक विषय चुनें:", subtitle: "या नीचे अपना सवाल टाइप करें।" },
  fallback: "मैं KatBox में मदद कर सकता हूँ। कृपया बताएं कि आपको किस चीज़ में सहायता चाहिए।",
  errors: { ordersUnauthenticated: "अपने ऑर्डर देखने के लिए कृपया साइन इन करें।" },
};

const LANGUAGE_PACKS: Record<AssistantLanguage, LanguagePack> = {
  English: EN,
  తెలుగు: TE,
  हिंदी: HI,
};

// ─── Backend / menu helpers ────────────────────────────────────────────
const getRecords = (payload: any, keys: string[] = []): any[] => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.menus)) return payload.data.menus;
  if (Array.isArray(payload?.data?.plans)) return payload.data.plans;
  if (Array.isArray(payload?.data?.categories)) return payload.data.categories;
  if (Array.isArray(payload?.data?.chefs)) return payload.data.chefs;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
};

const getChefId = (chef: any): string => String(chef?._id || chef?.id || chef?.chefId || "");
const getChefName = (chef: any): string => String(chef?.name || chef?.chefName || chef?.businessName || "KatBox Chef");
const getMenuName = (menu: any): string => String(menu?.name || menu?.title || menu?.planName || menu?.menuName || "Food Plan");

const getMenuPrice = (menu: any): number | null => {
  const raw = menu?.price ?? menu?.planPrice ?? menu?.pricePerPlate ?? menu?.originalBasePrice;
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRupeeAmount = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/,/g, "").replace(/[^0-9.]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getAffordableItemPrice = (item: any, budgetLimit?: number): number | null => {
  const prices = [parseRupeeAmount(item?.price), ...(Array.isArray(item?.variants)
    ? item.variants.map((variant: any) => parseRupeeAmount(variant?.price))
    : [])].filter((price): price is number => price !== null && price > 0);
  if (prices.length === 0) return null;
  const eligible = typeof budgetLimit === "number" ? prices.filter((price) => price <= budgetLimit) : prices;
  return eligible.length ? Math.min(...eligible) : null;
};

const getImageUri = (value: any): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && typeof value.uri === "string") return value.uri;
  return null;
};

const getMenuImage = (menu: any, chef: any): string | null =>
  getImageUri(menu?.heroImageUrl) || getImageUri(menu?.imageUrl) || getImageUri(menu?.image) ||
  getImageUri(menu?.coverImage) || getImageUri(chef?.coverImage) || getImageUri(chef?.avatar) ||
  getImageUri(chef?.profileImage) || getImageUri(chef?.image);

const textForMenu = (menu: any): string => {
  const values = [
    menu?.category, menu?.mealType, menu?.serviceType, menu?.type,
    menu?.selectedCategoryName, menu?.planType, menu?.menuType,
    menu?.name, menu?.title, menu?.description,
  ];
  return values.filter(Boolean).map((v) => String(v).toLowerCase()).join(" ");
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
  const raw = [menu?.category, menu?.mealType, menu?.meals, menu?.mealPreferences, menu?.availableMeals, menu?.tags]
    .filter(Boolean).map((v) => (Array.isArray(v) ? v.join(" ") : String(v))).join(" ").toLowerCase();
  return raw;
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Message factories ──────────────────────────────────────────────────
const makeTextMessage = (sender: "user" | "assistant", text: string): AssistantMessage => ({
  id: makeId(sender), text, sender, kind: "text", createdAt: new Date().toISOString(),
});

const makeHubMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("hub"), text: pack.hubTitle, sender: "assistant", kind: "hub", createdAt: new Date().toISOString(),
});

const makeCateringFormMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("catering-form"),
  text: pack.cateringForm.title,
  sender: "assistant",
  kind: "catering_form",
  payload: { pricePerPlate: "", guests: "", meal: "Lunch", diet: "Any", validation: "" },
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

const makeItemSearchFormMessage = (serviceType: "homemade" | "quickbites"): AssistantMessage => ({
  id: makeId("item-search"),
  text: serviceType === "homemade"
    ? "Which pickle or homemade item are you looking for?"
    : "What is your budget for Quick Bites? I’ll show available items within it.",
  sender: "assistant",
  kind: "text",
  payload: { serviceType, itemName: "", budget: "", validation: "", isItemSearchForm: true },
  createdAt: new Date().toISOString(),
});

const makeFaqTopicsMessage = (pack: LanguagePack): AssistantMessage => ({
  id: makeId("faq-topics"), text: pack.faqTopics.title, sender: "assistant", kind: "faq_topics", createdAt: new Date().toISOString(),
});

const makeFaqAnswerMessage = (answer: string, topicKey: FaqTopicKey): AssistantMessage => ({
  id: makeId("faq-answer"), text: answer, sender: "assistant", kind: "faq_answer", payload: { topicKey }, createdAt: new Date().toISOString(),
});

const makeResultsMessage = (headerText: string, results: ChefWithMenus[], serviceType: AssistantSearchServiceType): AssistantMessage => ({
  id: makeId("results"), text: headerText, sender: "assistant", kind: "results", payload: { results, serviceType }, createdAt: new Date().toISOString(),
});

const makeOrdersMessage = (header: string, orders: any[]): AssistantMessage => ({
  id: makeId("orders"), text: header, sender: "assistant", kind: "orders", payload: { orders }, createdAt: new Date().toISOString(),
});

// ─── Component ──────────────────────────────────────────────────────────
export default function KatBoxAssistant() {
  const { width } = useWindowDimensions();
  // ✅ Safe-area insets ensure the header never hides behind the notch/camera
  const insets = useSafeAreaInsets();

  const [language, setLanguage] = useState<AssistantLanguage>("English");
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);

  const scrollRef = useRef<ScrollView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveMessages = useRef<AssistantMessage[] | null>(null);

  const pack = LANGUAGE_PACKS[language];
  const maxBubbleWidth = Math.min(width * 0.92, 600);

  // Start with a fresh empty chat state
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", text: LANGUAGE_PACKS.English.introHeading, sender: "assistant", kind: "text", createdAt: new Date().toISOString() },
    makeHubMessage(LANGUAGE_PACKS.English),
  ]);

  // ─── On Mount: Always start a new chat (don't hydrate old) ─────────────
  useEffect(() => {
    // We intentionally do NOT load the previous conversation here.
    // This fulfills the requirement: "when the chat is closed then the previous chat has to be ended and a new chat has to be opened"
    // The previous chat remains in the DB and is accessible via the History menu.
  }, []);

  // ─── Persist conversation after each change (debounced) ──────────────
  const writeConversation = async (next: AssistantMessage[]) => {
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
  };

  const persistMessages = (next: AssistantMessage[]) => {
    pendingSaveMessages.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snapshot = pendingSaveMessages.current;
      pendingSaveMessages.current = null;
      saveTimer.current = null;
      if (snapshot) void writeConversation(snapshot);
    }, 400);
  };

  // Flush the most recent pending conversation snapshot if the screen unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const pending = pendingSaveMessages.current;
      pendingSaveMessages.current = null;
      if (pending) void writeConversation(pending);
    };
  }, []);

  const appendMessages = (next: AssistantMessage[]) => {
    setMessages((current) => {
      const merged = [...current, ...next];
      persistMessages(merged);
      return merged;
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const replaceMessage = (id: string, next: AssistantMessage) => {
    setMessages((current) => {
      const merged = current.map((m) => (m.id === id ? next : m));
      persistMessages(merged);
      return merged;
    });
  };

  // ─── Smart Replacement Logic ─────────────────────────────────────────
  // Keep this as a pure list transformation so hub removal and the next
  // action are committed in one React state update.
  const smartAppendToList = (current: AssistantMessage[], newMessage: AssistantMessage) => {
    const last = current[current.length - 1];
    let nextList = [...current];

    if (last && (last.kind === "catering_form" || last.kind === "mealbox_form" || last.kind === "chef_search")) {
      const payload = last.payload || {};
      const isEmpty =
        (!payload.pricePerPlate && !payload.budget && !payload.guests && !payload.chefName && !payload.itemName) &&
        (!payload.validation || payload.validation === "");

      if (isEmpty) {
        nextList = [...current.slice(0, -1), newMessage];
      } else {
        nextList = [...current, newMessage];
      }
    } else {
      nextList = [...current, newMessage];
    }

    return nextList;
  };

  const handleSmartAppend = (newMessage: AssistantMessage) => {
    setMessages((current) => {
      const nextList = smartAppendToList(current, newMessage);
      persistMessages(nextList);
      return nextList;
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleLanguageChange = (next: AssistantLanguage) => {
    setLanguage(next);
    const nextPack = LANGUAGE_PACKS[next];
    setMessages((current) => {
      const updated = current.map((m) => {
        if (m.id === "welcome") return { ...m, text: nextPack.introHeading };
        if (m.kind === "hub") return { ...m, text: nextPack.hubTitle };
        return m;
      });
      persistMessages(updated);
      return updated;
    });
  };

  // ─── Hub action taps ─────────────────────────────────────────────────
  const handleHubAction = (action: "catering" | "mealbox" | "orders" | "faq" | "chefSearch" | "pickles" | "quickBites") => {
    if (isSending) return;
    setShowChat(true);

    if (action === "orders") {
      // Remove the hub and persist that change once, before the async lookup.
      setMessages((current) => {
        const next = current.filter((message) => message.kind !== "hub");
        persistMessages(next);
        return next;
      });
      void handleOrdersLookup();
      return;
    }

    let actionMessage: AssistantMessage;
    if (action === "catering") {
      actionMessage = makeCateringFormMessage(pack);
    } else if (action === "mealbox") {
      actionMessage = makeMealboxFormMessage(pack);
    } else if (action === "faq") {
      actionMessage = makeFaqTopicsMessage(pack);
    } else if (action === "chefSearch") {
      actionMessage = makeChefSearchFormMessage(pack);
    } else if (action === "pickles") {
      actionMessage = makeItemSearchFormMessage("homemade");
    } else {
      actionMessage = makeItemSearchFormMessage("quickbites");
    }

    // Hub removal and action insertion happen atomically from the same snapshot.
    setMessages((current) => {
      const withoutHub = current.filter((message) => message.kind !== "hub");
      const next = smartAppendToList(withoutHub, actionMessage);
      persistMessages(next);
      return next;
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleOrdersLookup = async () => {
    setIsSending(true);
    try {
      const res = await api.get(ORDERS_ENDPOINT);
      const orders = getRecords(res.data, ["orders"]);
      if (orders.length === 0) {
        handleSmartAppend(makeTextMessage("assistant", pack.orders.empty));
      } else {
        const sorted = [...orders].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        handleSmartAppend(makeOrdersMessage(pack.orders.header, sorted.slice(0, 10)));
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        handleSmartAppend(makeTextMessage("assistant", pack.errors.ordersUnauthenticated));
      } else {
        handleSmartAppend(makeTextMessage("assistant", pack.orders.error));
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleFaqTopicTap = (topicKey: FaqTopicKey) => {
    const topic = getFaqByKey(topicKey);
    if (!topic) return;
    appendMessages([makeFaqAnswerMessage(topic.answer[language], topicKey)]);
  };

  // ─── Search Logic ────────────────────────────────────────────────────
  const runSearch = async (opts: {
    serviceType: AssistantSearchServiceType;
    budgetLimit: number; // Calculated from pricePerPlate * guests for catering
    guests?: number;
    cateringMeal?: string;
    dietFilter?: string;
    mealBoxMeals?: string[];
    chefNameFilter?: string;
    originMessageId: string;
  }) => {
    const { serviceType, budgetLimit, guests, cateringMeal, dietFilter, mealBoxMeals, chefNameFilter, originMessageId } = opts;

    setIsSending(true);
    let searchMessages: AssistantMessage[] = [];
    try {
      const chefsResponse = await api.get(CHEFS_ENDPOINT);
      const chefs = getRecords(chefsResponse?.data, ["chefs"]);

      const chefRows = await Promise.all(
        chefs.map(async (chef: any) => {
          const chefId = getChefId(chef);
          if (!chefId) return { chef, menus: [] as any[] };
          if (chefNameFilter && !getChefName(chef).toLowerCase().includes(chefNameFilter.toLowerCase())) {
            return { chef, menus: [] as any[] };
          }

          try {
            // Catering menus and Meal Box plans are stored in different collections.
            const endpoint = serviceType === "mealbox"
              ? CHEF_PLANS_ENDPOINT(chefId)
              : CHEF_MENUS_ENDPOINT(chefId);
            const menusResponse = await api.get(endpoint);
            const menus = getRecords(menusResponse?.data, ["menus", "chefMenus", "plans", "categories"]);
            return { chef, menus };
          } catch (error) {
            console.warn(`Assistant ${serviceType} lookup failed for chef ${chefId}:`, error);
            return { chef, menus: [] as any[] };
          }
        })
      );

      const requestedGuests = guests ?? 0;
      const requestedMeals = serviceType === "catering"
          ? [(cateringMeal || "Lunch").toLowerCase()]
          : (mealBoxMeals || ["Lunch"]).map((m) => m.toLowerCase());

      const matchedRows = chefRows.map(({ chef, menus }) => {
          const matchingMenus = menus.filter((menu: any) => {
            if (serviceType === "catering" && !matchesServiceType(menu, "catering")) return false;
            if (serviceType === "mealbox") {
              const planText = [menu?.name, menu?.title, menu?.category, menu?.description, menu?.planType]
                .filter(Boolean).join(" ").toLowerCase();
              if (/catering|platter|event/.test(planText)) return false;
            }

            // Diet Filter (Veg / Non-Veg) for Catering
            if (serviceType === "catering" && dietFilter && dietFilter !== "Any") {
               const menuText = textForMenu(menu);
               const isVeg = menu?.isNonVeg === true || menu?.isVeg === false
                 ? false
                 : menu?.isNonVeg === false || menu?.isVeg === true
                   ? true
                   : /veg|vegetarian/.test(menuText) && !/non.?veg|chicken|mutton|fish/.test(menuText);
               if (dietFilter === "Veg" && !isVeg) return false;
               if (dietFilter === "Non-Veg" && isVeg) return false;
            }

            const price = getMenuPrice(menu);
            if (price !== null) {
              const priceMode = String(menu?.pricingType || menu?.priceType || menu?.priceUnit || "").toLowerCase();
              const perPlate = serviceType === "catering" || menu?.pricePerPlate !== undefined || /per.?plate|per.?person|per.?guest/.test(priceMode);
              // For catering, we compare the menu's total cost (price * guests) to the budgetLimit
              const estimatedMenuCost = serviceType === "catering" && perPlate ? price * requestedGuests : price;
              if (estimatedMenuCost > budgetLimit) return false;
            }

            if (serviceType === "catering") {
              const minGuests = Number(menu?.minGuests ?? menu?.minimumGuests ?? menu?.minGuestCount ?? 0);
              const maxGuests = Number(menu?.maxGuests ?? menu?.maximumGuests ?? menu?.maxGuestCount ?? 0);
              if (minGuests > 0 && requestedGuests < minGuests) return false;
              if (maxGuests > 0 && requestedGuests > maxGuests) return false;
              
              const mealsText = menuMealText(menu);
              if (mealsText && /breakfast|lunch|dinner/.test(mealsText) && !mealsText.includes((cateringMeal || "Lunch").toLowerCase())) return false;
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

      if (matchedRows.length === 0) {
        searchMessages = [makeTextMessage("assistant", pack.results.empty)];
      } else {
        const header = matchedRows.length === 1 ? pack.results.headerOne : pack.results.headerMany;
        searchMessages = [makeResultsMessage(header, matchedRows, serviceType)];
      }
    } catch (error: any) {
      console.warn("Assistant search failed:", error?.response?.data || error?.message || error);
      searchMessages = [makeTextMessage("assistant", pack.results.error)];
    } finally {
      setIsSending(false);
      setMessages((current) => {
        const cleaned = current.filter((message) => message.id !== originMessageId);
        const updated = [...cleaned, ...searchMessages];
        persistMessages(updated);
        return updated;
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const runCategoryItemSearch = async (
    serviceType: "homemade" | "quickbites",
    itemName: string,
    originMessageId: string,
    budgetLimit?: number,
  ) => {
    setIsSending(true);
    let searchMessages: AssistantMessage[] = [];
    try {
      const chefsResponse = await api.get(CHEFS_ENDPOINT);
      const chefs = getRecords(chefsResponse?.data, ["chefs"]);
      const query = itemName.trim().toLocaleLowerCase();

      const rows = await Promise.all(chefs.map(async (chef: any) => {
        const chefId = getChefId(chef);
        if (!chefId) return { chef, menus: [] as any[] };

        try {
          const response = await api.get(CHEF_CATEGORIES_ENDPOINT(chefId));
          const categories = getRecords(response?.data, ["categories"]);
          const matchedCategories = categories.flatMap((category: any) => {
            const categoryName = String(category?.name || "").toLocaleLowerCase();
            const categoryType = [category?.serviceType, category?.type, category?.categoryType, category?.tag]
              .filter(Boolean).map((value: any) => String(value)).join(" ").toLocaleLowerCase();
            const classificationText = `${categoryName} ${categoryType}`;
            const isQuickBites = /quick\s*bites?|quickbites/.test(classificationText);
            const isHomemade = /homemade|home\s*made|pickle|pickles|podi|achar|traditional\s*foods?/.test(classificationText);

            if (serviceType === "quickbites" && !isQuickBites) return [];
            if (serviceType === "homemade" && !isHomemade) return [];

            const subCategories = Array.isArray(category?.subCategories) ? category.subCategories : [];
            const matchingItems = subCategories.flatMap((sub: any) => {
              const subCategoryName = String(sub?.name || "");
              const items = Array.isArray(sub?.items) ? sub.items : [];
              return items
                .filter((item: any) => item?.isAvailable !== false)
                .filter((item: any) => String(item?.name || "").toLocaleLowerCase().includes(query))
                .map((item: any) => {
                  const eligiblePrice = getAffordableItemPrice(item, serviceType === "quickbites" ? budgetLimit : undefined);
                  return { ...item, subCategoryName, assistantDisplayPrice: eligiblePrice };
                })
                .filter((item: any) => serviceType !== "quickbites" || item.assistantDisplayPrice !== null);
            });

            if (!matchingItems.length) return [];
            return [{
              ...category,
              matchedItems: matchingItems,
              matchedItemNames: matchingItems.map((item: any) => item.name),
            }];
          });

          return { chef, menus: matchedCategories };
        } catch (error: any) {
          console.warn(`Assistant category lookup failed for chef ${chefId}:`, error?.response?.data || error?.message || error);
          return { chef, menus: [] as any[] };
        }
      }));

      const matched = rows.filter((row) => row.menus.length > 0);
      if (!matched.length) {
        const budgetText = serviceType === "quickbites" && typeof budgetLimit === "number"
          ? ` under ₹${budgetLimit.toLocaleString("en-IN")}`
          : "";
        const emptyMessage = serviceType === "quickbites"
          ? `I couldn't find any available Quick Bites items${budgetText} right now. Try increasing your budget.`
          : `I couldn't find ${itemName} in Homemade Items right now. Try another item name.`;
        searchMessages = [makeTextMessage("assistant", emptyMessage)];
      } else {
        const header = serviceType === "quickbites"
          ? `Here are the available Quick Bites items${typeof budgetLimit === "number" ? ` within your ₹${budgetLimit.toLocaleString("en-IN")} budget` : ""}:`
          : `Here are the homemade item matches for “${itemName}”:`;
        searchMessages = [makeResultsMessage(header, matched, serviceType)];
      }
    } catch (error: any) {
      console.error("Assistant category item search failed:", error?.response?.data || error);
      searchMessages = [makeTextMessage("assistant", "I couldn't search these items right now. Please check your connection and try again.")];
    } finally {
      setIsSending(false);
      setMessages((current) => {
        const cleaned = current.filter((message) => message.id !== originMessageId);
        const updated = [...cleaned, ...searchMessages];
        persistMessages(updated);
        return updated;
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleOpenMenu = (chef: any, menu: any, serviceType: AssistantSearchServiceType) => {
    const chefId = getChefId(chef);
    if (!chefId) {
      appendMessages([makeTextMessage("assistant", "This chef does not have a valid profile ID, so the plan cannot be opened.")]);
      return;
    }
    const chefName = getChefName(chef);
    const menuImage = getMenuImage(menu, chef) || "";

    if (serviceType === "mealbox") {
      const chefObject = {
        ...chef, id: chefId, chefId, name: chefName, chefName,
        image: getImageUri(chef.image) || getImageUri(chef.avatar) || getImageUri(chef.coverImage) || menuImage,
      };
      router.push({
        pathname: "/screens/MealBoxItems" as any,
        params: {
          chefId, chefName,
          planId: String(menu._id || menu.id || ""),
          planName: getMenuName(menu),
          planPrice: String(getMenuPrice(menu) ?? ""),
          category: String(menu.category || "All Plans"),
          description: String(menu.description || ""),
          planImage: menuImage,
          chefImage: String(chefObject.image || ""),
          avatar: String(chefObject.image || ""),
          rating: String(chef.rating || ""),
          location: String(chef.location || chef.address || ""),
        },
      });
      return;
    }

    if (serviceType === "homemade" || serviceType === "quickbites") {
      const categoryName = String(menu.name || (serviceType === "quickbites" ? "QuickBites" : "Pickles & Podis"));
      router.push({
        pathname: "/screens/HomeMadeItemScreen" as any,
        params: {
          id: chefId, chefId, chefName, name: chefName,
          categoryId: String(menu._id || menu.id || ""),
          category: serviceType === "quickbites" ? "QuickBites" : categoryName,
          fromCategory: serviceType === "quickbites" ? "Quick Bites" : "Pickles & Podis",
          isQuickBites: serviceType === "quickbites" ? "true" : "false",
          image: menuImage,
          rating: String(chef.rating || ""),
          location: String(chef.location || chef.address || ""),
        },
      });
      return;
    }

    const category = "Catering";
    const normalizedMenu = { ...menu, category: menu.category || category, selectedCategoryName: category };
    const chefObject = {
      ...chef, id: chefId, chefId, name: chefName, chefName,
      image: getImageUri(chef.image) || getImageUri(chef.avatar) || getImageUri(chef.coverImage) || menuImage,
      selectedCategoryName: category,
    };
    router.push({
      pathname: "/screens/CateringMenuItemScreen" as any,
      params: {
        id: chefId, chefId, chefName, name: chefName,
        planId: String(menu._id || menu.id || ""),
        planName: getMenuName(menu),
        planPrice: String(getMenuPrice(menu) ?? ""),
        planImage: menuImage, category, fromCategory: category,
        menu: JSON.stringify(normalizedMenu), chef: JSON.stringify(chefObject),
      },
    });
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setShowChat(true);
    appendMessages([makeTextMessage("user", trimmed)]);
    setInput("");

    const normalized = trimmed.toLowerCase();

    if (/^(hi|hello|hey|start|menu|help|నమస్తే|హాయ్|नमस्ते|हाय)[\s!.?]*$/i.test(trimmed) || /what can you do|ఏమి చేయగలరు|क्या कर सकते/.test(normalized)) {
      appendMessages([makeHubMessage(pack)]);
      return;
    }
    if (/cater|platter|క్యాటరింగ్|ప్లాటర్|कैटरिंग|प्लैटर/.test(normalized)) {
      handleSmartAppend(makeCateringFormMessage(pack));
      return;
    }
    if (/meal.?box|mealbox|మీల్ బాక్స్|मील बॉक्स/.test(normalized)) {
      handleSmartAppend(makeMealboxFormMessage(pack));
      return;
    }
    if (/quick.?bites?|quickbites|క్విక్ బైట్స్|क्विक बाइट्स/.test(normalized)) {
      handleSmartAppend(makeItemSearchFormMessage("quickbites"));
      return;
    }
    if (/pickle|pickles|podi|achar|పచ్చడి|పచ్చళ్లు|अचार/.test(normalized)) {
      handleSmartAppend(makeItemSearchFormMessage("homemade"));
      return;
    }
    if (/order|ఆర్డర్|ऑर्डर/.test(normalized)) {
      await handleOrdersLookup();
      return;
    }
    if (/faq|question|help me|how do|policy|refund|cancel|payment|delivery|support/.test(normalized) && !/cater|platter|meal.?box/.test(normalized)) {
      const topic = matchFaqTopic(trimmed);
      if (topic) appendMessages([makeFaqAnswerMessage(topic.answer[language], topic.key)]);
      else appendMessages([makeFaqTopicsMessage(pack)]);
      return;
    }
    if (/chef|find.*chef|చెఫ్|शेफ/.test(normalized)) {
      handleSmartAppend(makeChefSearchFormMessage(pack));
      return;
    }

    const topic = matchFaqTopic(trimmed);
    if (topic) {
      appendMessages([makeFaqAnswerMessage(topic.answer[language], topic.key)]);
      return;
    }

    appendMessages([makeTextMessage("assistant", pack.fallback)]);
  };

  const handleResetChat = async () => {
    setShowChat(false);
    setInput("");
    const resetMessages: AssistantMessage[] = [
      { id: "welcome", text: pack.introHeading, sender: "assistant", kind: "text", createdAt: new Date().toISOString() },
      makeHubMessage(pack),
    ];
    setMessages(resetMessages);
    persistMessages(resetMessages);
  };

  const openHistory = async () => {
    try {
      const res = await api.get("/api/assistant/history");
      setHistoryItems(res.data.history || []);
      setShowHistoryModal(true);
    } catch (e) {
      console.log("History fetch failed", e);
    }
  };

  const loadHistoryItem = (item: any) => {
    if (item.messages && item.messages.length > 0) {
      setMessages(item.messages);
      setShowChat(true);
      setShowHistoryModal(false);
    }
  };

  const renderBubble = (message: AssistantMessage) => {
    const isUser = message.sender === "user";
    if (isUser) {
      return (
        <View key={message.id} style={[styles.messageRow, styles.userMessageRow]}>
          <View style={[styles.messageBubble, styles.userBubble, { maxWidth: maxBubbleWidth }]}>
            <Text style={[styles.messageText, styles.userMessageText]}>{message.text}</Text>
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
        <View style={[styles.assistantBubbleWrap, { maxWidth: maxBubbleWidth }]}>
          {kind === "hub" && renderHubCard(message.text)}
          {kind === "catering_form" && renderCateringForm(message)}
          {kind === "mealbox_form" && renderMealboxForm(message)}
          {kind === "chef_search" && renderChefSearchForm(message)}
          {(kind as string) === "item_search" && renderItemSearchForm(message)}
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
      <Text style={styles.hubTitle}>{pack.hubSubtitle}</Text>
      {(
        [
          { key: "catering", icon: "restaurant-outline" },
          { key: "mealbox", icon: "fast-food-outline" },
          { key: "orders", icon: "receipt-outline" },
          { key: "faq", icon: "help-circle-outline" },
          { key: "chefSearch", icon: "person-outline" },
          { key: "pickles", icon: "leaf-outline" },
          { key: "quickBites", icon: "flash-outline" },
        ] as const
      ).map(({ key, icon }) => (
        <TouchableOpacity key={key} style={styles.hubRow} activeOpacity={0.85} onPress={() => handleHubAction(key)} disabled={isSending}>
          <View style={styles.hubIconWrap}>
            <Ionicons name={icon as any} size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hubRowLabel}>{pack.hubActions[key].label}</Text>
            <Text style={styles.hubRowDesc}>{pack.hubActions[key].description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textFaint} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCateringForm = (message: AssistantMessage) => {
    const payload = message.payload || {};
    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{message.text}</Text>
        <Text style={styles.fieldLabel}>{pack.cateringForm.pricePerPlateLabel}</Text>
        <TextInput
          style={styles.formInput} value={payload.pricePerPlate}
          onChangeText={(v) => replaceMessage(message.id, { ...message, payload: { ...payload, pricePerPlate: v, validation: "" } })}
          placeholder={pack.cateringForm.pricePerPlatePlaceholder} placeholderTextColor={COLORS.textFaint} keyboardType="numeric"
        />
        <Text style={styles.fieldLabel}>{pack.cateringForm.guestsLabel}</Text>
        <TextInput
          style={styles.formInput} value={payload.guests}
          onChangeText={(v) => replaceMessage(message.id, { ...message, payload: { ...payload, guests: v, validation: "" } })}
          placeholder={pack.cateringForm.guestsPlaceholder} placeholderTextColor={COLORS.textFaint} keyboardType="number-pad"
        />
        
        <Text style={styles.fieldLabel}>{pack.cateringForm.dietLabel}</Text>
        <View style={styles.chipRow}>
          {(["Any", "Veg", "Non-Veg"] as const).map((diet) => {
            const selected = payload.diet === diet;
            return (
              <TouchableOpacity key={diet} style={[styles.chip, selected && styles.chipSelected]} onPress={() => replaceMessage(message.id, { ...message, payload: { ...payload, diet, validation: "" } })} activeOpacity={0.85}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{diet}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>{pack.cateringForm.mealLabel}</Text>
        <View style={styles.chipRow}>
          {(["Breakfast", "Lunch", "Dinner"] as const).map((meal) => {
            const selected = payload.meal === meal;
            return (
              <TouchableOpacity key={meal} style={[styles.chip, selected && styles.chipSelected]} onPress={() => replaceMessage(message.id, { ...message, payload: { ...payload, meal, validation: "" } })} activeOpacity={0.85}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{meal}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!!payload.validation && <Text style={styles.formError}>{payload.validation}</Text>}
        <View style={styles.formActionsRow}>
          <TouchableOpacity style={styles.formCancelBtn} onPress={() => setMessages((current) => { const cleaned = current.filter((m) => m.id !== message.id); persistMessages(cleaned); return cleaned; })} activeOpacity={0.85}>
            <Text style={styles.formCancelText}>{pack.cateringForm.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formPrimaryBtn} activeOpacity={0.85}
            onPress={() => {
              const pricePerPlate = Number(String(payload.pricePerPlate).trim());
              const guests = Number(String(payload.guests).trim());
              if (!Number.isFinite(pricePerPlate) || pricePerPlate <= 0) {
                replaceMessage(message.id, { ...message, payload: { ...payload, validation: pack.cateringForm.validationPrice } });
                return;
              }
              if (!Number.isFinite(guests) || guests < 1) {
                replaceMessage(message.id, { ...message, payload: { ...payload, validation: pack.cateringForm.validationGuests } });
                return;
              }
              // The user inputs price per plate, but the search requires a total budget limit.
              const calculatedBudget = pricePerPlate * guests;
              void runSearch({
                serviceType: "catering",
                budgetLimit: calculatedBudget,
                guests,
                cateringMeal: payload.meal,
                dietFilter: payload.diet,
                originMessageId: message.id,
              });
            }}
          >
            <Text style={styles.formPrimaryText}>{pack.cateringForm.findPlans}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMealboxForm = (message: AssistantMessage) => {
    const payload = message.payload || { meals: [] };
    const selectedMeals: string[] = Array.isArray(payload.meals) ? payload.meals : [];
    const toggleMeal = (meal: string) => {
      const next = selectedMeals.includes(meal) ? selectedMeals.filter((m) => m !== meal) : [...selectedMeals, meal];
      replaceMessage(message.id, { ...message, payload: { ...payload, meals: next, validation: "" } });
    };
    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{message.text}</Text>
        <Text style={styles.fieldLabel}>{pack.mealboxForm.budgetLabel}</Text>
        <TextInput
          style={styles.formInput} value={payload.budget}
          onChangeText={(v) => replaceMessage(message.id, { ...message, payload: { ...payload, budget: v, validation: "" } })}
          placeholder={pack.mealboxForm.budgetPlaceholder} placeholderTextColor={COLORS.textFaint} keyboardType="numeric"
        />
        <Text style={styles.fieldLabel}>{pack.mealboxForm.mealLabel}</Text>
        <View style={styles.chipRow}>
          {["Breakfast", "Lunch", "Dinner", "Snacks"].map((meal) => {
            const selected = selectedMeals.includes(meal);
            return (
              <TouchableOpacity key={meal} style={[styles.chip, selected && styles.chipSelected]} onPress={() => toggleMeal(meal)} activeOpacity={0.85}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{meal}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!!payload.validation && <Text style={styles.formError}>{payload.validation}</Text>}
        <View style={styles.formActionsRow}>
          <TouchableOpacity style={styles.formCancelBtn} onPress={() => setMessages((current) => { const cleaned = current.filter((m) => m.id !== message.id); persistMessages(cleaned); return cleaned; })} activeOpacity={0.85}>
            <Text style={styles.formCancelText}>{pack.mealboxForm.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formPrimaryBtn} activeOpacity={0.85}
            onPress={() => {
              const budget = Number(String(payload.budget).trim());
              if (!Number.isFinite(budget) || budget <= 0) {
                replaceMessage(message.id, { ...message, payload: { ...payload, validation: pack.mealboxForm.validationBudget } });
                return;
              }
              if (selectedMeals.length === 0) {
                replaceMessage(message.id, { ...message, payload: { ...payload, validation: pack.mealboxForm.validationMeals } });
                return;
              }
              void runSearch({
                serviceType: "mealbox",
                budgetLimit: budget,
                mealBoxMeals: selectedMeals,
                originMessageId: message.id,
              });
            }}
          >
            <Text style={styles.formPrimaryText}>{pack.mealboxForm.findPlans}</Text>
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
        <Text style={styles.fieldLabel}>{pack.chefSearchForm.chefNameLabel}</Text>
        <TextInput
          style={styles.formInput} value={payload.chefName}
          onChangeText={(v) => replaceMessage(message.id, { ...message, payload: { ...payload, chefName: v, validation: "" } })}
          placeholder={pack.chefSearchForm.chefNamePlaceholder} placeholderTextColor={COLORS.textFaint}
        />
        {!!payload.validation && <Text style={styles.formError}>{payload.validation}</Text>}
        <View style={styles.formActionsRow}>
          <TouchableOpacity style={styles.formCancelBtn} onPress={() => setMessages((current) => { const cleaned = current.filter((m) => m.id !== message.id); persistMessages(cleaned); return cleaned; })} activeOpacity={0.85}>
            <Text style={styles.formCancelText}>{pack.chefSearchForm.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formPrimaryBtn} activeOpacity={0.85}
            onPress={() => {
              const name = String(payload.chefName || "").trim();
              if (!name) {
                replaceMessage(message.id, { ...message, payload: { ...payload, validation: pack.chefSearchForm.validationName } });
                return;
              }
              void runSearch({
                serviceType: "catering",
                budgetLimit: Number.MAX_SAFE_INTEGER,
                guests: 1,
                chefNameFilter: name,
                originMessageId: message.id,
              });
            }}
          >
            <Text style={styles.formPrimaryText}>{pack.chefSearchForm.findChefs}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItemSearchForm = (message: AssistantMessage) => {
    const payload = message.payload || {};
    const serviceType: "homemade" | "quickbites" = payload.serviceType === "quickbites" ? "quickbites" : "homemade";
    const submitSearch = () => {
      const itemName = String(payload.itemName || "").trim();
      if (serviceType === "quickbites") {
        const budget = parseRupeeAmount(payload.budget);
        if (budget === null || budget <= 0) {
          replaceMessage(message.id, { ...message, payload: { ...payload, validation: "Please enter a valid Quick Bites budget, for example 250 or 250rs." } });
          return;
        }
        // Quick Bites searches all available items within the customer's budget.
        void runCategoryItemSearch(serviceType, "", message.id, budget);
        return;
      }
      if (!itemName) {
        replaceMessage(message.id, { ...message, payload: { ...payload, validation: "Please enter an item name." } });
        return;
      }
      void runCategoryItemSearch(serviceType, itemName, message.id);
    };

    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{message.text}</Text>
        {serviceType === "homemade" ? (
          <>
            <Text style={styles.fieldLabel}>Item name</Text>
            <TextInput
              style={styles.formInput}
              value={String(payload.itemName || "")}
              onChangeText={(value) => replaceMessage(message.id, { ...message, payload: { ...payload, itemName: value, validation: "" } })}
              placeholder="e.g. Mango Pickle, Gongura, Idli Podi"
              placeholderTextColor={COLORS.textFaint}
              returnKeyType="search"
              onSubmitEditing={submitSearch}
            />
          </>
        ) : null}
        {serviceType === "quickbites" ? (
          <>
            <Text style={styles.fieldLabel}>Your budget (₹)</Text>
            <TextInput
              style={styles.formInput}
              value={String(payload.budget || "")}
              onChangeText={(value) => replaceMessage(message.id, { ...message, payload: { ...payload, budget: value, validation: "" } })}
              placeholder="e.g. 250rs"
              placeholderTextColor={COLORS.textFaint}
              keyboardType="default"
              returnKeyType="search"
              onSubmitEditing={submitSearch}
            />
            <Text style={styles.formHint}>We’ll show available Quick Bites items priced at or below your budget.</Text>
          </>
        ) : null}
        {!!payload.validation && <Text style={styles.formError}>{payload.validation}</Text>}
        <View style={styles.formActionsRow}>
          <TouchableOpacity style={styles.formCancelBtn} onPress={() => setMessages((current) => { const next = current.filter((item) => item.id !== message.id); persistMessages(next); return next; })} activeOpacity={0.85}>
            <Text style={styles.formCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.formPrimaryBtn} activeOpacity={0.85} onPress={submitSearch} disabled={isSending}>
            {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.formPrimaryText}>Search items</Text>}
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
          <TouchableOpacity key={topic.key} style={styles.faqChip} onPress={() => handleFaqTopicTap(topic.key)} activeOpacity={0.85}>
            <Text style={styles.faqChipText}>{topic.label[language]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderResults = (message: AssistantMessage) => {
    const payload = message.payload || {};
    const results: ChefWithMenus[] = payload.results || [];
    const serviceType: AssistantSearchServiceType = payload.serviceType || "catering";

    return (
      <View style={styles.resultsWrap}>
        <View style={styles.assistantBubble}>
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
        {results.map(({ chef, menus }) => (
          <View key={getChefId(chef)} style={styles.chefResultCard}>
            <View style={styles.chefHeaderRow}>
              {getImageUri(chef.avatar) || getImageUri(chef.profileImage) || getImageUri(chef.image) || getImageUri(chef.coverImage) ? (
                <Image source={{ uri: getImageUri(chef.avatar) || getImageUri(chef.profileImage) || getImageUri(chef.image) || getImageUri(chef.coverImage) || "" }} style={styles.chefAvatar} />
              ) : (
                <View style={styles.chefAvatarFallback}><Text style={styles.avatarEmoji}>👨‍🍳</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.chefName}>{getChefName(chef)}</Text>
                {!!(chef.location || chef.address) && <Text style={styles.chefLocation} numberOfLines={1}>{String(chef.location || chef.address)}</Text>}
                <Text style={styles.chefCount}>{menus.length} {menus.length === 1 ? pack.results.chefsSingular : pack.results.chefsPlural}</Text>
              </View>
            </View>
            {menus.map((menu: any) => {
              const imageUri = getMenuImage(menu, chef);
              const price = getMenuPrice(menu);
              return (
                <TouchableOpacity key={String(menu._id || menu.id || getMenuName(menu))} style={styles.menuRow} activeOpacity={0.85} onPress={() => handleOpenMenu(chef, menu, serviceType)}>
                  {imageUri ? <Image source={{ uri: imageUri }} style={styles.menuImage} /> : <View style={styles.menuImageFallback}><Ionicons name="restaurant-outline" size={22} color={COLORS.primary} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuName} numberOfLines={2}>{getMenuName(menu)}</Text>
                    {!!menu.description && <Text style={styles.menuDesc} numberOfLines={2}>{String(menu.description)}</Text>}
                    {(serviceType === "homemade" || serviceType === "quickbites") && Array.isArray(menu.matchedItemNames) && menu.matchedItemNames.length > 0 ? (
                      <Text style={styles.menuDesc} numberOfLines={3}>
                        Items: {(menu.matchedItems || []).map((item: any) => `${item.name}${item.assistantDisplayPrice !== null && item.assistantDisplayPrice !== undefined ? ` (₹${Number(item.assistantDisplayPrice).toLocaleString("en-IN")})` : ""}`).join(", ")}
                      </Text>
                    ) : null}
                    <Text style={styles.menuPrice}>{(serviceType === "homemade" || serviceType === "quickbites") ? `${(menu.matchedItems || []).length} matching item(s)` : price === null ? pack.results.noPrice : `₹${price.toLocaleString("en-IN")}`}</Text>
                  </View>
                  <View style={styles.menuArrow}><Ionicons name="chevron-forward" size={18} color={COLORS.primary} /></View>
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
        <View style={styles.assistantBubble}><Text style={styles.messageText}>{message.text}</Text></View>
        {orders.map((order) => {
          const id = String(order.orderId || order._id || "");
          const status = String(order.orderStatus || order.status || order.order_state || "");
          const total = Number(order.totalAmount ?? order.totalPrice ?? order.grandTotal ?? order.amount ?? 0);
          const created = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
          return (
            <View key={id} style={styles.orderCard}>
              <View style={styles.orderHeaderRow}>
                <Text style={styles.orderId}>#{id}</Text>
                <Text style={styles.orderDate}>{created}</Text>
              </View>
              <View style={styles.orderMetaRow}><Text style={styles.orderMetaLabel}>{pack.orders.statusLabel}:</Text><Text style={styles.orderMetaValue}>{status || "—"}</Text></View>
              <View style={styles.orderMetaRow}><Text style={styles.orderMetaLabel}>{pack.orders.totalLabel}:</Text><Text style={styles.orderMetaValue}>₹{total.toLocaleString("en-IN")}</Text></View>
              {!!(order.chefName || order.serviceType || order.orderType) && <Text style={styles.orderChef} numberOfLines={1}>👨‍🍳 {String(order.chefName || order.serviceType || order.orderType)}</Text>}
            </View>
          );
        })}
      </View>
    );
  };

  const renderWelcomeScreen = () => (
    <ScrollView style={styles.welcomeScroll} contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.welcomeHero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <View style={styles.heroStatusDot} />
            <Text style={styles.heroBadgeText}>KATBOX AI ASSISTANT</Text>
          </View>
          <View style={styles.heroSparkle}><Ionicons name="sparkles" size={18} color="#D7F7DF" /></View>
        </View>
        <View style={styles.heroMainRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>YOUR FOOD COMPANION</Text>
            <Text style={styles.heroTitle}>{pack.introHeading}</Text>
            <Text style={styles.heroSubtitle}>{pack.introSubtitle}</Text>
          </View>
          <View style={styles.heroAvatar}>
            <Ionicons name="restaurant" size={25} color="#174B35" />
            <View style={styles.heroAvatarSparkle}><Ionicons name="sparkles" size={9} color="#174B35" /></View>
          </View>
        </View>
        <View style={styles.heroFooter}>
          <Ionicons name="flash-outline" size={15} color="#D7F7DF" />
          <Text style={styles.heroFooterText}>Ask anything about food, chefs, plans or orders</Text>
        </View>
      </View>

      <View style={styles.quickSectionHeader}>
        <View>
          <Text style={styles.quickSectionTitle}>{pack.hubTitle}</Text>
          <Text style={styles.quickSectionSubtitle}>{pack.hubSubtitle}</Text>
        </View>
        <View style={styles.quickSectionIcon}><Ionicons name="grid-outline" size={18} color={COLORS.primary} /></View>
      </View>

      <View style={styles.actionsGrid}>
        <TouchableOpacity style={[styles.actionTile, styles.actionTileFeatured]} activeOpacity={0.86} onPress={() => handleHubAction("catering")}>
          <View style={[styles.actionTileIcon, { backgroundColor: "#DDF2E3" }]}><Ionicons name="restaurant-outline" size={23} color="#205B3E" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.catering.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.catering.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color="#205B3E" /></View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionTile} activeOpacity={0.86} onPress={() => handleHubAction("mealbox")}>
          <View style={[styles.actionTileIcon, { backgroundColor: "#E7F0D9" }]}><Ionicons name="fast-food-outline" size={23} color="#55713B" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.mealbox.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.mealbox.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color={COLORS.primary} /></View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionTile} activeOpacity={0.86} onPress={() => handleHubAction("orders")}>
          <View style={[styles.actionTileIcon, { backgroundColor: "#E3ECF7" }]}><Ionicons name="receipt-outline" size={23} color="#456B91" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.orders.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.orders.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color={COLORS.primary} /></View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionTile} activeOpacity={0.86} onPress={() => handleHubAction("faq")}>
          <View style={[styles.actionTileIcon, { backgroundColor: "#F2EADB" }]}><Ionicons name="help-circle-outline" size={23} color="#98723D" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.faq.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.faq.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color={COLORS.primary} /></View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionTile, styles.actionTileWide]} activeOpacity={0.86} onPress={() => handleHubAction("chefSearch")}>
          <View style={[styles.actionTileIcon, styles.actionTileWideIcon, { backgroundColor: "#F0E6F4" }]}><Ionicons name="person-circle-outline" size={23} color="#80548C" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.chefSearch.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.chefSearch.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color={COLORS.primary} /></View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionTile} activeOpacity={0.86} onPress={() => handleHubAction("pickles")}>
          <View style={[styles.actionTileIcon, { backgroundColor: "#F4EBDD" }]}><Ionicons name="leaf-outline" size={23} color="#9A6330" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.pickles.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.pickles.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color={COLORS.primary} /></View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionTile} activeOpacity={0.86} onPress={() => handleHubAction("quickBites")}>
          <View style={[styles.actionTileIcon, { backgroundColor: "#FFF0DB" }]}><Ionicons name="flash-outline" size={23} color="#A56A20" /></View>
          <View style={styles.actionTileTextWrap}><Text style={styles.actionTileTitle}>{pack.hubActions.quickBites.label}</Text><Text style={styles.actionTileSubtitle}>{pack.hubActions.quickBites.description}</Text></View>
          <View style={styles.actionTileArrow}><Ionicons name="arrow-forward" size={14} color={COLORS.primary} /></View>
        </TouchableOpacity>
      </View>

      <View style={styles.tipCard}>
        <View style={styles.tipIcon}><Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.primary} /></View>
        <View style={styles.tipTextWrap}>
          <Text style={styles.tipTitle}>Prefer typing?</Text>
          <Text style={styles.tipDescription}>Ask your question below in English, తెలుగు or हिंदी.</Text>
        </View>
        <Ionicons name="arrow-down" size={18} color={COLORS.primary} />
      </View>
    </ScrollView>
  );

  const renderChatStream = () => (
    <View style={styles.chatBackground}>
      <View pointerEvents="none" style={styles.chatDoodles}>
        <Text style={[styles.chatDoodle, { top: 18, left: 18, transform: [{ rotate: "-18deg" }] }]}>🥬</Text>
        <Text style={[styles.chatDoodle, { top: 76, right: 26, transform: [{ rotate: "16deg" }] }]}>🍋</Text>
        <Text style={[styles.chatDoodle, { top: 158, left: 38, transform: [{ rotate: "-12deg" }] }]}>🥕</Text>
        <Text style={[styles.chatDoodle, { top: 232, right: 18, transform: [{ rotate: "22deg" }] }]}>🍅</Text>
        <Text style={[styles.chatDoodle, { top: 312, left: 12, transform: [{ rotate: "14deg" }] }]}>🥑</Text>
        <Text style={[styles.chatDoodle, { top: 394, right: 40, transform: [{ rotate: "-20deg" }] }]}>🍲</Text>
        <Text style={[styles.chatDoodle, { top: 474, left: 28, transform: [{ rotate: "18deg" }] }]}>🌶️</Text>
        <Text style={[styles.chatDoodle, { top: 550, right: 14, transform: [{ rotate: "-12deg" }] }]}>🥦</Text>
        <Text style={[styles.chatDoodle, { top: 630, left: 42, transform: [{ rotate: "-16deg" }] }]}>🍚</Text>
        <Text style={[styles.chatDoodle, { top: 706, right: 30, transform: [{ rotate: "12deg" }] }]}>🥗</Text>
        <Text style={[styles.chatDoodle, { top: 784, left: 12, transform: [{ rotate: "-10deg" }] }]}>🫑</Text>
        <Text style={[styles.chatDoodle, { top: 866, right: 42, transform: [{ rotate: "18deg" }] }]}>🍃</Text>
      </View>
      <ScrollView ref={scrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.filter((m) => m.id !== "welcome").map(renderBubble)}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: showChat ? COLORS.primary : COLORS.surface }]}>
      <StatusBar barStyle={showChat ? "light-content" : "dark-content"} backgroundColor={showChat ? COLORS.primary : COLORS.surface} />
      <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.header, showChat && styles.chatHeader]}>
          <TouchableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.headerIconBtn} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={26} color={showChat ? COLORS.surface : COLORS.text} />
          </TouchableOpacity>
          {showChat && <View style={styles.headerBotAvatar}><Ionicons name="restaurant" size={21} color={COLORS.primary} /></View>}
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, showChat && styles.chatHeaderTitle]}>{pack.headerTitle}</Text>
            {showChat && <Text style={styles.headerSubtitle}>Your food companion</Text>}
          </View>
          <TouchableOpacity accessibilityLabel="More options" onPress={openHistory} style={styles.headerIconBtn} activeOpacity={0.75}>
            <Ionicons name="ellipsis-vertical" size={22} color={showChat ? COLORS.surface : COLORS.text} />
          </TouchableOpacity>
        </View>

        {!showChat ? renderWelcomeScreen() : renderChatStream()}

        <View style={styles.composerContainer}>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder={pack.composerPlaceholder} placeholderTextColor={COLORS.textFaint} multiline maxLength={500} editable={!isSending} onSubmitEditing={handleSend} />
            <TouchableOpacity style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]} onPress={handleSend} disabled={!input.trim() || isSending} activeOpacity={0.85} accessibilityLabel="Send message">
              {isSending ? <ActivityIndicator size="small" color={COLORS.surface} /> : <Ionicons name="send" size={18} color={COLORS.surface} />}
            </TouchableOpacity>
          </View>
          <View style={styles.languageRow}>
            {(["English", "తెలుగు", "हिंदी"] as AssistantLanguage[]).map((lang) => {
              const selected = language === lang;
              return (
                <TouchableOpacity key={lang} onPress={() => handleLanguageChange(lang)} style={[styles.languagePill, selected && styles.languagePillSelected]} activeOpacity={0.85}>
                  <Text style={[styles.languagePillText, selected && styles.languagePillTextSelected]}>{lang}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* History Modal */}
      <Modal visible={showHistoryModal} transparent animationType="fade" onRequestClose={() => setShowHistoryModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowHistoryModal(false)}>
          <View style={styles.historyContainer}>
            <Text style={styles.historyTitle}>Chat History</Text>
            <Text style={styles.historySubtitle}>Chats auto-delete after 2 days.</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {historyItems.length === 0 ? (
                <Text style={styles.historyEmpty}>No past chats found.</Text>
              ) : (
                historyItems.map((item) => (
                  <TouchableOpacity key={item.sessionId} style={styles.historyItem} onPress={() => loadHistoryItem(item)}>
                    <Ionicons name="chatbubbles-outline" size={20} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyItemText} numberOfLines={1}>{item.previewText}</Text>
                      <Text style={styles.historyItemDate}>{new Date(item.updatedAt).toLocaleString()}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textFaint} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.surface },
  keyboardContainer: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  chatHeader: { minHeight: 66, paddingVertical: 9, backgroundColor: COLORS.primary, borderBottomWidth: 0 },
  headerIconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerBotAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", marginRight: 10 },
  headerTextWrap: { flex: 1, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, letterSpacing: 0.1 },
  chatHeaderTitle: { color: COLORS.surface, fontSize: 16, letterSpacing: 0 },
  headerSubtitle: { color: "#DCEDE1", fontSize: 11.5, marginTop: 2, fontWeight: "500" },
  
  welcomeScroll: { flex: 1, backgroundColor: "#F3F7F2" },
  welcomeContent: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 14 },
  welcomeHero: { width: "100%", backgroundColor: "#174B35", borderRadius: 17, paddingHorizontal: 14, paddingVertical: 11, overflow: "hidden", shadowColor: "#123B2A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 7, elevation: 3 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  heroBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  heroStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8BE6A5", marginRight: 7 },
  heroBadgeText: { color: "#E7F7EC", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  heroSparkle: { width: 27, height: 27, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  heroMainRow: { flexDirection: "row", alignItems: "center" },
  heroCopy: { flex: 1, paddingRight: 7 },
  heroEyebrow: { color: "#A8DDB9", fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginBottom: 3 },
  heroTitle: { color: "#FFFFFF", fontSize: 17, lineHeight: 21, fontWeight: "900", letterSpacing: -0.35, marginBottom: 3 },
  heroSubtitle: { color: "#D3E9D9", fontSize: 10, lineHeight: 14 },
  heroAvatar: { width: 54, height: 54, borderRadius: 17, backgroundColor: "#DDF2E3", alignItems: "center", justifyContent: "center", marginLeft: 4, transform: [{ rotate: "3deg" }] },
  heroAvatarSparkle: { position: "absolute", right: -4, top: -4, width: 19, height: 19, borderRadius: 10, backgroundColor: "#A8E6B9", borderWidth: 1.5, borderColor: "#174B35", alignItems: "center", justifyContent: "center" },
  heroFooter: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.16)", marginTop: 8, paddingTop: 7 },
  heroFooterText: { color: "#D7F7DF", fontSize: 9.5, fontWeight: "600", marginLeft: 6, flex: 1 },
  quickSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 8 },
  quickSectionTitle: { color: COLORS.text, fontSize: 15.5, fontWeight: "900", letterSpacing: -0.3 },
  quickSectionSubtitle: { color: COLORS.textMuted, fontSize: 10.5, marginTop: 2 },
  quickSectionIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#E2F0E7", alignItems: "center", justifyContent: "center" },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 7 },
  actionTile: { width: "48.3%", minHeight: 104, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: "#E1EAE2", padding: 9, shadowColor: "#173528", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.035, shadowRadius: 3, elevation: 1 },
  actionTileFeatured: { borderColor: "#B8DCC3", backgroundColor: "#FCFFFC" },
  actionTileWide: { width: "100%", minHeight: 66, flexDirection: "row", alignItems: "center" },
  actionTileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 7 },
  actionTileTextWrap: { flex: 1 },
  actionTileTitle: { color: COLORS.text, fontSize: 12, fontWeight: "900", marginBottom: 2 },
  actionTileSubtitle: { color: COLORS.textMuted, fontSize: 9.5, lineHeight: 12 },
  actionTileArrow: { position: "absolute", right: 8, top: 8, width: 21, height: 21, borderRadius: 7, backgroundColor: "#F0F5F0", alignItems: "center", justifyContent: "center" },
  actionTileWideIcon: { marginBottom: 0 },
  tipCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#E8F1E9", borderRadius: 13, padding: 9, marginTop: 9, borderWidth: 1, borderColor: "#D6E6D9" },
  tipIcon: { width: 29, height: 29, borderRadius: 9, backgroundColor: "#D7EADB", alignItems: "center", justifyContent: "center", marginRight: 8 },
  tipTextWrap: { flex: 1 },
  tipTitle: { color: COLORS.text, fontSize: 11, fontWeight: "900" },
  tipDescription: { color: COLORS.textMuted, fontSize: 9.5, lineHeight: 13, marginTop: 2 },
  
  chatBackground: { flex: 1, backgroundColor: "#E4F2E7", overflow: "hidden" },
  chatDoodles: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  chatDoodle: { position: "absolute", fontSize: 23, color: "#477B58", opacity: 0.14 },
  chatScroll: { flex: 1, backgroundColor: "transparent", zIndex: 1 },
  chatContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 20 },
  messageRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  userMessageRow: { justifyContent: "flex-end" },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 8, marginTop: 2 },
  assistantBubbleWrap: { flex: 1, minWidth: 0 },
  messageBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  assistantBubble: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start", maxWidth: "100%" },
  userBubble: { backgroundColor: COLORS.userBubble, borderTopRightRadius: 4 },
  messageText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  userMessageText: { color: COLORS.userBubbleText, fontWeight: "600" },
  
  hubCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 6 },
  hubIntro: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginBottom: 4 },
  hubTitle: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  hubRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, marginBottom: 8, backgroundColor: COLORS.background },
  hubIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  hubRowLabel: { color: COLORS.text, fontSize: 14.5, fontWeight: "800" },
  hubRowDesc: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  
  formCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 6 },
  formTitle: { color: COLORS.text, fontSize: 15.5, fontWeight: "800", marginBottom: 12 },
  fieldLabel: { color: COLORS.text, fontSize: 13, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  formInput: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, paddingHorizontal: 14, color: COLORS.text, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  chipSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  chipText: { color: COLORS.textMuted, fontSize: 12.5, fontWeight: "700" },
  chipTextSelected: { color: COLORS.primary, fontWeight: "800" },
  formHint: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 2 },
  formError: { color: COLORS.danger, fontSize: 12, marginTop: 8 },
  formActionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  formCancelBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  formCancelText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "700" },
  formPrimaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  formPrimaryText: { color: COLORS.surface, fontSize: 13.5, fontWeight: "800" },
  
  faqCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 6 },
  faqSubtitle: { color: COLORS.textMuted, fontSize: 13, marginBottom: 12 },
  faqTopicsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  faqChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  faqChipText: { color: COLORS.text, fontSize: 12.5, fontWeight: "700" },
  
  resultsWrap: { marginBottom: 6 },
  chefResultCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 14, marginTop: 10 },
  chefHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  chefAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.background, marginRight: 12 },
  chefAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarEmoji: { fontSize: 24 },
  chefName: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  chefLocation: { color: COLORS.textMuted, fontSize: 11.5, marginTop: 2 },
  chefCount: { color: COLORS.primary, fontSize: 11.5, fontWeight: "700", marginTop: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 12 },
  menuImage: { width: 68, height: 68, borderRadius: 12, backgroundColor: COLORS.background },
  menuImageFallback: { width: 68, height: 68, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: "center", justifyContent: "center" },
  menuName: { color: COLORS.text, fontSize: 13.5, fontWeight: "800", lineHeight: 18 },
  menuDesc: { color: COLORS.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  menuPrice: { color: COLORS.primary, fontSize: 13.5, fontWeight: "900", marginTop: 6 },
  menuArrow: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.primarySoft, alignItems: "center", justifyContent: "center" },
  
  ordersWrap: { marginBottom: 6 },
  orderCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginTop: 10 },
  orderHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  orderId: { color: COLORS.text, fontSize: 13.5, fontWeight: "900" },
  orderDate: { color: COLORS.textMuted, fontSize: 11.5 },
  orderMetaRow: { flexDirection: "row", marginTop: 4 },
  orderMetaLabel: { color: COLORS.textMuted, fontSize: 12.5, marginRight: 6 },
  orderMetaValue: { color: COLORS.text, fontSize: 12.5, fontWeight: "700" },
  orderChef: { color: COLORS.primary, fontSize: 12, marginTop: 8 },
  
  composerContainer: { flexShrink: 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 8 : 8, backgroundColor: "#F8FBF7", borderTopWidth: 1, borderTopColor: "#CFE0D2" },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: 26, borderWidth: 1, borderColor: "#CFE0D2", paddingLeft: 16, paddingRight: 6, minHeight: 50 },
  input: { flex: 1, color: COLORS.text, fontSize: 14.5, paddingVertical: 10, paddingHorizontal: 0, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  sendBtnDisabled: { opacity: 0.45 },
  languageRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 8 },
  languagePill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  languagePillSelected: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  languagePillText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },
  languagePillTextSelected: { color: COLORS.primary, fontWeight: "800" },
  
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  historyContainer: { width: "80%", backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 },
  historyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  historySubtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
  historyEmpty: { fontSize: 14, color: COLORS.textMuted, textAlign: "center", padding: 20 },
  historyItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyItemText: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  historyItemDate: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});