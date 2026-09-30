// src/app/screens/add-banner.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Dimensions,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import api from '@/src/lib/api';

const { width, height } = Dimensions.get('window');

interface BannerForm {
  titlePrimary: string;
  titleSecondary: string;
  tagline: string;
  badge: string;
  price: string;
  unit: string;
  isComingSoon: boolean;
  isFullBanner: boolean;
  isActive: boolean;
  displayOrder: string;
  ctaAction: string;
  imageUri: string | null;
  // When editing, we keep the existing remote URL so the preview still shows
  // an image even before the user picks a new one.
  existingImageUrl: string | null;
}

interface BannerRecord {
  _id: string;
  titlePrimary: string;
  titleSecondary: string;
  tagline: string;
  badge: string;
  price: string;
  unit: string;
  imageUrl: string;
  cloudinaryPublicId: string;
  isComingSoon: boolean;
  isFullBanner: boolean;
  isActive: boolean;
  displayOrder: number;
  ctaAction: string;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM: BannerForm = {
  titlePrimary: '',
  titleSecondary: '',
  tagline: '',
  badge: '',
  price: '',
  unit: '',
  isComingSoon: false,
  isFullBanner: false,
  isActive: true,
  displayOrder: '0',
  ctaAction: '',
  imageUri: null,
  existingImageUrl: null,
};

const AddBannerScreen = () => {
  const router = useRouter();

  // ─── Form state (used for both create and edit) ───
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [bannerList, setBannerList] = useState<BannerRecord[]>([]);
  const [isFormVisible, setIsFormVisible] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<BannerRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const updateField = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ────────────────────────────────────────────────────────────────────────
  // Fetch all banners (including inactive) for the management list.
  // ────────────────────────────────────────────────────────────────────────
  const fetchAllBanners = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) setIsLoadingList(true);
      const res = await api.get('/api/banners', { params: { includeInactive: 'true' } });
      if (res.data && res.data.success && Array.isArray(res.data.banners)) {
        setBannerList(res.data.banners);
      } else {
        setBannerList([]);
      }
    } catch (err) {
      console.log('fetchAllBanners error:', err);
      setBannerList([]);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchAllBanners();
  }, [fetchAllBanners]);

  // ────────────────────────────────────────────────────────────────────────
  // Image picker
  // ────────────────────────────────────────────────────────────────────────
  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos to upload a banner image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 10],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        updateField('imageUri', result.assets[0].uri);
      }
    } catch (err) {
      console.log('pickImage error:', err);
      Alert.alert('Error', 'Could not open image picker.');
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Open form for CREATE
  // ────────────────────────────────────────────────────────────────────────
  const openCreateForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setIsFormVisible(true);
  };

  // ────────────────────────────────────────────────────────────────────────
  // Open form for EDIT (prefill all fields)
  // ────────────────────────────────────────────────────────────────────────
  const openEditForm = (banner: BannerRecord) => {
    setEditingId(banner._id);
    setForm({
      titlePrimary: banner.titlePrimary || '',
      titleSecondary: banner.titleSecondary || '',
      tagline: banner.tagline || '',
      badge: banner.badge || '',
      price: banner.price || '',
      unit: banner.unit || '',
      isComingSoon: !!banner.isComingSoon,
      isFullBanner: !!banner.isFullBanner,
      isActive: banner.isActive !== false,
      displayOrder: String(banner.displayOrder ?? 0),
      ctaAction: banner.ctaAction || '',
      imageUri: null,
      existingImageUrl: banner.imageUrl || null,
    });
    setIsFormVisible(true);
  };

  const closeForm = () => {
    setIsFormVisible(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  // ────────────────────────────────────────────────────────────────────────
  // Validation
  // ────────────────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const hasImage = form.imageUri || form.existingImageUrl;
    if (!hasImage) {
      Alert.alert('Missing image', 'Please select a banner image.');
      return false;
    }
    if (!form.isFullBanner) {
      if (!form.titlePrimary.trim() || !form.titleSecondary.trim()) {
        Alert.alert('Missing title', 'Please fill in both title lines (or enable Full Banner mode).');
        return false;
      }
    }
    return true;
  };

  // ────────────────────────────────────────────────────────────────────────
  // Submit — create OR update
  // ────────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const data = new FormData();

      // Only append image if a NEW one was picked. When editing without a new
      // image, the backend keeps the existing one (safe replace).
      if (form.imageUri) {
        const uri = form.imageUri;
        const filename = uri.split('/').pop() || `banner_${Date.now()}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        data.append('image', { uri, name: filename, type } as any);
      }

      data.append('titlePrimary', form.titlePrimary);
      data.append('titleSecondary', form.titleSecondary);
      data.append('tagline', form.tagline);
      data.append('badge', form.badge);
      data.append('price', form.price);
      data.append('unit', form.unit);
      data.append('isComingSoon', String(form.isComingSoon));
      data.append('isFullBanner', String(form.isFullBanner));
      data.append('isActive', String(form.isActive));
      data.append('displayOrder', String(Number(form.displayOrder) || 0));
      data.append('ctaAction', form.ctaAction);

      if (editingId) {
        await api.put(`/api/banners/${editingId}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/api/banners', data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      closeForm();
      await fetchAllBanners(true);
    } catch (err: any) {
      console.log('Submit banner error:', err);
      Alert.alert(
        'Error',
        err?.response?.data?.message || `Failed to ${editingId ? 'update' : 'add'} banner.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Delete confirmation
  // ────────────────────────────────────────────────────────────────────────
  const handleDeleteRequest = (banner: BannerRecord) => {
    setDeleteTarget(banner);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/banners/${deleteTarget._id}`);
      setDeleteTarget(null);
      await fetchAllBanners(true);
    } catch (err: any) {
      console.log('Delete banner error:', err);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to delete banner.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Preview image source (new pick wins, else existing remote URL)
  const previewImageSource =
    form.imageUri != null
      ? { uri: form.imageUri }
      : form.existingImageUrl != null
      ? { uri: form.existingImageUrl }
      : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#F9FAFB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Banners</Text>
        <TouchableOpacity style={styles.headerAddBtn} onPress={openCreateForm}>
          <Ionicons name="add" size={22} color="#F9FAFB" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Management list header ─── */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.sectionLabel}>
            ALL BANNERS ({bannerList.length})
          </Text>
          <TouchableOpacity onPress={() => fetchAllBanners()} activeOpacity={0.7}>
            <Feather name="refresh-cw" size={15} color="#52B788" />
          </TouchableOpacity>
        </View>

        {isLoadingList ? (
          <View style={styles.listLoadingBox}>
            <ActivityIndicator size="small" color="#15803D" />
            <Text style={styles.listLoadingText}>Loading banners…</Text>
          </View>
        ) : bannerList.length === 0 ? (
          <View style={styles.emptyListBox}>
            <Ionicons name="images-outline" size={34} color="#4ADE80" />
            <Text style={styles.emptyListTitle}>No banners yet</Text>
            <Text style={styles.emptyListSubtitle}>
              Tap the + button at the top right to add your first banner.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardListScroll}
          >
            {bannerList.map((banner) => (
              <View key={banner._id} style={styles.manageCard}>
                {/* ─── Top-right action icons ─── */}
                <View style={styles.manageCardActionsRow} pointerEvents="box-none">
                  <TouchableOpacity
                    style={[styles.manageCardIconBtn, styles.manageCardEditBtn]}
                    activeOpacity={0.85}
                    onPress={() => openEditForm(banner)}
                  >
                    <Feather name="edit-2" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.manageCardIconBtn, styles.manageCardDeleteBtn]}
                    activeOpacity={0.85}
                    onPress={() => handleDeleteRequest(banner)}
                  >
                    <Feather name="trash-2" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* ─── Banner preview (mini version of Home banner) ─── */}
                <View style={styles.manageCardPreview}>
                  {banner.isFullBanner ? (
                    <Image
                      source={{ uri: banner.imageUrl }}
                      style={styles.manageCardFullImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.manageCardSplitRow}>
                      <View style={styles.manageCardLeftCol}>
                        {!!banner.badge && (
                          <View
                            style={[
                              styles.manageBadgePill,
                              banner.isComingSoon && styles.manageBadgePillSoon,
                            ]}
                          >
                            <View
                              style={[
                                styles.manageBadgeDot,
                                banner.isComingSoon && styles.manageBadgeDotSoon,
                              ]}
                            />
                            <Text
                              style={[
                                styles.manageBadgeText,
                                banner.isComingSoon && styles.manageBadgeTextSoon,
                              ]}
                              numberOfLines={1}
                            >
                              {banner.badge}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.manageTitlePrimary} numberOfLines={1}>
                          {banner.titlePrimary}
                        </Text>
                        <Text
                          style={[
                            styles.manageTitleSecondary,
                            banner.isComingSoon && styles.manageTitleSecondarySoon,
                          ]}
                          numberOfLines={1}
                        >
                          {banner.titleSecondary}
                        </Text>
                      </View>
                      <View style={styles.manageCardRightCol}>
                        <Image
                          source={{ uri: banner.imageUrl }}
                          style={styles.manageCardFoodImage}
                          resizeMode="cover"
                        />
                        {!banner.isComingSoon && !!banner.price && (
                          <View style={styles.managePricePill}>
                            <Text style={styles.managePriceText}>₹{banner.price}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>

                {/* ─── Meta row ─── */}
                <View style={styles.manageCardMetaRow}>
                  <View style={styles.manageCardMetaLeft}>
                    <Text style={styles.manageCardOrderText}>
                      Order #{banner.displayOrder ?? 0}
                    </Text>
                    <View
                      style={[
                        styles.manageCardStatusDot,
                        banner.isActive ? styles.manageCardStatusDotActive : styles.manageCardStatusDotInactive,
                      ]}
                    />
                    <Text style={styles.manageCardStatusText}>
                      {banner.isActive ? 'Active' : 'Inactive'}
                    </Text>
                    {banner.isComingSoon && (
                      <>
                        <View style={styles.manageCardMetaDivider} />
                        <Text style={styles.manageCardSoonText}>Coming Soon</Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── FORM MODAL (Create / Edit) ─── */}
      <Modal
        visible={isFormVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeForm}
      >
        <View style={styles.formModalBackdrop}>
          <View style={styles.formModalCard}>
            {/* Modal header */}
            <View style={styles.formModalHeader}>
              <Text style={styles.formModalTitle}>
                {editingId ? 'Edit Banner' : 'Add New Banner'}
              </Text>
              <TouchableOpacity style={styles.formModalCloseBtn} onPress={closeForm}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formModalScroll}
              contentContainerStyle={styles.formModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ─── Live Preview ─── */}
              <Text style={styles.sectionLabel}>LIVE PREVIEW</Text>
              <View style={styles.previewWrap}>
                {form.isFullBanner ? (
                  <View style={styles.bannerFullSlideCard}>
                    {previewImageSource ? (
                      <Image
                        source={previewImageSource}
                        style={styles.bannerFullImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <Ionicons name="image-outline" size={28} color="#4ADE80" />
                        <Text style={styles.previewPlaceholderText}>Full Image Banner</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.bannerSlideCard}>
                    <View style={styles.bannerLeftSection}>
                      <View
                        style={[
                          styles.mealBadgePill,
                          form.isComingSoon && styles.comingSoonBadgePill,
                        ]}
                      >
                        <View
                          style={[
                            styles.badgeGreenDot,
                            form.isComingSoon && styles.comingSoonBadgeDot,
                          ]}
                        />
                        <Text
                          style={[
                            styles.mealBadgeText,
                            form.isComingSoon && styles.comingSoonBadgeText,
                          ]}
                          numberOfLines={1}
                        >
                          {form.badge || 'BADGE'}
                        </Text>
                      </View>

                      <Text style={styles.bannerTitlePrimary} numberOfLines={1}>
                        {form.titlePrimary || 'Title Line 1'}
                      </Text>
                      <Text
                        style={[
                          styles.bannerTitleSecondary,
                          form.isComingSoon && styles.comingSoonTitleSecondary,
                        ]}
                        numberOfLines={1}
                      >
                        {form.titleSecondary || 'Title Line 2'}
                      </Text>
                      <Text style={styles.bannerSubtitle} numberOfLines={2}>
                        {form.tagline || 'Tagline goes here...'}
                      </Text>

                      {form.isComingSoon ? (
                        <View style={styles.bannerNotifyBtn}>
                          <MaterialCommunityIcons
                            name="clock-fast"
                            size={14}
                            color="#FBBF24"
                            style={{ marginRight: 5 }}
                          />
                          <Text style={styles.bannerNotifyBtnText}>Coming Soon</Text>
                        </View>
                      ) : (
                        <View style={styles.bannerExploreBtn}>
                          <Text style={styles.bannerExploreBtnText}>Explore Plans</Text>
                          <Feather
                            name="arrow-right"
                            size={13}
                            color="#111813"
                            style={{ marginLeft: 6 }}
                          />
                        </View>
                      )}
                    </View>

                    <View style={styles.bannerRightSection}>
                      {previewImageSource ? (
                        <Image
                          source={previewImageSource}
                          style={styles.bannerFoodImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.previewPlaceholder}>
                          <Ionicons name="image-outline" size={24} color="#4ADE80" />
                        </View>
                      )}

                      {form.isComingSoon ? (
                        <View style={styles.comingSoonTagBanner}>
                          <Ionicons name="sparkles" size={11} color="#FBBF24" style={{ marginRight: 4 }} />
                          <Text style={styles.comingSoonTagText}>LAUNCHING SOON</Text>
                        </View>
                      ) : (
                        <View style={styles.startsAtBadge}>
                          <Text style={styles.startsAtLabel}>STARTS AT</Text>
                          <Text style={styles.startsAtPrice}>₹{form.price || '00'}</Text>
                          <Text style={styles.startsAtDuration}>{form.unit || '/pack'}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {/* ─── Image picker ─── */}
              <Text style={styles.sectionLabel}>
                BANNER IMAGE {!form.existingImageUrl ? '*' : ''}
              </Text>
              <TouchableOpacity
                style={styles.imagePicker}
                activeOpacity={0.85}
                onPress={pickImage}
              >
                {previewImageSource ? (
                  <Image
                    source={previewImageSource}
                    style={styles.imagePickerPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.imagePickerEmpty}>
                    <Ionicons name="cloud-upload-outline" size={30} color="#15803D" />
                    <Text style={styles.imagePickerEmptyText}>Tap to upload image</Text>
                    <Text style={styles.imagePickerEmptySub}>
                      Recommended 1200×800 · auto-compressed
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {editingId && form.existingImageUrl && !form.imageUri && (
                <Text style={styles.imageKeepHint}>
                  Current image kept. Pick a new one to replace it (old one is auto-deleted from Cloudinary).
                </Text>
              )}

              {/* ─── Detail inputs ─── */}
              <Text style={styles.sectionLabel}>BANNER DETAILS</Text>

              <InputField
                label="Title Line 1"
                placeholder="e.g. Festive Feasts,"
                value={form.titlePrimary}
                onChangeText={(t) => updateField('titlePrimary', t)}
              />
              <InputField
                label="Title Line 2"
                placeholder="e.g. Served with Love"
                value={form.titleSecondary}
                onChangeText={(t) => updateField('titleSecondary', t)}
              />
              <InputField
                label="Tagline"
                placeholder="e.g. Let Bappa bless your celebrations with authentic catering spreads made fresh."
                value={form.tagline}
                onChangeText={(t) => updateField('tagline', t)}
                multiline
              />
              <InputField
                label="Badge"
                placeholder="e.g. CATERING SERVICE"
                value={form.badge}
                onChangeText={(t) => updateField('badge', t)}
              />

              <View style={styles.rowTwoCol}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <InputField
                    label="Price"
                    placeholder="e.g. 129"
                    value={form.price}
                    onChangeText={(t) => updateField('price', t)}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <InputField
                    label="Unit"
                    placeholder="e.g. /platter"
                    value={form.unit}
                    onChangeText={(t) => updateField('unit', t)}
                  />
                </View>
              </View>

              <InputField
                label="CTA Action (optional)"
                placeholder="e.g. Catering, MealBox, QuickBites, Pickles"
                value={form.ctaAction}
                onChangeText={(t) => updateField('ctaAction', t)}
              />

              <InputField
                label="Display Order"
                placeholder="e.g. 1"
                value={form.displayOrder}
                onChangeText={(t) => updateField('displayOrder', t)}
                keyboardType="numeric"
              />

              {/* ─── Toggles ─── */}
              <Text style={styles.sectionLabel}>OPTIONS</Text>
              <ToggleRow
                label="Full Image Banner"
                subtitle="Render as a single full-bleed image (no text overlay)"
                value={form.isFullBanner}
                onValueChange={(v) => updateField('isFullBanner', v)}
              />
              <ToggleRow
                label="Coming Soon"
                subtitle="Show a 'Coming Soon' badge instead of an Explore button"
                value={form.isComingSoon}
                onValueChange={(v) => updateField('isComingSoon', v)}
              />
              <ToggleRow
                label="Active"
                subtitle="Show this banner on the Home screen"
                value={form.isActive}
                onValueChange={(v) => updateField('isActive', v)}
              />

              {/* ─── Submit ─── */}
              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]}
                activeOpacity={0.88}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.submitBtnText}>
                      {editingId ? 'Update Banner' : 'Publish Banner'}
                    </Text>
                    <Feather
                      name={editingId ? 'save' : 'check-circle'}
                      size={17}
                      color="#FFFFFF"
                      style={{ marginLeft: 8 }}
                    />
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── DELETE CONFIRMATION MODAL ─── */}
      <Modal
        visible={!!deleteTarget}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={styles.deleteModalBackdrop}>
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteIconWrap}>
              <Feather name="trash-2" size={26} color="#DC2626" />
            </View>
            <Text style={styles.deleteModalTitle}>Delete Banner?</Text>
            <Text style={styles.deleteModalDescription}>
              Are you sure you want to delete this banner? This action cannot be undone and the
              image will be removed from Cloudinary.
            </Text>

            {deleteTarget && (
              <View style={styles.deletePreviewRow}>
                <Image
                  source={{ uri: deleteTarget.imageUrl }}
                  style={styles.deletePreviewImg}
                  resizeMode="cover"
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.deletePreviewTitle} numberOfLines={1}>
                    {deleteTarget.isFullBanner
                      ? 'Full Image Banner'
                      : deleteTarget.titlePrimary || 'Banner'}
                  </Text>
                  {!deleteTarget.isFullBanner && (
                    <Text style={styles.deletePreviewSub} numberOfLines={1}>
                      {deleteTarget.titleSecondary || ''}
                    </Text>
                  )}
                </View>
              </View>
            )}

            <View style={styles.deleteActionsRow}>
              <TouchableOpacity
                style={[styles.deleteActionBtn, styles.deleteCancelBtn]}
                activeOpacity={0.85}
                onPress={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteActionBtn, styles.deleteConfirmBtn]}
                activeOpacity={0.85}
                onPress={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Reusable input ───
const InputField = ({
  label,
  placeholder,
  value,
  onChangeText,
  multiline,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: any;
}) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      placeholder={placeholder}
      placeholderTextColor="#6B7280"
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      keyboardType={keyboardType}
    />
  </View>
);

const ToggleRow = ({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) => (
  <View style={styles.toggleRow}>
    <View style={{ flex: 1 }}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Text style={styles.toggleSubtitle}>{subtitle}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#374151', true: '#15803D' }}
      thumbColor="#FFFFFF"
    />
  </View>
);

export default AddBannerScreen;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111813' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 0) + 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111813',
  },
  headerBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1A241D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#26342A',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#F9FAFB' },
  headerAddBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#15803D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#15803D',
    shadowColor: '#15803D', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },

  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 10.5, fontWeight: '800', color: '#52B788',
    letterSpacing: 1, marginTop: 20, marginBottom: 10,
  },

  listLoadingBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  listLoadingText: { color: '#86EFAC', fontSize: 12.5, fontWeight: '600' },

  emptyListBox: {
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#132117',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#223628',
    borderStyle: 'dashed',
  },
  emptyListTitle: {
    fontSize: 14, fontWeight: '800', color: '#F9FAFB', marginTop: 10,
  },
  emptyListSubtitle: {
    fontSize: 11.5, color: '#94A3B8', textAlign: 'center',
    marginTop: 4, lineHeight: 16,
  },

  // ─── Scrollable management cards ───
  cardListScroll: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  manageCard: {
    width: 250,
    backgroundColor: '#132117',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#223628',
    marginRight: 12,
    padding: 10,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  // Top-right edit + delete icons
  manageCardActionsRow: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    zIndex: 10,
  },
  manageCardIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  manageCardEditBtn: {
    backgroundColor: '#2563EB',
    marginRight: 6,
  },
  manageCardDeleteBtn: {
    backgroundColor: '#DC2626',
  },

  manageCardPreview: {
    width: '100%',
    height: 130,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0F1A13',
    borderWidth: 1,
    borderColor: '#1E2E23',
  },
  manageCardFullImage: {
    width: '100%',
    height: '100%',
  },
  manageCardSplitRow: {
    flexDirection: 'row',
    flex: 1,
  },
  manageCardLeftCol: {
    flex: 1.15,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  manageCardRightCol: {
    flex: 1,
    position: 'relative',
  },
  manageCardFoodImage: {
    width: '100%',
    height: '100%',
  },
  manageBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(74, 222, 128, 0.4)',
    maxWidth: '100%',
  },
  manageBadgePillSoon: {
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  manageBadgeDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#4ADE80', marginRight: 4,
  },
  manageBadgeDotSoon: { backgroundColor: '#FBBF24' },
  manageBadgeText: {
    color: '#86EFAC', fontSize: 7.5, fontWeight: '800', letterSpacing: 0.3,
  },
  manageBadgeTextSoon: { color: '#FDE68A' },
  manageTitlePrimary: {
    fontSize: 12.5, fontWeight: '900', color: '#FFFFFF', lineHeight: 15,
  },
  manageTitleSecondary: {
    fontSize: 12.5, fontWeight: '900', color: '#4ADE80', lineHeight: 15,
  },
  manageTitleSecondarySoon: { color: '#FBBF24' },

  managePricePill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#0F1A13',
    borderWidth: 1,
    borderColor: '#4ADE80',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  managePriceText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },

  manageCardMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageCardMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manageCardOrderText: {
    fontSize: 10.5, color: '#94A3B8', fontWeight: '700',
  },
  manageCardStatusDot: {
    width: 6, height: 6, borderRadius: 3, marginLeft: 8, marginRight: 4,
  },
  manageCardStatusDotActive: { backgroundColor: '#4ADE80' },
  manageCardStatusDotInactive: { backgroundColor: '#64748B' },
  manageCardStatusText: {
    fontSize: 10.5, color: '#94A3B8', fontWeight: '700',
  },
  manageCardMetaDivider: {
    width: 1, height: 10, backgroundColor: '#334155',
    marginHorizontal: 6,
  },
  manageCardSoonText: {
    fontSize: 10.5, color: '#FBBF24', fontWeight: '800',
  },

  // ─── Banner live preview styles (mirror Home.tsx) ───
  previewWrap: {
    borderRadius: 22, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 10,
  },
  bannerSlideCard: {
    width: '100%', height: 200, borderRadius: 22, overflow: 'hidden',
    flexDirection: 'row', backgroundColor: '#132117',
    borderWidth: 1, borderColor: '#223628',
  },
  bannerFullSlideCard: {
    width: '100%', height: 200, borderRadius: 22, overflow: 'hidden',
    backgroundColor: '#132117', borderWidth: 1, borderColor: '#223628',
  },
  bannerFullImage: { width: '100%', height: '100%' },

  bannerLeftSection: {
    flex: 1.15, paddingTop: 14, paddingBottom: 20,
    paddingLeft: 16, paddingRight: 6, justifyContent: 'center',
  },
  mealBadgePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 12,
    alignSelf: 'flex-start', marginBottom: 6,
    borderWidth: 0.5, borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  comingSoonBadgePill: {
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  badgeGreenDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: '#4ADE80', marginRight: 5,
  },
  comingSoonBadgeDot: { backgroundColor: '#FBBF24' },
  mealBadgeText: {
    color: '#86EFAC', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4,
  },
  comingSoonBadgeText: {
    color: '#FDE68A', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4,
  },
  bannerTitlePrimary: {
    fontSize: 17.5, fontWeight: '900', color: '#FFFFFF',
    lineHeight: 21, letterSpacing: -0.2,
  },
  bannerTitleSecondary: {
    fontSize: 17.5, fontWeight: '900', color: '#4ADE80',
    lineHeight: 21, letterSpacing: -0.2,
  },
  comingSoonTitleSecondary: { color: '#FBBF24' },
  bannerSubtitle: {
    fontSize: 10, color: '#D1D5DB', marginTop: 4, lineHeight: 14,
  },
  bannerExploreBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 6.5,
    borderRadius: 18, alignSelf: 'flex-start', marginTop: 10,
  },
  bannerExploreBtnText: { color: '#111813', fontSize: 10.5, fontWeight: '800' },
  bannerNotifyBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#26342A', borderWidth: 1, borderColor: '#FBBF24',
    paddingHorizontal: 13, paddingVertical: 6.5, borderRadius: 18,
    alignSelf: 'flex-start', marginTop: 10,
  },
  bannerNotifyBtnText: { color: '#FDE68A', fontSize: 10.5, fontWeight: '800' },
  bannerRightSection: { flex: 1, position: 'relative', height: '100%' },
  bannerFoodImage: { width: '100%', height: '100%' },
  startsAtBadge: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: '#0F1A13', borderWidth: 1.5, borderColor: '#4ADE80',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  startsAtLabel: { color: '#86EFAC', fontSize: 6.5, fontWeight: '800', letterSpacing: 0.3 },
  startsAtPrice: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  startsAtDuration: { color: '#FFFFFF', fontSize: 9 },
  comingSoonTagBanner: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: '#0F1A13', borderWidth: 1.5, borderColor: '#FBBF24',
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5,
    flexDirection: 'row', alignItems: 'center',
  },
  comingSoonTagText: { color: '#FDE68A', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.3 },

  previewPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A241D',
  },
  previewPlaceholderText: { color: '#86EFAC', fontSize: 11, fontWeight: '700', marginTop: 6 },

  imagePicker: {
    width: '100%', height: 160, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#1A241D', borderWidth: 1.5, borderColor: '#26342A',
    borderStyle: 'dashed',
  },
  imagePickerPreview: { width: '100%', height: '100%' },
  imagePickerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imagePickerEmptyText: { color: '#D1D5DB', fontSize: 13, fontWeight: '700', marginTop: 8 },
  imagePickerEmptySub: { color: '#6B7280', fontSize: 10.5, marginTop: 3 },
  imageKeepHint: {
    fontSize: 10.5, color: '#94A3B8', marginTop: 8, lineHeight: 15, fontStyle: 'italic',
  },

  inputGroup: { marginBottom: 14 },
  inputLabel: {
    fontSize: 11.5, fontWeight: '700', color: '#9CA3AF',
    marginBottom: 6, letterSpacing: 0.3,
  },
  input: {
    backgroundColor: '#1A241D', borderRadius: 12,
    borderWidth: 1, borderColor: '#26342A',
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#F3F4F6', fontSize: 13.5, fontWeight: '500',
  },
  inputMultiline: { minHeight: 76, textAlignVertical: 'top' },
  rowTwoCol: { flexDirection: 'row' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A241D', borderRadius: 12,
    borderWidth: 1, borderColor: '#26342A',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
  },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: '#F3F4F6' },
  toggleSubtitle: { fontSize: 10.5, color: '#6B7280', marginTop: 2 },

  submitBtn: {
    marginTop: 22, backgroundColor: '#15803D', borderRadius: 16,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#15803D', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

  // ─── Form modal ───
  formModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(10, 18, 13, 0.85)',
    justifyContent: 'flex-end',
  },
  formModalCard: {
    backgroundColor: '#111813',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    maxHeight: height * 0.94,
    paddingTop: 14,
    borderTopWidth: 1, borderColor: '#26342A',
  },
  formModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E2E23',
  },
  formModalTitle: { fontSize: 16.5, fontWeight: '800', color: '#F9FAFB' },
  formModalCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1A241D', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#26342A',
  },
  formModalScroll: { flex: 1 },
  formModalScrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },

  // ─── Delete confirmation modal ───
  deleteModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  deleteModalCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#0F1A13',
    borderRadius: 22,
    paddingVertical: 22, paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#26342A',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 24,
  },
  deleteIconWrap: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(220, 38, 38, 0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  deleteModalTitle: {
    fontSize: 17, fontWeight: '900', color: '#F9FAFB', letterSpacing: -0.2,
  },
  deleteModalDescription: {
    fontSize: 12.5, color: '#94A3B8', textAlign: 'center',
    lineHeight: 18, marginTop: 8, marginBottom: 14,
  },
  deletePreviewRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#132117',
    borderRadius: 12, padding: 8,
    borderWidth: 1, borderColor: '#223628',
    marginBottom: 16,
  },
  deletePreviewImg: {
    width: 52, height: 40, borderRadius: 8,
  },
  deletePreviewTitle: {
    fontSize: 12.5, fontWeight: '800', color: '#F9FAFB',
  },
  deletePreviewSub: {
    fontSize: 11, color: '#94A3B8', marginTop: 2,
  },
  deleteActionsRow: {
    flexDirection: 'row', width: '100%', gap: 10,
  },
  deleteActionBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteCancelBtn: {
    backgroundColor: '#1A241D', borderWidth: 1, borderColor: '#26342A',
  },
  deleteCancelText: { color: '#D1D5DB', fontSize: 13.5, fontWeight: '800' },
  deleteConfirmBtn: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  deleteConfirmText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
});