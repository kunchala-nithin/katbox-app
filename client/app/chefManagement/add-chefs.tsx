import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Dimensions,
  Alert,
  StatusBar,
  Platform,
  Switch,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "@/src/lib/api";
import { getToken } from "@/src/lib/authStorage";

const { width } = Dimensions.get("window");

type CouponServiceType = "catering" | "mealbox" | "homemade" | "quickbites";

interface BannerItem {
  id: string;
  uri: string;
  cloudinaryId?: string;
  isNew?: boolean;
}

interface CouponItem {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: string;
  description: string;
  serviceType: CouponServiceType;
}

// ✅ Service-type options for the dropdown
const SERVICE_TYPES: {
  label: string;
  value: CouponServiceType;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}[] = [
  {
    label: "Catering",
    value: "catering",
    icon: "restaurant-outline",
    hint: "Platters, events, bulk orders",
  },
  {
    label: "MealBox",
    value: "mealbox",
    icon: "fast-food-outline",
    hint: "Weekly / monthly subscription plans",
  },
  {
    label: "Homemade",
    value: "homemade",
    icon: "home-outline",
    hint: "Fresh home-cooked chef orders",
  },
  {
    label: "Quick Bites",
    value: "quickbites",
    icon: "flash-outline",
    hint: "Snacks, fast bites, instant orders",
  },
];

const SERVICE_TYPE_LABEL: Record<CouponServiceType, string> = {
  catering: "Catering",
  mealbox: "MealBox",
  homemade: "Homemade",
  quickbites: "Quick Bites",
};

const SERVICE_TYPE_ICON: Record<CouponServiceType, keyof typeof Ionicons.glyphMap> = {
  catering: "restaurant-outline",
  mealbox: "fast-food-outline",
  homemade: "home-outline",
  quickbites: "flash-outline",
};

const normalizeServiceType = (raw: any): CouponServiceType => {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "mealbox" || s === "homemade" || s === "quickbites" || s === "catering") {
    return s as CouponServiceType;
  }
  return "catering";
};

const AddChefs = () => {
  const router = useRouter();

  const [name, setName] = useState("");
  const [exp, setExp] = useState("");
  const [phone, setPhone] = useState("");
  const [aadhar, setAadhar] = useState("");
  const [location, setLocation] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [price, setPrice] = useState("");
  const [foodType, setFoodType] = useState<"VEG" | "NONVEG" | "BOTH">("BOTH");
  const [fssaiNo, setFssaiNo] = useState("");

  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarCloudinaryId, setAvatarCloudinaryId] = useState("");
  const [removeAvatarOnSave, setRemoveAvatarOnSave] = useState(false);

  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [deletedBannerIds, setDeletedBannerIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditable, setIsEditable] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);

  // Coupons & Discounts
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "flat">("percent");
  const [couponValue, setCouponValue] = useState("");
  const [couponDescription, setCouponDescription] = useState("");
  // ✅ NEW: service type for the coupon being created
  const [couponServiceType, setCouponServiceType] = useState<CouponServiceType>("catering");
  // ✅ NEW: dropdown visibility
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const safeGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  useFocusEffect(
    useCallback(() => {
      const loadMyChef = async () => {
        try {
          const res = await api.get("/api/chefs/my-chef");
          if (res.data.success && res.data.chef) {
            const c = res.data.chef;
            setName(c.name || "");
            setExp(c.exp || "");
            setPhone(c.phone || "");
            setAadhar(c.aadhar || "");
            setLocation(c.location || "");
            setSpecialty(c.specialty || "");
            setPrice(c.price || "");
            setFoodType(c.foodType || "BOTH");
            setFssaiNo(c.fssaiNo || "");
            setAvatar(c.avatar || null);
            setAvatarCloudinaryId(c.avatarCloudinaryId || "");
            setRemoveAvatarOnSave(false);
            setIsAvailable(c.isAvailable ?? true);

            if (c.coupons && Array.isArray(c.coupons)) {
              setCoupons(
                c.coupons.map((cp: any, idx: number) => ({
                  id: cp._id || `${Date.now()}-${idx}`,
                  code: cp.code || "",
                  type: cp.type || "percent",
                  value: String(cp.value || ""),
                  description: cp.description || "",
                  serviceType: normalizeServiceType(cp.serviceType),
                }))
              );
            } else {
              setCoupons([]);
            }

            if (c.banners && Array.isArray(c.banners)) {
              setBanners(
                c.banners.map((b: any, index: number) => ({
                  id: b.cloudinaryId || `existing-${index}`,
                  uri: b.url,
                  cloudinaryId: b.cloudinaryId,
                  isNew: false,
                }))
              );
            } else {
              setBanners([]);
            }

            setDeletedBannerIds([]);
            setIsEditing(true);
            setIsEditable(false);
          } else {
            resetForm();
          }
        } catch (err) {
          console.log("Load my chef error", err);
          resetForm();
        }
      };
      loadMyChef();
    }, [])
  );

  const resetForm = () => {
    setName("");
    setExp("");
    setPhone("");
    setAadhar("");
    setLocation("");
    setSpecialty("");
    setPrice("");
    setFoodType("BOTH");
    setFssaiNo("");
    setAvatar(null);
    setAvatarCloudinaryId("");
    setRemoveAvatarOnSave(false);
    setCoupons([]);
    setBanners([]);
    setDeletedBannerIds([]);
    setIsEditing(false);
    setIsEditable(true);
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "We need access to your photo library.");
      return false;
    }
    return true;
  };

  const pickAvatar = async () => {
    if (!isEditable) return;
    const ok = await requestPermissions();
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.45,
      allowsEditing: true,
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
      setRemoveAvatarOnSave(false);
    }
  };

  const removeAvatar = () => {
    if (!isEditable) return;
    setAvatar(null);
    setRemoveAvatarOnSave(true);
  };

  const pickBanner = async () => {
    if (!isEditable) return;
    const ok = await requestPermissions();
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      allowsEditing: true,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setBanners((prev) => [
        ...prev,
        {
          id: `new-${Date.now()}-${Math.random()}`,
          uri,
          isNew: true,
        },
      ]);
    }
  };

  const removeBanner = (id: string, cloudinaryId?: string) => {
    if (!isEditable) return;
    if (cloudinaryId) {
      setDeletedBannerIds((prev) =>
        prev.includes(cloudinaryId) ? prev : [...prev, cloudinaryId]
      );
    }
    setBanners((prev) => prev.filter((b) => b.id !== id));
  };

  const resetCouponForm = () => {
    setCouponCode("");
    setCouponType("percent");
    setCouponValue("");
    setCouponDescription("");
    setCouponServiceType("catering");
    setShowServiceDropdown(false);
    setShowCouponForm(false);
  };

  const handleAddCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    const value = couponValue.trim();

    if (!code) {
      Alert.alert("Missing code", "Enter a coupon code (e.g. WELCOME10).");
      return;
    }
    if (!value || isNaN(Number(value)) || Number(value) <= 0) {
      Alert.alert("Invalid value", "Enter a valid discount number.");
      return;
    }
    if (couponType === "percent" && Number(value) > 100) {
      Alert.alert("Invalid %", "Percent discount cannot exceed 100.");
      return;
    }
    if (coupons.some((c) => c.code === code)) {
      Alert.alert("Duplicate", "This coupon code already exists.");
      return;
    }

    setCoupons((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        code,
        type: couponType,
        value,
        description:
          couponDescription.trim() ||
          (couponType === "percent" ? `${value}% off` : `₹${value} off`),
        serviceType: couponServiceType,
      },
    ]);
    resetCouponForm();
  };

  const handleRemoveCoupon = (id: string) => {
    if (!isEditable) return;
    Alert.alert("Remove coupon", "Delete this coupon?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => setCoupons((prev) => prev.filter((c) => c.id !== id)),
      },
    ]);
  };

  const buildChefFormData = () => {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("exp", exp);
    formData.append("phone", phone);
    formData.append("aadhar", aadhar);
    formData.append("location", location);
    formData.append("specialty", specialty);
    formData.append("price", price);
    formData.append("foodType", foodType);
    formData.append("fssaiNo", fssaiNo);
    formData.append("isAvailable", String(isAvailable));
    formData.append("coupons", JSON.stringify(coupons));

    if (removeAvatarOnSave && !avatar) {
      formData.append("removeAvatarOnSave", "true");
    }

    if (avatar && (avatar.startsWith("file") || avatar.startsWith("ph:"))) {
      const avatarType = avatar.split(".").pop() || "jpg";
      formData.append("avatar", {
        uri: avatar,
        name: `avatar.${avatarType}`,
        type: `image/${avatarType}`,
      } as any);
    }

    const existingBannersPayload = banners
      .filter((b) => !b.isNew && b.cloudinaryId)
      .map((b) => ({
        url: b.uri,
        cloudinaryId: b.cloudinaryId,
      }));
    formData.append("existingBanners", JSON.stringify(existingBannersPayload));
    formData.append("deletedBannerIds", JSON.stringify(deletedBannerIds));

    banners.forEach((b, idx) => {
      if (b.isNew) {
        const bannerType = b.uri.split(".").pop() || "jpg";
        formData.append("banners", {
          uri: b.uri,
          name: `banner_${idx}.${bannerType}`,
          type: `image/${bannerType}`,
        } as any);
      }
    });

    return formData;
  };

  const handleToggleAvailability = async (newStatus: boolean) => {
    setIsAvailable(newStatus);

    if (!isEditing) return;

    try {
      const token = await getToken();
      if (!token) return;

      const formData = buildChefFormData();
      formData.set("isAvailable", String(newStatus));

      await api.post("/api/chefs", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      console.log("✅ Availability status auto-updated successfully");
    } catch (err: any) {
      console.log("Auto-update availability error", err);
    }
  };

  const startFakeProgress = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + 3;
      });
    }, 300);
    return interval;
  };

  const handleDeleteChef = async () => {
    if (!isEditing) return;

    Alert.alert(
      "Delete Chef Profile",
      "This action is PERMANENT.\n\n• Your chef profile will be deleted\n• All your menus will be deleted\n• ALL images (avatar, banners, menus, categories, items) will be permanently removed from Cloudinary\n• User isChef flag will be reset\n\nAre you absolutely sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const token = await getToken();
              if (!token) return;

              await api.delete("/api/chefs/my-chef", {
                headers: { Authorization: `Bearer ${token}` },
              });

              Alert.alert(
                "Success",
                "Chef profile and all related data deleted permanently"
              );
              resetForm();
              safeGoBack();
            } catch (err: any) {
              console.log("Delete chef error", err);
              Alert.alert(
                "Error",
                err.response?.data?.message || "Failed to delete chef"
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    if (isEditing && !isEditable) {
      setIsEditable(true);
      return;
    }

    if (!name || !exp || !location || !specialty || !price) {
      Alert.alert("Missing Fields", "Please fill all fields.");
      return;
    }
    if (!avatar) {
      Alert.alert("Missing Image", "Please upload an avatar image.");
      return;
    }
    if (phone && phone.length !== 10) {
      Alert.alert("Invalid Phone", "Phone number must be exactly 10 digits.");
      return;
    }
    if (aadhar && aadhar.length !== 12) {
      Alert.alert("Invalid Aadhar", "Aadhar number must be exactly 12 digits.");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    const fakeProgress = startFakeProgress();

    try {
      const token = await getToken();

      const formData = buildChefFormData();

      const response = await api.post("/api/chefs", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent: any) => {
          if (!progressEvent.total) return;
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percent);
        },
        timeout: 120000,
      });

      clearInterval(fakeProgress);
      setUploadProgress(100);

      if (response.data.success && response.data.chef) {
        const c = response.data.chef;
        setName(c.name || "");
        setExp(c.exp || "");
        setPhone(c.phone || "");
        setAadhar(c.aadhar || "");
        setLocation(c.location || "");
        setSpecialty(c.specialty || "");
        setPrice(c.price || "");
        setFoodType(c.foodType || "BOTH");
        setFssaiNo(c.fssaiNo || "");
        setAvatar(c.avatar || null);
        setAvatarCloudinaryId(c.avatarCloudinaryId || "");
        setRemoveAvatarOnSave(false);
        setIsAvailable(c.isAvailable ?? true);

        if (c.coupons && Array.isArray(c.coupons)) {
          setCoupons(
            c.coupons.map((cp: any, idx: number) => ({
              id: cp._id || `${Date.now()}-${idx}`,
              code: cp.code || "",
              type: cp.type || "percent",
              value: String(cp.value || ""),
              description: cp.description || "",
              serviceType: normalizeServiceType(cp.serviceType),
            }))
          );
        }

        if (c.banners && Array.isArray(c.banners)) {
          setBanners(
            c.banners.map((b: any, index: number) => ({
              id: b.cloudinaryId || `existing-${index}`,
              uri: b.url,
              cloudinaryId: b.cloudinaryId,
              isNew: false,
            }))
          );
        }
        setDeletedBannerIds([]);
      }

      setIsEditing(true);
      setIsEditable(false);

      Alert.alert(
        "Success",
        isEditing ? "Chef updated successfully" : "Chef added successfully"
      );
    } catch (err: any) {
      console.log("Chef error", err);
      Alert.alert("Error", err.response?.data?.message || "Failed to save chef");
    } finally {
      clearInterval(fakeProgress);
      setTimeout(() => {
        setUploadProgress(0);
        setIsSubmitting(false);
      }, 500);
    }
  };

  const foodTypeOptions = [
    { label: "VEG", value: "VEG" as const },
    { label: "NONVEG", value: "NONVEG" as const },
    { label: "BOTH", value: "BOTH" as const },
  ];

  const displayName = name?.trim() ? name.trim() : "Chef";

  const getSubmitButtonText = () => {
    if (isSubmitting) return `Uploading ${uploadProgress}%`;
    if (!isEditing) return "Publish chef profile";
    if (!isEditable) return "Edit profile";
    return "Update profile";
  };

  const currentServiceMeta =
    SERVICE_TYPES.find((s) => s.value === couponServiceType) || SERVICE_TYPES[0];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0B140F" />

      {/* ─── PREMIUM HEADER ─── */}
      <LinearGradient
        colors={["#0B140F", "#132117", "#1A241D"]}
        style={styles.darkHeader}
      >
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerInner}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerBrandCol}>
                <View style={styles.eyebrowRow}>
                  <View
                    style={[
                      styles.liveDot,
                      { backgroundColor: isAvailable ? "#4ADE80" : "#F87171" },
                    ]}
                  />
                  <Text style={styles.headerEyebrow}>CHEF DASHBOARD</Text>
                </View>
                <Text style={styles.headerTitle}>
                  {isEditing ? `Welcome, ${displayName}` : "Set up your kitchen"}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {isEditing
                    ? "Update profile, offers & availability in one place"
                    : "Create a profile customers will trust"}
                </Text>
              </View>

              <View style={styles.headerToggleContainer}>
                <Text
                  style={[
                    styles.toggleLabelText,
                    { color: isAvailable ? "#4ADE80" : "#F87171" },
                  ]}
                >
                  {isAvailable ? "LIVE" : "OFFLINE"}
                </Text>
                <Switch
                  trackColor={{
                    false: "rgba(248, 113, 113, 0.3)",
                    true: "rgba(74, 222, 128, 0.4)",
                  }}
                  thumbColor={isAvailable ? "#4ADE80" : "#F87171"}
                  ios_backgroundColor="#374151"
                  onValueChange={handleToggleAvailability}
                  value={isAvailable}
                  style={styles.smallSwitch}
                />
              </View>
            </View>

            <View style={styles.statsStrip}>
              <View style={styles.statItem}>
                <View style={styles.statIconWrap}>
                  <MaterialCommunityIcons name="chef-hat" size={15} color="#86EFAC" />
                </View>
                <Text style={styles.statValue}>{isEditing ? "Active" : "Draft"}</Text>
                <Text style={styles.statLabel}>Profile</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="pricetag-outline" size={14} color="#86EFAC" />
                </View>
                <Text style={styles.statValue}>{coupons.length}</Text>
                <Text style={styles.statLabel}>Coupons</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="star" size={14} color="#FBBF24" />
                </View>
                <Text style={styles.statValue}>{exp || "—"}</Text>
                <Text style={styles.statLabel}>Yrs Exp</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ─── BODY ─── */}
      <View style={styles.bodyCard}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* PHOTO */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="person" size={16} color="#166534" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Your photo</Text>
                <Text style={styles.sectionHint}>A clear face photo builds trust</Text>
              </View>
            </View>

            <View style={styles.avatarRowContainer}>
              <TouchableOpacity
                style={styles.avatarPicker}
                onPress={pickAvatar}
                activeOpacity={isEditable ? 0.85 : 1}
                disabled={!isEditable}
              >
                {avatar ? (
                  <View style={{ position: "relative" }}>
                    <Image source={{ uri: avatar }} style={styles.avatar} />
                    {isEditable && (
                      <TouchableOpacity style={styles.removeIcon} onPress={removeAvatar}>
                        <Ionicons name="close" size={14} color="#ffffff" />
                      </TouchableOpacity>
                    )}
                    {isEditable && (
                      <View style={styles.avatarEditBadge}>
                        <Ionicons name="camera" size={12} color="#166534" />
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <View style={styles.cameraIconContainer}>
                      <Ionicons name="camera" size={24} color="#166534" />
                    </View>
                    <Text style={styles.avatarPickText}>Tap to upload</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* KITCHEN & BANNER IMAGES */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Kitchen & Banner Images</Text>
              </View>
              {isEditable && (
                <TouchableOpacity
                  style={styles.addBannerBtn}
                  onPress={pickBanner}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color="#166534" />
                  <Text style={styles.addBannerBtnText}>Add Images</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bannerScroll}
            >
              {isEditable && (
                <TouchableOpacity
                  style={styles.bannerUploadPlaceholder}
                  onPress={pickBanner}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerUploadIconWrap}>
                    <Ionicons name="images-outline" size={24} color="#166534" />
                  </View>
                  <Text style={styles.bannerUploadText}>Upload</Text>
                </TouchableOpacity>
              )}

              {banners.map((b) => (
                <View key={b.id} style={styles.bannerThumbnailWrap}>
                  <Image source={{ uri: b.uri }} style={styles.bannerThumbnail} />
                  {isEditable && (
                    <TouchableOpacity
                      style={styles.bannerRemoveBtn}
                      onPress={() => removeBanner(b.id, b.cloudinaryId)}
                    >
                      <Ionicons name="close" size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>

          {/* PROFILE DETAILS */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="create-outline" size={16} color="#166534" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Profile details</Text>
                <Text style={styles.sectionHint}>Shown on your public chef card</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Chef name</Text>
            <TextInput
              placeholder="Enter chef name"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Experience (years)</Text>
            <TextInput
              placeholder="e.g. 12"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={exp}
              onChangeText={(text) => {
                setExp(text);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              keyboardType="numeric"
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              placeholder="Enter 10-digit phone number"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={phone}
              onChangeText={(text) => {
                const cleaned = text.replace(/\D/g, "").slice(0, 10);
                setPhone(cleaned);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              keyboardType="number-pad"
              maxLength={10}
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Aadhar Number</Text>
            <TextInput
              placeholder="Enter 12-digit Aadhar number"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={aadhar}
              onChangeText={(text) => {
                const cleaned = text.replace(/\D/g, "").slice(0, 12);
                setAadhar(cleaned);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              keyboardType="number-pad"
              maxLength={12}
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              placeholder="e.g. Miyapur, Hyderabad"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={location}
              onChangeText={(text) => {
                setLocation(text);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Specialty</Text>
            <TextInput
              placeholder="e.g. Andhra Meals • Biryani"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={specialty}
              onChangeText={(text) => {
                setSpecialty(text);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Starting price (₹)</Text>
            <TextInput
              placeholder="e.g. 450"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={price}
              onChangeText={(text) => {
                setPrice(text);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              keyboardType="numeric"
              editable={isEditable}
            />

            <Text style={styles.fieldLabel}>Food type</Text>
            <View style={styles.foodTypeContainer}>
              {foodTypeOptions.map((option) => {
                const isSelected = foodType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={isEditable ? 0.8 : 1}
                    disabled={!isEditable}
                    style={[
                      styles.foodTypeButton,
                      isSelected && styles.foodTypeButtonSelected,
                      !isEditable && styles.disabledButton,
                    ]}
                    onPress={() => {
                      setFoodType(option.value);
                      if (isEditing && !isEditable) setIsEditable(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.foodTypeText,
                        isSelected && styles.foodTypeTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>FSSAI Number</Text>
            <TextInput
              placeholder="e.g. 12345678901234"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !isEditable && styles.disabledInput]}
              value={fssaiNo}
              onChangeText={(text) => {
                setFssaiNo(text);
                if (isEditing && !isEditable) setIsEditable(true);
              }}
              editable={isEditable}
            />
          </View>

          {/* COUPONS & DISCOUNTS */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="pricetag" size={16} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Coupons & discounts</Text>
                <Text style={styles.sectionHint}>
                  Attract more orders with simple offers
                </Text>
              </View>
              {isEditable && (
                <TouchableOpacity
                  style={styles.addCouponChip}
                  onPress={() => {
                    setShowCouponForm((v) => !v);
                    if (isEditing && !isEditable) setIsEditable(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={showCouponForm ? "close" : "add"}
                    size={16}
                    color="#166534"
                  />
                  <Text style={styles.addCouponChipText}>
                    {showCouponForm ? "Close" : "Add"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {showCouponForm && isEditable && (
              <View style={styles.couponFormBox}>
                <Text style={styles.fieldLabel}>Coupon code</Text>
                <TextInput
                  placeholder="e.g. WELCOME10"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={couponCode}
                  onChangeText={setCouponCode}
                  autoCapitalize="characters"
                />

                {/* ✅ NEW: SERVICE TYPE DROPDOWN */}
                <Text style={styles.fieldLabel}>Applicable service type</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  activeOpacity={0.85}
                  onPress={() => setShowServiceDropdown(true)}
                >
                  <View style={styles.dropdownTriggerLeft}>
                    <View style={styles.dropdownIconCircle}>
                      <Ionicons
                        name={currentServiceMeta.icon}
                        size={15}
                        color="#166534"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dropdownTriggerValue}>
                        {currentServiceMeta.label}
                      </Text>
                      <Text style={styles.dropdownTriggerHint} numberOfLines={1}>
                        {currentServiceMeta.hint}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-down" size={18} color="#166534" />
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Discount type</Text>
                <View style={styles.foodTypeContainer}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.foodTypeButton,
                      couponType === "percent" && styles.foodTypeButtonSelected,
                    ]}
                    onPress={() => setCouponType("percent")}
                  >
                    <Text
                      style={[
                        styles.foodTypeText,
                        couponType === "percent" && styles.foodTypeTextSelected,
                      ]}
                    >
                      % Off
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.foodTypeButton,
                      couponType === "flat" && styles.foodTypeButtonSelected,
                    ]}
                    onPress={() => setCouponType("flat")}
                  >
                    <Text
                      style={[
                        styles.foodTypeText,
                        couponType === "flat" && styles.foodTypeTextSelected,
                      ]}
                    >
                      ₹ Flat
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>
                  {couponType === "percent" ? "Percent value" : "Amount (₹)"}
                </Text>
                <TextInput
                  placeholder={couponType === "percent" ? "e.g. 10" : "e.g. 50"}
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={couponValue}
                  onChangeText={setCouponValue}
                  keyboardType="numeric"
                />

                <Text style={styles.fieldLabel}>Short description (optional)</Text>
                <TextInput
                  placeholder="e.g. First order only"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={couponDescription}
                  onChangeText={setCouponDescription}
                />

                <TouchableOpacity
                  style={styles.saveCouponBtn}
                  onPress={() => {
                    handleAddCoupon();
                    if (isEditing && !isEditable) setIsEditable(true);
                  }}
                  activeOpacity={0.9}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.saveCouponBtnText}>Save coupon</Text>
                </TouchableOpacity>
              </View>
            )}

            {coupons.length === 0 && !showCouponForm ? (
              <View style={styles.emptyCouponBox}>
                <Ionicons name="ticket-outline" size={28} color="#94A3B8" />
                <Text style={styles.emptyCouponTitle}>No coupons yet</Text>
                <Text style={styles.emptyCouponSub}>
                  Add a welcome discount to boost first orders
                </Text>
                {isEditable && (
                  <TouchableOpacity
                    style={styles.emptyCouponCta}
                    onPress={() => {
                      setShowCouponForm(true);
                      if (isEditing && !isEditable) setIsEditable(true);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.emptyCouponCtaText}>Create first coupon</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              coupons.map((c) => (
                <View key={c.id} style={styles.couponCard}>
                  <View style={styles.couponLeft}>
                    <View style={styles.couponCodeBadge}>
                      <Text style={styles.couponCodeText}>{c.code}</Text>
                    </View>
                    <Text style={styles.couponValueText}>
                      {c.type === "percent" ? `${c.value}% OFF` : `₹${c.value} OFF`}
                    </Text>

                    <View style={styles.couponServiceChip}>
                      <Ionicons
                        name={SERVICE_TYPE_ICON[c.serviceType]}
                        size={11}
                        color="#166534"
                      />
                      <Text style={styles.couponServiceChipText}>
                        {SERVICE_TYPE_LABEL[c.serviceType] || "Catering"}
                      </Text>
                    </View>

                    {!!c.description && (
                      <Text style={styles.couponDescText} numberOfLines={1}>
                        {c.description}
                      </Text>
                    )}
                  </View>
                  {isEditable && (
                    <TouchableOpacity
                      style={styles.couponDeleteBtn}
                      onPress={() => {
                        handleRemoveCoupon(c.id);
                        if (isEditing && !isEditable) setIsEditable(true);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>

          {/* ACTIONS */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <LinearGradient colors={["#166534", "#15803D"]} style={styles.submitBtn}>
              <Text style={styles.submitText}>{getSubmitButtonText()}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleDeleteChef}
              disabled={isSubmitting}
              style={{ marginTop: 12 }}
            >
              <View style={styles.deleteOutlineBtn}>
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                <Text style={styles.deleteOutlineText}>Delete chef permanently</Text>
              </View>
            </TouchableOpacity>
          )}

          <View style={{ height: Platform.OS === "ios" ? 100 : 88 }} />
        </ScrollView>
      </View>

      {/* ✅ SERVICE TYPE DROPDOWN MODAL */}
      <Modal
        visible={showServiceDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowServiceDropdown(false)}
      >
        <Pressable
          style={styles.dropdownBackdrop}
          onPress={() => setShowServiceDropdown(false)}
        >
          <Pressable style={styles.dropdownSheet} onPress={() => {}}>
            <View style={styles.dropdownHandle} />
            <Text style={styles.dropdownSheetTitle}>Select service type</Text>
            <Text style={styles.dropdownSheetSubtitle}>
              This coupon will only apply to orders of this service
            </Text>

            {SERVICE_TYPES.map((opt) => {
              const isSelected = couponServiceType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.dropdownOption,
                    isSelected && styles.dropdownOptionSelected,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setCouponServiceType(opt.value);
                    setShowServiceDropdown(false);
                  }}
                >
                  <View
                    style={[
                      styles.dropdownOptionIconCircle,
                      isSelected && styles.dropdownOptionIconCircleSelected,
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={isSelected ? "#FFFFFF" : "#166534"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.dropdownOptionLabel,
                        isSelected && styles.dropdownOptionLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.dropdownOptionHint}>{opt.hint}</Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={20} color="#166534" />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.dropdownCancelBtn}
              activeOpacity={0.85}
              onPress={() => setShowServiceDropdown(false)}
            >
              <Text style={styles.dropdownCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default AddChefs;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B140F",
  },
  darkHeader: {
    paddingBottom: 20,
  },
  headerInner: {
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerBrandCol: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: "#86EFAC",
    letterSpacing: 1.4,
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: "900",
    color: "#F9FAFB",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: "#A3A3A3",
    marginTop: 5,
    fontWeight: "500",
    lineHeight: 18,
  },
  headerToggleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: "rgba(26, 36, 29, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(38, 54, 42, 0.9)",
  },
  toggleLabelText: {
    fontSize: 9,
    fontWeight: "800",
    marginBottom: 1,
  },
  smallSwitch: {
    transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
    marginVertical: -2,
  },

  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(26, 36, 29, 0.95)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(38, 54, 42, 0.9)",
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#F9FAFB",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(38, 54, 42, 0.95)",
  },

  bodyCard: {
    flex: 1,
    backgroundColor: "#F4F7F5",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8EEE9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 1,
  },

  avatarRowContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  avatarPicker: {
    borderRadius: 70,
    padding: 5,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  avatarPlaceholder: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
    borderStyle: "dashed",
  },
  cameraIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarPickText: {
    fontSize: 11,
    color: "#166534",
    fontWeight: "700",
    marginTop: 4,
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  removeIcon: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#DC2626",
    borderRadius: 12,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    zIndex: 5,
  },

  bannerScroll: {
    marginTop: 4,
  },
  bannerUploadPlaceholder: {
    width: 96,
    height: 84,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
    borderStyle: "dashed",
    marginRight: 10,
  },
  bannerUploadIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  bannerUploadText: {
    fontSize: 11.5,
    color: "#166534",
    fontWeight: "700",
  },
  bannerThumbnailWrap: {
    width: 96,
    height: 84,
    borderRadius: 14,
    marginRight: 10,
    position: "relative",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bannerThumbnail: {
    width: "100%",
    height: "100%",
  },
  bannerRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    zIndex: 5,
  },
  addBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addBannerBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
  },

  addCouponChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  addCouponChipText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#166534",
  },
  couponFormBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },

  // ✅ NEW: dropdown trigger (the button that opens the modal)
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 16,
  },
  dropdownTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dropdownIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dropdownTriggerValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  dropdownTriggerHint: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 1,
  },

  // ✅ NEW: dropdown modal styles
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 20, 15, 0.55)",
    justifyContent: "flex-end",
  },
  dropdownSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: "rgba(15, 56, 42, 0.08)",
    shadowColor: "#0F382A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 25,
  },
  dropdownHandle: {
    width: 40,
    height: 4.5,
    backgroundColor: "#CBD5E1",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 14,
  },
  dropdownSheetTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0B261D",
    letterSpacing: -0.3,
  },
  dropdownSheetSubtitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 3,
    marginBottom: 14,
    lineHeight: 17,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  dropdownOptionSelected: {
    backgroundColor: "#F0FDF4",
    borderColor: "#166534",
  },
  dropdownOptionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  dropdownOptionIconCircleSelected: {
    backgroundColor: "#166534",
  },
  dropdownOptionLabel: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  dropdownOptionLabelSelected: {
    color: "#166534",
  },
  dropdownOptionHint: {
    fontSize: 11.5,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
  },
  dropdownCancelBtn: {
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  dropdownCancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
  },

  couponServiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  couponServiceChipText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#166534",
    letterSpacing: 0.2,
  },

  saveCouponBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#166534",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 4,
  },
  saveCouponBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14.5,
  },
  emptyCouponBox: {
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  emptyCouponTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#334155",
    marginTop: 8,
  },
  emptyCouponSub: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
  },
  emptyCouponCta: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
  },
  emptyCouponCtaText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#166534",
  },
  couponCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  couponLeft: {
    flex: 1,
  },
  couponCodeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#166534",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  couponCodeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  couponValueText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  couponDescText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  couponDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "600",
  },
  disabledInput: {
    backgroundColor: "#EDF2F7",
    color: "#4A5568",
  },
  disabledButton: {
    opacity: 0.7,
  },
  foodTypeContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  foodTypeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  foodTypeButtonSelected: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  foodTypeText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#64748B",
  },
  foodTypeTextSelected: {
    color: "#FFFFFF",
  },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: "#166534",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15.5,
  },
  deleteOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  deleteOutlineText: {
    color: "#DC2626",
    fontWeight: "800",
    fontSize: 14.5,
  },
});