// src/app/screens/add-banner.tsx
import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import api from '@/src/lib/api';

const { width } = Dimensions.get('window');

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
};

const AddBannerScreen = () => {
  const router = useRouter();
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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

  const validate = (): boolean => {
    if (!form.imageUri) {
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

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const data = new FormData();
      const uri = form.imageUri!;
      const filename = uri.split('/').pop() || `banner_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      data.append('image', { uri, name: filename, type } as any);
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

      await api.post('/api/banners', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('Success', 'Banner added successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.log('Add banner error:', err);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to add banner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#F9FAFB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Banner</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Live Preview (matches Home.tsx static banner look) ─── */}
        <Text style={styles.sectionLabel}>LIVE PREVIEW</Text>
        <View style={styles.previewWrap}>
          {form.isFullBanner ? (
            <View style={styles.bannerFullSlideCard}>
              {form.imageUri ? (
                <Image source={{ uri: form.imageUri }} style={styles.bannerFullImage} resizeMode="cover" />
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
                <View style={[styles.mealBadgePill, form.isComingSoon && styles.comingSoonBadgePill]}>
                  <View style={[styles.badgeGreenDot, form.isComingSoon && styles.comingSoonBadgeDot]} />
                  <Text style={[styles.mealBadgeText, form.isComingSoon && styles.comingSoonBadgeText]}>
                    {form.badge || 'BADGE'}
                  </Text>
                </View>

                <Text style={styles.bannerTitlePrimary}>{form.titlePrimary || 'Title Line 1'}</Text>
                <Text style={[styles.bannerTitleSecondary, form.isComingSoon && styles.comingSoonTitleSecondary]}>
                  {form.titleSecondary || 'Title Line 2'}
                </Text>
                <Text style={styles.bannerSubtitle} numberOfLines={2}>
                  {form.tagline || 'Tagline goes here...'}
                </Text>

                {form.isComingSoon ? (
                  <View style={styles.bannerNotifyBtn}>
                    <MaterialCommunityIcons name="clock-fast" size={14} color="#FBBF24" style={{ marginRight: 5 }} />
                    <Text style={styles.bannerNotifyBtnText}>Coming Soon</Text>
                  </View>
                ) : (
                  <View style={styles.bannerExploreBtn}>
                    <Text style={styles.bannerExploreBtnText}>Explore Plans</Text>
                    <Feather name="arrow-right" size={13} color="#111813" style={{ marginLeft: 6 }} />
                  </View>
                )}
              </View>

              <View style={styles.bannerRightSection}>
                {form.imageUri ? (
                  <Image source={{ uri: form.imageUri }} style={styles.bannerFoodImage} resizeMode="cover" />
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

        {/* ─── Image Picker ─── */}
        <Text style={styles.sectionLabel}>BANNER IMAGE *</Text>
        <TouchableOpacity style={styles.imagePicker} activeOpacity={0.85} onPress={pickImage}>
          {form.imageUri ? (
            <Image source={{ uri: form.imageUri }} style={styles.imagePickerPreview} resizeMode="cover" />
          ) : (
            <View style={styles.imagePickerEmpty}>
              <Ionicons name="cloud-upload-outline" size={30} color="#15803D" />
              <Text style={styles.imagePickerEmptyText}>Tap to upload image</Text>
              <Text style={styles.imagePickerEmptySub}>Recommended 1200×800 · auto-compressed</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ─── Inputs ─── */}
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
              <Text style={styles.submitBtnText}>Publish Banner</Text>
              <Feather name="check-circle" size={17} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

// ─── Small reusable input ───
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
// Styles — banner preview styles mirror Home.tsx's static banner EXACTLY so
// the admin sees a 1:1 preview of what will render on the Home screen.
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

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },

  sectionLabel: {
    fontSize: 10.5, fontWeight: '800', color: '#52B788',
    letterSpacing: 1, marginTop: 20, marginBottom: 10,
  },

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
  badgeGreenDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4ADE80', marginRight: 5 },
  comingSoonBadgeDot: { backgroundColor: '#FBBF24' },
  mealBadgeText: { color: '#86EFAC', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 },
  comingSoonBadgeText: { color: '#FDE68A', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 },
  bannerTitlePrimary: { fontSize: 17.5, fontWeight: '900', color: '#FFFFFF', lineHeight: 21, letterSpacing: -0.2 },
  bannerTitleSecondary: { fontSize: 17.5, fontWeight: '900', color: '#4ADE80', lineHeight: 21, letterSpacing: -0.2 },
  comingSoonTitleSecondary: { color: '#FBBF24' },
  bannerSubtitle: { fontSize: 10, color: '#D1D5DB', marginTop: 4, lineHeight: 14 },
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

  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', color: '#9CA3AF', marginBottom: 6, letterSpacing: 0.3 },
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
});