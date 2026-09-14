import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '@/src/lib/api';
import { useRouter } from 'expo-router';
import { removeToken } from '@/src/lib/authStorage';
import { triggerAuthChange } from '@/src/lib/authEvents';
import { useClerk } from '@clerk/clerk-expo';

interface UserItem {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  isChef: boolean;
  isAdmin: boolean;
  createdAt?: string;
}

export default function AllUsersScreen() {
  const router = useRouter();
  const { signOut } = useClerk();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api
        .get('/api/admin/users')
        .catch(() =>
          api.get('/auth/users').catch(() => api.get('/api/users'))
        );

      if (res.data && Array.isArray(res.data.users || res.data)) {
        setUsers(res.data.users || res.data);
      } else if (Array.isArray(res.data)) {
        setUsers(res.data);
      }
    } catch (err) {
      console.log('Error fetching users:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <View style={styles.userAvatarBox}>
                <Ionicons name="person" size={20} color="#4ADE80" />
              </View>

              <View style={styles.userInfoCol}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userNameText} numberOfLines={1}>
                    {item.name || 'Unnamed User'}
                  </Text>
                  {item.isAdmin && (
                    <View
                      style={[
                        styles.badgePill,
                        { backgroundColor: '#DC2626' },
                      ]}
                    >
                      <Text style={styles.badgeText}>Admin</Text>
                    </View>
                  )}
                  {item.isChef && (
                    <View
                      style={[
                        styles.badgePill,
                        {
                          backgroundColor: '#D97706',
                          marginLeft: 4,
                        },
                      ]}
                    >
                      <Text style={styles.badgeText}>Chef</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.userPhoneText}>{item.phone}</Text>
                {item.email ? (
                  <Text style={styles.userEmailText}>{item.email}</Text>
                ) : null}
              </View>
            </View>
          )}
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A241D',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#26342A',
    marginBottom: 10,
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
});