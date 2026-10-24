// src/lib/assistantFaq.ts
//
// Verified FAQ knowledge base for the KatBox Assistant.
// Every answer below is grounded in either:
//   1. The actual backend behaviour in orders.controller.ts
//   2. The public legal pages at katbox.in/privacy-policy,
//      katbox.in/terms-and-conditions,
//      katbox.in/refund-cancellation-policy,
//      katbox.in/chef-partner-agreement
//   3. Confirmed operational facts from the KatBox home screen.
//
// Nothing here is invented. If a topic is not covered, the assistant
// falls back to the §10 fallback message which directs the customer to
// the appropriate support channel — never fabricating policy.

import type { AssistantLanguage } from "./assistantTypes";

export type FaqTopicKey =
  | "how_it_works"
  | "payments"
  | "delivery"
  | "cancellation"
  | "refund"
  | "order_status"
  | "food_safety"
  | "chef_commission"
  | "catering"
  | "meal_boxes"
  | "support";

export interface FaqTopic {
  key: FaqTopicKey;
  /** Short chip label shown in the FAQ topics card */
  label: Record<AssistantLanguage, string>;
  /** Full answer text */
  answer: Record<AssistantLanguage, string>;
}

export const SUPPORT_EMAIL = "katbox.in@gmail.com";
export const SUPPORT_PHONE = "+91 9133450555";

export const LEGAL_LINKS = {
  privacy: "https://katbox.in/privacy-policy",
  terms: "https://katbox.in/terms-and-conditions",
  refund: "https://katbox.in/refund-cancellation-policy",
  chefPartner: "https://katbox.in/chef-partner-agreement",
} as const;

export const FAQ_TOPICS: FaqTopic[] = [
  {
    key: "how_it_works",
    label: {
      English: "How KatBox works",
      తెలుగు: "KatBox ఎలా పనిచేస్తుంది",
      हिंदी: "KatBox कैसे काम करता है",
    },
    answer: {
      English:
        "KatBox is a marketplace that connects you with independent home chefs. You can:\n\n• Explore catering platters (per-plate pricing, guest count, chef selection)\n• Explore meal-box plans (weekly, flexible-day, or single-meal)\n• Place orders, track them, and view order history\n\nKatBox itself does not prepare the food — the chef you choose is responsible for the meal. KatBox handles discovery, ordering, and support.\n\nFull terms: " +
        LEGAL_LINKS.terms,
      తెలుగు:
        "KatBox ఒక మార్కెట్‌ప్లేస్, ఇది మిమ్మల్ని స్వతంత్ర హోమ్ చెఫ్‌లతో కలుపుతుంది. మీరు:\n\n• క్యాటరింగ్ ప్లాటర్లు అన్వేషించవచ్చు (ప్లేట్ ధర, అతిథుల సంఖ్య, చెఫ్ ఎంపిక)\n• మీల్-బాక్స్ ప్లాన్‌లు అన్వేషించవచ్చు (వారంత, ఫ్లెక్సిబుల్-డే, లేదా సింగిల్-మీల్)\n• ఆర్డర్ చేయవచ్చు, ట్రాక్ చేయవచ్చు, ఆర్డర్ హిస్టరీ చూడవచ్చు\n\nKatBox స్వయంగా ఆహారం తయారు చేయదు — మీరు ఎంచుకున్న చెఫ్ భోజనానికి బాధ్యుడు. KatBox డిస్కవరీ, ఆర్డరింగ్ మరియు సపోర్ట్ నిర్వహిస్తుంది.\n\nపూర్తి నిబంధనలు: " +
        LEGAL_LINKS.terms,
      हिंदी:
        "KatBox एक मार्केटप्लेस है जो आपको स्वतंत्र होम शेफ से जोड़ता है। आप:\n\n• कैटरिंग प्लैटर देख सकते हैं (प्रति-प्लेट मूल्य, मेहमानों की संख्या, शेफ चयन)\n• मील-बॉक्स प्लान देख सकते हैं (साप्ताहिक, लचीले-दिन, या सिंगल-मील)\n• ऑर्डर कर सकते हैं, ट्रैक कर सकते हैं, और ऑर्डर इतिहास देख सकते हैं\n\nKatBox स्वयं भोजन नहीं बनाता — आपके द्वारा चुना गया शेफ भोजन के लिए ज़िम्मेदार है। KatBox खोज, ऑर्डरिंग और सहायता संभालता है।\n\nपूरी शर्तें: " +
        LEGAL_LINKS.terms,
    },
  },
  {
    key: "payments",
    label: {
      English: "Payment methods",
      తెలుగు: "చెల్లింపు పద్ధతులు",
      हिंदी: "भुगतान के तरीके",
    },
    answer: {
      English:
        "During KatBox's current testing phase, customers pay via UPI and submit the UTR/reference number for manual admin verification. Your order stays in 'Verification Pending' until an admin verifies the payment.\n\nKatBox will never ask you for your UPI PIN, card CVV, banking password, or OTP. Please do not share these with anyone.\n\nFull details: " +
        LEGAL_LINKS.privacy,
      తెలుగు:
        "KatBox ప్రస్తుత పరీక్ష దశలో, కస్టమర్లు UPI ద్వారా చెల్లించి, మాన్యువల్ అడ్మిన్ ధృవీకరణ కోసం UTR/రెఫరెన్స్ నంబర్ సమర్పిస్తారు. అడ్మిన్ చెల్లింపును ధృవీకరించే వరకు మీ ఆర్డర్ 'ధృవీకరణ పెండింగ్'లో ఉంటుంది.\n\nKatBox మీ UPI PIN, కార్డ్ CVV, బ్యాంకింగ్ పాస్‌వర్డ్ లేదా OTP ఎప్పుడూ అడగదు. దయచేసి ఎవరితోనూ పంచుకోవద్దు.\n\nపూర్తి వివరాలు: " +
        LEGAL_LINKS.privacy,
      हिंदी:
        "KatBox के वर्तमान परीक्षण चरण के दौरान, ग्राहक UPI से भुगतान करते हैं और मैन्युअल एडमिन सत्यापन के लिए UTR/संदर्भ संख्या जमा करते हैं। जब तक एडमिन भुगतान सत्यापित नहीं करता, आपका ऑर्डर 'सत्यापन लंबित' में रहता है।\n\nKatBox कभी भी आपका UPI PIN, कार्ड CVV, बैंकिंग पासवर्ड या OTP नहीं मांगेगा। कृपया इन्हें किसी के साथ साझा न करें।\n\nपूरी जानकारी: " +
        LEGAL_LINKS.privacy,
    },
  },
  {
    key: "delivery",
    label: {
      English: "Delivery info",
      తెలుగు: "డెలివరీ సమాచారం",
      हिंदी: "डिलीवरी जानकारी",
    },
    answer: {
      English:
        "KatBox currently serves a 10 km delivery radius from each chef's kitchen. Delivery fees are calculated per-kilometre at checkout: ₹40 for the first 5 km, then +₹10 for every additional kilometre (rounded up).\n\nQuick Bites orders target cooking and delivery within about 75 minutes, but actual times can vary with traffic, weather, and chef availability. Meal-box deliveries follow the schedule shown on each plan.\n\nFull details: " +
        LEGAL_LINKS.terms,
      తెలుగు:
        "KatBox ప్రస్తుతం ప్రతి చెఫ్ వంటగది నుండి 10 కిమీ డెలివరీ పరిధిని అందిస్తుంది. డెలివరీ రుసుము చెక్అవుట్‌లో కిలోమీటరుకు లెక్కించబడుతుంది: మొదటి 5 కిమీకి ₹40, ఆ తర్వాత ప్రతి అదనపు కిలోమీటరుకు +₹10 (పైకి రౌండ్ చేయబడింది).\n\nQuick Bites ఆర్డర్లు సుమారు 75 నిమిషాలలో వంట మరియు డెలివరీ లక్ష్యంగా ఉంటాయి, కానీ ట్రాఫిక్, వాతావరణం మరియు చెఫ్ లభ్యతతో వాస్తవ సమయాలు మారవచ్చు. మీల్-బాక్స్ డెలివరీలు ప్రతి ప్లాన్‌లో చూపిన షెడ్యూల్‌ను అనుసరిస్తాయి.\n\nపూర్తి వివరాలు: " +
        LEGAL_LINKS.terms,
      हिंदी:
        "KatBox वर्तमान में प्रत्येक शेफ की रसोई से 10 किमी डिलीवरी त्रिज्या प्रदान करता है। डिलीवरी शुल्क चेकआउट पर प्रति-किलोमीटर गणना किया जाता है: पहले 5 किमी के लिए ₹40, फिर प्रत्येक अतिरिक्त किलोमीटर के लिए +₹10 (ऊपर की ओर पूर्णांकित)।\n\nQuick Bites ऑर्डर लगभग 75 मिनट में खाना पकाने और डिलीवरी का लक्ष्य रखते हैं, लेकिन वास्तविक समय ट्रैफ़िक, मौसम और शेफ उपलब्धता के साथ बदल सकता है। मील-बॉक्स डिलीवरी प्रत्येक प्लान में दिखाए गए शेड्यूल का पालन करती हैं।\n\nपूरी जानकारी: " +
        LEGAL_LINKS.terms,
    },
  },
  {
    key: "cancellation",
    label: {
      English: "Cancellation policy",
      తెలుగు: "రద్దు విధానం",
      हिंदी: "रद्दीकरण नीति",
    },
    answer: {
      English:
        "You can cancel for a full refund if the chef has not yet accepted your order. After chef acceptance but before preparation begins, cancellation may still be accepted under the applicable workflow.\n\nOnce food preparation has started, cancellation generally does not qualify for a refund because perishable ingredients and labour have already been committed.\n\nFull policy: " +
        LEGAL_LINKS.refund,
      తెలుగు:
        "చెఫ్ మీ ఆర్డర్‌ను ఇంకా అంగీకరించకపోతే మీరు పూర్తి రీఫండ్ కోసం రద్దు చేయవచ్చు. చెఫ్ అంగీకరించిన తర్వాత కానీ తయారీ ప్రారంభం కాకముందు, వర్తించే వర్క్‌ఫ్లో కింద రద్దు ఇప్పటికీ అంగీకరించబడవచ్చు.\n\nఆహార తయారీ ప్రారంభమైన తర్వాత, పాడైపోయే పదార్థాలు మరియు శ్రమ ఇప్పటికే నిబద్ధతలో ఉన్నందున రద్దు సాధారణంగా రీఫండ్‌కు అర్హత పొందదు.\n\nపూర్తి విధానం: " +
        LEGAL_LINKS.refund,
      हिंदी:
        "यदि शेफ ने अभी तक आपका ऑर्डर स्वीकार नहीं किया है तो आप पूर्ण रिफंड के लिए रद्द कर सकते हैं। शेफ स्वीकृति के बाद लेकिन तैयारी शुरू होने से पहले, लागू वर्कफ़्लो के तहत रद्दीकरण अभी भी स्वीकार किया जा सकता है।\n\nएक बार खाना पकाना शुरू हो जाने के बाद, रद्दीकरण आमतौर पर रिफंड के लिए योग्य नहीं होता क्योंकि खराब होने वाली सामग्री और श्रम पहले ही प्रतिबद्ध हो चुके होते हैं।\n\nपूरी नीति: " +
        LEGAL_LINKS.refund,
    },
  },
  {
    key: "refund",
    label: {
      English: "Refund process",
      తెలుగు: "రీఫండ్ ప్రక్రియ",
      हिंदी: "रिफंड प्रक्रिया",
    },
    answer: {
      English:
        "Approved refunds are initiated through the original payment route where possible. Banking and payment-provider processing times are outside KatBox's direct control.\n\nIf a chef cancels an accepted order, or KatBox cannot arrange delivery, you will generally receive a full refund of the eligible amount paid.\n\nTo request a refund or complaint, email " +
        SUPPORT_EMAIL +
        " with your order ID, registered mobile number, the issue, and photographs/video evidence where relevant. Or call " +
        SUPPORT_PHONE +
        ".\n\nFull policy: " +
        LEGAL_LINKS.refund,
      తెలుగు:
        "ఆమోదించబడిన రీఫండ్‌లు సాధ్యమైనప్పుడు అసలు చెల్లింపు మార్గం ద్వారా ప్రారంభించబడతాయి. బ్యాంకింగ్ మరియు చెల్లింపు ప్రదాత ప్రాసెసింగ్ సమయాలు KatBox యొక్క ప్రత్యక్ష నియంత్రణలో లేవు.\n\nచెఫ్ అంగీకరించిన ఆర్డర్‌ను రద్దు చేస్తే, లేదా KatBox డెలివరీని ఏర్పాటు చేయలేకపోతే, మీరు సాధారణంగా చెల్లించిన అర్హమైన మొత్తానికి పూర్తి రీఫండ్ పొందుతారు.\n\nరీఫండ్ లేదా ఫిర్యాదు అభ్యర్థించడానికి, మీ ఆర్డర్ ID, నమోదిత మొబైల్ నంబర్, సమస్య మరియు సంబంధిత ఫోటోలు/వీడియో ఆధారాలతో " +
        SUPPORT_EMAIL +
        " కు ఇమెయిల్ చేయండి. లేదా " +
        SUPPORT_PHONE +
        " కు కాల్ చేయండి.\n\nపూర్తి విధానం: " +
        LEGAL_LINKS.refund,
      हिंदी:
        "स्वीकृत रिफंड जहाँ संभव हो मूल भुगतान मार्ग के माध्यम से शुरू किए जाते हैं। बैंकिंग और भुगतान-प्रदाता प्रसंस्करण समय KatBox के सीधे नियंत्रण से बाहर हैं।\n\nयदि शेफ स्वीकृत ऑर्डर रद्द करता है, या KatBox डिलीवरी की व्यवस्था नहीं कर सकता, तो आपको आमतौर पर भुगतान की गई पात्र राशि का पूर्ण रिफंड मिलेगा।\n\nरिफंड या शिकायत का अनुरोध करने के लिए, अपने ऑर्डर ID, पंजीकृत मोबाइल नंबर, समस्या, और प्रासंगिक फ़ोटो/वीडियो साक्ष्य के साथ " +
        SUPPORT_EMAIL +
        " पर ईमेल करें। या " +
        SUPPORT_PHONE +
        " पर कॉल करें।\n\nपूरी नीति: " +
        LEGAL_LINKS.refund,
    },
  },
  {
    key: "order_status",
    label: {
      English: "Track my order",
      తెలుగు: "నా ఆర్డర్ ట్రాక్ చేయండి",
      हिंदी: "मेरा ऑर्डर ट्रैक करें",
    },
    answer: {
      English:
        "You can check your recent orders any time by tapping 'My Orders' in the action card, or by asking me 'show my recent orders'.\n\nOrder statuses you may see:\n• Placed — waiting for admin verification\n• Accepted — chef has accepted\n• Preparing — food is being cooked\n• Out for Delivery — on its way\n• Delivered — completed\n• Cancelled — with refund status if applicable\n\nYou'll also receive push notifications on every status change.",
      తెలుగు:
        "మీరు ఎప్పుడైనా యాక్షన్ కార్డ్‌లో 'నా ఆర్డర్లు' నొక్కి లేదా 'నా ఇటీవలి ఆర్డర్లు చూపించు' అని అడగడం ద్వారా మీ ఇటీవలి ఆర్డర్‌లను తనిఖీ చేయవచ్చు.\n\nమీరు చూడగల ఆర్డర్ స్థితులు:\n• ప్లేస్డ్ — అడ్మిన్ ధృవీకరణ కోసం వేచి ఉంది\n• అంగీకరించబడింది — చెఫ్ అంగీకరించారు\n• సిద్ధమవుతోంది — ఆహారం వండుతున్నారు\n• డెలివరీకి బయలుదేరింది — దారిలో ఉంది\n• డెలివరీ చేయబడింది — పూర్తయింది\n• రద్దు చేయబడింది — వర్తిస్తే రీఫండ్ స్థితితో\n\nప్రతి స్థితి మార్పుపై మీకు పుష్ నోటిఫికేషన్‌లు కూడా అందుతాయి.",
      हिंदी:
        "आप कभी भी एक्शन कार्ड में 'मेरे ऑर्डर' टैप करके या मुझसे 'मेरे हाल के ऑर्डर दिखाओ' कहकर अपने हाल के ऑर्डर देख सकते हैं।\n\nआपको दिख सकने वाली ऑर्डर स्थितियाँ:\n• Placed — एडमिन सत्यापन की प्रतीक्षा\n• Accepted — शेफ ने स्वीकार किया\n• Preparing — खाना पक रहा है\n• Out for Delivery — रास्ते में\n• Delivered — पूर्ण\n• Cancelled — लागू होने पर रिफंड स्थिति के साथ\n\nहर स्थिति परिवर्तन पर आपको पुश सूचनाएँ भी मिलेंगी।",
    },
  },
  {
    key: "food_safety",
    label: {
      English: "Food safety",
      తెలుగు: "ఆహార భద్రత",
      हिंदी: "खाद्य सुरक्षा",
    },
    answer: {
      English:
        "If you believe food is unsafe, contaminated, or has caused an adverse reaction, stop consuming it and contact KatBox immediately at " +
        SUPPORT_EMAIL +
        " or " +
        SUPPORT_PHONE +
        ". Keep the food, packaging, and labels where reasonably possible.\n\nKatBox may request evidence, temporarily suspend the chef, take the listing offline, investigate, request FSSAI documentation, and escalate to relevant authorities where appropriate.\n\nFull policy: " +
        LEGAL_LINKS.refund,
      తెలుగు:
        "ఆహారం సురక్షితం కాదని, కలుషితమైందని లేదా ప్రతికూల ప్రతిచర్యకు కారణమైందని మీరు భావిస్తే, తినడం ఆపివేసి వెంటనే KatBox ను " +
        SUPPORT_EMAIL +
        " లేదా " +
        SUPPORT_PHONE +
        " వద్ద సంప్రదించండి. సాధ్యమైనప్పుడు ఆహారం, ప్యాకేజింగ్ మరియు లేబుళ్లను ఉంచండి.\n\nKatBox ఆధారాలను అభ్యర్థించవచ్చు, చెఫ్‌ను తాత్కాలికంగా సస్పెండ్ చేయవచ్చు, లిస్టింగ్‌ను ఆఫ్‌లైన్ చేయవచ్చు, దర్యాప్తు చేయవచ్చు, FSSAI పత్రాలను అభ్యర్థించవచ్చు మరియు తగిన చోట సంబంధిత అధికారులకు ఎస్కలేట్ చేయవచ్చు.\n\nపూర్తి విధానం: " +
        LEGAL_LINKS.refund,
      हिंदी:
        "यदि आपको लगता है कि भोजन असुरक्षित है, दूषित है, या प्रतिकूल प्रतिक्रिया का कारण बना है, तो इसे खाना बंद करें और तुरंत KatBox से " +
        SUPPORT_EMAIL +
        " या " +
        SUPPORT_PHONE +
        " पर संपर्क करें। जहाँ संभव हो भोजन, पैकेजिंग और लेबल रखें।\n\nKatBox साक्ष्य का अनुरोध कर सकता है, शेफ को अस्थायी रूप से निलंबित कर सकता है, लिस्टिंग ऑफ़लाइन कर सकता है, जाँच कर सकता है, FSSAI दस्तावेज़ का अनुरोध कर सकता है, और उचित होने पर संबंधित अधिकारियों को एस्केलेट कर सकता है।\n\nपूरी नीति: " +
        LEGAL_LINKS.refund,
    },
  },
  {
    key: "chef_commission",
    label: {
      English: "Chef commission",
      తెలుగు: "చెఫ్ కమిషన్",
      हिंदी: "शेफ कमीशन",
    },
    answer: {
      English:
        "New chefs enjoy commission-free orders: their first 3 orders are at 0% commission. After that, orders #4–#7 carry 18% commission, order #8 is free, orders #9–#12 are 18%, order #13 is free, and the pattern continues — every fifth order in the chef's sequence is commission-free, with 18% on the others.\n\nFull chef terms: " +
        LEGAL_LINKS.chefPartner,
      తెలుగు:
        "కొత్త చెఫ్‌లు కమిషన్-రహిత ఆర్డర్‌లను ఆస్వాదిస్తారు: వారి మొదటి 3 ఆర్డర్‌లు 0% కమిషన్‌తో. ఆ తర్వాత, ఆర్డర్‌లు #4–#7కి 18% కమిషన్, ఆర్డర్ #8 ఉచితం, ఆర్డర్‌లు #9–#12 18%, ఆర్డర్ #13 ఉచితం, మరియు నమూనా కొనసాగుతుంది — చెఫ్ క్రమంలో ప్రతి ఐదవ ఆర్డర్ కమిషన్-రహితం, మిగిలిన వాటిపై 18%.\n\nపూర్తి చెఫ్ నిబంధనలు: " +
        LEGAL_LINKS.chefPartner,
      हिंदी:
        "नए शेफ कमीशन-मुक्त ऑर्डर का आनंद लेते हैं: उनके पहले 3 ऑर्डर 0% कमीशन पर। उसके बाद, ऑर्डर #4–#7 पर 18% कमीशन, ऑर्डर #8 मुफ़्त, ऑर्डर #9–#12 पर 18%, ऑर्डर #13 मुफ़्त, और पैटर्न जारी रहता है — शेफ के अनुक्रम में हर पाँचवाँ ऑर्डर कमीशन-मुक्त, बाकी पर 18%.\n\nपूरी शेफ शर्तें: " +
        LEGAL_LINKS.chefPartner,
    },
  },
  {
    key: "catering",
    label: {
      English: "Catering",
      తెలుగు: "క్యాటరింగ్",
      हिंदी: "कैटरिंग",
    },
    answer: {
      English:
        "Catering platters are priced per plate and can be customized by course (starters, mains, etc.). To explore:\n\n1. Tap 'Catering' in the action card\n2. Enter your total budget, guest count, and preferred meal\n3. I'll show matching platters from verified chefs\n\nCatering bookings require advance confirmation and have specific cancellation terms. Details are shown at checkout before payment.\n\nFull terms: " +
        LEGAL_LINKS.terms,
      తెలుగు:
        "క్యాటరింగ్ ప్లాటర్లు ప్లేట్‌కు ధర మరియు కోర్సు ద్వారా (స్టార్టర్స్, మెయిన్స్ మొదలైనవి) అనుకూలీకరించవచ్చు. అన్వేషించడానికి:\n\n1. యాక్షన్ కార్డ్‌లో 'క్యాటరింగ్' నొక్కండి\n2. మీ మొత్తం బడ్జెట్, అతిథుల సంఖ్య మరియు ఇష్టపడే భోజనాన్ని నమోదు చేయండి\n3. ధృవీకరించబడిన చెఫ్‌ల నుండి సరిపోలే ప్లాటర్లను నేను చూపిస్తాను\n\nక్యాటరింగ్ బుకింగ్‌లకు ముందస్తు నిర్ధారణ అవసరం మరియు నిర్దిష్ట రద్దు నిబంధనలు ఉంటాయి. చెల్లింపుకు ముందు చెక్అవుట్‌లో వివరాలు చూపబడతాయి.\n\nపూర్తి నిబంధనలు: " +
        LEGAL_LINKS.terms,
      हिंदी:
        "कैटरिंग प्लैटर प्रति प्लेट मूल्य पर हैं और कोर्स (स्टार्टर, मेन्स, आदि) के अनुसार अनुकूलित किए जा सकते हैं। खोजने के लिए:\n\n1. एक्शन कार्ड में 'कैटरिंग' टैप करें\n2. अपना कुल बजट, मेहमानों की संख्या, और पसंदीदा भोजन दर्ज करें\n3. मैं सत्यापित शेफ से मेल खाते प्लैटर दिखाऊंगा\n\nकैटरिंग बुकिंग के लिए अग्रिम पुष्टि आवश्यक है और विशिष्ट रद्दीकरण शर्तें हैं। भुगतान से पहले चेकआउट पर विवरण दिखाए जाते हैं।\n\nपूरी शर्तें: " +
        LEGAL_LINKS.terms,
    },
  },
  {
    key: "meal_boxes",
    label: {
      English: "Meal boxes",
      తెలుగు: "మీల్ బాక్స్‌లు",
      हिंदी: "मील बॉक्स",
    },
    answer: {
      English:
        "Meal-box plans may be weekly, flexible-day, or single-meal, depending on the chef. To explore:\n\n1. Tap 'Meal Boxes' in the action card\n2. Enter your budget and choose your meal preferences\n3. I'll show matching plans from verified chefs\n\nEach plan's specific schedule, price, and cancellation terms are shown at checkout before payment.\n\nFull terms: " +
        LEGAL_LINKS.terms,
      తెలుగు:
        "మీల్-బాక్స్ ప్లాన్‌లు చెఫ్‌ను బట్టి వారంత, ఫ్లెక్సిబుల్-డే, లేదా సింగిల్-మీల్ కావచ్చు. అన్వేషించడానికి:\n\n1. యాక్షన్ కార్డ్‌లో 'మీల్ బాక్స్‌లు' నొక్కండి\n2. మీ బడ్జెట్‌ను నమోదు చేసి మీ భోజన ప్రాధాన్యతలను ఎంచుకోండి\n3. ధృవీకరించబడిన చెఫ్‌ల నుండి సరిపోలే ప్లాన్‌లను నేను చూపిస్తాను\n\nప్రతి ప్లాన్ యొక్క నిర్దిష్ట షెడ్యూల్, ధర మరియు రద్దు నిబంధనలు చెల్లింపుకు ముందు చెక్అవుట్‌లో చూపబడతాయి.\n\nపూర్తి నిబంధనలు: " +
        LEGAL_LINKS.terms,
      हिंदी:
        "मील-बॉक्स प्लान शेफ के आधार पर साप्ताहिक, लचीले-दिन, या सिंगल-मील हो सकते हैं। खोजने के लिए:\n\n1. एक्शन कार्ड में 'मील बॉक्स' टैप करें\n2. अपना बजट दर्ज करें और अपनी भोजन प्राथमिकताएँ चुनें\n3. मैं सत्यापित शेफ से मेल खाते प्लान दिखाऊंगा\n\nप्रत्येक प्लान का विशिष्ट शेड्यूल, मूल्य और रद्दीकरण शर्तें भुगतान से पहले चेकआउट पर दिखाई जाती हैं।\n\nपूरी शर्तें: " +
        LEGAL_LINKS.terms,
    },
  },
  {
    key: "support",
    label: {
      English: "Contact support",
      తెలుగు: "సపోర్ట్‌ను సంప్రదించండి",
      हिंदी: "सहायता से संपर्क करें",
    },
    answer: {
      English:
        "Need help with an order, privacy request, grievance, or chef-partner question?\n\n📧 Email: " +
        SUPPORT_EMAIL +
        "\n📞 Phone: " +
        SUPPORT_PHONE +
        "\n\nKatBox is operated by KATBOX (Proprietor: Kunchala Sree Nithin), Hyderabad, Telangana.\n\nLegal pages:\n• Privacy: " +
        LEGAL_LINKS.privacy +
        "\n• Terms: " +
        LEGAL_LINKS.terms +
        "\n• Refund & Cancellation: " +
        LEGAL_LINKS.refund +
        "\n• Chef Partner Agreement: " +
        LEGAL_LINKS.chefPartner,
      తెలుగు:
        "ఆర్డర్, గోప్యతా అభ్యర్థన, ఫిర్యాదు లేదా చెఫ్-భాగస్వామి ప్రశ్నలో సహాయం కావాలా?\n\n📧 ఇమెయిల్: " +
        SUPPORT_EMAIL +
        "\n📞 ఫోన్: " +
        SUPPORT_PHONE +
        "\n\nKatBox ను KATBOX (ప్రొప్రైటర్: కుంచల శ్రీ నితిన్), హైదరాబాద్, తెలంగాణ నిర్వహిస్తుంది.\n\nచట్టపరమైన పేజీలు:\n• గోప్యత: " +
        LEGAL_LINKS.privacy +
        "\n• నిబంధనలు: " +
        LEGAL_LINKS.terms +
        "\n• రీఫండ్ & రద్దు: " +
        LEGAL_LINKS.refund +
        "\n• చెఫ్ భాగస్వామి ఒప్పందం: " +
        LEGAL_LINKS.chefPartner,
      हिंदी:
        "ऑर्डर, गोपनीयता अनुरोध, शिकायत, या शेफ-पार्टनर प्रश्न में सहायता चाहिए?\n\n📧 ईमेल: " +
        SUPPORT_EMAIL +
        "\n📞 फ़ोन: " +
        SUPPORT_PHONE +
        "\n\nKatBox को KATBOX (स्वामी: कुंचला श्री नितिन), हैदराबाद, तेलंगाना द्वारा संचालित किया जाता है।\n\nकानूनी पृष्ठ:\n• गोपनीयता: " +
        LEGAL_LINKS.privacy +
        "\n• शर्तें: " +
        LEGAL_LINKS.terms +
        "\n• रिफंड और रद्दीकरण: " +
        LEGAL_LINKS.refund +
        "\n• शेफ पार्टनर समझौता: " +
        LEGAL_LINKS.chefPartner,
    },
  },
];

/** Free-text matcher: returns the best FAQ topic for a user's message, or null. */
export const matchFaqTopic = (userText: string): FaqTopic | null => {
  const lower = userText.trim().toLowerCase();
  if (!lower) return null;

  const rules: Array<{ key: FaqTopicKey; patterns: RegExp }> = [
    { key: "how_it_works", patterns: /how.*work|what is katbox|about katbox|katbox ఎలా|katbox कैसे/ },
    { key: "payments", patterns: /pay|payment|upi|utr|card|cod|చెల్లింపు|भुगतान/ },
    { key: "delivery", patterns: /deliver|delivery|shipping|km|radius|డెలివరీ|डिलीवरी/ },
    { key: "cancellation", patterns: /cancel|రద్దు|रद्द/ },
    { key: "refund", patterns: /refund|money back|return|రీఫండ్|रिफंड/ },
    { key: "order_status", patterns: /order status|track|where.*order|ఆర్డర్ స్థితి|ऑर्डर स्थिति/ },
    { key: "food_safety", patterns: /food safety|unsafe|contaminat|allerg|ఆహార భద్రత|खाद्य सुरक्षा/ },
    { key: "chef_commission", patterns: /commission|chef.*earn|కమిషన్|कमीशन/ },
    { key: "catering", patterns: /cater|platter|క్యాటరింగ్|ప్లాటర్|कैटरिंग|प्लैटर/ },
    { key: "meal_boxes", patterns: /meal.*box|mealbox|meal plan|మీల్ బాక్స్|मील बॉक्स/ },
    { key: "support", patterns: /help|support|contact|email|phone|సహాయం|मदद/ },
  ];

  for (const rule of rules) {
    if (rule.patterns.test(lower)) {
      return FAQ_TOPICS.find((t) => t.key === rule.key) || null;
    }
  }
  return null;
};

export const getFaqByKey = (key: FaqTopicKey): FaqTopic | undefined =>
  FAQ_TOPICS.find((t) => t.key === key);