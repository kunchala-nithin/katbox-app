import React, { useState, useEffect } from "react";
import api from "@/src/lib/api";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { getToken } from "@/src/lib/authStorage";
import MenuCard from "@/src/components/MenuCard";
import { SafeAreaView } from "react-native-safe-area-context";

const cateringCategories = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const mealboxCategories = ["All Plans", "Lunch", "Dinner", "Lunch + Dinner"];
const mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"];

export default function AddChefCategory() {
  // =====
  // SHARED STATES
  // =====
  const [chefId, setChefId] = useState("");
  const [activeForm, setActiveForm] = useState<"items" | "catering" | "mealbox" | "none">("items");
  const [showBottomTabs, setShowBottomTabs] = useState(false);
  const [selectedCategoryForItems, setSelectedCategoryForItems] = useState<any>(null);
  const [isInItemsEditor, setIsInItemsEditor] = useState(false);
  const [processedCategories, setProcessedCategories] = useState<Set<string>>(new Set());

  // SCROLL SYNC REFS
  const mainVerticalScrollRef = React.useRef<ScrollView>(null);
  const tokenHorizontalScrollRef = React.useRef<ScrollView>(null);
  const categorySectionLayouts = React.useRef<{ [key: number]: number }>({});
  const isProgrammaticScroll = React.useRef(false);

  // ===
  // CATEGORY FORM STATES
  // =======
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [heroCloudinaryId, setHeroCloudinaryId] = useState("");
  const [buttonLoading, setButtonLoading] = useState(false);
  const [modalSubCategories, setModalSubCategories] = useState<any[]>([]);
  const [addingItemLoading, setAddingItemLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  //
  // ORIGINAL CHEF MENU FORM STATES
  // ========
  const [selectedMenuCategory, setSelectedMenuCategory] = useState("Breakfast");
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [menus, setMenus] = useState<any[]>([]);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [menuHeroImage, setMenuHeroImage] = useState("");
  const [menuName, setMenuName] = useState("");
  const [menuPrice, setMenuPrice] = useState("");
  const [itemsPerPlate, setItemsPerPlate] = useState("");
  const [mealType, setMealType] = useState("Breakfast");
  const [showDropdown, setShowDropdown] = useState(false);
  const [plateItems, setPlateItems] = useState([
    { id: Date.now().toString() + "-" + Math.random().toString(36).slice(2), name: "", imageUrl: "", cloudinaryId: "" },
  ]);
  const [menuButtonLoading, setMenuButtonLoading] = useState(false);

  // STATES FOR BEAUTIFUL ADD ITEMS MODAL
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState<number | null>(null);
  const [isMenuEditMode, setIsMenuEditMode] = useState(false);
  const [hasSubmittedDaawath, setHasSubmittedDaawath] = useState(false);
  const [editingDaawathCatIndex, setEditingDaawathCatIndex] = useState<number | null>(null);

  // Category Form States
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [daawathCategoryName, setDaawathCategoryName] = useState("");
  const [daawathCategoryImage, setDaawathCategoryImage] = useState("");
  const [daawathCategoryCloudinaryId, setDaawathCategoryCloudinaryId] = useState("");
  const [daawathCategoryMaxItems, setDaawathCategoryMaxItems] = useState("1");

  // Item Form States
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemImage, setItemImage] = useState("");
  const [itemCloudinaryId, setItemCloudinaryId] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  // Addons State
  const [addonsList, setAddonsList] = useState<any[]>([]);
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [addonImage, setAddonImage] = useState("");
  const [addonCloudinaryId, setAddonCloudinaryId] = useState("");
  const [editingAddonIndex, setEditingAddonIndex] = useState<number | null>(null);

  // ===
  // MEAL PLAN STATES
  // =====
  const [plans, setPlans] = useState<any[]>([]);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [mealsPerDay, setMealsPerDay] = useState("");
  const [mealsPerWeek, setMealsPerWeek] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [planHeroImage, setPlanHeroImage] = useState("");
  const [planCloudinaryId, setPlanCloudinaryId] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedPlanCategory, setSelectedPlanCategory] = useState("All Plans");
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);

  // NEW STATES FOR PLAN ITEMS MODAL
  const [showPlanItemsModal, setShowPlanItemsModal] = useState(false);
  const [selectedPlanForItems, setSelectedPlanForItems] = useState<any>(null);

  // ==========================================
  // NEW: MEAL BOX / SAMPLE MENU STATES (PER DAY)
  // ==========================================
  const [selectedDay, setSelectedDay] = useState<"Mon" | "Tue" | "Wed" | "Thu" | "Fri">("Mon");
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const initialMealBoxForDay = {
    Lunch: {},
    Dinner: {},
  };

  const [mealBoxData, setMealBoxData] = useState<any>({
    Mon: { ...initialMealBoxForDay },
    Tue: { ...initialMealBoxForDay },
    Wed: { ...initialMealBoxForDay },
    Thu: { ...initialMealBoxForDay },
    Fri: { ...initialMealBoxForDay },
  });

  // ==========================================
  // Structural dynamic management for Meal Box forms
  // ==========================================
  const [showMealItemFormModal, setShowMealItemFormModal] = useState(false);
  const [mealItemFormContext, setMealItemFormContext] = useState<{
    mealType: string;
    section: string;
    isEditing: boolean;
    itemId?: string;
  } | null>(null);
  const [mealItemFormName, setMealItemFormName] = useState("");
  const [mealItemFormPrice, setMealItemFormPrice] = useState("");
  const [mealItemFormImage, setMealItemFormImage] = useState("");

  // NEW STATES FOR CREATING/EDITING MEAL CATEGORY SECTIONS DYNAMICALLY
  const [showCreateSectionModal, setShowCreateSectionModal] = useState(false);
  const [newSectionMealType, setNewSectionMealType] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionMaxItems, setNewSectionMaxItems] = useState("1");
  const [isEditingSection, setIsEditingSection] = useState(false);
  const [oldSectionName, setOldSectionName] = useState("");

  // VOLATILE QUANTITY BINDINGS HELD IN MEMORY PREVENTING CONTAMINATION OF NETWORK JSON COMMITS
  const [addonCounts, setAddonCounts] = useState<{ [key: string]: number }>({});

  //
  // FETCH LOGIC COMBINED
  // ====
  const fetchAllData = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const resChef = await api.get("/api/chefs/my-chef");
      if (resChef.data.success && resChef.data.chef) {
        const currentChefId = resChef.data.chef._id;
        setChefId(currentChefId);

        const resCat = await api.get(`/api/chef-categories/chef/${currentChefId}`);
        setCategories(resCat.data || []);

        const resMenus = await api.get(`/api/chef-categories/menu/chef/${currentChefId}`);
        setMenus(resMenus.data || []);

        const resPlans = await api.get(`/api/chef-categories/plans/chef/${currentChefId}`);
        setPlans(resPlans.data || []);
      }
    } catch (err) {
      console.log("Error fetching data updates:", err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // ===
  // CLOUDINARY CLEANUP METHODS
  // =======
  const deleteImageFromCloudinary = async (cloudinaryId: string) => {
    if (!cloudinaryId) return;
    try {
      const token = await getToken();
      if (!token) return;
      await api.delete("/api/chef-categories/image", {
        headers: { Authorization: `Bearer ${token}` },
        data: { publicId: cloudinaryId },
      });
    } catch (err) {
      console.log("Failed to delete image from Cloudinary:", err);
    }
  };

  const deleteMenuImageFromCloudinary = async (cloudinaryId: string) => {
    if (!cloudinaryId) return;
    try {
      const token = await getToken();
      if (!token) return;
      await api.delete("/api/chef-categories/menu/image", {
        headers: { Authorization: `Bearer ${token}` },
        data: { publicId: cloudinaryId },
      });
    } catch (err) {
      console.log("Failed to delete image from Cloudinary:", err);
    }
  };

  const deletePlanImageFromCloudinary = async (cloudinaryId: string) => {
    if (!cloudinaryId) return;
    try {
      const token = await getToken();
      if (!token) return;
      await api.delete("/api/chef-categories/plan/image", {
        headers: { Authorization: `Bearer ${token}` },
        data: { publicId: cloudinaryId },
      });
    } catch (err) {
      console.log("Failed to delete plan image from Cloudinary:", err);
    }
  };

  // ===
  // IMAGE PICKERS
  // ======
  const pickHeroImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled) {
      if (heroCloudinaryId) {
        await deleteImageFromCloudinary(heroCloudinaryId);
      }
      setHeroImage(result.assets[0].uri);
      setHeroCloudinaryId("");
    }
  };

  const removeHeroImage = async () => {
    if (heroCloudinaryId) {
      await deleteImageFromCloudinary(heroCloudinaryId);
    }
    setHeroCloudinaryId("");
    setHeroImage("");
  };

  const pickItemImage = async (subIndex: number, itemIndex: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled) {
      const newSubCats = [...modalSubCategories];
      const item = newSubCats[subIndex].items[itemIndex];
      if (item.cloudinaryId) {
        await deleteImageFromCloudinary(item.cloudinaryId);
      }
      item.cloudinaryId = "";
      newSubCats[subIndex].items[itemIndex].image = result.assets[0].uri;
      setModalSubCategories(newSubCats);
    }
  };

  const removeItemItem = async (subIndex: number, itemIndex: number) => {
    const item = modalSubCategories[subIndex]?.items[itemIndex];
    if (item?.cloudinaryId) {
      await deleteImageFromCloudinary(item.cloudinaryId);
    }
    const newSubCats = [...modalSubCategories];
    newSubCats[subIndex].items[itemIndex].image = "";
    newSubCats[subIndex].items[itemIndex].cloudinaryId = "";
    setModalSubCategories(newSubCats);
  };

  const pickMenuHeroImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsEditing: true
    });
    if (!result.canceled) setMenuHeroImage(result.assets[0].uri);
  };

  const pickMenuPlateItemImage = async (id: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsEditing: true
    });
    if (!result.canceled) {
      updatePlateItem(id, "imageUrl", result.assets[0].uri);
    }
  };

  const pickDaawathCategoryImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsEditing: true
    });
    if (!result.canceled) setDaawathCategoryImage(result.assets[0].uri);
  };

  const pickMenuItemImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsEditing: true
    });
    if (!result.canceled) setItemImage(result.assets[0].uri);
  };

  const pickAddonImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsEditing: true
    });
    if (!result.canceled) setAddonImage(result.assets[0].uri);
  };

  const pickPlanHeroImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.45,
      allowsEditing: true
    });
    if (!result.canceled) {
      if (planCloudinaryId) {
        await deletePlanImageFromCloudinary(planCloudinaryId);
      }
      setPlanCloudinaryId("");
      setPlanHeroImage(result.assets[0].uri);
    }
  };

  const removePlanHeroImage = async () => {
    if (planCloudinaryId) {
      await deletePlanImageFromCloudinary(planCloudinaryId);
    }
    setPlanCloudinaryId("");
    setPlanHeroImage("");
  };

  const pickMealItemImageFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission required");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setMealItemFormImage(result.assets[0].uri);
    }
  };

  // ==
  // CATEGORY FORMS MANAGEMENT
  // ====
  const addMoreQuantityPrice = (subIndex: number, itemIndex: number) => {
    const newSubCats = [...modalSubCategories];
    if (!newSubCats[subIndex].items[itemIndex].variants) {
      newSubCats[subIndex].items[itemIndex].variants = [];
    }
    newSubCats[subIndex].items[itemIndex].variants.push({
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
      quantity: "",
      price: "",
    });
    setModalSubCategories(newSubCats);
  };

  const updateVariantField = (subIndex: number, itemIndex: number, variantIndex: number, field: string, value: string) => {
    const newSubCats = [...modalSubCategories];
    newSubCats[subIndex].items[itemIndex].variants[variantIndex][field] = value;
    setModalSubCategories(newSubCats);
  };

  const removeVariant = (subIndex: number, itemIndex: number, variantIndex: number) => {
    const newSubCats = [...modalSubCategories];
    newSubCats[subIndex].items[itemIndex].variants.splice(variantIndex, 1);
    setModalSubCategories(newSubCats);
  };

  const saveCategory = async () => {
    if (!categoryName || !heroImage) {
      return Alert.alert("Please fill all fields");
    }
    try {
      setButtonLoading(true);
      const token = await getToken();
      if (!token) return;
      const formData = new FormData();
      formData.append("name", categoryName);
      if (heroImage && heroImage.startsWith("file")) {
        const fileType = heroImage.split(".").pop() || "jpg";
        formData.append("heroImage", {
          uri: heroImage,
          name: `category.${fileType}`,
          type: `image/${fileType}`,
        } as any);
      }
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      };
      if (editingCategoryId) {
        await api.put(`/api/chef-categories/${editingCategoryId}`, formData, config);
      } else {
        await api.post("/api/chef-categories/add", formData, config);
      }
      Alert.alert("Success", editingCategoryId ? "Category updated successfully" : "Category added successfully");
      setShowForm(false);
      setCategoryName("");
      setHeroImage("");
      setHeroCloudinaryId("");
      setEditingCategoryId(null);
      fetchAllData();
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.response?.data?.message || "Failed to save category");
    } finally {
      setButtonLoading(false);
    }
  };

  const deleteCategory = (id: string) => {
    Alert.alert("Delete Category", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getToken();
            await api.delete(`/api/chef-categories/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setCategories((prev) => prev.filter((cat) => cat._id !== id));
            Alert.alert("Deleted");
          } catch (err) {
            Alert.alert("Error", "Failed to delete category");
          }
        },
      },
    ]);
  };

  const handleDeleteSubCategory = (subIndex: number, subId: string) => {
    Alert.alert("Delete Sub Category", "Are you sure you want to permanently delete this sub-category?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const newSubCats = [...modalSubCategories];
          newSubCats.splice(subIndex, 1);
          setModalSubCategories(newSubCats);
          if (subId && selectedCategoryForItems?._id) {
            try {
              const token = await getToken();
              if (!token) return;
              await api.delete(`/api/chef-categories/${selectedCategoryForItems._id}/sub-category/${subId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              fetchAllData();
            } catch (err) {
              console.log("Failed to delete sub-category from DB", err);
            }
          }
        },
      },
    ]);
  };

  const handleDeleteltem = (subIndex: number, itemIndex: number, itemId: string) => {
    Alert.alert("Delete Item", "Are you sure you want to permanently delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const newSubCats = [...modalSubCategories];
          newSubCats[subIndex].items.splice(itemIndex, 1);
          setModalSubCategories(newSubCats);
          if (itemId && selectedCategoryForItems?._id) {
            try {
              const token = await getToken();
              if (!token) return;
              await api.delete(`/api/chef-categories/${selectedCategoryForItems._id}/item/${itemId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              fetchAllData();
            } catch (err) {
              console.log("Failed to delete item from DB", err);
            }
          }
        },
      },
    ]);
  };

  const openAddItemsScreen = (category: any) => {
    setSelectedCategoryForItems(category);
    const hasSubCategories = !!(category.subCategories && category.subCategories.length > 0);
    const hasMenus = menus.some((menu: any) => menu.categoryId === category._id || menu.chefCategoryId === category._id);
    const hasPlans = plans.some(
      (plan: any) =>
        plan.categoryId === category._id ||
        plan.categoryId?.toString() === category._id?.toString()
    );

    if (hasSubCategories) {
      setActiveForm("items");
      setIsInItemsEditor(true);
      setShowBottomTabs(false);
    } else if (hasMenus) {
      setActiveForm("catering");
      setIsInItemsEditor(false);
      setShowBottomTabs(false);
    } else if (hasPlans || processedCategories.has(category._id)) {
      setActiveForm("mealbox");
      setIsInItemsEditor(false);
      setShowBottomTabs(false);
    } else {
      setActiveForm("items");
      setIsInItemsEditor(true);
      setShowBottomTabs(true);
    }

    setIsEditMode(!hasSubCategories && !hasMenus && !hasPlans && !processedCategories.has(category._id));

    const initialData = category.subCategories && category.subCategories.length > 0
      ? category.subCategories.map((sub: any) => ({
        ...sub,
        id: sub._id || Date.now().toString() + "-" + Math.random().toString(36).slice(2),
        items: sub.items.map((item: any) => ({
          ...item,
          id: item._id || Date.now().toString() + "-" + Math.random().toString(36).slice(2),
          description: item.description || "",
          image: item.imageUrl || "",
          cloudinaryId: item.cloudinaryId || "",
          price: item.price !== undefined ? String(item.price) : "",
          quantity: item.quantity || "",
          variants: (item.variants || []).map((v: any, idx: number) => ({
            id: v._id || Date.now().toString() + idx,
            quantity: v.quantity || "",
            price: v.price !== undefined ? String(v.price) : "",
          })),
        })),
      }))
      : [
        {
          id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
          name: "",
          items: [
            {
              id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
              name: "",
              description: "",
              image: "",
              cloudinaryId: "",
              price: "",
              quantity: "",
              variants: [],
            },
          ],
        },
      ];
    setModalSubCategories(initialData);
  };

  const closeltemsEditor = () => {
    setShowBottomTabs(false);
    setIsInItemsEditor(false);
    setModalSubCategories([]);
    setSelectedCategoryForItems(null);
    setIsEditMode(false);
  };

  const addNewSubCategory = () => {
    setModalSubCategories([
      ...modalSubCategories,
      {
        id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
        name: "",
        items: [
          {
            id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
            name: "",
            description: "",
            image: "",
            cloudinaryId: "",
            price: "",
            quantity: "",
            variants: [],
          },
        ],
      },
    ]);
  };

  const addNewItemToSub = (subIndex: number) => {
    const newSubCats = [...modalSubCategories];
    newSubCats[subIndex].items.push({
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
      name: "",
      description: "",
      image: "",
      cloudinaryId: "",
      price: "",
      quantity: "",
      variants: [],
    });
    setModalSubCategories(newSubCats);
  };

  const updateSubCategoryName = (subIndex: number, value: string) => {
    const newSubCats = [...modalSubCategories];
    newSubCats[subIndex].name = value;
    setModalSubCategories(newSubCats);
  };

  const updateltemField = (subIndex: number, itemIndex: number, field: string, value: any) => {
    const newSubCats = [...modalSubCategories];
    newSubCats[subIndex].items[itemIndex][field] = value;
    setModalSubCategories(newSubCats);
  };

  const saveCategoryItemsList = async () => {
    if (!selectedCategoryForItems || modalSubCategories.length === 0) {
      return Alert.alert("Please add at least one sub category");
    }
    const emptySub = modalSubCategories.find((sub) => !sub.name.trim());
    if (emptySub) return Alert.alert("Please fill sub category name for all sections");

    let invalidItem = null;
    for (let sub of modalSubCategories) {
      invalidItem = sub.items.find((item: any) => !item.name || !item.image || !item.price || !item.quantity);
      if (invalidItem) break;
    }
    if (invalidItem) return Alert.alert("Please complete all fields for every item");

    try {
      setAddingItemLoading(true);
      const token = await getToken();
      if (!token) return;
      const formData = new FormData();
      formData.append("subCategories", JSON.stringify(modalSubCategories));
      modalSubCategories.forEach((sub: any, subIndex: number) => {
        sub.items.forEach((item: any, itemIndex: number) => {
          if (item.image && item.image.startsWith("file")) {
            const fileType = item.image.split(".").pop() || "jpg";
            formData.append("images", {
              uri: item.image,
              name: `item_${subIndex}_${itemIndex}.${fileType}`,
              type: `image/${fileType}`,
            } as any);
          }
        });
      });
      const res = await api.post(`/api/chef-categories/${selectedCategoryForItems._id}/items`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });
      Alert.alert("Success", "Items saved successfully!");
      setShowBottomTabs(false);
      setIsEditMode(false);
      if (selectedCategoryForItems?._id) {
        setProcessedCategories(prev => new Set(prev).add(selectedCategoryForItems._id));
      }
      if (res.data && res.data.subCategories) {
        const updatedSubCats = res.data.subCategories.map((sub: any) => ({
          ...sub,
          id: sub._id,
          items: sub.items.map((item: any) => ({
            ...item,
            id: item._id,
            description: item.description || "",
            image: item.imageUrl || "",
            cloudinaryId: item.cloudinaryId || "",
            price: item.price !== undefined ? String(item.price) : "",
            quantity: item.quantity || "",
            variants: (item.variants || []).map((v: any, idx: number) => ({
              id: v._id || Date.now().toString() + idx,
              quantity: v.quantity || "",
              price: v.price !== undefined ? String(v.price) : "",
            })),
          }))
        }));
        setModalSubCategories(updatedSubCats);
        setSelectedCategoryForItems(res.data);
        fetchAllData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || "Failed to save items");
    } finally {
      setAddingItemLoading(false);
    }
  };

  const addPlateItem = () => {
    setPlateItems((prev) => [
      ...prev,
      { id: Date.now().toString() + "-" + Math.random().toString(36).slice(2), name: "", imageUrl: "", cloudinaryId: "" }
    ]);
  };

  const updatePlateItem = (id: string, field: string, value: string) => {
    setPlateItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeMenuHeroImage = () => setMenuHeroImage("");

  const removePlateItemImage = (id: string) => {
    setPlateItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, imageUrl: "", cloudinaryId: item.cloudinaryId } : item
      )
    );
  };

  const openEditDaawathCategory = (index: number) => {
    const cat = categoriesList[index];
    setDaawathCategoryName(cat.name);
    setDaawathCategoryImage(cat.imageUrl || "");
    setDaawathCategoryCloudinaryId(cat.cloudinaryId || "");
    setDaawathCategoryMaxItems(String(cat.maxItems !== undefined ? cat.maxItems : 1));
    setEditingDaawathCatIndex(index);
    setShowAddItemModal(false);
    setTimeout(() => setShowCategoryForm(true), 300);
  };

  const deleteDaawathCategory = (index: number) => {
    Alert.alert("Delete Category", "Are you sure you want to delete this category?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const cat = categoriesList[index];
          try {
            if (cat?.cloudinaryId) await deleteMenuImageFromCloudinary(cat.cloudinaryId);
            for (const item of cat?.items || []) {
              if (item.cloudinaryId) await deleteMenuImageFromCloudinary(item.cloudinaryId);
            }
            const updated = categoriesList.filter((_, i) => i !== index);
            setCategoriesList(updated);
            setSelectedCategoryIndex(updated.length > 0 ? 0 : null);
          } catch (err) {
            Alert.alert("Error", "Failed to delete category");
          }
        },
      },
    ]);
  };

  const openEditDaawathItem = (index: number) => {
    const cat = categoriesList[selectedCategoryIndex!];
    const dish = cat.items[index];
    setItemName(dish.name);
    setItemPrice(dish.price ? String(dish.price) : "");
    setItemImage(dish.imageUrl || "");
    setItemCloudinaryId(dish.cloudinaryId || "");
    setEditingItemIndex(index);
    setShowAddItemModal(false);
    setTimeout(() => setShowItemForm(true), 300);
  };

  const deleteDaawathItem = (catIndex: number, itemIndex: number) => {
    Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const cat = categoriesList[catIndex];
          const item = cat?.items?.[itemIndex];
          try {
            if (item?.cloudinaryId) await deleteMenuImageFromCloudinary(item.cloudinaryId);
            setCategoriesList((prev) => {
              const updated = [...prev];
              updated[catIndex].items = updated[catIndex].items.filter((_: any, i: number) => i !== itemIndex);
              return updated;
            });
          } catch (err) {
            Alert.alert("Error", "Failed to delete item");
          }
        },
      },
    ]);
  };

  const openEditAddon = (index: number) => {
    const addon = addonsList[index];
    setAddonName(addon.name);
    setAddonPrice(String(addon.price || ""));
    setAddonImage(addon.imageUrl || "");
    setAddonCloudinaryId(addon.cloudinaryId || "");
    setEditingAddonIndex(index);
    setShowAddItemModal(false);
    setTimeout(() => setShowAddonForm(true), 300);
  };

  const deleteAddon = (index: number) => {
    Alert.alert("Delete Addon", "Are you sure you want to delete this addon?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const addon = addonsList[index];
          try {
            if (addon.cloudinaryId) await deleteMenuImageFromCloudinary(addon.cloudinaryId);
            setAddonsList(prev => prev.filter((_, i) => i !== index));
          } catch(err) {
            Alert.alert("Error", "Failed to delete addon");
          }
        }
      }
    ]);
  };

  const removeDaawathCategoryImageInForm = async () => {
    if (daawathCategoryCloudinaryId) await deleteMenuImageFromCloudinary(daawathCategoryCloudinaryId);
    setDaawathCategoryImage("");
    setDaawathCategoryCloudinaryId("");
  };

  const removeDaawathItemImageInForm = async () => {
    if (itemCloudinaryId) await deleteMenuImageFromCloudinary(itemCloudinaryId);
    setItemImage("");
    setItemCloudinaryId("");
  };

  const removeAddonImageInForm = async () => {
    if (addonCloudinaryId) await deleteMenuImageFromCloudinary(addonCloudinaryId);
    setAddonImage("");
    setAddonCloudinaryId("");
  };

  const saveAddon = () => {
    if (!addonName.trim()) {
      Alert.alert("Validation Error", "Please enter addon name");
      return;
    }
    const newAddon = {
      id: editingAddonIndex !== null ? addonsList[editingAddonIndex].id : Date.now().toString(),
      name: addonName.trim(),
      price: addonPrice !== "" ? Number(addonPrice) : undefined,
      imageUrl: addonImage,
      cloudinaryId: addonCloudinaryId
    };
    const updated = [...addonsList];
    if (editingAddonIndex !== null) {
      updated[editingAddonIndex] = newAddon;
    } else {
      updated.push(newAddon);
    }
    setAddonsList(updated);
    setShowAddonForm(false);
    setTimeout(() => setShowAddItemModal(true), 300);
  };

  const saveMenu = async () => {
    if (!menuName || !menuPrice || !itemsPerPlate || !mealType) {
      return Alert.alert("Please fill all fields");
    }
    if (!menuHeroImage) {
      return Alert.alert("Please upload hero image");
    }
    try {
      setMenuButtonLoading(true);
      const token = await getToken();
      if (!token) return;
      const formData = new FormData();
      formData.append("name", menuName);
      formData.append("price", menuPrice);
      formData.append("itemsPerPlate", itemsPerPlate);
      formData.append("mealType", mealType);
      if (selectedCategoryForItems?._id) {
        formData.append("categoryId", selectedCategoryForItems._id);
        formData.append("chefCategoryId", selectedCategoryForItems._id);
      }
      formData.append("plateItems", JSON.stringify(plateItems.map((item) => ({ name: item.name }))));
      const heroType = menuHeroImage.split(".").pop() || "jpg";
      formData.append("heroImage", {
        uri: menuHeroImage,
        name: `hero.${heroType}`,
        type: `image/${heroType}`,
      } as any);
      plateItems.forEach((item, index) => {
        if (item.imageUrl) {
          const fileType = item.imageUrl.split(".").pop() || "jpg";
          formData.append("itemImages", {
            uri: item.imageUrl,
            name: `item_${index}.${fileType}`,
            type: `image/${fileType}`,
          } as any);
        }
      });
      const config = {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        timeout: 90000,
      };
      const res = editingMenuId
        ? await api.put(`/api/chef-categories/menu/${editingMenuId}`, formData, config)
        : await api.post("/api/chef-categories/menu/add", formData, config);
      const savedMenu = res.data;
      if (editingMenuId) {
        setMenus((prev) => prev.map((m) => (m._id === editingMenuId ? savedMenu : m)));
      } else {
        setMenus((prev) => [savedMenu, ...prev]);
      }
      Alert.alert("Success", editingMenuId ? "Menu updated successfully" : "Menu added successfully");
      if (selectedCategoryForItems?._id) {
        setProcessedCategories(prev => new Set(prev).add(selectedCategoryForItems._id));
      }
      setShowBottomTabs(false);
      setShowMenuForm(false);
      setMenuName("");
      setMenuPrice("");
      setItemsPerPlate("");
      setMealType("Breakfast");
      setMenuHeroImage("");
      setPlateItems([{ id: Date.now().toString() + "-" + Math.random().toString(36).slice(2), name: "", imageUrl: "", cloudinaryId: "" }]);
      setEditingMenuId(null);
      fetchAllData();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || "Failed to save menu");
    } finally {
      setMenuButtonLoading(false);
    }
  };

  const openAddItemModal = (menu: any) => {
    setSelectedMenuId(menu._id);
    const normalizedCategories = (menu.daawathCategories || []).map((cat: any) => ({
      ...cat,
      imageUrl: cat.imageUrl || "",
      cloudinaryId: cat.cloudinaryId || "",
      maxItems: cat.maxItems !== undefined ? cat.maxItems : 1,
      items: cat.items || [],
    }));
    setCategoriesList(normalizedCategories);
    setAddonsList(menu.daawathAddons || []);
    setSelectedCategoryIndex(normalizedCategories.length > 0 ? 0 : null);
    setHasSubmittedDaawath(normalizedCategories.length > 0);
    setIsMenuEditMode(false);
    setShowAddItemModal(true);
  };

  const openPlanItemsModal = (plan: any) => {
    setSelectedPlanForItems(plan);
    if (plan.mealBoxData) {
      const parsedData = typeof plan.mealBoxData === 'string' ? JSON.parse(plan.mealBoxData) : plan.mealBoxData;
      setMealBoxData(parsedData);
    } else {
      setMealBoxData({
        Mon: { Lunch: {}, Dinner: {} },
        Tue: { Lunch: {}, Dinner: {} },
        Wed: { Lunch: {}, Dinner: {} },
        Thu: { Lunch: {}, Dinner: {} },
        Fri: { Lunch: {}, Dinner: {} },
      });
    }
    setSelectedDay("Mon");
    setShowPlanItemsModal(true);
  };

  const saveMealBoxDataToPlan = async () => {
    if (!selectedPlanForItems) return;
    try {
      setPlanLoading(true);
      const token = await getToken();
      if (!token) return;

      const formData = new FormData();
      formData.append("mealBoxData", JSON.stringify(mealBoxData));

      Object.keys(mealBoxData).forEach((dayKey) => {
        const dayData = mealBoxData[dayKey];
        ["Lunch", "Dinner"].forEach((mealType) => {
          const sections = dayData[mealType] || {};
          Object.keys(sections).forEach((sectionKey) => {
            const sectionWrapper = sections[sectionKey];
            const items = (sectionWrapper && Array.isArray(sectionWrapper.items)) ? sectionWrapper.items : (Array.isArray(sectionWrapper) ? sectionWrapper : []);
            items.forEach((item: any) => {
              if (item.image && (item.image.startsWith("file") || item.image.startsWith("content"))) {
                const fileType = item.image.split(".").pop() || "jpg";
                formData.append("images", {
                  uri: item.image,
                  name: `mealbox_${dayKey}_${mealType}_${item.id}.${fileType}`,
                  type: `image/${fileType}`,
                } as any);
              }
            });
          });
        });
      });

      const res = await api.post(`/api/chef-categories/plans/${selectedPlanForItems._id}/mealbox`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });

      setPlans((prev) =>
        prev.map((p) => (p._id === selectedPlanForItems._id ? res.data : p))
      );

      Alert.alert("Success", "Meal plan items successfully configured!");
      setShowPlanItemsModal(false);
      fetchAllData();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to save plan items inside remote store collection");
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSaveDaawath = async () => {
    if (!selectedMenuId) {
      Alert.alert("Error", "No menu selected");
      return;
    }
    if (categoriesList.length === 0) {
      Alert.alert("Error", "Please add at least one category");
      return;
    }
    try {
      setMenuButtonLoading(true);
      const token = await getToken();
      if (!token) return;
      const formData = new FormData();
      formData.append("categories", JSON.stringify(categoriesList));
      formData.append("daawathAddons", JSON.stringify(addonsList));
      
      categoriesList.forEach((cat: any, catIndex: number) => {
        if (cat.imageUrl && cat.imageUrl.startsWith("file")) {
          const fileType = cat.imageUrl.split(".").pop() || "jpg";
          formData.append("images", {
            uri: cat.imageUrl,
            name: `category_${catIndex}.${fileType}`,
            type: `image/${fileType}`,
          } as any);
        }
        (cat.items || []).forEach((item: any, itemIndex: number) => {
          if (item.imageUrl && item.imageUrl.startsWith("file")) {
            const fileType = item.imageUrl.split(".").pop() || "jpg";
            formData.append("images", {
              uri: item.imageUrl,
              name: `item_${catIndex}_${itemIndex}.${fileType}`,
              type: `image/${fileType}`,
            } as any);
          }
        });
      });

      addonsList.forEach((addon: any, addonIndex: number) => {
        if (addon.imageUrl && addon.imageUrl.startsWith("file")) {
          const fileType = addon.imageUrl.split(".").pop() || "jpg";
          formData.append("images", {
            uri: addon.imageUrl,
            name: `addon_${addonIndex}.${fileType}`,
            type: `image/${fileType}`,
          } as any);
        }
      });

      const res = await api.post(`/api/chef-categories/menu/${selectedMenuId}/daawath`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });
      const updatedMenu = res.data;
      setMenus((prev) => prev.map((menu) => menu._id === selectedMenuId ? updatedMenu : menu));
      setCategoriesList(updatedMenu.daawathCategories || []);
      setAddonsList(updatedMenu.daawathAddons || []);
      setHasSubmittedDaawath(true);
      setIsMenuEditMode(false);
      Alert.alert("Success", "Daawath items saved successfully!");
    } catch (err: any) {
      Alert.alert("Server Error", err.response?.data?.message || "Unknown error occurred");
    } finally {
      setMenuButtonLoading(false);
    }
  };

  const savePlan = async () => {
    if (!planName || !planDescription || !mealsPerDay || !mealsPerWeek || !planPrice || !planHeroImage) {
      return Alert.alert("Please fill all fields");
    }
    try {
      setPlanLoading(true);
      const token = await getToken();
      if (!token) return;

      const formData = new FormData();
      formData.append("name", planName);
      formData.append("description", planDescription);
      formData.append("mealsPerDay", mealsPerDay);
      formData.append("mealsPerWeek", mealsPerWeek);
      formData.append("price", planPrice);
      formData.append("category", selectedPlanCategory);

      if (selectedCategoryForItems?._id) {
        formData.append("categoryId", selectedCategoryForItems._id);
      }

      if (planHeroImage && planHeroImage.startsWith("file")) {
        const fileType = planHeroImage.split(".").pop() || "jpg";
        formData.append("heroImage", {
          uri: planHeroImage,
          name: `plan.${fileType}`,
          type: `image/${fileType}`,
        } as any);
      }

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 90000,
      };

      let res;
      if (editingPlanId) {
        res = await api.put(`/api/chef-categories/plans/${editingPlanId}`, formData, config);
      } else {
        res = await api.post("/api/chef-categories/plans/add", formData, config);
      }

      const savedPlan = res.data;
      if (editingPlanId) {
        setPlans((prev) => prev.map((p) => (p._id === editingPlanId ? savedPlan : p)));
      } else {
        setPlans((prev) => [savedPlan, ...prev]);
      }

      Alert.alert("Success", editingPlanId ? "Plan updated successfully" : "Plan added successfully");

      if (selectedCategoryForItems?._id) {
        setProcessedCategories((prev) => new Set(prev).add(selectedCategoryForItems._id));
      }
      setShowBottomTabs(false);
      setActiveForm("mealbox");

      setShowPlanForm(false);
      resetPlanForm();
      fetchAllData();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || "Failed to save plan");
    } finally {
      setPlanLoading(false);
    }
  };

  const resetPlanForm = () => {
    setPlanName("");
    setPlanDescription("");
    setMealsPerDay("");
    setMealsPerWeek("");
    setPlanPrice("");
    setPlanHeroImage("");
    setPlanCloudinaryId("");
    setEditingPlanId(null);
    setSelectedPlanCategory("All Plans");
    setShowPlanDropdown(false);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlanId(plan._id);
    setPlanName(plan.name);
    setPlanDescription(plan.description || "");
    setMealsPerDay(String(plan.mealsPerDay || ""));
    setMealsPerWeek(String(plan.mealsPerWeek || ""));
    setPlanPrice(String(plan.price || ""));
    setPlanHeroImage(plan.heroImageUrl || "");
    setPlanCloudinaryId(plan.cloudinaryId || "");
    setSelectedPlanCategory(plan.category || "All Plans");
    setShowPlanDropdown(false);
    setShowPlanForm(true);
  };

  const deletePlan = (id: string) => {
    Alert.alert("Delete Plan", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getToken();
            await api.delete(`/api/chef-categories/plans/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setPlans((prev) => prev.filter((p) => p._id !== id));
            Alert.alert("Deleted");
          } catch (err) {
            Alert.alert("Error", "Failed to delete plan");
          }
        },
      },
    ]);
  };

  const filteredPlans = plans.filter((p) => {
    const matchesMealType = selectedPlanCategory === "All Plans" || p.category === selectedPlanCategory;
    if (selectedCategoryForItems) {
      return matchesMealType &&
        (p.categoryId === selectedCategoryForItems._id ||
          p.categoryId?.toString() === selectedCategoryForItems._id?.toString());
    }
    return matchesMealType;
  });

  const sampledCategory = selectedCategoryForItems;
  const layoutFormSelection = isInItemsEditor
    ? "items"
    : (sampledCategory && menus.some(m => m.categoryId === sampledCategory._id || m.chefCategoryId === sampledCategory._id)
      ? "catering"
      : activeForm);

  const filteredMenus = menus.filter((m) => {
    const matchesMealType = selectedMenuCategory ? m.mealType === selectedMenuCategory : true;
    if (selectedCategoryForItems) {
      const matchesCategory = m.categoryId === selectedCategoryForItems._id ||
        m.chefCategoryId === selectedCategoryForItems._id ||
        m.name?.trim().toLowerCase() === selectedCategoryForItems.name?.trim().toLowerCase();
      return matchesMealType && matchesCategory;
    }
    return matchesMealType;
  });

  // ==========================================
  // MEAL BOX HELPERS
  // ==========================================
  const toggleMealItemActive = (mealType: string, section: string, itemId: string) => {
    setMealBoxData((prev: any) => {
      const currentDayData = prev[selectedDay] || {};
      const sectionWrapper = currentDayData[mealType]?.[section];
      
      const currentItems = (sectionWrapper && Array.isArray(sectionWrapper.items)) 
        ? sectionWrapper.items 
        : (Array.isArray(sectionWrapper) ? sectionWrapper : []);

      const updatedItems = currentItems.map((item: any) =>
        item.id === itemId ? { ...item, active: !item.active } : item
      );

      return {
        ...prev,
        [selectedDay]: {
          ...currentDayData,
          [mealType]: {
            ...currentDayData[mealType],
            [section]: typeof sectionWrapper?.maxItems === "number" 
              ? { items: updatedItems, maxItems: sectionWrapper.maxItems }
              : updatedItems,
          },
        },
      };
    });
  };

  const deleteMealItem = (mealType: string, section: string, itemId: string) => {
    Alert.alert("Delete Item", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setMealBoxData((prev: any) => {
            const currentDayData = prev[selectedDay] || {};
            const sectionWrapper = currentDayData[mealType]?.[section];
            
            const currentItems = (sectionWrapper && Array.isArray(sectionWrapper.items)) 
              ? sectionWrapper.items 
              : (Array.isArray(sectionWrapper) ? sectionWrapper : []);

            const updatedItems = currentItems.filter((item: any) => item.id !== itemId);

            return {
              ...prev,
              [selectedDay]: {
                ...currentDayData,
                [mealType]: {
                  ...currentDayData[mealType],
                  [section]: typeof sectionWrapper?.maxItems === "number"
                    ? { items: updatedItems, maxItems: sectionWrapper.maxItems }
                    : updatedItems,
                },
              },
            };
          });
        },
      },
    ]);
  };

  const openAddMealItemModal = (mealType: string, section: string) => {
    setMealItemFormContext({ mealType, section, isEditing: false });
    setMealItemFormName("");
    setMealItemFormPrice("");
    setMealItemFormImage("");
    setShowMealItemFormModal(true);
  };

  const openEditMealItemModal = (mealType: string, section: string, item: any) => {
    setMealItemFormContext({ mealType, section, isEditing: true, itemId: item.id });
    setMealItemFormName(item.name);
    setMealItemFormPrice(item.price ? String(item.price) : "");
    setMealItemFormImage(item.image || "");
    setShowMealItemFormModal(true);
  };

  const saveMealItemForm = () => {
    if (!mealItemFormName.trim()) {
      return Alert.alert("Validation Error", "Please provide a name for the dynamic item.");
    }
    if (!mealItemFormContext) return;

    const { mealType, section, isEditing, itemId } = mealItemFormContext;
    const finalImage = mealItemFormImage || "https://via.placeholder.com/60";

    setMealBoxData((prev: any) => {
      const currentDayData = prev[selectedDay] || {};
      const sectionWrapper = currentDayData[mealType]?.[section];
      
      const targetSectionList = (sectionWrapper && Array.isArray(sectionWrapper.items))
        ? [...sectionWrapper.items]
        : (Array.isArray(sectionWrapper) ? [...sectionWrapper] : []);

      const maxSelectable = (sectionWrapper && typeof sectionWrapper.maxItems === "number")
        ? sectionWrapper.maxItems
        : 1;

      if (isEditing) {
        const updatedList = targetSectionList.map((itm: any) => {
          if (itm.id === itemId) {
            return {
              ...itm,
              name: mealItemFormName,
              price: mealItemFormPrice ? Number(mealItemFormPrice) : undefined,
              image: finalImage,
            };
          }
          return itm;
        });
        return {
          ...prev,
          [selectedDay]: {
            ...currentDayData,
            [mealType]: { 
              ...currentDayData[mealType], 
              [section]: { items: updatedList, maxItems: maxSelectable } 
            },
          },
        };
      } else {
        const newItem = {
          id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
          name: mealItemFormName,
          price: mealItemFormPrice ? Number(mealItemFormPrice) : undefined,
          image: finalImage,
          active: true,
        };
        return {
          ...prev,
          [selectedDay]: {
            ...currentDayData,
            [mealType]: {
              ...currentDayData[mealType],
              [section]: { items: [...targetSectionList, newItem], maxItems: maxSelectable },
            },
          },
        };
      }
    });

    setShowMealItemFormModal(false);
    setMealItemFormContext(null);
  };

  const promptCreateNewMealSection = (mealType: string) => {
    setNewSectionMealType(mealType);
    setNewSectionName("");
    setNewSectionMaxItems("1");
    setIsEditingSection(false);
    setOldSectionName("");
    setShowCreateSectionModal(true);
  };

  const openEditMealSectionModal = (mealType: string, sectionName: string, maxItems: number) => {
    setNewSectionMealType(mealType);
    setNewSectionName(sectionName);
    setNewSectionMaxItems(String(maxItems));
    setIsEditingSection(true);
    setOldSectionName(sectionName);
    setShowCreateSectionModal(true);
  };

  const deleteMealSection = (mealType: string, sectionName: string) => {
    Alert.alert("Delete Section", `Are you sure you want to delete "${sectionName}" and all of its items?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setMealBoxData((prev: any) => {
            const currentDayData = prev[selectedDay] || {};
            const updatedSections = { ...currentDayData[mealType] };
            delete updatedSections[sectionName];

            return {
              ...prev,
              [selectedDay]: {
                ...currentDayData,
                [mealType]: updatedSections
              }
            };
          });
        }
      }
    ]);
  };

  const handleCreateOrEditMealSection = () => {
    if (!newSectionName || !newSectionName.trim()) {
      return Alert.alert("Validation Error", "Please enter a valid section name.");
    }
    const cleanedKey = newSectionName.trim();
    const maxSelectable = parseInt(newSectionMaxItems) || 1;

    setMealBoxData((prev: any) => {
      const currentDayData = prev[selectedDay] || {};
      const updatedSections = { ...currentDayData[newSectionMealType] };

      if (isEditingSection) {
        const structuralData = updatedSections[oldSectionName] || { items: [] };
        
        if (oldSectionName !== cleanedKey) {
          if (updatedSections[cleanedKey]) {
            Alert.alert("Notice", "A section with this name already exists.");
            return prev;
          }
          delete updatedSections[oldSectionName];
        }

        updatedSections[cleanedKey] = {
          items: structuralData.items || [],
          maxItems: maxSelectable
        };
      } else {
        if (updatedSections[cleanedKey]) {
          Alert.alert("Notice", "This section already exists.");
          return prev;
        }
        updatedSections[cleanedKey] = {
          items: [],
          maxItems: maxSelectable
        };
      }

      return {
        ...prev,
        [selectedDay]: {
          ...currentDayData,
          [newSectionMealType]: updatedSections
        }
      };
    });

    setShowCreateSectionModal(false);
  };

  const getPlanItemsSummary = (data: any) => {
    if (!data) return [];
    const items: string[] = [];
    
    const rootObj = (data instanceof Map) ? Object.fromEntries(data) : data;
    
    Object.values(rootObj).forEach((day: any) => {
      if (day) {
        ["Lunch", "Dinner"].forEach((mealType) => {
          const meal = day[mealType];
          if (meal) {
            Object.values(meal).forEach((section: any) => {
              const targetList = (section && Array.isArray(section.items)) ? section.items : (Array.isArray(section) ? section : []);
              targetList.forEach((item: any) => {
                if (item.name && !items.includes(item.name)) items.push(item.name);
              });
            });
          }
        });
      }
    });
    return items;
  };

  const handleAddonQtyChange = (itemId: string, direction: "up" | "down") => {
    setAddonCounts(prev => {
      const current = prev[itemId] || 0;
      let next = direction === "up" ? current + 1 : current - 1;
      if (next < 0) next = 0;
      return { ...prev, [itemId]: next };
    });
  };

  function getCurrentMenuPrice(): React.ReactNode {
    const selectedMenu = menus.find((menu) => menu._id === selectedMenuId);
    const basePrice = selectedMenu && selectedMenu.price !== undefined ? Number(selectedMenu.price) : 0;
    const addonTotal = addonsList.reduce((sum, addon) => {
      const addonId = addon._id || addon.id || "";
      const qty = addonCounts[addonId] || 0;
      const price = addon.price !== undefined && addon.price !== null ? Number(addon.price) : 0;
      return sum + price * qty;
    }, 0);

    const totalPrice = Number.isFinite(basePrice + addonTotal) ? basePrice + addonTotal : 0;
    return `₹${totalPrice}`;
  }

  return (
    <View style={styles.safe}>
      {/* IMMERSIVE FIXED HEADER BEHIND CAMERA / NOTCH WITH SINGLE-LINE ALIGNMENT & CALL ICON */}
      <View style={styles.globalHeader}>
        <View style={styles.globalHeaderContent}>
          <View style={styles.headerLeft}>
            <View style={styles.headerGlowRing}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="restaurant" size={17} color="#52B788" />
              </View>
            </View>
            <View style={styles.headerTextWrapper}>
              <Text style={styles.globalHeaderTitle} numberOfLines={1}>Chef Categories</Text>
              <View style={styles.statusBadgeRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusBadgeText}>Live Studio</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.headerAddCategoryBtn} 
              onPress={() => {
                setEditingCategoryId(null);
                setCategoryName("");
                setHeroImage("");
                setHeroCloudinaryId("");
                setShowForm(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={15} color="#FFFFFF" />
              <Text style={styles.headerAddCategoryText}>Add Category</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.headerCallBtn} 
              activeOpacity={0.8}
              onPress={() => Alert.alert("Customer Support", "Calling support line...")}
            >
              <Ionicons name="call" size={15} color="#52B788" />
            </TouchableOpacity>
          </View>
        </View>

        {/* SMALL HEADER TAB BAR: SHOWN ONLY WHEN A NEW/UNCONFIGURED CATEGORY IS ADDED (showBottomTabs === true) AND HIDDEN ON AVAILABLE CATEGORIES OR OLD EXISTING CATEGORIES */}
        {selectedCategoryForItems && showBottomTabs && (
          <View style={styles.headerTabBar}>
            <TouchableOpacity 
              style={[styles.headerTabItem, activeForm === "items" && styles.headerTabItemActive]} 
              onPress={() => {
                setActiveForm("items");
                setIsInItemsEditor(true);
              }}
            >
              <Ionicons name="grid" size={14} color={activeForm === "items" ? "#52B788" : "#94A3B8"} />
              <Text style={[styles.headerTabLabel, activeForm === "items" && styles.headerTabLabelActive]}>Items</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.headerTabItem, activeForm === "catering" && styles.headerTabItemActive]} 
              onPress={() => {
                setActiveForm("catering");
                setIsInItemsEditor(false);
              }}
            >
              <Ionicons name="restaurant" size={14} color={activeForm === "catering" ? "#52B788" : "#94A3B8"} />
              <Text style={[styles.headerTabLabel, activeForm === "catering" && styles.headerTabLabelActive]}>Catering</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.headerTabItem, activeForm === "mealbox" && styles.headerTabItemActive]} 
              onPress={() => {
                setActiveForm("mealbox");
                setIsInItemsEditor(false);
              }}
            >
              <Ionicons name="cafe" size={14} color={activeForm === "mealbox" ? "#52B788" : "#94A3B8"} />
              <Text style={[styles.headerTabLabel, activeForm === "mealbox" && styles.headerTabLabelActive]}>Meal Box</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.container}>
        {/* SUB-HEADER / ACTION ROW */}
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            {selectedCategoryForItems && !isInItemsEditor && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setSelectedCategoryForItems(null);
                  setActiveForm("items");
                  setShowBottomTabs(false);
                }}
              >
                <Ionicons name="arrow-back" size={15} color="#52B788" />
                <Text style={styles.backButtonText}>Categories</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {layoutFormSelection === "catering" && !isInItemsEditor ? (
              <TouchableOpacity style={styles.addButtonSmall} onPress={() => setShowMenuForm(true)}>
                <Ionicons name="add" size={17} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Menu</Text>
              </TouchableOpacity>
            ) : layoutFormSelection === "mealbox" && !isInItemsEditor ? (
              <TouchableOpacity
                style={styles.addButtonSmall}
                onPress={() => {
                  resetPlanForm();
                  setShowPlanForm(true);
                }}
              >
                <Ionicons name="add" size={17} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Plan</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {(layoutFormSelection === "catering" || layoutFormSelection === "mealbox") && !isInItemsEditor && (
            <View style={styles.topRowContainer}>
              {selectedCategoryForItems?.name && layoutFormSelection === "catering" && (
                <Text style={styles.cateringContextText}>
                  Add Catering Items for: {selectedCategoryForItems.name}
                </Text>
              )}
              {selectedCategoryForItems?.name && layoutFormSelection === "mealbox" && (
                <Text style={styles.cateringContextText}>
                  Add Meal Box Items for: {selectedCategoryForItems.name}
                </Text>
              )}
              <View style={styles.topRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(layoutFormSelection === "catering" ? cateringCategories : mealboxCategories).map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pill, (layoutFormSelection === "catering" ? selectedMenuCategory : selectedPlanCategory) === cat && styles.activePill]}
                      onPress={() => {
                        if (layoutFormSelection === "catering") {
                          setSelectedMenuCategory(cat);
                        } else {
                          setSelectedPlanCategory(cat);
                        }
                      }}
                    >
                      <Text style={[styles.pillText, (layoutFormSelection === "catering" ? selectedMenuCategory : selectedPlanCategory) === cat && { color: "#FFFFFF" }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* COMPONENT CONTENT BODY LISTS */}
        {!isInItemsEditor ? (
          layoutFormSelection === "items" ? (
            <>
              <Text style={styles.title}>Available Categories</Text>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
                <View style={styles.contentContainer}>
                  {categories.length === 0 ? (
                    <View style={styles.card}>
                      <View style={styles.emptyIconCircle}>
                        <Ionicons name="grid-outline" size={32} color="#52B788" />
                      </View>
                      <Text style={styles.emptyTitle}>No categories added yet</Text>
                      <Text style={styles.emptySubtitle}>Tap the "+ Add Category" button on the top header to publish your first collection.</Text>
                    </View>
                  ) : (
                    categories.map((item) => (
                      <View key={item._id} style={styles.categoryCard}>
                        <View style={styles.imageContainer}>
                          <Image source={{ uri: item.heroImageUrl }} style={styles.categoryHero} />
                          {/* HALF BLUR OVERLAY COMPLETELY REMOVED */}
                          <TouchableOpacity
                            style={[styles.topIconBtn, styles.editBtn]}
                            onPress={() => {
                              setEditingCategoryId(item._id);
                              setCategoryName(item.name);
                              setHeroImage(item.heroImageUrl);
                              setHeroCloudinaryId(item.heroCloudinaryId || "");
                              setShowForm(true);
                            }}
                          >
                            <Ionicons name="create-outline" size={17} color="#52B788" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.topIconBtn, styles.deleteBtn]} onPress={() => deleteCategory(item._id)}>
                            <Ionicons name="trash-outline" size={17} color="#F87171" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.categoryContent}>
                          <Text style={styles.categoryName}>{item.name}</Text>
                          <TouchableOpacity style={styles.addItemsButton} onPress={() => openAddItemsScreen(item)}>
                            <Ionicons name="layers-outline" size={17} color="#FFFFFF" />
                            <Text style={styles.addItemsText}>Add Category Items</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            </>
          ) : layoutFormSelection === "catering" ? (
            <>
              <Text style={styles.title}>Available Menus</Text>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
                <View style={styles.contentContainer}>
                  {filteredMenus.length === 0 ? (
                    <View style={styles.card}>
                      <View style={styles.emptyIconCircle}>
                        <Ionicons name="restaurant-outline" size={32} color="#52B788" />
                      </View>
                      <Text style={styles.emptyTitle}>No menus added yet</Text>
                      <Text style={styles.emptySubtitle}>Set up your first bespoke catering menu by pressing "+ Add Menu".</Text>
                    </View>
                  ) : (
                    filteredMenus.map((menu) => (
                      <MenuCard
                        key={menu._id}
                        menu={menu}
                        showActions={true}
                        onPress={() => { }}
                        onEdit={(menuData: any) => {
                          setEditingMenuId(menuData._id);
                          setMenuName(menuData.name);
                          setMenuPrice(String(menuData.price));
                          setItemsPerPlate(String(menuData.itemsPerPlate));
                          setMealType(menuData.mealType);
                          setMenuHeroImage(menuData.heroImageUrl);
                          setPlateItems(
                            menuData.plateItems.map((item: any) => ({
                              id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
                              name: item.name,
                              imageUrl: item.imageUrl,
                              cloudinaryId: item.cloudinaryId || "",
                            }))
                          );
                          setShowMenuForm(true);
                        }}
                        onDelete={(menuData: any) => {
                          Alert.alert("Delete Menu", "Are you sure?", [
                            { text: "Cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  const token = await getToken();
                                  await api.delete(`/api/chef-categories/menu/${menuData._id}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  setMenus((prev) => prev.filter((m) => m._id !== menuData._id));
                                  Alert.alert("Deleted");
                                } catch {
                                  Alert.alert("Error");
                                }
                              },
                            },
                          ]);
                        }}
                        onAddItems={(menuData: any) => openAddItemModal(menuData)}
                      />
                    ))
                  )}
                </View>
              </ScrollView>
            </>
          ) : layoutFormSelection === "mealbox" ? (
            <>
              <Text style={styles.title}>Available Plans</Text>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
                <View style={styles.contentContainer}>
                  {filteredPlans.length === 0 ? (
                    <View style={styles.card}>
                      <View style={styles.emptyIconCircle}>
                        <Ionicons name="cafe-outline" size={32} color="#52B788" />
                      </View>
                      <Text style={styles.emptyTitle}>No Plans Added Yet</Text>
                      <Text style={styles.emptySubtitle}>
                        Add your first meal plan using the Add Plan button above.
                      </Text>
                    </View>
                  ) : (
                    filteredPlans.map((plan) => (
                      <View key={plan._id} style={styles.planCard}>
                        <View style={styles.planImageContainer}>
                          <Image source={{ uri: plan.heroImageUrl }} style={styles.planHeroImage} />
                          {/* HALF BLUR OVERLAY COMPLETELY REMOVED */}
                          <TouchableOpacity style={[styles.topIconBtn, styles.editBtn]} onPress={() => openEditPlan(plan)}>
                            <Ionicons name="create-outline" size={17} color="#52B788" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.topIconBtn, styles.deleteBtn]} onPress={() => deletePlan(plan._id)}>
                            <Ionicons name="trash-outline" size={17} color="#F87171" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.planContent}>
                          <Text style={styles.planName}>{plan.name}</Text>
                          <Text style={styles.planDescription}>{plan.description}</Text>
                          <View style={styles.planDetails}>
                            <View style={styles.detailRow}>
                              <Ionicons name="time-outline" size={17} color="#52B788" />
                              <Text style={styles.detailText}>{plan.mealsPerDay} Meals / Day</Text>
                            </View>
                            <View style={styles.detailRow}>
                              <Ionicons name="calendar-outline" size={17} color="#52B788" />
                              <Text style={styles.detailText}>{plan.mealsPerWeek} Meals / Week</Text>
                            </View>
                          </View>
                          <View style={styles.priceRow}>
                            <Text style={styles.planPrice}>₹{plan.price}</Text>
                            <Text style={styles.priceUnit}>/week</Text>
                          </View>

                          <View style={styles.planItemsPreviewContainer}>
                            <Text style={styles.planItemsPreviewTitle}>Menu Preview:</Text>
                            {getPlanItemsSummary(plan.mealBoxData).length > 0 ? (
                              <Text style={styles.planItemsPreviewText} numberOfLines={2}>
                                {getPlanItemsSummary(plan.mealBoxData).join(" • ")}
                              </Text>
                            ) : (
                              <Text style={styles.planItemsPreviewText}>No items added yet</Text>
                            )}
                          </View>

                          <TouchableOpacity 
                            style={styles.planAddItemsButton} 
                            onPress={() => openPlanItemsModal(plan)}
                          >
                            <Ionicons name="grid-outline" size={17} color="#FFFFFF" />
                            <Text style={styles.planAddItemsButtonText}>Add Items</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            </>
          ) : null
        ) : (
          <View style={{ flex: 1, backgroundColor: "#0C130E" }}>
            <View style={styles.dHeader}>
              <Text style={styles.dTitle}>Add Items for {selectedCategoryForItems?.name}</Text>
              <TouchableOpacity onPress={closeltemsEditor} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {modalSubCategories.map((subCat, subIndex) => (
                <View key={subCat.id || `sub-${subIndex}`} style={[styles.subCategoryBlock, { position: "relative" }]}>
                  {isEditMode && (
                    <TouchableOpacity
                      style={[styles.topIconBtn, { right: 12, top: 12, backgroundColor: "rgba(220, 38, 38, 0.15)", borderColor: "rgba(220, 38, 38, 0.35)", zIndex: 10 }]}
                      onPress={() => handleDeleteSubCategory(subIndex, subCat._id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#F87171" />
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.label, { fontSize: 14, fontWeight: "800", marginTop: 4, color: "#E2E8F0" }]}>Sub Category {subIndex + 1}</Text>
                  <TextInput
                    placeholder="Enter sub category name"
                    placeholderTextColor="#64748B"
                    value={subCat.name}
                    onChangeText={(text) => updateSubCategoryName(subIndex, text)}
                    style={styles.input}
                    editable={isEditMode}
                  />
                  {subCat.items.map((item: any, itemIndex: number) => (
                    <View key={item.id || `item-${subIndex}-${itemIndex}`} style={[styles.itemBlock, { position: "relative" }]}>
                      {isEditMode && (
                        <TouchableOpacity
                          style={[styles.topIconBtn, { right: 10, top: 10, backgroundColor: "rgba(220, 38, 38, 0.15)", borderColor: "rgba(220, 38, 38, 0.35)", zIndex: 10 }]}
                          onPress={() => handleDeleteltem(subIndex, itemIndex, item._id)}
                        >
                          <Ionicons name="trash-outline" size={16} color="#F87171" />
                        </TouchableOpacity>
                      )}
                      <Text style={[styles.label, { marginTop: 4, fontWeight: "700", color: "#52B788" }]}>Item {itemIndex + 1}</Text>
                      <Text style={styles.label}>Item Name</Text>
                      <TextInput
                        placeholder="Enter item name"
                        placeholderTextColor="#64748B"
                        value={item.name}
                        onChangeText={(text) => updateltemField(subIndex, itemIndex, "name", text)}
                        style={styles.input}
                        editable={isEditMode}
                      />
                      <Text style={styles.label}>Item Description</Text>
                      <TextInput
                        placeholder="Enter item description"
                        placeholderTextColor="#64748B"
                        value={item.description}
                        onChangeText={(text) => updateltemField(subIndex, itemIndex, "description", text)}
                        style={styles.input}
                        editable={isEditMode}
                        multiline
                      />
                      <Text style={styles.label}>Quantity & Price</Text>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            placeholder="Quantity"
                            placeholderTextColor="#64748B"
                            value={item.quantity}
                            onChangeText={(text) => updateltemField(subIndex, itemIndex, "quantity", text)}
                            style={styles.input}
                            editable={isEditMode}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            placeholder="Price"
                            placeholderTextColor="#64748B"
                            value={item.price}
                            onChangeText={(text) => updateltemField(subIndex, itemIndex, "price", text)}
                            style={styles.input}
                            editable={isEditMode}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      {item.variants && item.variants.map((variant: any, variantIndex: number) => (
                        <View key={`${variant.id || variantIndex}-${variantIndex}`} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                          <View style={{ flex: 1 }}>
                            <TextInput
                              placeholder="Quantity"
                              placeholderTextColor="#64748B"
                              value={variant.quantity}
                              onChangeText={(text) => updateVariantField(subIndex, itemIndex, variantIndex, "quantity", text)}
                              style={styles.input}
                              editable={isEditMode}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <TextInput
                              placeholder="Price (₹)"
                              placeholderTextColor="#64748B"
                              value={variant.price}
                              onChangeText={(text) => updateVariantField(subIndex, itemIndex, variantIndex, "price", text)}
                              style={styles.input}
                              keyboardType="numeric"
                              editable={isEditMode}
                            />
                          </View>
                          {isEditMode && (
                            <TouchableOpacity style={styles.removeVariantButton} onPress={() => removeVariant(subIndex, itemIndex, variantIndex)}>
                              <Ionicons name="trash-outline" size={16} color="#F87171" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                      {isEditMode && (
                        <TouchableOpacity style={styles.addSmallButton} onPress={() => addMoreQuantityPrice(subIndex, itemIndex)}>
                          <Ionicons name="add-circle" size={15} color="#52B788" />
                          <Text style={styles.addSmallText}>+ Add More Quantity & Price</Text>
                        </TouchableOpacity>
                      )}
                      {/* Removed Veg/Non-Veg Switch */}
                      <Text style={styles.label}>Item Image</Text>
                      <TouchableOpacity style={styles.imagePicker} onPress={() => isEditMode && pickItemImage(subIndex, itemIndex)} disabled={!isEditMode}>
                        <Ionicons name="cloud-upload-outline" size={18} color="#52B788" style={{ marginBottom: 4 }} />
                        <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Pick Item Image</Text>
                      </TouchableOpacity>
                      {item.image && (
                        <View style={{ position: "relative", alignSelf: "flex-start", marginTop: 10 }}>
                          <Image source={{ uri: item.image }} style={styles.previewImage} />
                          {isEditMode && (
                            <TouchableOpacity style={styles.removelcon} onPress={() => removeItemItem(subIndex, itemIndex)}>
                              <Ionicons name="close" size={13} color="#ffffff" />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  ))}
                  {isEditMode && (
                    <TouchableOpacity style={styles.addMediumButton} onPress={() => addNewItemToSub(subIndex)}>
                      <Ionicons name="add-circle" size={16} color="#52B788" />
                      <Text style={styles.addMediumText}>+ Add More Items</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {isEditMode && (
                <TouchableOpacity style={[styles.addLargeButton, { marginTop: 18 }]} onPress={addNewSubCategory}>
                  <Ionicons name="add-circle" size={20} color="#52B788" />
                  <Text style={styles.addLargeText}>+ Add New Sub Category</Text>
                </TouchableOpacity>
              )}
              {isEditMode ? (
                <TouchableOpacity style={[styles.saveButton, addingItemLoading && { opacity: 0.7 }]} onPress={saveCategoryItemsList} disabled={addingItemLoading}>
                  {addingItemLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{selectedCategoryForItems?.subCategories?.length > 0 ? "Update Sub Categories & Items" : "Save All Sub Categories & Items"}</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.editToggleButton} onPress={() => setIsEditMode(true)}>
                  <Text style={styles.editToggleText}>Edit Sub Categories & Items</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ADD/EDIT MAIN CATEGORY MODAL */}
      <Modal visible={showForm} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCategoryId ? "Edit Category" : "Add Chef Category"}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowForm(false);
                  setCategoryName("");
                  setHeroImage("");
                  setHeroCloudinaryId("");
                  setEditingCategoryId(null);
                }}
                style={styles.closeRoundBtn}
              >
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Category Name</Text>
              <TextInput placeholder="Enter category name" placeholderTextColor="#64748B" value={categoryName} onChangeText={setCategoryName} style={styles.input} />
              <Text style={styles.label}>Category Image</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickHeroImage}>
                <Ionicons name="image-outline" size={20} color="#52B788" style={{ marginBottom: 4 }} />
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Pick Category Image</Text>
              </TouchableOpacity>
              {heroImage && (
                <View style={{ position: "relative", alignSelf: "flex-start", marginTop: 10 }}>
                  <Image source={{ uri: heroImage }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removelcon} onPress={removeHeroImage}>
                    <Ionicons name="close" size={13} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={[styles.saveButton, buttonLoading && { opacity: 0.7 }]} onPress={saveCategory} disabled={buttonLoading}>
                {buttonLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editingCategoryId ? "Update Category" : "Save Category"}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ORIGINAL MENU FORM MODAL */}
      <Modal visible={showMenuForm} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMenuId ? "Edit Menu" : "Add Chef Menu"}</Text>
              <TouchableOpacity onPress={() => setShowMenuForm(false)} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Menu Name</Text>
              <TextInput placeholder="Enter menu name" placeholderTextColor="#64748B" value={menuName} onChangeText={setMenuName} style={styles.input} />
              <Text style={styles.label}>Price Per Plate</Text>
              <TextInput placeholder="e.g. 450" placeholderTextColor="#64748B" value={menuPrice} onChangeText={setMenuPrice} style={styles.input} keyboardType="numeric" />
              <Text style={styles.SectionLabel}>Items Per Plate</Text>
              <TextInput placeholder="e.g. 12" placeholderTextColor="#64748B" value={itemsPerPlate} onChangeText={setItemsPerPlate} style={styles.input} keyboardType="numeric" />
              <Text style={styles.label}>Meal Type</Text>
              <TouchableOpacity style={styles.dropdown} onPress={() => setShowDropdown(!showDropdown)}>
                <Text style={{ color: "#E2E8F0", fontWeight: "600" }}>{mealType}</Text>
                <Ionicons name="chevron-down" size={16} color="#52B788" />
              </TouchableOpacity>
              {showDropdown && (
                <View style={styles.glassDropdownContainer}>
                  {mealTypes.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.glassOption, mealType === type && styles.glassOptionActive]}
                      onPress={() => {
                        setMealType(type);
                        setShowDropdown(false);
                      }}
                    >
                      <Text style={[styles.glassText, mealType === type && styles.glassTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.label}>Hero Image</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickMenuHeroImage}>
                <Ionicons name="image-outline" size={20} color="#52B788" style={{ marginBottom: 4 }} />
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Pick Hero Image</Text>
              </TouchableOpacity>
              {menuHeroImage && (
                <View style={{ position: "relative", alignSelf: "flex-start", marginTop: 10 }}>
                  <Image source={{ uri: menuHeroImage }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removelcon} onPress={removeMenuHeroImage}>
                    <Ionicons name="close" size={13} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.sectionTitle}>Items in Plate</Text>
              {plateItems.map((item) => (
                <View key={item.id} style={{ marginBottom: 14 }}>
                  <TextInput placeholder="Item name" placeholderTextColor="#64748B" value={item.name} onChangeText={(text) => updatePlateItem(item.id, "name", text)} style={styles.input} />
                  <TouchableOpacity style={styles.imagePicker} onPress={() => pickMenuPlateItemImage(item.id)}>
                    <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Pick Item Image</Text>
                  </TouchableOpacity>
                  {item.imageUrl && (
                    <View style={{ position: "relative", alignSelf: "flex-start", marginTop: 8 }}>
                      <Image source={{ uri: item.imageUrl }} style={styles.previewImage} />
                      <TouchableOpacity style={styles.removelcon} onPress={() => removePlateItemImage(item.id)}>
                        <Ionicons name="close" size={13} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.addMoreBtn} onPress={addPlateItem}>
                <Text style={{ color: "#52B788", fontWeight: "700", fontSize: 13.5 }}>+ Add More Item</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, menuButtonLoading && { opacity: 0.7 }]} onPress={saveMenu} disabled={menuButtonLoading}>
                {menuButtonLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editingMenuId ? "Update Menu" : "Save Menu"}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ADD/EDIT PLAN MODAL */}
      <Modal visible={showPlanForm} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingPlanId ? "Edit Plan" : "Add Chef Plan"}</Text>
              <TouchableOpacity onPress={() => { setShowPlanForm(false); resetPlanForm(); }} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Plan Name</Text>
              <TextInput placeholder="e.g. Classic Plan" placeholderTextColor="#64748B" value={planName} onChangeText={setPlanName} style={styles.input} />
              <Text style={styles.label}>Plan Description</Text>
              <TextInput
                placeholder="Perfect balance of taste & nutrition"
                placeholderTextColor="#64748B"
                value={planDescription}
                onChangeText={setPlanDescription}
                style={[styles.input, { height: 80 }]}
                multiline
              />
              <Text style={styles.label}>Meals Per Day</Text>
              <TextInput placeholder="e.g. 2" placeholderTextColor="#64748B" value={mealsPerDay} onChangeText={setMealsPerDay} style={styles.input} keyboardType="numeric" />
              <Text style={styles.label}>Meals Per Week</Text>
              <TextInput placeholder="e.g. 20" placeholderTextColor="#64748B" value={mealsPerWeek} onChangeText={setMealsPerWeek} style={styles.input} keyboardType="numeric" />
              <Text style={styles.label}>Price Per Week</Text>
              <TextInput placeholder="e.g. 749" placeholderTextColor="#64748B" value={planPrice} onChangeText={setPlanPrice} style={styles.input} keyboardType="numeric" />
              <Text style={styles.label}>Plan Category</Text>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setShowPlanDropdown(!showPlanDropdown)}
              >
                <Text style={{ color: "#E2E8F0", fontWeight: "600" }}>{selectedPlanCategory}</Text>
                <Ionicons name="chevron-down" size={16} color="#52B788" />
              </TouchableOpacity>
              {showPlanDropdown && (
                <View style={styles.glassDropdownContainer}>
                  {mealboxCategories.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.glassOption, selectedPlanCategory === type && styles.glassOptionActive]}
                      onPress={() => {
                        setSelectedPlanCategory(type);
                        setShowPlanDropdown(false);
                      }}
                    >
                      <Text style={[styles.glassText, selectedPlanCategory === type && styles.glassTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.label}>Hero Image</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickPlanHeroImage}>
                <Ionicons name="image-outline" size={20} color="#52B788" style={{ marginBottom: 4 }} />
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Pick Plan Image</Text>
              </TouchableOpacity>
              {planHeroImage && (
                <View style={{ position: "relative", alignSelf: "flex-start", marginTop: 10 }}>
                  <Image source={{ uri: planHeroImage }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removelcon} onPress={removePlanHeroImage}>
                    <Ionicons name="close" size={13} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={[styles.saveButton, planLoading && { opacity: 0.7 }]} onPress={savePlan} disabled={planLoading}>
                {planLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editingPlanId ? "Update Plan" : "Save Plan"}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PREMIUM DAAWATH CUSTOMIZER MODAL */}
      <Modal visible={showAddItemModal} transparent animationType="slide">
        <View style={[styles.screenshotOverlay, { backgroundColor: '#0C130E' }]}>
          <SafeAreaView style={styles.screenshotSafe}>
            
            {/* Header section */}
            <View style={styles.screenshotHeader}>
              <TouchableOpacity onPress={() => setShowAddItemModal(false)} style={styles.screenshotBackBtn}>
                <Ionicons name="chevron-back" size={20} color="#E2E8F0" />
              </TouchableOpacity>
              <Text style={styles.screenshotTitleText}>
                {menus.find(m => m._id === selectedMenuId)?.name || "Samrat Menu Setup"}
              </Text>
              <View style={{ width: 38 }} />
            </View>

            {/* Token Category Browser */}
            <View style={styles.plateContainerSection}>
              <Text style={styles.plateHeading}>BROWSE MENU SECTIONS</Text>
              <ScrollView 
                ref={tokenHorizontalScrollRef}
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 4 }}
              >
                {categoriesList.map((cat, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.plateToken, selectedCategoryIndex === idx && styles.plateTokenSelected]}
                    onPress={() => {
                      setSelectedCategoryIndex(idx);
                      isProgrammaticScroll.current = true;
                      
                      // Scroll vertical list to the category section
                      const targetY = categorySectionLayouts.current[idx] || 0;
                      mainVerticalScrollRef.current?.scrollTo({ y: targetY, animated: true });
                      
                      // Center the tapped token horizontally
                      tokenHorizontalScrollRef.current?.scrollTo({ x: idx * 83 - 40, animated: true });
                      
                      setTimeout(() => {
                        isProgrammaticScroll.current = false;
                      }, 500);
                    }}
                  >
                    <Image 
                      source={{ uri: cat.imageUrl || "https://via.placeholder.com/60" }} 
                      style={styles.plateTokenImage} 
                    />
                    <Text style={[styles.plateTokenText, selectedCategoryIndex === idx && { color: "#52B788" }]} numberOfLines={1}>{cat.name || "Category"}</Text>
                  </TouchableOpacity>
                ))}
                
                <TouchableOpacity
                  style={styles.plateTokenAdd}
                  onPress={() => {
                    setDaawathCategoryName("");
                    setDaawathCategoryImage("");
                    setDaawathCategoryCloudinaryId("");
                    setDaawathCategoryMaxItems("1");
                    setEditingDaawathCatIndex(null);
                    setShowAddItemModal(false);
                    setTimeout(() => setShowCategoryForm(true), 300);
                  }}
                >
                  <View style={styles.plateTokenAddCircle}>
                    <Ionicons name="add" size={22} color="#52B788" />
                  </View>
                  <Text style={styles.plateTokenText}>New Cat</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            <View style={styles.customAreaContainer}>
              <Text style={styles.customMainTitle}>Customize Menu Items</Text>
              <Text style={styles.customSubtitle}>Tailor dishes, selection logic controls, and extra event add-ons dynamically.</Text>
            </View>

            {/* Main Vertical ScrollView with onScroll tracking */}
            <ScrollView 
              ref={mainVerticalScrollRef}
              style={{ flex: 1, paddingHorizontal: 14 }}
              contentContainerStyle={{ paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => {
                if (isProgrammaticScroll.current) return;
                const scrollY = event.nativeEvent.contentOffset.y;
                
                let activeIndex = 0;
                Object.keys(categorySectionLayouts.current).forEach((key) => {
                  const idx = Number(key);
                  const sectionY = categorySectionLayouts.current[idx] || 0;
                  if (scrollY >= sectionY - 60) {
                    activeIndex = idx;
                  }
                });

                if (activeIndex !== selectedCategoryIndex) {
                  setSelectedCategoryIndex(activeIndex);
                  tokenHorizontalScrollRef.current?.scrollTo({ x: activeIndex * 83 - 40, animated: true });
                }
              }}
            >
              {categoriesList.length === 0 ? (
                <View style={[styles.screenshotSelectionBox, styles.emptySelectionBox]}>
                  <Ionicons name="folder-open-outline" size={48} color="#52B788" />
                  <Text style={styles.emptySelectionTitle}>No Categories Configured</Text>
                  <Text style={styles.emptySelectionSub}>
                    Tap "New Cat" badge above inside the browsing strip to establish limitless sections.
                  </Text>
                </View>
              ) : (
                categoriesList.map((currentCategory, idx) => {
                  const dishes = currentCategory.items || [];
                  const maxSelectable = currentCategory.maxItems !== undefined ? currentCategory.maxItems : 1;

                  return (
                    <View 
                      key={idx} 
                      style={styles.screenshotSelectionBox}
                      onLayout={(event) => {
                        const layout = event.nativeEvent.layout;
                        categorySectionLayouts.current[idx] = layout.y;
                      }}
                    >
                      {/* Sub-Header Actions */}
                      <View style={styles.screenshotSelectionHeader}>
                        <View style={styles.selectionTitleRow}>
                          <View style={styles.selectionNumberBadge}>
                            <Text style={styles.selectionNumberText}>{idx + 1}</Text>
                          </View>
                          <View style={styles.selectionTitleWrapper}>
                            <Text style={styles.selectionMainLabel}>{currentCategory.name || "starters"}</Text>
                            <Text style={styles.selectionMaxLabel}>(Select max {maxSelectable})</Text>
                          </View>
                          <View style={styles.selectionActions}>
                            <TouchableOpacity onPress={() => openEditDaawathCategory(idx)} style={styles.selectionActionBtn}>
                              <Ionicons name="pencil" size={15} color="#52B788" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteDaawathCategory(idx)} style={[styles.selectionActionBtn, { backgroundColor: "rgba(220, 38, 38, 0.15)", borderColor: "rgba(220, 38, 38, 0.3)" }]}>
                              <Ionicons name="trash" size={15} color="#F87171" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      {/* Items Listing */}
                      {dishes.length === 0 ? (
                        <Text style={styles.noDishesText}>No specific items found under this group yet. Tap variant builder to insert.</Text>
                      ) : (
                        dishes.map((dish: any, dishIdx: number) => {
                          return (
                            <View key={dishIdx} style={styles.dishRowSelectorItem}>
                              <View style={styles.dishRowLeft}>
                                <Image 
                                  source={{ uri: dish.imageUrl || "https://via.placeholder.com/80" }} 
                                  style={styles.dishRowImage} 
                                />
                                <View style={styles.dishRowInfo}>
                                  <Text style={styles.dishRowName}>{dish.name || "Dish Item"}</Text>
                                  {dish.price !== undefined && dish.price !== null && dish.price !== "" ? (
                                    <Text style={styles.dishRowPrice}>₹{dish.price} / Plate</Text>
                                  ) : null}
                                </View>
                              </View>
                              
                              <View style={styles.dishRowActions}>
                                <TouchableOpacity onPress={() => openEditDaawathItem(dishIdx)} style={styles.dishActionBtn}>
                                  <Ionicons name="pencil-outline" size={15} color="#52B788" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteDaawathItem(idx, dishIdx)} style={[styles.dishActionBtn, { backgroundColor: "rgba(220, 38, 38, 0.15)", borderColor: "rgba(220, 38, 38, 0.3)" }]}>
                                  <Ionicons name="trash-outline" size={15} color="#F87171" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      )}

                      {/* Section Quick Actions */}
                      <View style={styles.chefQuickActionsContainer}>
                        <TouchableOpacity 
                          style={styles.chefQuickActionBtn}
                          onPress={() => {
                            setSelectedCategoryIndex(idx);
                            setEditingItemIndex(null);
                            setShowAddItemModal(false);
                            setTimeout(() => setShowItemForm(true), 300);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={17} color="#52B788" />
                          <Text style={styles.chefQuickActionText}>Add Item Variant</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Addons Block */}
              <View style={styles.screenshotSelectionBox}>
                <View style={styles.addonSectionTitleRow}>
                  <View style={styles.addonGreenCircle}>
                    <Ionicons name="add" size={16} color="#52B788" />
                  </View>
                  <View style={styles.addonTitleWrapper}>
                    <Text style={styles.addonMainLabel}>Menu Add-ons</Text>
                    <Text style={styles.addonSubLabel}>Optional items available to order separately.</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addNewAddonBtn}
                    onPress={() => {
                      setAddonName("");
                      setAddonPrice("");
                      setAddonImage("");
                      setAddonCloudinaryId("");
                      setEditingAddonIndex(null);
                      setShowAddItemModal(false);
                      setTimeout(() => setShowAddonForm(true), 300);
                    }}
                  >
                    <Text style={styles.addNewAddonText}>+ New Addon</Text>
                  </TouchableOpacity>
                </View>
                
                {addonsList.length === 0 ? (
                  <Text style={styles.noDishesText}>No premium menu addons recorded yet.</Text>
                ) : (
                  addonsList.map((addon, aIdx) => (
                    <View key={aIdx} style={styles.dishRowSelectorItem}>
                      <Image source={{ uri: addon.imageUrl || "https://via.placeholder.com/80" }} style={[styles.dishRowImage, { width: 50, height: 50, borderRadius: 12 }]} />
                      <View style={styles.dishRowInfo}>
                        <Text style={styles.dishRowName}>{addon.name}</Text>
                        {addon.price !== undefined && addon.price !== null && addon.price !== "" ? (
                          <Text style={styles.dishRowPrice}>₹{addon.price} / Plate</Text>
                        ) : null}
                      </View>
                      <View style={styles.dishRowActions}>
                        <TouchableOpacity onPress={() => openEditAddon(aIdx)} style={styles.dishActionBtn}>
                          <Ionicons name="pencil" size={14} color="#52B788" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteAddon(aIdx)} style={[styles.dishActionBtn, { backgroundColor: "rgba(220, 38, 38, 0.15)", borderColor: "rgba(220, 38, 38, 0.3)" }]}>
                          <Ionicons name="trash" size={14} color="#F87171" />
                        </TouchableOpacity>
                        <View style={styles.qtyStepperContainer}>
                          <TouchableOpacity style={styles.qtyStepperBtn} onPress={() => handleAddonQtyChange(addon._id || addon.id || aIdx.toString(), "down")}>
                            <Text style={styles.qtyStepperText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.qtyValueText}>{addonCounts[addon._id || addon.id || aIdx.toString()] || 0}</Text>
                          <TouchableOpacity style={styles.qtyStepperBtn} onPress={() => handleAddonQtyChange(addon._id || addon.id || aIdx.toString(), "up")}>
                            <Text style={styles.qtyStepperText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Commit button */}
              <View style={{ marginTop: 15, marginBottom: 30 }}>
                <TouchableOpacity 
                  style={[styles.screenshotPrimarySubmitBtn, menuButtonLoading && { opacity: 0.7 }]} 
                  onPress={handleSaveDaawath} 
                  disabled={menuButtonLoading}
                >
                  {menuButtonLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.screenshotSubmitBtnText}>{hasSubmittedDaawath ? "Update Complete Configurations" : "Submit Configurations instantly"}</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Sticky pricing matrix footer */}
            <View style={styles.screenshotStickyFooterBar}>
              <View>
                <Text style={styles.footerPriceAmountText}>{getCurrentMenuPrice()}</Text>
                <Text style={styles.footerPriceUnitLabel}>standard cost per plate</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* DAAWATH ADDON MODAL FORM */}
      <Modal visible={showAddonForm} transparent animationType="fade">
        <View style={styles.superOverlay}>
          <View style={styles.formModal}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingAddonIndex !== null ? "Edit Addon" : "Add Addon"}</Text>
              <TouchableOpacity onPress={() => { 
                setShowAddonForm(false); 
                setTimeout(() => setShowAddItemModal(true), 300); 
              }} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Addon Name</Text>
            <TextInput style={styles.input} value={addonName} onChangeText={setAddonName} placeholder="e.g. Raita" placeholderTextColor="#64748B" />
            <Text style={styles.label}>Price Per Plate</Text>
            <TextInput style={styles.input} value={addonPrice} onChangeText={setAddonPrice} keyboardType="numeric" placeholder="e.g. 30" placeholderTextColor="#64748B" />
            <Text style={styles.label}>Addon Image</Text>
            <TouchableOpacity style={styles.imagePicker} onPress={pickAddonImage}>
              <Ionicons name="cloud-upload-outline" size={18} color="#52B788" style={{ marginBottom: 4 }} />
              <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Choose File</Text>
            </TouchableOpacity>
            {addonImage ? (
              <View style={{ position: "relative", alignSelf: "center", marginTop: 10 }}>
                <Image source={{ uri: addonImage }} style={styles.roundImage} />
                <TouchableOpacity style={styles.removelcon} onPress={removeAddonImageInForm}><Ionicons name="close" size={13} color="#ffffff" /></TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity style={styles.submitBtn} onPress={saveAddon}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{editingAddonIndex !== null ? "Update Addon" : "+ Add Addon"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MEAL PLAN ITEMS MODAL */}
      <Modal visible={showPlanItemsModal} transparent animationType="slide">
        <View style={styles.planItemsOverlay}>
          <View style={styles.planItemsModalCard}>
            <View style={styles.planItemsHeader}>
              <Text style={styles.planItemsTitle}>
                Manage Items for: {selectedPlanForItems?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowPlanItemsModal(false)} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, backgroundColor: "#0C130E" }}>
              <View style={styles.planItemsTopBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {days.map((day) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => setSelectedDay(day as any)}
                      style={[styles.dayPill, selectedDay === day && styles.dayPillActive]}
                    >
                      <Text style={[styles.dayPillText, selectedDay === day && { color: "#FFF" }]}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.infoRow}>
                  <Ionicons name="information-circle-outline" size={16} color="#52B788" style={{ marginTop: 1 }} />
                  <Text style={styles.infoText}>
                    Add, edit or reorder items for each meal. This will be visible to customers.
                  </Text>
                </View>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
                {(selectedPlanForItems?.category === "Lunch" ? ["Lunch"] : selectedPlanForItems?.category === "Dinner" ? ["Dinner"] : ["Lunch", "Dinner"]).map((mealTime) => (
                  <View key={mealTime} style={styles.mealSectionCard}>
                    <View style={styles.mealSectionHeader}>
                      <View style={styles.mealSectionTitle}>
                        <Text style={styles.mealIcon}>{mealTime === "Lunch" ? "☀️" : "🌙"}</Text>
                        <Text style={styles.mealLabel}>{mealTime}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.addCategoryBtn}
                        onPress={() => promptCreateNewMealSection(mealTime)}
                      >
                        <Ionicons name="add" size={15} color="#52B788" />
                        <Text style={styles.addCategoryText}>Add Category</Text>
                      </TouchableOpacity>
                    </View>

                    {Object.keys(mealBoxData[selectedDay]?.[mealTime] || {}).length === 0 ? (
                      <View style={styles.emptyMealSection}>
                        <Ionicons name="add-circle-outline" size={30} color="#52B788" style={{ marginBottom: 8 }} />
                        <Text style={styles.emptyMealTitle}>No sections added yet</Text>
                        <Text style={styles.emptyMealSub}>
                          Tap "Add Category" to create your first{"\n"}{mealTime} section
                        </Text>
                      </View>
                    ) : (
                      Object.keys(mealBoxData[selectedDay]?.[mealTime] || {}).map((section) => {
                        const sectionWrapper = mealBoxData[selectedDay]?.[mealTime]?.[section];
                        const maxSelectable = (sectionWrapper && typeof sectionWrapper.maxItems === "number") ? sectionWrapper.maxItems : 1;
                        const itemsList = (sectionWrapper && Array.isArray(sectionWrapper.items)) ? sectionWrapper.items : (Array.isArray(sectionWrapper) ? sectionWrapper : []);
                        
                        return (
                          <View key={section} style={styles.sectionContainer}>
                            <View style={styles.sectionHeader}>
                              <View style={styles.sectionTitleWrapper}>
                                <Text style={styles.sectionName}>{section}</Text>
                                <Text style={styles.sectionMax}>(Select max {maxSelectable})</Text>
                                <TouchableOpacity style={styles.sectionAction} onPress={() => openEditMealSectionModal(mealTime, section, maxSelectable)}>
                                  <Ionicons name="pencil" size={14} color="#52B788" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.sectionAction} onPress={() => deleteMealSection(mealTime, section)}>
                                  <Ionicons name="trash" size={14} color="#F87171" />
                                </TouchableOpacity>
                              </View>
                              <TouchableOpacity 
                                style={styles.addItemBtn}
                                onPress={() => openAddMealItemModal(mealTime, section)}
                              >
                                <Text style={styles.addItemText}>+ Add Item</Text>
                              </TouchableOpacity>
                            </View>

                            {itemsList.length === 0 ? (
                              <View style={styles.emptyItemList}>
                                <Text style={styles.emptyItemText}>No items added to {section} yet.</Text>
                              </View>
                            ) : (
                              <View>
                                {itemsList.map((item: any) => (
                                  <View key={item.id} style={styles.mealItemRow}>
                                    <Image source={{ uri: item.image }} style={styles.mealItemImage} />
                                    <View style={styles.mealItemInfo}>
                                      <Text style={styles.mealItemName}>{item.name}</Text>
                                      {item.price ? <Text style={styles.mealItemPrice}>+ ₹{item.price}</Text> : null}
                                    </View>
                                    <View style={styles.mealItemActions}>
                                      <TouchableOpacity 
                                        style={[styles.activeToggle, item.active ? styles.activeToggleOn : styles.activeToggleOff]}
                                        onPress={() => toggleMealItemActive(mealTime, section, item.id)}
                                      >
                                        <Text style={[styles.activeToggleText, item.active ? { color: "#52B788" } : { color: "#F87171" }]}>
                                          {item.active ? "Active" : "Inactive"}
                                        </Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity style={styles.mealActionBtn} onPress={() => openEditMealItemModal(mealTime, section, item)}>
                                        <Ionicons name="pencil-outline" size={16} color="#52B788" />
                                      </TouchableOpacity>
                                      <TouchableOpacity style={styles.mealActionBtn} onPress={() => deleteMealItem(mealTime, section, item.id)}>
                                        <Ionicons name="trash-outline" size={16} color="#F87171" />
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.planItemsFooter}>
                <TouchableOpacity style={styles.saveItemsBtn} onPress={saveMealBoxDataToPlan}>
                  {planLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveItemsBtnText}>Save Plan Items</Text>}
                </TouchableOpacity>
              </View>
            </View>

            {showMealItemFormModal && (
              <View style={styles.floatingModalOverlay}>
                <View style={styles.floatingModalCard}>
                  <View style={styles.floatingModalHeader}>
                    <Text style={styles.floatingModalTitle}>
                      {mealItemFormContext?.isEditing ? "Modify Meal Item" : `Add Item into ${mealItemFormContext?.section}`}
                    </Text>
                    <TouchableOpacity onPress={() => setShowMealItemFormModal(false)} style={styles.closeRoundBtn}>
                      <Ionicons name="close" size={18} color="#E2E8F0" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.floatingModalLabel}>Dish / Item Title</Text>
                  <TextInput 
                    style={styles.floatingModalInput} 
                    placeholder="e.g. Garlic Naan, Chicken Tikka" 
                    placeholderTextColor="#64748B"
                    value={mealItemFormName} 
                    onChangeText={setMealItemFormName} 
                  />
                  <Text style={styles.floatingModalLabel}>Extra / Base Premium Surcharge Price (Optional - ₹)</Text>
                  <TextInput 
                    style={styles.floatingModalInput} 
                    placeholder="Leave blank if included in plan standard costs" 
                    placeholderTextColor="#64748B"
                    value={mealItemFormPrice} 
                    onChangeText={setMealItemFormPrice} 
                    keyboardType="numeric" 
                  />
                  <Text style={styles.floatingModalLabel}>Dish Cover Image Asset</Text>
                  <TouchableOpacity style={styles.floatingModalImagePicker} onPress={pickMealItemImageFromGallery}>
                    <Ionicons name="image-outline" size={18} color="#52B788" style={{ marginBottom: 4 }} />
                    <Text style={styles.floatingModalPickerText}>
                      {mealItemFormImage ? "Change Chosen Asset" : "Select Cover From Gallery"}
                    </Text>
                  </TouchableOpacity>
                  {mealItemFormImage && (
                    <View style={{ position: "relative", alignSelf: "center", marginTop: 10 }}>
                      <Image source={{ uri: mealItemFormImage }} style={styles.roundImage} />
                      <TouchableOpacity style={styles.removelcon} onPress={() => setMealItemFormImage("")}>
                        <Ionicons name="close" size={13} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity style={styles.floatingModalSubmitBtn} onPress={saveMealItemForm}>
                    <Text style={styles.floatingModalSubmitBtnText}>
                      {mealItemFormContext?.isEditing ? "Save Selection Upgrades" : "Add Instantly to Form View"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {showCreateSectionModal && (
              <View style={styles.floatingModalOverlay}>
                <View style={styles.floatingModalCard}>
                  <View style={styles.floatingModalHeader}>
                    <Text style={styles.floatingModalTitle}>
                      {isEditingSection ? "Modify Section Header" : "New Section Container"}
                    </Text>
                    <TouchableOpacity onPress={() => setShowCreateSectionModal(false)} style={styles.closeRoundBtn}>
                      <Ionicons name="close" size={18} color="#E2E8F0" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.floatingModalLabel}>Section Category Name</Text>
                  <TextInput 
                    style={styles.floatingModalInput} 
                    placeholder="e.g., Soup, Desserts, Starters, Base, Dal" 
                    placeholderTextColor="#64748B"
                    value={newSectionName} 
                    onChangeText={setNewSectionName} 
                  />
                  <Text style={styles.floatingModalLabel}>Max Items to be Selected</Text>
                  <TextInput 
                    style={styles.floatingModalInput} 
                    placeholder="1" 
                    placeholderTextColor="#64748B"
                    value={newSectionMaxItems} 
                    onChangeText={setNewSectionMaxItems} 
                    keyboardType="numeric" 
                  />
                  <TouchableOpacity style={styles.floatingModalSubmitBtn} onPress={handleCreateOrEditMealSection}>
                    <Text style={styles.floatingModalSubmitBtnText}>
                      {isEditingSection ? "Apply Headings Updates" : "Create Section"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* DAAWATH CATEGORY MODAL FORM */}
      <Modal visible={showCategoryForm} transparent animationType="fade">
        <View style={styles.superOverlay}>
          <View style={styles.formModal}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingDaawathCatIndex !== null ? "Edit Category" : "Add Category"}</Text>
              <TouchableOpacity onPress={() => { 
                setShowCategoryForm(false); 
                setTimeout(() => setShowAddItemModal(true), 300); 
              }} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Category Name</Text>
            <TextInput style={styles.input} value={daawathCategoryName} onChangeText={setDaawathCategoryName} placeholderTextColor="#64748B" placeholder="Enter category name" />
            <Text style={styles.label}>Max no of items to be selected</Text>
            <TextInput 
              style={styles.input} 
              value={daawathCategoryMaxItems} 
              onChangeText={setDaawathCategoryMaxItems} 
              placeholderTextColor="#64748B" 
              placeholder="e.g. 2" 
              keyboardType="numeric" 
            />
            <Text style={styles.label}>Category Image</Text>
            <TouchableOpacity style={styles.imagePicker} onPress={pickDaawathCategoryImage}>
              <Ionicons name="image-outline" size={18} color="#52B788" style={{ marginBottom: 4 }} />
              <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Choose File</Text>
            </TouchableOpacity>
            {daawathCategoryImage && (
              <View style={{ position: "relative", alignSelf: "center", marginTop: 10 }}>
                <Image source={{ uri: daawathCategoryImage }} style={styles.roundImage} />
                <TouchableOpacity style={styles.removelcon} onPress={removeDaawathCategoryImageInForm}><Ionicons name="close" size={13} color="#ffffff" /></TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => {
                if (!daawathCategoryName.trim()) {
                  return Alert.alert("Please enter category name");
                }
                const newCategory = {
                  name: daawathCategoryName.trim(),
                  imageUrl: daawathCategoryImage,
                  cloudinaryId: daawathCategoryCloudinaryId,
                  maxItems: parseInt(daawathCategoryMaxItems) || 1,
                  items: editingDaawathCatIndex !== null ? categoriesList[editingDaawathCatIndex].items : [], 
                };
                const updated = [...categoriesList];
                if (editingDaawathCatIndex !== null) {
                  updated[editingDaawathCatIndex] = newCategory;
                } else {
                  updated.push(newCategory);
                }
                setCategoriesList(updated);
                if (editingDaawathCatIndex === null) {
                  setSelectedCategoryIndex(updated.length - 1);
                }
                setEditingDaawathCatIndex(null);
                setShowCategoryForm(false);
                setTimeout(() => setShowAddItemModal(true), 300);
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{editingDaawathCatIndex !== null ? "Update Category" : "+ Add Category"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DAAWATH ITEM MODAL FORM */}
      <Modal visible={showItemForm} transparent animationType="fade">
        <View style={styles.superOverlay}>
          <View style={styles.formModal}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{editingItemIndex !== null ? "Edit Menu Item" : "Add Menu Item"}</Text>
              <TouchableOpacity onPress={() => { 
                setShowItemForm(false); 
                setTimeout(() => setShowAddItemModal(true), 300); 
              }} style={styles.closeRoundBtn}>
                <Ionicons name="close" size={18} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Item Name</Text>
            <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholderTextColor="#64748B" placeholder="Enter item name" />
            <Text style={styles.label}>Price Per Piece</Text>
            <TextInput style={styles.input} value={itemPrice} onChangeText={setItemPrice} keyboardType="numeric" placeholderTextColor="#64748B" placeholder="e.g. 150" />
            <Text style={styles.label}>Item Image</Text>
            <TouchableOpacity style={styles.imagePicker} onPress={pickMenuItemImage}>
              <Ionicons name="image-outline" size={18} color="#52B788" style={{ marginBottom: 4 }} />
              <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 13 }}>Choose File</Text>
            </TouchableOpacity>
            {itemImage && (
              <View style={{ position: "relative", alignSelf: "center", marginTop: 10 }}>
                <Image source={{ uri: itemImage }} style={styles.roundImage} />
                <TouchableOpacity style={styles.removelcon} onPress={removeDaawathItemImageInForm}><Ionicons name="close" size={13} color="#ffffff" /></TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => {
                if (selectedCategoryIndex === null || !categoriesList[selectedCategoryIndex]) {
                  Alert.alert("Error", "Create or select a valid category first.");
                  setShowItemForm(false);
                  return;
                }
                const updated = [...categoriesList];
                const currentCat = updated[selectedCategoryIndex];
                const newItemObj = { 
                  name: itemName.trim(), 
                  imageUrl: itemImage, 
                  cloudinaryId: itemCloudinaryId, 
                  price: itemPrice !== "" && itemPrice !== null && itemPrice !== undefined ? Number(itemPrice) : undefined 
                };

                if (editingItemIndex !== null) {
                  currentCat.items[editingItemIndex] = { ...currentCat.items[editingItemIndex], ...newItemObj };
                } else {
                  currentCat.items.push(newItemObj);
                }
                setCategoriesList(updated);
                setItemName(""); 
                setItemImage(""); 
                setItemPrice(""); 
                setEditingItemIndex(null);
                setShowItemForm(false);
                setTimeout(() => setShowAddItemModal(true), 300);
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{editingItemIndex !== null ? "Update Item" : "+ Add Item"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0C130E" },
  
  // Immersive Fixed Header Stretched Behind Camera / Notch with Proper Single-Line Alignment and Customer Support Call Icon
  globalHeader: {
    backgroundColor: "#131E16",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 32,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(82, 183, 136, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  globalHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  headerGlowRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(82, 183, 136, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(82, 183, 136, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(82, 183, 136, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrapper: {
    justifyContent: "center",
    flex: 1,
  },
  globalHeaderTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#52B788",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#52B788",
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  headerAddCategoryBtn: {
    backgroundColor: "#15803D",
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(82, 183, 136, 0.4)",
  },
  headerAddCategoryText: {
    color: "#FFFFFF",
    marginLeft: 4,
    fontWeight: "800",
    fontSize: 12,
  },
  headerCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#18261C",
    borderWidth: 1.5,
    borderColor: "#52B788",
    alignItems: "center",
    justifyContent: "center",
  },
  closeRoundBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#18261C",
    borderWidth: 1,
    borderColor: "rgba(82, 183, 136, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Small Tab Bar Embedded in Header (Shown only when unconfigured new category is added)
  headerTabBar: {
    flexDirection: "row",
    backgroundColor: "#18261C",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(82, 183, 136, 0.16)",
    marginTop: 4,
  },
  headerTabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  headerTabItemActive: {
    backgroundColor: "rgba(82, 183, 136, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(82, 183, 136, 0.35)",
  },
  headerTabLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#94A3B8",
  },
  headerTabLabelActive: {
    color: "#52B788",
    fontWeight: "800",
  },

  container: { flex: 1, paddingHorizontal: 16, backgroundColor: "#0C130E" },
  headerContainer: { marginTop: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  backButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#131E16", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  backButtonText: { fontSize: 12.5, fontWeight: "700", marginLeft: 5, color: "#FFFFFF" },
  addButtonSmall: { backgroundColor: "#15803D", height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.4)" },
  addButtonText: { color: "#FFFFFF", marginLeft: 5, fontWeight: "800", fontSize: 13 },
  title: { fontSize: 18, fontWeight: "800", marginTop: 8, marginBottom: 12, paddingHorizontal: 2, color: "#FFFFFF", letterSpacing: -0.2 },
  contentContainer: { paddingBottom: 24 },
  card: { marginTop: 14, backgroundColor: "#131E16", borderRadius: 18, padding: 26, alignItems: "center", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)" },
  emptyIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(82, 183, 136, 0.1)", alignItems: "center", justifyContent: "center", marginBottom: 12, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  emptyTitle: { fontSize: 15.5, fontWeight: "800", color: "#E2E8F0" },
  emptySubtitle: { fontSize: 12.5, color: "#94A3B8", textAlign: "center", lineHeight: 18, marginTop: 5, maxWidth: "85%" },
  
  // Luxury Category Card (Half Blur Overlay Removed Fully)
  categoryCard: { backgroundColor: "#131E16", borderRadius: 18, overflow: "hidden", marginTop: 14, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  imageContainer: { position: "relative" },
  categoryHero: { width: "100%", height: 170 },
  categoryImageOverlay: { display: "none" }, // Completely removed half blur overlay per request
  categoryContent: { paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  categoryName: { fontSize: 17, fontWeight: "800", color: "#FFFFFF", textAlign: "center", marginBottom: 10, letterSpacing: -0.2 },
  addItemsButton: { backgroundColor: "#15803D", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, width: "100%", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  addItemsText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800", marginLeft: 5 },
  topIconBtn: { position: "absolute", top: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(19, 30, 22, 0.85)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  editBtn: { left: 10 },
  deleteBtn: { right: 10 },
  
  modalOverlay: { flex: 1, backgroundColor: "rgba(8, 12, 9, 0.85)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#131E16", borderRadius: 20, padding: 18, maxHeight: "85%", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  label: { fontSize: 12, marginBottom: 5, marginTop: 8, fontWeight: "700", color: "#94A3B8" },
  input: { borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, backgroundColor: "#0C130E", fontSize: 13.5, color: "#FFFFFF", fontWeight: "600" },
  imagePicker: { padding: 14, borderWidth: 1.5, borderColor: "rgba(82, 183, 136, 0.25)", borderRadius: 10, alignItems: "center", borderStyle: "dashed", backgroundColor: "#0C130E" },
  previewImage: { width: 80, height: 80, borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  saveButton: { backgroundColor: "#15803D", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 18, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  saveText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14.5, letterSpacing: 0.2 },
  removelcon: { position: "absolute", top: -5, right: -5, backgroundColor: "#DC2626", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  
  subCategoryBlock: { borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)", borderRadius: 16, padding: 14, marginTop: 12, backgroundColor: "#131E16" },
  itemBlock: { borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.12)", borderRadius: 12, padding: 12, marginTop: 12, backgroundColor: "#0C130E" },
  addSmallButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)", borderRadius: 8, marginTop: 3, marginBottom: 5, backgroundColor: "#18261C" },
  addSmallText: { color: "#52B788", fontWeight: "700", marginLeft: 5, fontSize: 12 },
  addMediumButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)", borderRadius: 10, marginTop: 10, backgroundColor: "#18261C" },
  addMediumText: { color: "#52B788", fontWeight: "800", marginLeft: 6, fontSize: 13.5 },
  addLargeButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)", borderRadius: 10, marginTop: 12, backgroundColor: "#18261C" },
  addLargeText: { color: "#52B788", fontWeight: "800", marginLeft: 6, fontSize: 14 },
  removeVariantButton: { width: 38, height: 38, borderRadius: 9, backgroundColor: "rgba(220, 38, 38, 0.15)", borderWidth: 1, borderColor: "rgba(220, 38, 38, 0.3)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  topRowContainer: { marginBottom: 6 },
  cateringContextText: { fontSize: 13, fontWeight: "700", color: "#52B788", marginBottom: 6, paddingHorizontal: 2 },
  topRow: { flexDirection: "row", alignItems: "center" },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#131E16", marginRight: 6, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)" },
  activePill: { backgroundColor: "#15803D", borderColor: "rgba(82, 183, 136, 0.4)" },
  pillText: { color: "#94A3B8", fontWeight: "700", fontSize: 12 },
  dropdown: { borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, backgroundColor: "#0C130E", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  glassDropdownContainer: { marginBottom: 12, borderRadius: 12, padding: 6, backgroundColor: "#18261C", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  glassOption: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, marginBottom: 3, backgroundColor: "#0C130E" },
  glassOptionActive: { backgroundColor: "#15803D" },
  glassText: { color: "#52B788", fontWeight: "700", fontSize: 12.5 },
  glassTextActive: { color: "#FFFFFF" },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginTop: 12, marginBottom: 6, color: "#FFFFFF" },
  addMoreBtn: { marginTop: 6, paddingVertical: 10, backgroundColor: "#18261C", borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  
  // Luxury Plan Card (Half Blur Overlay Removed Fully)
  planCard: { backgroundColor: "#131E16", borderRadius: 18, overflow: "hidden", marginTop: 14, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  planImageContainer: { position: "relative" },
  planHeroImage: { width: "100%", height: 180, resizeMode: "cover" },
  planContent: { padding: 15 },
  planName: { fontSize: 18, fontWeight: "800", color: "#FFFFFF", marginBottom: 3, letterSpacing: -0.2 },
  planDescription: { fontSize: 13, color: "#94A3B8", marginBottom: 10, lineHeight: 18, fontWeight: "500" },
  planDetails: { marginBottom: 10 },
  detailRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  detailText: { marginLeft: 7, fontSize: 13, color: "#E2E8F0", fontWeight: "600" },
  priceRow: { flexDirection: "row", alignItems: "baseline" },
  planPrice: { fontSize: 23, fontWeight: "900", color: "#FFFFFF" },
  priceUnit: { fontSize: 13.5, color: "#94A3B8", marginLeft: 4, fontWeight: "600" },
  dHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderBottomWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)", backgroundColor: "#131E16" },
  dTitle: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", flex: 1 },
  dToggleRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  dVegActive: { backgroundColor: "#15803D", paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, marginRight: 6 },
  dVegTextActive: { color: "#FFFFFF", fontWeight: "700" },
  dNonVegBtn: { borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#131E16" },
  dNonVegText: { fontWeight: "700", color: "#94A3B8" },
  superOverlay: { flex: 1, backgroundColor: "rgba(8, 12, 9, 0.85)", justifyContent: "center", padding: 16 },
  formModal: { backgroundColor: "#131E16", borderRadius: 20, padding: 18, maxHeight: "85%", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  formHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  formTitle: { fontSize: 16.5, fontWeight: "800", color: "#FFFFFF" },
  submitBtn: { backgroundColor: "#15803D", paddingVertical: 13, borderRadius: 10, alignItems: "center", marginTop: 16, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  roundImage: { width: 65, height: 65, borderRadius: 32.5, marginTop: 8, alignSelf: "center", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  SectionLabel: { fontSize: 12, fontWeight: "700", marginTop: 8, marginBottom: 5, color: "#94A3B8" },
  planAddItemsButton: { backgroundColor: "#15803D", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, paddingHorizontal: 15, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  planAddItemsButtonText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800", marginLeft: 5 },
  planItemsOverlay: { flex: 1, backgroundColor: "rgba(8, 12, 9, 0.85)", justifyContent: "flex-end" },
  planItemsModalCard: { backgroundColor: "#131E16", borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "85%", overflow: "hidden", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  planItemsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(82, 183, 136, 0.15)" },
  planItemsTitle: { fontSize: 15.5, fontWeight: "800", color: "#FFFFFF", flex: 1 },
  saveItemsBtn: { backgroundColor: "#15803D", paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  saveItemsBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14.5 },
  planItemsPreviewContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: "rgba(82, 183, 136, 0.12)" },
  planItemsPreviewTitle: { fontSize: 11.5, fontWeight: "800", color: "#E2E8F0", marginBottom: 2 },
  planItemsPreviewText: { fontSize: 12, color: "#94A3B8", lineHeight: 16, fontWeight: "500" },
  floatingModalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8, 12, 9, 0.9)", justifyContent: "center", alignItems: "center", padding: 18, zIndex: 999 },
  floatingModalCard: { backgroundColor: "#131E16", borderRadius: 22, padding: 18, width: "100%", maxWidth: 350, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  floatingModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  floatingModalTitle: { fontSize: 16.5, fontWeight: "800", color: "#FFFFFF" },
  floatingModalLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 5, marginTop: 10 },
  floatingModalInput: { borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, color: "#FFFFFF", backgroundColor: "#0C130E", fontWeight: "600" },
  floatingModalImagePicker: { padding: 12, borderWidth: 1.5, borderColor: "rgba(82, 183, 136, 0.25)", borderRadius: 10, alignItems: "center", backgroundColor: "#0C130E", borderStyle: "dashed" },
  floatingModalPickerText: { fontSize: 12.5, color: "#94A3B8", fontWeight: "600" },
  floatingModalSubmitBtn: { backgroundColor: "#15803D", paddingVertical: 13, borderRadius: 10, alignItems: "center", marginTop: 16, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  floatingModalSubmitBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  // Daawath modal styles
  screenshotOverlay: { flex: 1, backgroundColor: "#0C130E" },
  screenshotSafe: { flex: 1 },
  screenshotHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, height: 56, backgroundColor: "#131E16", borderBottomWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)" },
  screenshotBackBtn: { backgroundColor: "#18261C", borderRadius: 10, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  screenshotTitleText: { fontSize: 16.5, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.2, textAlign: "center" },
  screenshotScroll: { flex: 1, backgroundColor: "#0C130E" },
  
  plateContainerSection: { backgroundColor: "#131E16", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)", borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  plateHeading: { fontSize: 10.5, fontWeight: "800", color: "#52B788", letterSpacing: 1, marginBottom: 6 },
  plateToken: { alignItems: "center", width: 75, marginRight: 8, paddingVertical: 6, borderRadius: 12 },
  plateTokenSelected: { backgroundColor: "#18261C", borderColor: "#52B788", borderWidth: 1.5 },
  plateTokenImage: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  plateTokenText: { fontSize: 11, fontWeight: "700", color: "#94A3B8", marginTop: 5, textAlign: "center" },
  
  plateTokenAdd: { width: 75, justifyContent: 'center', alignItems: 'center' },
  plateTokenAddCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#18261C', borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#52B788', alignItems: 'center', justifyContent: 'center' },
  
  customAreaContainer: { paddingHorizontal: 14, paddingTop: 14 },
  customMainTitle: { fontSize: 19, color: '#FFFFFF', fontWeight: '800' },
  customSubtitle: { color: '#94A3B8', fontSize: 12.5, marginBottom: 14, lineHeight: 17 },
  
  screenshotSelectionBox: { borderRadius: 18, padding: 14, backgroundColor: '#131E16', borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)", marginBottom: 12 },
  screenshotSelectionHeader: { borderBottomWidth: 1, borderColor: 'rgba(82, 183, 136, 0.12)', paddingBottom: 10, marginBottom: 10 },
  selectionTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  selectionNumberBadge: { backgroundColor: '#15803D', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  selectionNumberText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
  selectionTitleWrapper: { marginLeft: 8, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, flex: 1 },
  selectionMainLabel: { fontSize: 16, color: '#FFFFFF', fontWeight: '800', textTransform: 'capitalize' },
  selectionMaxLabel: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  selectionActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  selectionActionBtn: { padding: 6, backgroundColor: '#18261C', borderRadius: 9, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  
  dishRowSelectorItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(82, 183, 136, 0.1)' },
  dishRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dishRowImage: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#0C130E', borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)" },
  dishRowInfo: { marginLeft: 10, flex: 1 },
  dishRowName: { fontSize: 14, color: '#FFFFFF', fontWeight: '700' },
  dishRowPrice: { color: '#52B788', fontWeight: '700', fontSize: 12.5, marginTop: 2 },
  dishRowActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dishActionBtn: { padding: 6, backgroundColor: '#18261C', borderRadius: 8, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  
  screenshotCheckboxCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(82, 183, 136, 0.3)", alignItems: "center", justifyContent: "center" },
  screenshotCheckboxCircleActive: { backgroundColor: "#15803D", borderColor: "#15803D" },
  
  noDishesText: { paddingVertical: 18, color: '#94A3B8', textAlign: 'center', fontSize: 12, fontStyle: 'italic' },
  
  chefQuickActionsContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: 'rgba(82, 183, 136, 0.12)', flexDirection: 'row', justifyContent: 'space-between' },
  chefQuickActionBtn: { backgroundColor: '#0C130E', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, borderColor: 'rgba(82, 183, 136, 0.2)', borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  chefQuickActionText: { color: '#52B788', fontWeight: '700', marginLeft: 4, fontSize: 12 },
  
  addonSectionTitleRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: 'rgba(82, 183, 136, 0.12)', paddingBottom: 8, marginBottom: 8 },
  addonGreenCircle: { borderColor: '#52B788', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: 'rgba(82, 183, 136, 0.1)' },
  addonTitleWrapper: { marginLeft: 8, flex: 1 },
  addonMainLabel: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  addonSubLabel: { color: '#94A3B8', fontSize: 11.5 },
  addNewAddonBtn: { backgroundColor: '#18261C', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  addNewAddonText: { color: '#52B788', fontWeight: '700', fontSize: 11.5 },
  
  qtyStepperContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#18261C", borderRadius: 10, paddingHorizontal: 2, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.2)" },
  qtyStepperBtn: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  qtyStepperText: { fontSize: 14, fontWeight: "700", color: "#52B788" },
  qtyValueText: { fontSize: 12.5, fontWeight: "800", color: "#FFFFFF", paddingHorizontal: 6, minWidth: 18, textAlign: "center" },
  
  screenshotPrimarySubmitBtn: { backgroundColor: '#15803D', height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.4)" },
  screenshotSubmitBtnText: { fontSize: 14.5, fontWeight: '800', color: '#FFFFFF' },
  
  screenshotStickyFooterBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 70, backgroundColor: "#131E16", borderTopWidth: 1, borderColor: 'rgba(82, 183, 136, 0.16)', paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: Platform.OS === 'ios' ? 14 : 0 },
  footerPriceAmountText: { color: '#FFFFFF', fontWeight: '900', fontSize: 22 },
  footerPriceUnitLabel: { color: '#94A3B8', fontSize: 11.5, fontWeight: '600' },
  
  // Meal plan items modal styles
  planItemsTopBar: { paddingHorizontal: 14, paddingTop: 10 },
  dayPill: { paddingHorizontal: 18, paddingVertical: 7, backgroundColor: "#131E16", borderRadius: 16, marginRight: 6, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)" },
  dayPillActive: { backgroundColor: "#15803D", borderColor: "rgba(82, 183, 136, 0.4)" },
  dayPillText: { color: "#94A3B8", fontWeight: "800", fontSize: 12.5 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginBottom: 12, paddingHorizontal: 4 },
  infoText: { fontSize: 12, color: "#94A3B8", flex: 1, lineHeight: 16, fontWeight: "500" },
  mealSectionCard: { marginBottom: 14, backgroundColor: "#131E16", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.16)" },
  mealSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(82, 183, 136, 0.12)", paddingBottom: 8 },
  mealSectionTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  mealIcon: { fontSize: 18 },
  mealLabel: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  addCategoryBtn: { backgroundColor: "#18261C", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  addCategoryText: { color: "#52B788", fontWeight: "700", fontSize: 12 },
  emptyMealSection: { borderStyle: "dashed", borderWidth: 1.5, borderColor: "rgba(82, 183, 136, 0.2)", borderRadius: 10, padding: 18, alignItems: "center", backgroundColor: "#0C130E" },
  emptyMealTitle: { fontSize: 13, color: "#E2E8F0", fontWeight: "700", marginBottom: 2 },
  emptyMealSub: { fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 15 },
  sectionContainer: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingHorizontal: 2 },
  sectionTitleWrapper: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  sectionName: { fontWeight: "800", fontSize: 14, color: "#FFFFFF" },
  sectionMax: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  sectionAction: { padding: 2 },
  addItemBtn: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7, backgroundColor: "#18261C", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.25)" },
  addItemText: { color: "#52B788", fontSize: 11.5, fontWeight: "800" },
  emptyItemList: { borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)", borderRadius: 9, padding: 10, alignItems: "center", backgroundColor: "#0C130E", marginBottom: 8 },
  emptyItemText: { fontSize: 11.5, color: "#94A3B8", fontStyle: "italic" },
  mealItemRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#131E16", borderRadius: 10, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.12)" },
  mealItemImage: { width: 36, height: 36, borderRadius: 7, marginRight: 8, backgroundColor: "#0C130E", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.15)" },
  mealItemInfo: { flex: 1, justifyContent: "center" },
  mealItemName: { fontWeight: "700", fontSize: 13, color: "#FFFFFF" },
  mealItemPrice: { fontSize: 12, color: "#52B788", fontWeight: "700", marginTop: 1 },
  mealItemActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  activeToggle: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  activeToggleOn: { backgroundColor: "rgba(82, 183, 136, 0.15)" },
  activeToggleOff: { backgroundColor: "rgba(220, 38, 38, 0.15)" },
  activeToggleText: { fontSize: 10, fontWeight: "800" },
  mealActionBtn: { padding: 2 },
  planItemsFooter: { padding: 12, backgroundColor: '#131E16', borderTopWidth: 1, borderColor: 'rgba(82, 183, 136, 0.15)' },
  editToggleButton: { marginTop: 16, paddingVertical: 14, borderRadius: 10, alignItems: "center", backgroundColor: "#15803D", borderWidth: 1, borderColor: "rgba(82, 183, 136, 0.3)" },
  editToggleText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14.5 },
  
  bottomTabBar: { display: 'none' },
  emptySelectionBox: { alignItems: 'center', padding: 36, backgroundColor: '#131E16', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(82, 183, 136, 0.16)' },
  emptySelectionTitle: { fontSize: 15.5, fontWeight: '800', color: '#FFFFFF', marginTop: 12 },
  emptySelectionSub: { fontSize: 12.5, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 18 },
});