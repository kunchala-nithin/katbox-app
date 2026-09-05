import mongoose, { Schema, Document } from "mongoose";

// ==========================================
// 1. CHEF CATEGORY SCHEMAS & INTERFACES
// ==========================================
interface ICategoryItem {
  name: string;
  description?: string;
  imageUrl: string;
  cloudinaryId: string;
  price: number;
  quantity: string;
  variants: Array<{
    quantity: string;
    price: number;
  }>;
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

const CategoryItemSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: { type: String, required: true },
  cloudinaryId: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: String, required: true },
  variants: [{
    quantity: String,
    price: Number
  }]
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
}

const MenuPlateItemSchema = new Schema<IDaawathItem>(
  {
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    cloudinaryId: { type: String, required: true },
    price: { type: Number },
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

const DaawathCategorySchema = new Schema<IDaawathCategory>(
  {
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    cloudinaryId: { type: String, required: true },
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
}

const MealBoxItemSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number },
  image: { type: String, required: true },
  cloudinaryId: { type: String, default: "" },
  active: { type: Boolean, default: true }
}, { _id: false });

const MealBoxSectionWrapperSchema = new Schema({
  items: { type: [MealBoxItemSchema], default: [] },
  maxItems: { type: Number, default: 1 }
}, { _id: false });

const DayMealBoxSchema = new Schema({
  Lunch: { type: Map, of: MealBoxSectionWrapperSchema, default: {} },
  Dinner: { type: Map, of: MealBoxSectionWrapperSchema, default: {} }
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
  category: { type: String, enum: ["Breakfast", "Lunch", "Dinner", "Lunch + Dinner", "All Plans"], required: true },
  heroImageUrl: { type: String, required: true },
  cloudinaryId: { type: String, required: true },
  mealBoxData: {
    type: Map,
    of: DayMealBoxSchema,
    default: {
      Mon: { Lunch: {}, Dinner: {} },
      Tue: { Lunch: {}, Dinner: {} },
      Wed: { Lunch: {}, Dinner: {} },
      Thu: { Lunch: {}, Dinner: {} },
      Fri: { Lunch: {}, Dinner: {} }
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