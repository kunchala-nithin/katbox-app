import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl,  StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '@/src/lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';

type NotificationItem = {
  _id: string;
  title: string;
  message: string;
  imageUrl?: string;
  deepLink?: string;
  isRead: boolean;
  createdAt: string;
};

const GREEN = '#4ADE80';
const BG = '#0F1A13';

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const response = await api.get('/api/admin-notifications/inbox', { params: { page: 1, limit: 50 } });
      setItems(Array.isArray(response.data?.data) ? response.data.data : []);
      setUnreadCount(Number(response.data?.unreadCount || 0));
    } catch (error: any) {
      Alert.alert('Notifications unavailable', error?.response?.data?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const markRead = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await api.patch(`/api/admin-notifications/inbox/${item._id}/read`);
        setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, isRead: true } : entry));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        Alert.alert('Update failed', 'Unable to mark this notification as read.');
        return;
      }
    }
    if (item.deepLink) {
      try { router.push(item.deepLink as any); } catch { /* Keep the inbox open for unsupported routes. */ }
    }
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    try {
      await api.patch('/api/admin-notifications/inbox/read-all');
      setItems((current) => current.map((entry) => ({ ...entry, isRead: true })));
      setUnreadCount(0);
    } catch {
      Alert.alert('Update failed', 'Unable to mark notifications as read.');
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity style={[styles.card, !item.isRead && styles.unreadCard]} onPress={() => markRead(item)} activeOpacity={0.82}>
      <View style={styles.row}>
        <View style={styles.icon}><Ionicons name="notifications" size={18} color={GREEN} /></View>
        <View style={styles.texts}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
        </View>
        {!item.isRead ? <View style={styles.unreadDot} /> : null}
      </View>
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" /> : null}
      <Text style={styles.message}>{item.message}</Text>
      {item.deepLink ? <Text style={styles.linkHint}>Tap to open <Ionicons name="arrow-forward" size={11} color={GREEN} /></Text> : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.heading}>Notifications</Text><Text style={styles.subheading}>{unreadCount} unread</Text></View>
        <TouchableOpacity onPress={markAllRead} disabled={!unreadCount}><Text style={[styles.markAll, !unreadCount && styles.disabled]}>Mark all read</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GREEN} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="notifications-off-outline" size={34} color="#6E8273" /><Text style={styles.emptyTitle}>You're all caught up</Text><Text style={styles.emptyText}>New KatBox announcements will appear here.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#26372B', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: '#F2FFF5', fontSize: 22, fontWeight: '900' },
  subheading: { color: '#9AAE9F', fontSize: 12, marginTop: 4 },
  markAll: { color: GREEN, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  list: { padding: 15, paddingBottom: 35, flexGrow: 1 },
  card: { backgroundColor: '#17251B', borderRadius: 15, borderWidth: 1, borderColor: '#2A3B2F', padding: 14, marginBottom: 12 },
  unreadCard: { borderColor: 'rgba(74,222,128,0.65)', backgroundColor: '#192B20' },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(74,222,128,0.12)', alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, marginLeft: 10 },
  title: { color: '#F0FFF3', fontSize: 14, fontWeight: '800' },
  date: { color: '#829687', fontSize: 10, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN, marginLeft: 8 },
  image: { width: '100%', height: 150, borderRadius: 11, marginTop: 12, backgroundColor: '#24372A' },
  message: { color: '#C5D5C9', fontSize: 13, lineHeight: 19, marginTop: 12 },
  linkHint: { color: GREEN, fontSize: 11, fontWeight: '700', marginTop: 10 },
  empty: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#EAF5ED', fontWeight: '800', fontSize: 15, marginTop: 12 },
  emptyText: { color: '#8FA394', fontSize: 12, marginTop: 5 },
});
