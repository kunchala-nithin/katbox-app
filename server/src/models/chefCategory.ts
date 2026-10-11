import mongoose, { Schema, Document } from "mongoose";

// ==========================================
// 1. CHEF CATEGORY SCHEMAS & INTERFACES
// ==========================================

// ✅ NEW: Combo sub-document — represents an "Add X + Y for ₹Z" offer
// (Swiggy-style "Frequently bought together / Add a combo" card).
// Stored per-item so it can be offered contextually for the dish it
// belongs to. The two source items are referenced by their name + image
// snapshot (denormalised) so the combo renders even if the source item
// is later edited or removed.
interface IComboSource {
  name: string;
  imageUrl: string;
  cloudinaryId: string;
  price: number;
  quantity: string;
}

interface IItemCombo {
  comboName: string;
  sourceItem: IComboSource;   // "Add this" (the anchor dish the combo is attached to)
  pairedItem: IComboSource;   // "with this" (the second item in the bundle)
  comboPrice: number;         // combined offer price (must be < source + paired)
  savings: number;            // derived: (sourcePrice + pairedPrice) - comboPrice
  isAvailable: boolean;
}

interface ICategoryItem {
  name: string;
  description?: string;
  imageUrl: string;
  cloudinaryId: string;
  price: number;
  quantity: string;
  isVeg: boolean;
  isAvailable: boolean;
  variants: Array<{
    quantity: string;
    price: number;
  }>;
  combos: IItemCombo[]; // ✅ NEW
}

interface ISubCategory {
  name: string;
  items: ICategoryItem[];
}

export interface IChefCategory extends Document {
  user: mongoose.Types.ObjectId;
  chef: mongoose.Types.ObjectId;
  name: string;
  heroImageUrl: string;
  heroCloudinaryId: string;
  subCategories: ISubCategory[];
}

// ✅ NEW: Combo source schema (used inside IItemCombo)
const ComboSourceSchema = new Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, default: "" },
  cloudinaryId: { type: String, default: "" },
  price: { type: Number, required: true },
  quantity: { type: String, default: "" },
}, { _id: false });

// ✅ NEW: Combo schema — a Swiggy-style "Add A + B for ₹C" offer.
const ItemComboSchema = new Schema({
  comboName: { type: String, default: "" },
  sourceItem: { type: ComboSourceSchema, required: true },
  pairedItem: { type: ComboSourceSchema, required: true },
  comboPrice: { type: Number, required: true },
  savings: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
}, { _id: false });

const CategoryItemSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: { type: String, required: true },
  cloudinaryId: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: String, required: true },
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  variants: [{
    quantity: String,
    price: Number
  }],
  combos: { type: [ItemComboSchema], default: [] }, // ✅ NEW
}, { _id: false });

const SubCategorySchema = new Schema({
  name: { type: String, required: true },
  items: { type: [CategoryItemSchema], default: [] }
}, { _id: false });

const ChefCategorySchema = new Schema<IChefCategory>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chef: { type: Schema.Types.ObjectId, ref: "Chef", required: true },
    name: { type: String, required: true },
    heroImageUrl: { type: String, required: true },
    heroCloudinaryId: { type: String, required: true },
    subCategories: { type: [SubCategorySchema], default: [] },
  },
  { timestamps: true }
);

// ==========================================
// 2. CHEF MENU (CATERING) SCHEMAS & INTERFACES
// ==========================================
interface IDaawathItem {
  name: string;
  imageUrl: string;
  cloudinaryId: string;
  price?: number;
  isAvailable: boolean;
}

const MenuPlateItemSchema = new Schema<IDaawathItem>(
  {
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    cloudinaryId: { type: String, required: true },
    price: { type: Number },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

interface IDaawathCategory {
  name: string;
  imageUrl: string;
  cloudinaryId: string;
  maxItems: number;
  items: IDaawathItem[];
}

// ✅ IMAGE FIELDS NO LONGER REQUIRED — category form now uses a numeric badge in the UI
const DaawathCategorySchema = new Schema<IDaawathCategory>(
  {
    name: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    cloudinaryId: { type: String, default: "" },
    maxItems: { type: Number, default: 1 },
    items: { type: [MenuPlateItemSchema], default: [] },
  },
  { _id: false }
);

export interface IChefMenu extends Document {
  user: mongoose.Types.ObjectId;
  chef: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  name: string;
  price: number;
  itemsPerPlate: number;
  mealType: string;
  heroImageUrl: string;
  heroCloudinaryId: string;
  plateItems: IDaawathItem[];
  daawathCategories: IDaawathCategory[];
  daawathAddons: IDaawathItem[];
  isNonVeg: boolean;
}

const ChefMenuSchema = new Schema<IChefMenu>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chef: {
      type: Schema.Types.ObjectId,
      ref: "Chef",
      required: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ChefCategory"
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    itemsPerPlate: { type: Number, required: true },
    mealType: { type: String, enum: ["Breakfast", "Lunch", "Dinner", "Snacks"], required: true },
    heroImageUrl: { type: String, required: true },
    heroCloudinaryId: { type: String, required: true },
    plateItems: { type: [MenuPlateItemSchema], default: [] },
    daawathCategories: { type: [DaawathCategorySchema], default: [] },
    daawathAddons: { type: [MenuPlateItemSchema], default: [] },
    isNonVeg: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ==========================================
// 3. CHEF MEAL PLAN SCHEMA
// ==========================================
interface IMealBoxItem {
  id: string;
  name: string;
  price?: number;
  image: string;
  cloudinaryId?: string;
  active: boolean;
  isAvailable: boolean;
}

const MealBoxItemSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number },
  image: { type: String, required: true },
  cloudinaryId: { type: String, default: "" },
  active: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true }
}, { _id: false });

const MealBoxSectionWrapperSchema = new Schema({
  items: { type: [MealBoxItemSchema], default: [] },
  maxItems: { type: Number, default: 1 }
}, { _id: false });

const DayMealBoxSchema = new Schema({
  Breakfast: { type: Map, of: MealBoxSectionWrapperSchema, default: {} },
  Lunch: { type: Map, of: MealBoxSectionWrapperSchema, default: {} },
  Dinner: { type: Map, of: MealBoxSectionWrapperSchema, default: {} },
  Snacks: { type: Map, of: MealBoxSectionWrapperSchema, default: {} }
}, { _id: false });

interface IChefPlan extends Document {
  user: mongoose.Types.ObjectId;
  chef: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  name: string;
  description: string;
  mealsPerDay: number;
  mealsPerWeek: number;
  price: number;
  category: string;
  heroImageUrl: string;
  cloudinaryId: string;
  mealBoxData?: any;
}

const ChefPlanSchema = new Schema<IChefPlan>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  chef: { type: Schema.Types.ObjectId, ref: "Chef", required: true },
  categoryId: { type: Schema.Types.ObjectId, ref: "ChefCategory" },
  name: { type: String, required: true },
  description: { type: String, required: true },
  mealsPerDay: { type: Number, required: true },
  mealsPerWeek: { type: Number, required: true },
  price: { type: Number, required: true },
  category: { type: String, enum: ["Breakfast", "Lunch", "Dinner", "Snacks", "Lunch + Dinner", "All Plans"], required: true },
  heroImageUrl: { type: String, required: true },
  cloudinaryId: { type: String, required: true },
  mealBoxData: {
    type: Map,
    of: DayMealBoxSchema,
    default: {
      Mon: { Breakfast: {}, Lunch: {}, Dinner: {}, Snacks: {} },
      Tue: { Breakfast: {}, Lunch: {}, Dinner: {}, Snacks: {} },
      Wed: { Breakfast: {}, Lunch: {}, Dinner: {}, Snacks: {} },
      Thu: { Breakfast: {}, Lunch: {}, Dinner: {}, Snacks: {} },
      Fri: { Breakfast: {}, Lunch: {}, Dinner: {}, Snacks: {} }
    }
  }
}, { timestamps: true });

// ==========================================
// 4. EXPORTS
// ==========================================
const ChefCategory = mongoose.model<IChefCategory>("ChefCategory", ChefCategorySchema);
const ChefMenu = mongoose.model<IChefMenu>("ChefMenu", ChefMenuSchema);
const ChefPlan = mongoose.model<IChefPlan>("ChefPlan", ChefPlanSchema);

export { ChefCategory as default, ChefMenu, ChefPlan };