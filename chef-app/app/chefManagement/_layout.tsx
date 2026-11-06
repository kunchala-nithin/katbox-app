import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, useRef } from 'react'
import { AppState } from 'react-native'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Platform,
  Animated,
} from 'react-native'
import { getUser, getToken, verifyUserFromBackend } from '@/src/lib/authStorage'
import { isTokenExpired } from '@/src/lib/jwtUtils'
import { subscribeAuth } from '@/src/lib/authEvents'
import { useOrderNotifier } from '@/src/hooks/useOrderNotifier'

const CHEF_TAB_CONFIG: Record<
  string,
  {
    label: string
    icon: keyof typeof Ionicons.glyphMap
    activeIcon: keyof typeof Ionicons.glyphMap
  }
> = {
  'add-chefs': {
    label: 'Chef',
    icon: 'restaurant-outline',
    activeIcon: 'restaurant',
  },
  'add-chefCategory': {
    label: 'Category',
    icon: 'grid-outline',
    activeIcon: 'grid',
  },
  'all-orders': {
    label: 'Orders',
    icon: 'receipt-outline',
    activeIcon: 'receipt',
  },
  profile: {
    label: 'Profile',
    icon: 'person-outline',
    activeIcon: 'person',
  },
}

export default function ChefTabsLayout() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [isChef, setIsChef] = useState<boolean | null>(null) // ⭐ Start as null to prevent premature redirects
  const hasLoadedRef = useRef(false)

  /* ─────────────────────────────────────────────────────────
     ✅ NEW: Chef identity atoms consumed by useOrderNotifier
     so that CHEF-side order filtering can be done without an
     extra network round-trip.
     ───────────────────────────────────────────────────────── */
  const [chefUserId, setChefUserId] = useState<string | null>(null)
  const [chefName, setChefName] = useState<string | null>(null)

  /* ─────────────────────────────────────────────────────────
     ✅ NEW: Role-scoped order alarm + push notification listener.
     Enabled only once auth (allowed === true) AND role
     (isChef === true) are fully resolved. When disabled, the
     hook is a no-op — zero side effects.
     ───────────────────────────────────────────────────────── */
  useOrderNotifier('chef', {
    enabled: allowed === true && isChef === true,
    chefUserId,
    chefName,
  })

  useEffect(() => {
    let mounted = true
    let requestId = 0

    const loadOnce = async () => {
      if (hasLoadedRef.current) return
      hasLoadedRef.current = true
      const currentRequestId = ++requestId

      try {
        // First validate that a KatBox JWT exists and has not expired.
        const token = await getToken()
        if (!mounted || currentRequestId !== requestId) return

        if (!token || isTokenExpired(token)) {
          setAllowed(false)
          setIsChef(false)
          setChefUserId(null)
          setChefName(null)
          return
        }

        setAllowed(true)

        // Do not authorize from cached isChef. The cached user is useful
        // only as a temporary identity fallback for the order notifier.
        const cached = await getUser()
        if (!mounted || currentRequestId !== requestId) return

        if (cached?.id || cached?._id) {
          setChefUserId(String(cached.id || cached._id))
        }
        if (cached?.name) {
          setChefName(String(cached.name))
        }

        // /auth/me verifies the role against the current MongoDB record.
        const verification = await verifyUserFromBackend()
        if (!mounted || currentRequestId !== requestId) return

        if (verification.status === 'error') {
          // A transient network/server failure is not proof that access
          // was revoked. Keep the loading gate closed and retry on resume.
          console.log('ChefTabsLayout: unable to verify role; retaining verification gate.')
          setAllowed(null)
          setIsChef(null)
          return
        }
        if (verification.status === 'unauthorized') {
          setAllowed(false)
          setIsChef(false)
          return
        }

        const fresh = verification.user
        setIsChef(fresh.isChef === true)
        setChefUserId(fresh.id || fresh._id ? String(fresh.id || fresh._id) : null)
        setChefName(fresh.name ? String(fresh.name) : null)
      } catch (e) {
        console.log('ChefTabsLayout auth error:', e)
        if (mounted && currentRequestId === requestId) {
          setIsChef(false)
        }
      }
    }

    loadOnce()

    const unsub = subscribeAuth(() => {
      requestId += 1
      hasLoadedRef.current = false
      setAllowed(null)
      setIsChef(null)
      setChefUserId(null)
      setChefName(null)
      loadOnce()
    })

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        requestId += 1
        hasLoadedRef.current = false
        setAllowed(null)
        setIsChef(null)
        loadOnce()
      }
    })

    return () => {
      mounted = false
      requestId += 1
      unsub()
      appStateSubscription.remove()
    }
  }, [])

  // ⭐ Wait until both auth and chef status are fully resolved
  if (allowed === null || isChef === null) {
    return <View style={{ flex: 1, backgroundColor: '#111813' }} />
  }
  if (!allowed) return <Redirect href="/login" />
  if (!isChef) return <Redirect href="/unauthorized" />

  return (
    <Tabs
      initialRouteName="add-chefs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={({ navigation, state }) => (
        <View style={styles.fixedFooterContainer} pointerEvents="box-none">
          <View style={styles.footerBar}>
            <View style={styles.topGlowBorder} />

            {state.routes.map((route) => {
              const isFocused =
                state.index === state.routes.findIndex((r) => r.key === route.key)
              const config = CHEF_TAB_CONFIG[route.name] || {
                label: route.name,
                icon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap,
                activeIcon: 'ellipse' as keyof typeof Ionicons.glyphMap,
              }

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name)
                }
              }

              return (
                <ChefTabButton
                  key={route.key}
                  label={config.label}
                  icon={config.icon}
                  activeIcon={config.activeIcon}
                  active={isFocused}
                  onPress={onPress}
                />
              )
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="add-chefs" options={{ title: 'Chef' }} />
      <Tabs.Screen name="add-chefCategory" options={{ title: 'Category' }} />
      <Tabs.Screen name="all-orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}

function ChefTabButton({
  label,
  icon,
  activeIcon,
  active,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  activeIcon: keyof typeof Ionicons.glyphMap
  active: boolean
  onPress: () => void
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const pillOpacityAnim = useRef(new Animated.Value(active ? 1 : 0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: active ? 1.04 : 1,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.timing(pillOpacityAnim, {
        toValue: active ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [active])

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true }).start()
  }
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: active ? 1.04 : 1,
      useNativeDriver: true,
    }).start()
  }

  const iconColor = active ? '#FFFFFF' : '#94A3B8'

  return (
    <TouchableOpacity
      style={styles.tabButtonContainer}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
    >
      <Animated.View style={[styles.tabButtonInner, { transform: [{ scale: scaleAnim }] }]}>
        <Animated.View style={[styles.activePillGlow, { opacity: pillOpacityAnim }]} />
        <View style={styles.iconWrapper}>
          <Ionicons name={active ? activeIcon : icon} size={19} color={iconColor} />
        </View>
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
        {active ? <View style={styles.activeDotIndicator} /> : <View style={styles.dotSpacer} />}
      </Animated.View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  fixedFooterContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 999,
    elevation: 30,
    backgroundColor: 'transparent',
  },
  footerBar: {
    width: '100%',
    height: Platform.OS === 'ios' ? 74 : 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(15, 22, 17, 0.98)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 18 : 4,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(38, 54, 42, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 16,
    position: 'relative',
  },
  topGlowBorder: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1,
    backgroundColor: 'rgba(187, 247, 208, 0.3)',
    borderRadius: 1,
  },
  tabButtonContainer: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 1,
  },
  activePillGlow: {
    position: 'absolute',
    top: 0,
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(74, 222, 128, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.35)',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  iconWrapper: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  activeDotIndicator: {
    width: 10,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#4ADE80',
    marginTop: 2,
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  dotSpacer: {
    height: 2.5,
    marginTop: 2,
  },
})
