import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '@/src/lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

type Recipient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: 'customer' | 'chef';
};
type Audience = 'customers' | 'chefs' | 'both' | 'selected';
type Destination = '' | 'home' | 'orders' | 'profile' | 'chef_orders' | 'chef_profile';

const GREEN = '#4ADE80';
const BG = '#0F1A13';
const CARD = '#17251B';
const BORDER = '#2A3B2F';
const MUTED = '#9AAE9F';

export default function AdminNotificationsScreen() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageName, setImageName] = useState('');
  const [destination, setDestination] = useState<Destination>('');
  const [audience, setAudience] = useState<Audience>('customers');
  const [recipientRole, setRecipientRole] = useState<'all' | 'customer' | 'chef'>('all');
  const [search, setSearch] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadRecipients = useCallback(async () => {
    setRecipientLoading(true);
    try {
      const response = await api.get('/api/admin-notifications/recipients', {
        params: { role: recipientRole, search: search.trim(), page: 1, limit: 50 },
      });
      setRecipients(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error: any) {
      Alert.alert('Unable to load users', error?.response?.data?.message || 'Please try again.');
    } finally {
      setRecipientLoading(false);
    }
  }, [recipientRole, search]);

  useEffect(() => {
    if (audience === 'selected') void loadRecipients();
  }, [audience, loadRecipients]);

  useFocusEffect(
    useCallback(() => {
      setResult(null);
      return undefined;
    }, [])
  );

  const selectedCount = selectedIds.length;
  const destinationLabel = ({ '': 'No destination', home: 'App home', orders: 'Orders', profile: 'Profile', chef_orders: 'Chef orders', chef_profile: 'Chef profile' } as Record<Destination, string>)[destination];
  const canSend = title.trim().length > 0 && message.trim().length > 0 &&
    (audience !== 'selected' || selectedCount > 0) && !sending && !imageUploading;

  const audienceLabel = useMemo(() => ({
    customers: 'All customers',
    chefs: 'All chefs',
    both: 'Customers and chefs',
    selected: `${selectedCount} selected users`,
  }[audience]), [audience, selectedCount]);

  const toggleRecipient = (id: string) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const chooseImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Gallery permission required', 'Allow KatBox to access your photos to attach a notification image.'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      const form = new FormData();
      form.append('image', { uri: asset.uri, name: asset.fileName || `katbox-notification-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as any);
      setImageUploading(true);
      const uploaded = await api.post('/api/admin-notifications/upload-image', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      if (!uploaded.data?.imageUrl) throw new Error('The server did not return an uploaded image URL.');
      setImageUrl(uploaded.data.imageUrl);
      setImageName(asset.fileName || 'Gallery image');
    } catch (error: any) {
      const detail = error?.response?.data?.message || error?.message || 'Image upload failed. Please try again.';
      Alert.alert('Image upload failed', detail);
    } finally { setImageUploading(false); }
  };

  const chooseDestination = () => {
    Alert.alert('Choose destination', 'Select where recipients should go when they tap the inbox notification.', [
      { text: 'No destination', onPress: () => setDestination('') },
      { text: 'App home', onPress: () => setDestination('home') },
      { text: 'Orders', onPress: () => setDestination('orders') },
      { text: 'Profile', onPress: () => setDestination('profile') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showPreview = () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Missing details', 'Enter both a notification title and message before previewing.');
      return;
    }
    Alert.alert(
      'Notification preview',
      `${title.trim()}\n\n${message.trim()}\n\nAudience: ${audienceLabel}${imageUrl.trim() ? '\nImage: attached' : ''}${destination ? `\nDestination: ${destinationLabel}` : ''}`,
      [{ text: 'Close', style: 'cancel' }, { text: 'Looks good', onPress: () => Alert.alert('Ready to send', 'Review the audience and tap Send notification when you are ready.') }]
    );
  };

  const sendNotification = () => {
    if (!canSend) return;
    Alert.alert(
      'Confirm notification',
      `Send this notification to ${audienceLabel.toLowerCase()}? This will create an in-app notification and send a normal-sound push notification to registered devices.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            setResult(null);
            try {
              const response = await api.post('/api/admin-notifications/send', {
                title: title.trim(),
                message: message.trim(),
                imageUrl: imageUrl.trim(),
                destination: destination || undefined,
                audience,
                userIds: audience === 'selected' ? selectedIds : [],
              });
              setResult(response.data);
              Alert.alert('Notification processed',
                `Recipients: ${response.data?.recipients ?? 0}\nIn-app notifications: ${response.data?.inAppCreated ?? 0}\nPush accepted by Firebase: ${response.data?.pushAccepted ?? 0}\nPush failures: ${response.data?.pushFailed ?? 0}`);
              setTitle('');
              setMessage('');
              setImageUrl('');
              setImageName('');
              setDestination('');
              setSelectedIds([]);
            } catch (error: any) {
              const status = error?.response?.status ? ` (HTTP ${error.response.status})` : '';
              const detail = error?.response?.data?.message || error?.message || 'Unknown network or server error.';
              Alert.alert('Send failed', `${detail}${status}`);
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const renderRecipient = ({ item }: { item: Recipient }) => {
    const selected = selectedIds.includes(item.id);
    return (
      <TouchableOpacity style={styles.recipientRow} onPress={() => toggleRecipient(item.id)} activeOpacity={0.8}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || 'U').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.recipientInfo}>
          <Text style={styles.recipientName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.recipientMeta} numberOfLines={1}>{item.phone || item.email || item.role}</Text>
        </View>
        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
          {selected ? <Ionicons name="checkmark" size={15} color="#0B1710" /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerIcon}><Ionicons name="notifications" size={22} color={GREEN} /></View>
            <View style={styles.headerText}>
              <Text style={styles.heading}>Custom notifications</Text>
              <Text style={styles.subheading}>Send an announcement to KatBox customers and chefs</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color={GREEN} />
            <Text style={styles.infoText}>Admin-only sending. Push notifications use the normal default sound and do not activate order alarms.</Text>
          </View>

          <Text style={styles.sectionTitle}>Notification content</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Weekend special on KatBox" placeholderTextColor="#718477" maxLength={100} style={styles.input} />
            <Text style={styles.counter}>{title.length}/100</Text>
            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput value={message} onChangeText={setMessage} placeholder="Write your notification message..." placeholderTextColor="#718477" multiline maxLength={1000} textAlignVertical="top" style={[styles.input, styles.messageInput]} />
            <Text style={styles.counter}>{message.length}/1000</Text>
            <Text style={styles.fieldLabel}>Notification image (optional)</Text>
            <TouchableOpacity style={styles.imagePickerButton} onPress={chooseImage} disabled={imageUploading} activeOpacity={0.8}>
              {imageUploading ? <ActivityIndicator color={GREEN} /> : <Ionicons name="images-outline" size={19} color={GREEN} />}
              <Text style={styles.imagePickerText}>{imageUploading ? 'Uploading image...' : imageUrl ? 'Change gallery image' : 'Choose image from gallery'}</Text>
            </TouchableOpacity>
            {imageUrl ? <View style={styles.imageSelectedRow}><Text style={styles.imageSelectedText} numberOfLines={1}>{imageName || 'Image uploaded to Cloudinary'}</Text><TouchableOpacity onPress={() => { setImageUrl(''); setImageName(''); }}><Ionicons name="close-circle" size={20} color="#F87171" /></TouchableOpacity></View> : null}
            <Text style={styles.fieldLabel}>Open destination (optional)</Text>
            <TouchableOpacity style={styles.destinationButton} onPress={chooseDestination} activeOpacity={0.8}>
              <Text style={styles.destinationText}>{destinationLabel}</Text><Ionicons name="chevron-down" size={18} color={GREEN} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Choose audience</Text>
          <View style={styles.card}>
            {([
              ['customers', 'All customers', 'Send to customer accounts'],
              ['chefs', 'All chefs', 'Send to Chef accounts'],
              ['both', 'Customers and chefs', 'Send to both groups'],
              ['selected', 'Select individual users', 'Choose specific customers and chefs'],
            ] as [Audience, string, string][]).map(([value, label, detail]) => (
              <TouchableOpacity key={value} style={styles.audienceRow} onPress={() => setAudience(value)} activeOpacity={0.8}>
                <View style={[styles.radio, audience === value && styles.radioSelected]}>{audience === value ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.audienceText}><Text style={styles.audienceLabel}>{label}</Text><Text style={styles.audienceDetail}>{detail}</Text></View>
              </TouchableOpacity>
            ))}
            {audience === 'selected' ? (
              <View style={styles.recipientPicker}>
                <View style={styles.roleFilters}>
                  {(['all', 'customer', 'chef'] as const).map((role) => (
                    <TouchableOpacity key={role} onPress={() => setRecipientRole(role)} style={[styles.roleChip, recipientRole === role && styles.roleChipActive]}>
                      <Text style={[styles.roleChipText, recipientRole === role && styles.roleChipTextActive]}>{role === 'all' ? 'All' : role === 'customer' ? 'Customers' : 'Chefs'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={search} onChangeText={setSearch} placeholder="Search name, phone or email" placeholderTextColor="#718477" style={styles.searchInput} onSubmitEditing={loadRecipients} returnKeyType="search" />
                <TouchableOpacity style={styles.refreshButton} onPress={loadRecipients} disabled={recipientLoading}>
                  {recipientLoading ? <ActivityIndicator color={GREEN} size="small" /> : <Ionicons name="search" size={15} color={GREEN} />}
                  <Text style={styles.refreshText}>Search recipients</Text>
                </TouchableOpacity>
                <Text style={styles.selectedText}>{selectedCount} users selected</Text>
                {recipientLoading ? <ActivityIndicator color={GREEN} style={{ marginVertical: 18 }} /> : (
                  <FlatList
                    data={recipients}
                    keyExtractor={(item) => item.id}
                    renderItem={renderRecipient}
                    scrollEnabled={false}
                    ListEmptyComponent={<Text style={styles.emptyText}>No users found. Try another search.</Text>}
                  />
                )}
                {selectedCount > 0 ? <TouchableOpacity onPress={() => setSelectedIds([])}><Text style={styles.clearSelection}>Clear selection</Text></TouchableOpacity> : null}
              </View>
            ) : null}
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewHeading}><Ionicons name="eye-outline" size={18} color={GREEN} /><Text style={styles.previewTitle}>Preview before sending</Text></View>
            <Text style={styles.previewAudience}>Audience: {audienceLabel}</Text>
            <TouchableOpacity style={styles.previewButton} onPress={showPreview}>
              <Text style={styles.previewButtonText}>Preview notification</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} onPress={sendNotification} disabled={!canSend} activeOpacity={0.85}>
            {sending ? <ActivityIndicator color="#0B1710" /> : <><Ionicons name="send" size={17} color="#0B1710" /><Text style={styles.sendButtonText}>Send notification</Text></>}
          </TouchableOpacity>
          {result ? <Text style={styles.resultNote}>Last send: {result.recipients} recipients processed. No campaign history is stored.</Text> : null}
          <Text style={styles.footerNote}>Notifications appear in each recipient's in-app inbox and are retained for 90 days. Firebase acceptance does not guarantee device display.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  content: { padding: 18, paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  headerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(74,222,128,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(74,222,128,0.22)' },
  headerText: { flex: 1, marginLeft: 12 },
  heading: { color: '#F3FFF5', fontSize: 21, fontWeight: '800' },
  subheading: { color: MUTED, fontSize: 12, marginTop: 4 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.2)', borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 22 },
  infoText: { flex: 1, color: '#B8CDBD', fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: '#E7F5EA', fontSize: 15, fontWeight: '800', marginBottom: 10, marginTop: 2 },
  card: { backgroundColor: CARD, borderRadius: 17, borderWidth: 1, borderColor: BORDER, padding: 15, marginBottom: 20 },
  fieldLabel: { color: '#D9E8DD', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 5 },
  input: { backgroundColor: '#0F1B13', borderWidth: 1, borderColor: BORDER, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, color: '#F1FFF4', fontSize: 14, marginBottom: 5 },
  messageInput: { minHeight: 112, paddingTop: 12 },
  counter: { color: '#718477', textAlign: 'right', fontSize: 10, marginBottom: 10 },
  imagePickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 46, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: GREEN, backgroundColor: 'rgba(74,222,128,0.07)', marginBottom: 8 },
  imagePickerText: { color: GREEN, fontSize: 12, fontWeight: '700' },
  imageSelectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.22)', marginBottom: 10 },
  imageSelectedText: { flex: 1, color: '#C9D9CE', fontSize: 11 },
  destinationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: BORDER, backgroundColor: '#0F1B13' },
  destinationText: { color: '#EAF5ED', fontSize: 13, fontWeight: '600' },
  audienceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(42,59,47,0.7)' },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5, borderColor: '#6D8273', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  radioSelected: { borderColor: GREEN },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GREEN },
  audienceText: { flex: 1 },
  audienceLabel: { color: '#EAF5ED', fontSize: 13, fontWeight: '700' },
  audienceDetail: { color: MUTED, fontSize: 11, marginTop: 3 },
  recipientPicker: { marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: BORDER },
  roleFilters: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  roleChip: { borderRadius: 20, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 13, paddingVertical: 7 },
  roleChipActive: { backgroundColor: 'rgba(74,222,128,0.14)', borderColor: GREEN },
  roleChipText: { color: MUTED, fontSize: 11, fontWeight: '600' },
  roleChipTextActive: { color: GREEN },
  searchInput: { backgroundColor: '#0F1B13', borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, color: '#F1FFF4', fontSize: 13 },
  refreshButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  refreshText: { color: GREEN, fontSize: 12, fontWeight: '700' },
  selectedText: { color: '#C9D9CE', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  recipientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(42,59,47,0.55)' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#294232', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GREEN, fontWeight: '800' },
  recipientInfo: { flex: 1, marginLeft: 10, marginRight: 8 },
  recipientName: { color: '#EAF5ED', fontSize: 12, fontWeight: '700' },
  recipientMeta: { color: MUTED, fontSize: 10, marginTop: 3 },
  checkCircle: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.4, borderColor: '#64786A', alignItems: 'center', justifyContent: 'center' },
  checkCircleSelected: { backgroundColor: GREEN, borderColor: GREEN },
  emptyText: { color: MUTED, textAlign: 'center', paddingVertical: 18, fontSize: 12 },
  clearSelection: { color: '#FCA5A5', fontSize: 11, fontWeight: '700', textAlign: 'right', paddingTop: 9 },
  previewCard: { backgroundColor: '#14231A', borderWidth: 1, borderColor: '#2E4835', borderRadius: 15, padding: 14, marginBottom: 14 },
  previewHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewTitle: { color: '#E7F5EA', fontWeight: '800', fontSize: 13 },
  previewAudience: { color: MUTED, fontSize: 11, marginTop: 8 },
  previewButton: { alignSelf: 'flex-start', marginTop: 12, borderRadius: 9, borderWidth: 1, borderColor: GREEN, paddingHorizontal: 13, paddingVertical: 8 },
  previewButtonText: { color: GREEN, fontWeight: '700', fontSize: 11 },
  sendButton: { backgroundColor: GREEN, borderRadius: 13, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: '#0B1710', fontWeight: '900', fontSize: 14 },
  resultNote: { color: GREEN, fontSize: 11, marginTop: 12, textAlign: 'center' },
  footerNote: { color: '#74877A', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 14 },
});
