// src/lib/assistantTypes.ts
//
// Shared type definitions for the KatBox Assistant chat experience.
// These types back both the client screen and the backend persistence
// layer. Older messages stored with only { id, text, sender, createdAt }
// remain fully valid — `kind` defaults to 'text' and `payload` is optional.

export type AssistantSender = "user" | "assistant";

export type AssistantLanguage = "English" | "తెలుగు" | "हिंदी";

export type ServiceType = "catering" | "mealbox";

/**
 * The kind of bubble rendered in the chat stream.
 *
 *   • "text"           → plain text bubble (default)
 *   • "hub"            → the persistent 5-action card
 *                        (Catering / Meal Boxes / My Orders / Help & FAQs / Find a Chef)
 *   • "catering_form"  → inline budget / guests / meal form
 *   • "mealbox_form"   → inline budget / meal chips form
 *   • "chef_search"    → inline chef-name search form
 *   • "faq_topics"     → inline FAQ topic chips
 *   • "faq_answer"     → inline FAQ answer bubble (has .payload.answer)
 *   • "results"        → inline results list (has .payload.results)
 *   • "orders"         → inline orders list (has .payload.orders)
 *   • "error"          → inline error bubble (has .payload.message)
 */
export type AssistantMessageKind =
  | "text"
  | "hub"
  | "catering_form"
  | "mealbox_form"
  | "chef_search"
  | "faq_topics"
  | "faq_answer"
  | "results"
  | "orders"
  | "error";

export interface AssistantMessage {
  id: string;
  text: string;
  sender: AssistantSender;
  kind?: AssistantMessageKind;
  payload?: any;
  createdAt?: string | Date;
}

export interface CateringPreferences {
  budget: string;
  guests: string;
  meal: "Breakfast" | "Lunch" | "Dinner";
}

export interface MealBoxPreferences {
  budget: string;
  meals: string[]; // subset of ['Breakfast','Lunch','Dinner','Snacks']
}

export interface ChefSearchPreferences {
  chefName: string;
}

/**
 * Shared result shape for both catering and mealbox matches.
 * Mirrors the fields the existing `handleOpenMenu` navigation expects.
 */
export interface ChefWithMenus {
  chef: any; // ChefRecord from your backend
  menus: any[]; // MenuRecord from your backend
}