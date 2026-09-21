import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
  Alert,
  Switch,
  Modal,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Pressable,
  Image,
} from 'react-native';
import {
  Ionicons,
  Feather,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import api from '@/src/lib/api';
import { useRouter } from 'expo-router';
import { removeToken } from '@/src/lib/authStorage';
import { triggerAuthChange } from '@/src/lib/authEvents';
import { useClerk } from '@clerk/clerk-expo';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface UserOrderSummary {
  _id?: string;
  orderId: string;
  totalAmount: number;
  orderStatus: string;
  serviceType?: string;
  createdAt?: string;
}

interface UserItem {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  isChef: boolean;
  isAdmin: boolean;
  createdAt?: string;
  orderCount?: number;
  totalSpent?: number;
  orders?: UserOrderSummary[];
}

const SERVICE_LABEL: Record<string, string> = {
  catering: 'Catering',
  mealbox: 'MealBox',
  homemade: 'Homemade',
  quickbites: 'Quick Bites',
};

const formatOrderDate = (iso?: string) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const statusTone = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('delivered') || s.includes('completed') || s.includes('collected')) {
    return { bg: 'rgba(34, 197, 94, 0.14)', fg: '#4ADE80', label: 'Delivered' };
  }
  if (s.includes('cancel')) {
    return { bg: 'rgba(239, 68, 68, 0.16)', fg: '#F87171', label: status };
  }
  if (s.includes('prep') || s.includes('pack')) {
    return { bg: 'rgba(59, 130, 246, 0.16)', fg: '#60A5FA', label: status };
  }
  if (s.includes('out') || s.includes('delivery')) {
    return { bg: 'rgba(250, 204, 21, 0.16)', fg: '#FBBF24', label: status };
  }
  return { bg: 'rgba(148, 163, 184, 0.14)', fg: '#CBD5E1', label: status || 'Placed' };
};

export default function AllUsersScreen() {
  const router = useRouter();
  const { signOut } = useClerk();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // ─── Per-user action state ───
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  // ─── User detail modal (order history) ───
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // ─── Current admin's own id — used to lock their own switches ───
  const [myId, setMyId] = useState<string>('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Primary endpoint. Falls back through the legacy aliases if
      // the backend has not been redeployed yet.
      const res = await api
        .get('/auth/admin/users')
        .catch(() => api.get('/auth/users'))
        .catch(() => api.get('/api/admin/users'))
        .catch(() => api.get('/api/users'));

      const payload = res?.data || {};
      const list: any[] = Array.isArray(payload.users)
        ? payload.users
        : Array.isArray(payload)
        ? payload
        : [];

      setUsers(list);
    } catch (err) {
      console.log('Error fetching users:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Pull the caller's own id so we can lock their own switches
  useEffect(() => {
    const loadSelf = async () => {
      try {
        const res = await api.get('/auth/me');
        const id =
          res?.data?.user?.id ||
          res?.data?.user?._id ||
          '';
        if (id) setMyId(String(id));
      } catch (err) {
        // Silent — self-lock is best-effort
      }
    };
    loadSelf();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []);

  // ─── Toggle isChef / isAdmin ───
  const handleToggleChef = async (user: UserItem, nextValue: boolean) => {
    if (togglingUserId === user._id) return;

    // Optimistic update
    const previousValue = user.isChef;
    setTogglingUserId(user._id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setUsers((prev) =>
      prev.map((u) => (u._id === user._id ? { ...u, isChef: nextValue } : u))
    );

    try {
      const res = await api.patch(
        `/auth/admin/users/${user._id}/toggle-chef`,
        { isChef: nextValue }
      );

      if (res.data && res.data.success && res.data.user) {
        const serverValue = !!res.data.user.isChef;
        setUsers((prev) =>
          prev.map((u) =>
            u._id === user._id
              ? { ...u, isChef: serverValue, isAdmin: !!res.data.user.isAdmin }
              : u
          )
        );
      } else {
        throw new Error(res.data?.message || 'Toggle failed');
      }
    } catch (err: any) {
      console.log('Toggle chef error:', err?.response?.data || err?.message || err);

      // Roll back
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isChef: previousValue } : u))
      );

      Alert.alert(
        'Error',
        err?.response?.data?.message || 'Failed to update chef status'
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleToggleAdmin = async (user: UserItem, nextValue: boolean) => {
    if (togglingUserId === user._id) return;

    const previousValue = user.isAdmin;
    setTogglingUserId(user._id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setUsers((prev) =>
      prev.map((u) => (u._id === user._id ? { ...u, isAdmin: nextValue } : u))
    );

    try {
      const res = await api.patch(
        `/auth/admin/users/${user._id}/toggle-admin`,
        { isAdmin: nextValue }
      );

      if (res.data && res.data.success && res.data.user) {
        const serverValue = !!res.data.user.isAdmin;
        setUsers((prev) =>
          prev.map((u) =>
            u._id === user._id
              ? { ...u, isAdmin: serverValue, isChef: !!res.data.user.isChef }
              : u
          )
        );
      } else {
        throw new Error(res.data?.message || 'Toggle failed');
      }
    } catch (err: any) {
      console.log('Toggle admin error:', err?.response?.data || err?.message || err);

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isAdmin: previousValue } : u))
      );

      Alert.alert(
        'Error',
        err?.response?.data?.message || 'Failed to update admin status'
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // 1. Sign out from Clerk
              await signOut();

              // 2. Remove stored KatBox auth credentials
              await removeToken();

              // 3. Notify app auth state listeners
              triggerAuthChange();

              // 4. Reset navigation stack and navigate directly to Login screen
              router.replace('/login' as any);
            } catch (err) {
              console.error('Clerk/KatBox Logout error:', err);

              // Even if Clerk sign-out encounters an issue,
              // clear the local KatBox session
              try {
                await removeToken();
              } catch (storageError) {
                console.error(
                  'Failed to clear local auth storage:',
                  storageError
                );
              }

              try {
                triggerAuthChange();
              } catch (authError) {
                console.error(
                  'Failed to trigger auth state change:',
                  authError
                );
              }

              Alert.alert(
                'Logout',
                'Your local session has been cleared. Please sign in again.'
              );

              router.replace('/login' as any);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.phone && u.phone.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const renderUserCard = ({ item }: { item: UserItem }) => {
    const isSelf = Boolean(myId) && String(myId) === String(item._id);
    const isToggling = togglingUserId === item._id;
    const orderCount = Number(item.orderCount) || 0;
    const totalSpent = Number(item.totalSpent) || 0;

    return (
      <TouchableOpacity
        style={styles.userCard}
        activeOpacity={0.9}
        onPress={() => setSelectedUser(item)}
      >
        <View style={styles.userCardTopRow}>
          <View style={styles.userAvatarBox}>
            <Ionicons name="person" size={20} color="#4ADE80" />
          </View>

          <View style={styles.userInfoCol}>
            <View style={styles.userNameRow}>
              <Text style={styles.userNameText} numberOfLines={1}>
                {item.name || 'Unnamed User'}
              </Text>
              {item.isAdmin && (
                <View style={[styles.badgePill, { backgroundColor: '#DC2626' }]}>
                  <Text style={styles.badgeText}>Admin</Text>
                </View>
              )}
              {item.isChef && (
                <View
                  style={[styles.badgePill, { backgroundColor: '#D97706', marginLeft: 4 }]}
                >
                  <Text style={styles.badgeText}>Chef</Text>
                </View>
              )}
              {isSelf && (
                <View
                  style={[styles.badgePill, { backgroundColor: '#2563EB', marginLeft: 4 }]}
                >
                  <Text style={styles.badgeText}>You</Text>
                </View>
              )}
            </View>

            <Text style={styles.userPhoneText}>{item.phone || '—'}</Text>
            {item.email ? (
              <Text style={styles.userEmailText} numberOfLines={1}>
                {item.email}
              </Text>
            ) : null}
          </View>

          <View style={styles.orderCountChip}>
            <MaterialCommunityIcons name="receipt" size={11} color="#4ADE80" />
            <Text style={styles.orderCountChipText}>{orderCount}</Text>
          </View>
        </View>

        {/* ─── Orders summary strip ─── */}
        <View style={styles.ordersSummaryRow}>
          <View style={styles.ordersSummaryLeft}>
            <Feather name="shopping-bag" size={11} color="#94A3B8" />
            <Text style={styles.ordersSummaryText}>
              {orderCount === 0
                ? 'No orders yet'
                : `${orderCount} order${orderCount === 1 ? '' : 's'} • ₹${totalSpent}`}
            </Text>
          </View>
          {orderCount > 0 && (
            <View style={styles.latestOrderChip}>
              <Text style={styles.latestOrderChipText} numberOfLines={1}>
                Last: #{item.orders?.[0]?.orderId?.slice(-6) || '——'}
              </Text>
            </View>
          )}
        </View>

        {/* ─── Toggles ─── */}
        <View style={styles.togglesRow}>
          <View style={styles.toggleItem}>
            <View style={styles.toggleLabelWrap}>
              <MaterialCommunityIcons
                name="chef-hat"
                size={13}
                color={item.isChef ? '#FBBF24' : '#64748B'}
              />
              <Text
                style={[
                  styles.toggleLabel,
                  item.isChef && styles.toggleLabelActiveChef,
                ]}
              >
                {item.isChef ? 'Chef' : 'Not Chef'}
              </Text>
            </View>
            <Switch
              value={!!item.isChef}
              disabled={isToggling || !!isSelf}
              onValueChange={(val) => handleToggleChef(item, val)}
              trackColor={{
                false: 'rgba(100, 116, 139, 0.35)',
                true: 'rgba(217, 119, 6, 0.6)',
              }}
              thumbColor={item.isChef ? '#FBBF24' : '#94A3B8'}
              ios_backgroundColor="rgba(100, 116, 139, 0.25)"
              style={styles.compactSwitch}
            />
          </View>

          <View style={styles.toggleDivider} />

          <View style={styles.toggleItem}>
            <View style={styles.toggleLabelWrap}>
              <Ionicons
                name="shield-checkmark"
                size={13}
                color={item.isAdmin ? '#F87171' : '#64748B'}
              />
              <Text
                style={[
                  styles.toggleLabel,
                  item.isAdmin && styles.toggleLabelActiveAdmin,
                ]}
              >
                {item.isAdmin ? 'Admin' : 'Not Admin'}
              </Text>
            </View>
            <Switch
              value={!!item.isAdmin}
              disabled={isToggling || isSelf}
              onValueChange={(val) => handleToggleAdmin(item, val)}
              trackColor={{
                false: 'rgba(100, 116, 139, 0.35)',
                true: 'rgba(220, 38, 38, 0.6)',
              }}
              thumbColor={item.isAdmin ? '#F87171' : '#94A3B8'}
              ios_backgroundColor="rgba(100, 116, 139, 0.25)"
              style={styles.compactSwitch}
            />
          </View>
        </View>

        {/* ─── Tap hint ─── */}
        <View style={styles.tapHintRow}>
          <Text style={styles.tapHintText}>
            Tap to view {orderCount > 0 ? 'orders' : 'details'}
          </Text>
          <Feather name="chevron-right" size={14} color="#64748B" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111813" />

      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            Manage platform users & accounts
          </Text>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.8}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Feather
          name="search"
          size={16}
          color="#9CA3AF"
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone or email..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* User Count Bar */}
      <View style={styles.countBar}>
        <Text style={styles.countText}>
          Total Registered Users: {users.length}
        </Text>
        <TouchableOpacity onPress={fetchUsers} activeOpacity={0.7}>
          <Ionicons name="refresh" size={16} color="#4ADE80" />
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4ADE80" />
          <Text style={styles.loaderText}>Loading users...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchUsers();
          }}
          renderItem={renderUserCard}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="account-search-outline"
                size={48}
                color="#4B5563"
              />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}

      {/* ─── USER DETAIL / ORDER HISTORY MODAL ─── */}
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setSelectedUser(null)}
          />
          {selectedUser && (
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <View style={styles.modalAvatar}>
                    <Ionicons name="person" size={22} color="#4ADE80" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalUserName} numberOfLines={1}>
                      {selectedUser.name || 'Unnamed User'}
                    </Text>
                    <View style={styles.modalBadgesRow}>
                      {selectedUser.isAdmin && (
                        <View
                          style={[styles.badgePill, { backgroundColor: '#DC2626' }]}
                        >
                          <Text style={styles.badgeText}>Admin</Text>
                        </View>
                      )}
                      {selectedUser.isChef && (
                        <View
                          style={[
                            styles.badgePill,
                            { backgroundColor: '#D97706', marginLeft: 4 },
                          ]}
                        >
                          <Text style={styles.badgeText}>Chef</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedUser(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Contact meta */}
              <View style={styles.modalMetaGrid}>
                <View style={styles.modalMetaCell}>
                  <Feather name="phone" size={11} color="#4ADE80" />
                  <Text style={styles.modalMetaLabel}>Phone</Text>
                  <Text style={styles.modalMetaValue} numberOfLines={1}>
                    {selectedUser.phone || '—'}
                  </Text>
                </View>
                <View style={styles.modalMetaDivider} />
                <View style={styles.modalMetaCell}>
                  <Feather name="mail" size={11} color="#4ADE80" />
                  <Text style={styles.modalMetaLabel}>Email</Text>
                  <Text style={styles.modalMetaValue} numberOfLines={1}>
                    {selectedUser.email || '—'}
                  </Text>
                </View>
              </View>

              {/* Orders summary */}
              <View style={styles.modalOrdersSummary}>
                <View>
                  <Text style={styles.modalOrdersSummaryLabel}>TOTAL ORDERS</Text>
                  <Text style={styles.modalOrdersSummaryValue}>
                    {Number(selectedUser.orderCount) || 0}
                  </Text>
                </View>
                <View style={styles.modalOrdersSummarySep} />
                <View>
                  <Text style={styles.modalOrdersSummaryLabel}>LIFETIME SPEND</Text>
                  <Text style={[styles.modalOrdersSummaryValue, { color: '#4ADE80' }]}>
                    ₹{Number(selectedUser.totalSpent) || 0}
                  </Text>
                </View>
              </View>

              {/* Order list */}
              <Text style={styles.modalSectionTitle}>
                Order History
              </Text>

              <ScrollView
                style={styles.modalOrdersScroll}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {!selectedUser.orders || selectedUser.orders.length === 0 ? (
                  <View style={styles.modalEmptyOrders}>
                    <MaterialCommunityIcons
                      name="shopping-outline"
                      size={34}
                      color="#4B5563"
                    />
                    <Text style={styles.modalEmptyOrdersText}>
                      No orders placed yet
                    </Text>
                  </View>
                ) : (
                  selectedUser.orders.map((o, idx) => {
                    const tone = statusTone(o.orderStatus);
                    const svcLabel =
                      SERVICE_LABEL[String(o.serviceType || '').toLowerCase()] ||
                      (o.serviceType || '—');
                    return (
                      <View
                        key={o._id || `order-${idx}`}
                        style={styles.orderCard}
                      >
                        <View style={styles.orderCardTopRow}>
                          <View style={styles.orderIdBadge}>
                            <MaterialCommunityIcons
                              name="receipt"
                              size={11}
                              color="#4ADE80"
                            />
                            <Text style={styles.orderIdBadgeText} numberOfLines={1}>
                              #{o.orderId || '——'}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.orderStatusPill,
                              { backgroundColor: tone.bg },
                            ]}
                          >
                            <Text
                              style={[styles.orderStatusPillText, { color: tone.fg }]}
                              numberOfLines={1}
                            >
                              {tone.label}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.orderCardBottomRow}>
                          <View style={styles.orderMetaItem}>
                            <Feather name="tag" size={10} color="#94A3B8" />
                            <Text style={styles.orderMetaItemText} numberOfLines={1}>
                              {svcLabel}
                            </Text>
                          </View>
                          <View style={styles.orderMetaItem}>
                            <Feather name="calendar" size={10} color="#94A3B8" />
                            <Text style={styles.orderMetaItemText} numberOfLines={1}>
                              {formatOrderDate(o.createdAt) || '—'}
                            </Text>
                          </View>
                          <Text style={styles.orderAmountText}>
                            ₹{Number(o.totalAmount) || 0}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalDoneBtn}
                activeOpacity={0.9}
                onPress={() => setSelectedUser(null)}
              >
                <Text style={styles.modalDoneBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111813',
    paddingTop:
      Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 0) + 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A241D',
    borderWidth: 1,
    borderColor: '#26342A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A241D',
    marginHorizontal: 16,
    borderRadius: 14,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#26342A',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '500',
  },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  countText: {
    fontSize: 11.5,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },

  /* ─── USER CARD ─── */
  userCard: {
    backgroundColor: '#1A241D',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#26342A',
    marginBottom: 12,
  },
  userCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatarBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userInfoCol: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F9FAFB',
    flexShrink: 1,
    marginRight: 6,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  userPhoneText: {
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 2,
    fontWeight: '600',
  },
  userEmailText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },

  orderCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
  },
  orderCountChipText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '900',
  },

  /* ─── ORDERS SUMMARY STRIP ─── */
  ordersSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  ordersSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  ordersSummaryText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '700',
  },
  latestOrderChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  latestOrderChipText: {
    fontSize: 10,
    color: '#CBD5E1',
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  /* ─── TOGGLES ROW ─── */
  togglesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  toggleLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  toggleLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  toggleLabelActiveChef: {
    color: '#FBBF24',
  },
  toggleLabelActiveAdmin: {
    color: '#F87171',
  },
  toggleDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 10,
  },
  compactSwitch: {
    transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }],
    marginVertical: -4,
  },

  /* ─── TAP HINT ─── */
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 8,
  },
  tapHintText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  /* ─── LOADER / EMPTY ─── */
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  loaderText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 10,
  },

  /* ─── MODAL ─── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0F1A13',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.12)',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modalUserName: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.2,
  },
  modalBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },

  modalMetaGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 12,
  },
  modalMetaCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  modalMetaDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  modalMetaValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#F9FAFB',
    paddingHorizontal: 4,
  },

  modalOrdersSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.15)',
    marginBottom: 14,
  },
  modalOrdersSummaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  modalOrdersSummaryValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.4,
  },
  modalOrdersSummarySep: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    marginHorizontal: 20,
  },

  modalSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  modalOrdersScroll: {
    maxHeight: 380,
  },
  modalEmptyOrders: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  modalEmptyOrdersText: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '600',
  },

  /* ─── ORDER CARD ─── */
  orderCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  orderCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    flexShrink: 1,
  },
  orderIdBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 0.2,
  },
  orderStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  orderStatusPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  orderCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  orderMetaItemText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginRight: 8,
  },
  orderAmountText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.2,
  },

  modalDoneBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#4ADE80',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  modalDoneBtnText: {
    color: '#0F1A13',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});