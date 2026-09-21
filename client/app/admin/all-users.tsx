import React, { useEffect, useState, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import {
  Ionicons,
  Feather,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '@/src/lib/api';
import { useRouter } from 'expo-router';
import { removeToken } from '@/src/lib/authStorage';
import { triggerAuthChange } from '@/src/lib/authEvents';
import { useClerk } from '@clerk/clerk-expo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type UserFilterTab = 'All' | 'Chefs' | 'Admins' | 'Customers';

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
  // Orders received as a chef (populated from Chef.orderHistory)
  receivedOrderCount?: number;
  totalEarned?: number;
  receivedOrders?: UserOrderSummary[];
  chefId?: string | null;
}

const SERVICE_LABEL: Record<string, string> = {
  catering: 'Catering',
  mealbox: 'MealBox',
  homemade: 'Homemade',
  quickbites: 'Quick Bites',
};

const SERVICE_ICON: Record<string, any> = {
  catering: 'silverware-fork-knife',
  mealbox: 'food-takeout-box-outline',
  homemade: 'home-outline',
  quickbites: 'flash-outline',
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

const getInitials = (name: string) => {
  const clean = (name || '').trim();
  if (!clean) return 'U';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const [filterTab, setFilterTab] = useState<UserFilterTab>('All');

  // ─── Per-user action state ───
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  // ─── User detail modal (order history) ───
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // ─── Current admin's own id — used to lock their own switches ───
  const [myId, setMyId] = useState<string>('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
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

  useEffect(() => {
    const loadSelf = async () => {
      try {
        const res = await api.get('/auth/me');
        const id = res?.data?.user?.id || res?.data?.user?._id || '';
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

  // ─── Aggregate stats for the header strip ───
  const stats = useMemo(() => {
    const total = users.length;
    const chefs = users.filter((u) => u.isChef).length;
    const admins = users.filter((u) => u.isAdmin).length;
    const customers = users.filter((u) => !u.isChef && !u.isAdmin).length;
    const totalOrders = users.reduce(
      (sum, u) => sum + (Number(u.orderCount) || 0),
      0
    );
    const totalRevenue = users.reduce(
      (sum, u) => sum + (Number(u.totalSpent) || 0),
      0
    );
    return { total, chefs, admins, customers, totalOrders, totalRevenue };
  }, [users]);

  // ─── Toggle isChef / isAdmin ───
  const handleToggleChef = async (user: UserItem, nextValue: boolean) => {
    if (togglingUserId === user._id) return;

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
        // Refresh so freshly populated receivedOrders appear
        fetchUsers();
      } else {
        throw new Error(res.data?.message || 'Toggle failed');
      }
    } catch (err: any) {
      console.log('Toggle chef error:', err?.response?.data || err?.message || err);

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
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await signOut();
              await removeToken();
              triggerAuthChange();
              router.replace('/login' as any);
            } catch (err) {
              console.error('Clerk/KatBox Logout error:', err);

              try {
                await removeToken();
              } catch (storageError) {
                console.error('Failed to clear local auth storage:', storageError);
              }

              try {
                triggerAuthChange();
              } catch (authError) {
                console.error('Failed to trigger auth state change:', authError);
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

  // ─── Filtered list ───
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter((u) => {
      if (filterTab === 'Chefs' && !u.isChef) return false;
      if (filterTab === 'Admins' && !u.isAdmin) return false;
      if (filterTab === 'Customers' && (u.isChef || u.isAdmin)) return false;

      if (!q) return true;
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))
      );
    });
  }, [users, filterTab, searchQuery]);

  /* ─────────────────────────────────────────────────────────
     ✅ For chefs: always show received orders.
     ✅ For non-chefs: always show placed orders.
     ───────────────────────────────────────────────────────── */
  const ordersToDisplay: UserOrderSummary[] = useMemo(() => {
    if (!selectedUser) return [];
    if (selectedUser.isChef) {
      return selectedUser.receivedOrders || [];
    }
    return selectedUser.orders || [];
  }, [selectedUser]);

  const openUserModal = (user: UserItem) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedUser(user);
  };

  const closeUserModal = () => {
    setSelectedUser(null);
  };

  const renderUserCard = ({ item }: { item: UserItem }) => {
    const isSelf = Boolean(myId && String(myId) === String(item._id));
    const isToggling = togglingUserId === item._id;
    const orderCount = Number(item.orderCount) || 0;
    const receivedOrderCount = Number(item.receivedOrderCount) || 0;
    const totalSpent = Number(item.totalSpent) || 0;
    const totalEarned = Number(item.totalEarned) || 0;
    const initials = getInitials(item.name);

    return (
      <TouchableOpacity
        style={styles.userCard}
        activeOpacity={0.9}
        onPress={() => openUserModal(item)}
      >
        {/* ─── TOP ROW: Avatar + Identity + Order Chip ─── */}
        <View style={styles.userCardTopRow}>
          <LinearGradient
            colors={
              item.isAdmin
                ? ['#DC2626', '#991B1B']
                : item.isChef
                ? ['#D97706', '#B45309']
                : ['#4ADE80', '#16A34A']
            }
            style={styles.userAvatarGradient}
          >
            <Text style={styles.userAvatarInitials}>{initials}</Text>
          </LinearGradient>

          <View style={styles.userInfoCol}>
            <View style={styles.userNameRow}>
              <Text style={styles.userNameText} numberOfLines={1}>
                {item.name || 'Unnamed User'}
              </Text>
              {isSelf && (
                <View style={styles.selfBadge}>
                  <Text style={styles.selfBadgeText}>You</Text>
                </View>
              )}
            </View>

            <View style={styles.userMetaRow}>
              <Feather name="phone" size={10} color="#64748B" />
              <Text style={styles.userMetaText} numberOfLines={1}>
                {item.phone || '—'}
              </Text>
            </View>

            {item.email ? (
              <View style={styles.userMetaRow}>
                <Feather name="mail" size={10} color="#64748B" />
                <Text style={styles.userMetaText} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.orderCountChip}>
            <MaterialCommunityIcons
              name={item.isChef ? 'chef-hat' : 'receipt'}
              size={12}
              color={item.isChef ? '#FBBF24' : '#4ADE80'}
            />
            <Text
              style={[
                styles.orderCountChipText,
                item.isChef && { color: '#FBBF24' },
              ]}
            >
              {item.isChef ? receivedOrderCount : orderCount}
            </Text>
          </View>
        </View>

        {/* ─── BADGES ROW ─── */}
        {(item.isChef || item.isAdmin) && (
          <View style={styles.badgesRow}>
            {item.isChef && (
              <View style={styles.roleBadgeChef}>
                <MaterialCommunityIcons name="chef-hat" size={11} color="#FBBF24" />
                <Text style={styles.roleBadgeChefText}>Chef</Text>
              </View>
            )}
            {item.isAdmin && (
              <View style={styles.roleBadgeAdmin}>
                <Ionicons name="shield-checkmark" size={10} color="#F87171" />
                <Text style={styles.roleBadgeAdminText}>Admin</Text>
              </View>
            )}
          </View>
        )}

        {/* ─── SUMMARY ROW (chef = received, non-chef = placed) ─── */}
        {item.isChef ? (
          <View style={styles.ordersSummaryRow}>
            <View style={styles.ordersSummaryLeft}>
              <MaterialCommunityIcons name="chef-hat" size={11} color="#FBBF24" />
              <Text style={styles.receivedSummaryText}>
                {receivedOrderCount === 0
                  ? 'No orders received yet'
                  : `${receivedOrderCount} order${receivedOrderCount === 1 ? '' : 's'} received`}
              </Text>
            </View>
            {receivedOrderCount > 0 && (
              <View style={styles.earnedChip}>
                <Text style={styles.earnedChipText}>
                  ₹{totalEarned.toLocaleString('en-IN')}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.ordersSummaryRow}>
            <View style={styles.ordersSummaryLeft}>
              <Feather name="shopping-bag" size={11} color="#94A3B8" />
              <Text style={styles.ordersSummaryText}>
                {orderCount === 0
                  ? 'No orders placed yet'
                  : `${orderCount} order${orderCount === 1 ? '' : 's'} placed`}
              </Text>
            </View>
            {orderCount > 0 && (
              <View style={styles.spendChip}>
                <Text style={styles.spendChipText}>
                  ₹{totalSpent.toLocaleString('en-IN')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ─── TOGGLES ROW ─── */}
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
              disabled={isToggling || isSelf}
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

        {/* ─── TAP HINT ─── */}
        <View style={styles.tapHintRow}>
          <Text style={styles.tapHintText}>
            {item.isChef
              ? receivedOrderCount > 0
                ? 'View received orders'
                : 'View details'
              : orderCount > 0
              ? 'View placed orders'
              : 'View details'}
          </Text>
          <Feather name="chevron-right" size={13} color="#64748B" />
        </View>
      </TouchableOpacity>
    );
  };

  const FILTER_TABS: { key: UserFilterTab; label: string; count: number }[] = [
    { key: 'All', label: 'All', count: stats.total },
    { key: 'Customers', label: 'Customers', count: stats.customers },
    { key: 'Chefs', label: 'Chefs', count: stats.chefs },
    { key: 'Admins', label: 'Admins', count: stats.admins },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1A13" />

      {/* ─── HEADER ─── */}
      <LinearGradient
        colors={['#0F1A13', '#132117', '#0F1A13']}
        style={styles.headerGradient}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrowText}>ADMIN · USER MANAGEMENT</Text>
            </View>
            <Text style={styles.headerTitle}>All Users</Text>
            <Text style={styles.headerSubtitle}>
              Manage roles, orders & access in one place
            </Text>
          </View>

          <TouchableOpacity
            style={styles.logoutBtn}
            activeOpacity={0.8}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={19} color="#F87171" />
          </TouchableOpacity>
        </View>

        {/* ─── STATS STRIP ─── */}
        <View style={styles.statsBanner}>
          <View style={styles.statsBannerItem}>
            <Text style={styles.statsBannerValue}>{stats.total}</Text>
            <Text style={styles.statsBannerLabel}>Total</Text>
          </View>
          <View style={styles.statsBannerDivider} />
          <View style={styles.statsBannerItem}>
            <Text style={[styles.statsBannerValue, { color: '#4ADE80' }]}>
              {stats.customers}
            </Text>
            <Text style={styles.statsBannerLabel}>Customers</Text>
          </View>
          <View style={styles.statsBannerDivider} />
          <View style={styles.statsBannerItem}>
            <Text style={[styles.statsBannerValue, { color: '#FBBF24' }]}>
              {stats.chefs}
            </Text>
            <Text style={styles.statsBannerLabel}>Chefs</Text>
          </View>
          <View style={styles.statsBannerDivider} />
          <View style={styles.statsBannerItem}>
            <Text style={[styles.statsBannerValue, { color: '#F87171' }]}>
              {stats.admins}
            </Text>
            <Text style={styles.statsBannerLabel}>Admins</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ─── SEARCH + REFRESH ─── */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={15} color="#4ADE80" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone or email..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={15} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          activeOpacity={0.8}
          onPress={fetchUsers}
        >
          <Ionicons name="refresh" size={16} color="#4ADE80" />
        </TouchableOpacity>
      </View>

      {/* ─── FILTER TABS ─── */}
      <View style={styles.filterTabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsScroll}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = filterTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTabPill,
                  isActive && styles.filterTabPillActive,
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut
                  );
                  setFilterTab(tab.key);
                }}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isActive && styles.filterTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.filterTabBadge,
                    isActive && styles.filterTabBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTabBadgeText,
                      isActive && styles.filterTabBadgeTextActive,
                    ]}
                  >
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── LIST ─── */}
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
              <View style={styles.emptyIconCircle}>
                <MaterialCommunityIcons
                  name="account-search-outline"
                  size={40}
                  color="#4ADE80"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery.trim() || filterTab !== 'All'
                  ? 'No matching users'
                  : 'No users yet'}
              </Text>
              <Text style={styles.emptyText}>
                {searchQuery.trim() || filterTab !== 'All'
                  ? 'Try adjusting your search or filter.'
                  : 'New signups will appear here automatically.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ─── USER DETAIL / ORDER HISTORY MODAL ─── */}
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="fade"
        onRequestClose={closeUserModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeUserModal}
          />
          {selectedUser && (
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              {/* ─── MODAL HEADER ─── */}
              <View style={styles.modalHeader}>
                <LinearGradient
                  colors={
                    selectedUser.isAdmin
                      ? ['#DC2626', '#991B1B']
                      : selectedUser.isChef
                      ? ['#D97706', '#B45309']
                      : ['#4ADE80', '#16A34A']
                  }
                  style={styles.modalAvatarGradient}
                >
                  <Text style={styles.modalAvatarInitials}>
                    {getInitials(selectedUser.name)}
                  </Text>
                </LinearGradient>

                <View style={{ flex: 1 }}>
                  <Text style={styles.modalUserName} numberOfLines={1}>
                    {selectedUser.name || 'Unnamed User'}
                  </Text>
                  <View style={styles.modalBadgesRow}>
                    {selectedUser.isChef && (
                      <View style={styles.roleBadgeChef}>
                        <MaterialCommunityIcons
                          name="chef-hat"
                          size={10}
                          color="#FBBF24"
                        />
                        <Text style={styles.roleBadgeChefText}>Chef</Text>
                      </View>
                    )}
                    {selectedUser.isAdmin && (
                      <View
                        style={[styles.roleBadgeAdmin, { marginLeft: 6 }]}
                      >
                        <Ionicons
                          name="shield-checkmark"
                          size={10}
                          color="#F87171"
                        />
                        <Text style={styles.roleBadgeAdminText}>Admin</Text>
                      </View>
                    )}
                    {!selectedUser.isChef && !selectedUser.isAdmin && (
                      <View style={styles.roleBadgeCustomer}>
                        <Ionicons name="person-outline" size={10} color="#4ADE80" />
                        <Text style={styles.roleBadgeCustomerText}>Customer</Text>
                      </View>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={closeUserModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* ─── CONTACT META ─── */}
              <View style={styles.modalMetaGrid}>
                <View style={styles.modalMetaCell}>
                  <View style={styles.modalMetaIconCircle}>
                    <Feather name="phone" size={11} color="#4ADE80" />
                  </View>
                  <Text style={styles.modalMetaLabel}>Phone</Text>
                  <Text style={styles.modalMetaValue} numberOfLines={1}>
                    {selectedUser.phone || '—'}
                  </Text>
                </View>
                <View style={styles.modalMetaDivider} />
                <View style={styles.modalMetaCell}>
                  <View style={styles.modalMetaIconCircle}>
                    <Feather name="mail" size={11} color="#4ADE80" />
                  </View>
                  <Text style={styles.modalMetaLabel}>Email</Text>
                  <Text style={styles.modalMetaValue} numberOfLines={1}>
                    {selectedUser.email || '—'}
                  </Text>
                </View>
              </View>

              {/* ─── SUMMARY ─── */}
              {selectedUser.isChef ? (
                <View style={styles.modalOrdersSummary}>
                  <View style={styles.modalOrdersSummaryCell}>
                    <Text style={styles.modalOrdersSummaryLabel}>RECEIVED</Text>
                    <Text
                      style={[
                        styles.modalOrdersSummaryValue,
                        { color: '#FBBF24' },
                      ]}
                    >
                      {Number(selectedUser.receivedOrderCount) || 0}
                    </Text>
                  </View>
                  <View style={styles.modalOrdersSummarySep} />
                  <View style={styles.modalOrdersSummaryCell}>
                    <Text style={styles.modalOrdersSummaryLabel}>EARNED</Text>
                    <Text
                      style={[
                        styles.modalOrdersSummaryValue,
                        { color: '#4ADE80' },
                      ]}
                    >
                      ₹{(Number(selectedUser.totalEarned) || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.modalOrdersSummary}>
                  <View style={styles.modalOrdersSummaryCell}>
                    <Text style={styles.modalOrdersSummaryLabel}>TOTAL ORDERS</Text>
                    <Text style={styles.modalOrdersSummaryValue}>
                      {Number(selectedUser.orderCount) || 0}
                    </Text>
                  </View>
                  <View style={styles.modalOrdersSummarySep} />
                  <View style={styles.modalOrdersSummaryCell}>
                    <Text style={styles.modalOrdersSummaryLabel}>LIFETIME SPEND</Text>
                    <Text
                      style={[
                        styles.modalOrdersSummaryValue,
                        { color: '#4ADE80' },
                      ]}
                    >
                      ₹{(Number(selectedUser.totalSpent) || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              )}

              {/* ─── ORDER LIST HEADER ─── */}
              <View style={styles.modalSectionHeader}>
                <Text style={styles.modalSectionTitle}>
                  {selectedUser.isChef ? 'Orders Received' : 'Orders Placed'}
                </Text>
                {ordersToDisplay.length > 0 && (
                  <View style={styles.modalSectionCountPill}>
                    <Text style={styles.modalSectionCountPillText}>
                      {ordersToDisplay.length}
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                style={styles.modalOrdersScroll}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {ordersToDisplay.length === 0 ? (
                  <View style={styles.modalEmptyOrders}>
                    <View style={styles.modalEmptyOrdersIconCircle}>
                      <MaterialCommunityIcons
                        name={selectedUser.isChef ? 'chef-hat' : 'shopping-outline'}
                        size={30}
                        color="#4ADE80"
                      />
                    </View>
                    <Text style={styles.modalEmptyOrdersTitle}>
                      {selectedUser.isChef
                        ? 'No orders received yet'
                        : 'No orders placed yet'}
                    </Text>
                    <Text style={styles.modalEmptyOrdersText}>
                      {selectedUser.isChef
                        ? 'Orders placed to this chef will appear here.'
                        : 'Once this user places an order, it will appear here.'}
                    </Text>
                  </View>
                ) : (
                  ordersToDisplay.map((o, idx) => {
                    const tone = statusTone(o.orderStatus);
                    const svcKey = String(o.serviceType || '').toLowerCase();
                    const svcLabel = SERVICE_LABEL[svcKey] || o.serviceType || '—';
                    const svcIcon = SERVICE_ICON[svcKey] || 'silverware-fork-knife';
                    return (
                      <View key={o._id || `order-${idx}`} style={styles.orderCard}>
                        <View style={styles.orderCardTopRow}>
                          <View style={styles.orderIdBadge}>
                            <MaterialCommunityIcons
                              name="receipt"
                              size={11}
                              color="#4ADE80"
                            />
                            <Text
                              style={styles.orderIdBadgeText}
                              numberOfLines={1}
                            >
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
                              style={[
                                styles.orderStatusPillText,
                                { color: tone.fg },
                              ]}
                              numberOfLines={1}
                            >
                              {tone.label}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.orderCardMiddleRow}>
                          <View style={styles.orderServiceChip}>
                            <MaterialCommunityIcons
                              name={svcIcon}
                              size={11}
                              color="#94A3B8"
                            />
                            <Text style={styles.orderServiceChipText}>
                              {svcLabel}
                            </Text>
                          </View>

                          <View style={styles.orderDateRow}>
                            <Feather name="calendar" size={10} color="#64748B" />
                            <Text style={styles.orderDateText}>
                              {formatOrderDate(o.createdAt) || '—'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.orderCardBottomRow}>
                          <Text style={styles.orderAmountLabel}>
                            {selectedUser.isChef ? 'Order Value' : 'Total Amount'}
                          </Text>
                          <Text style={styles.orderAmountText}>
                            ₹{(Number(o.totalAmount) || 0).toLocaleString('en-IN')}
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
                onPress={closeUserModal}
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
    backgroundColor: '#0F1A13',
  },

  /* ─── HEADER ─── */
  headerGradient: {
    paddingTop:
      Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 0) + 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    marginRight: 6,
  },
  eyebrowText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  /* ─── STATS BANNER ─── */
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
  },
  statsBannerItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsBannerValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.3,
  },
  statsBannerLabel: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  statsBannerDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  /* ─── SEARCH + REFRESH ─── */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A241D',
    borderRadius: 12,
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#26342A',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 12.5,
    fontWeight: '500',
    paddingVertical: 0,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1A241D',
    borderWidth: 1,
    borderColor: '#26342A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ─── FILTER TABS ─── */
  filterTabsWrapper: {
    height: 46,
    justifyContent: 'center',
  },
  filterTabsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 7,
  },
  filterTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: '#1A241D',
    borderWidth: 1,
    borderColor: '#26342A',
    height: 32,
  },
  filterTabPillActive: {
    backgroundColor: '#4ADE80',
    borderColor: '#4ADE80',
  },
  filterTabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94A3B8',
    lineHeight: 14,
  },
  filterTabTextActive: {
    color: '#0F1A13',
    fontWeight: '800',
  },
  filterTabBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 5,
    borderRadius: 6,
    minWidth: 18,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabBadgeActive: {
    backgroundColor: 'rgba(15, 26, 19, 0.2)',
  },
  filterTabBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#CBD5E1',
    lineHeight: 11,
  },
  filterTabBadgeTextActive: {
    color: '#0F1A13',
  },

  /* ─── LIST ─── */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  userCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatarGradient: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarInitials: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F1A13',
    letterSpacing: 0.5,
  },
  userInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F9FAFB',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  selfBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    marginLeft: 6,
  },
  selfBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  userMetaText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    flexShrink: 1,
  },

  orderCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
  },
  orderCountChipText: {
    color: '#4ADE80',
    fontSize: 11.5,
    fontWeight: '900',
  },

  /* ─── BADGES ─── */
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  roleBadgeChef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(217, 119, 6, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  roleBadgeChefText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FBBF24',
    letterSpacing: 0.3,
  },
  roleBadgeAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(220, 38, 38, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  roleBadgeAdminText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#F87171',
    letterSpacing: 0.3,
  },
  roleBadgeCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(74, 222, 128, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  roleBadgeCustomerText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 0.3,
  },

  /* ─── SUMMARY ROW ─── */
  ordersSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  ordersSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  ordersSummaryText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '700',
  },
  receivedSummaryText: {
    fontSize: 11.5,
    color: '#FBBF24',
    fontWeight: '700',
  },
  spendChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  spendChipText: {
    fontSize: 11.5,
    color: '#4ADE80',
    fontWeight: '900',
    letterSpacing: -0.1,
  },
  earnedChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.28)',
  },
  earnedChipText: {
    fontSize: 11.5,
    color: '#FBBF24',
    fontWeight: '900',
    letterSpacing: -0.1,
  },

  /* ─── TOGGLES ─── */
  togglesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
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
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    color: '#F9FAFB',
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 5,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },

  /* ─── MODAL ─── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0F1A13',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.15)',
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
    marginBottom: 16,
  },
  modalAvatarGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modalAvatarInitials: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F1A13',
    letterSpacing: 0.5,
  },
  modalUserName: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.2,
  },
  modalBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
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
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 14,
  },
  modalMetaCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  modalMetaIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalMetaDivider: {
    width: 1,
    height: 42,
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
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.15)',
    marginBottom: 16,
  },
  modalOrdersSummaryCell: {
    flex: 1,
    alignItems: 'center',
  },
  modalOrdersSummaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  modalOrdersSummaryValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.5,
  },
  modalOrdersSummarySep: {
    width: 1,
    height: 38,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    marginHorizontal: 10,
  },

  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalSectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  modalSectionCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
  },
  modalSectionCountPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#4ADE80',
  },

  modalOrdersScroll: {
    maxHeight: 380,
  },
  modalEmptyOrders: {
    alignItems: 'center',
    paddingVertical: 34,
    gap: 8,
  },
  modalEmptyOrdersIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  modalEmptyOrdersTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
  },
  modalEmptyOrdersText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
  },

  /* ─── ORDER CARD ─── */
  orderCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  orderCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  orderIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
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
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    marginLeft: 6,
  },
  orderStatusPillText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  orderCardMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  orderServiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  orderServiceChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  orderDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  orderCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  orderAmountLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  orderAmountText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: -0.3,
  },

  modalDoneBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#4ADE80',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  modalDoneBtnText: {
    color: '#0F1A13',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});