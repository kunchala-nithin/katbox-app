import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, useRef } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Platform,
  Animated,
} from 'react-native'

import { getToken, getUser, refreshUser } from '@/src/lib/authStorage'
import { isTokenExpired } from '@/src/lib/jwtUtils'
import { useRouter } from 'expo-router'
import { subscribeAuth } from '@/src/lib/authEvents'

const { width } = Dimensions.get('window')

const TAB_CONFIG: Record<
  string,
  {
    label: string
    icon: keyof typeof Ionicons.glyphMap
    activeIcon: keyof typeof Ionicons.glyphMap
    badgeCount?: number
  }
> = {
  Home: {
    label: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  Orders: {
    label: 'Orders',
    icon: 'receipt-outline',
    activeIcon: 'receipt',
  },
  Profile: {
    label: 'Profile',
    icon: 'person-outline',
    activeIcon: 'person',
  },
}

type RoleState = 'loading' | 'unauth' | 'customer' | 'chef'

export default function TabsLayout() {
  const router = useRouter()
  const [role, setRole] = useState<RoleState>('loading')
  const hasLoadedRef = useRef(false)
  const lastHomeTapRef = useRef<number>(0)

  useEffect(() => {
    let mounted = true

    const loadOnce = async () => {
      if (hasLoadedRef.current) return
      hasLoadedRef.current = true

      try {
        const token = await getToken()
        if (!token || isTokenExpired(token)) {
          if (mounted) setRole('unauth')
          return
        }

        // 1) Cached user first (fast path — no network)
        const cached = await getUser()
        if (cached && mounted) {
          if (cached.isChef) {
            setRole('chef')
            return
          }
          // Customer from cache — still soft-refresh below, but we can show tabs
          setRole('customer')
        }

        // 2) Soft network refresh once
        const fresh = await refreshUser()
        if (!mounted) return

        if (!fresh) {
          // Keep whatever we set from cache, or unauth
          if (!cached) setRole('unauth')
          return
        }

        if (fresh.isChef) {
          setRole('chef')
        } else {
          setRole('customer')
        }
      } catch (e) {
        console.log('TabsLayout auth error:', e)
        if (mounted) setRole('unauth')
      }
    }

    loadOnce()

    const unsub = subscribeAuth(() => {
      hasLoadedRef.current = false
      setRole('loading')
      loadOnce()
    })

    return () => {
      mounted = false
      unsub()
    }
  }, [])

  // ─── Never mount Home until role is known ───
  if (role === 'loading') {
    return <View style={{ flex: 1, backgroundColor: '#111813' }} />
  }

  if (role === 'unauth') {
    return <Redirect href="/login" />
  }

  if (role === 'chef') {
    return <Redirect href="/chefManagement/add-chefs" />
  }

  // role === 'customer' → original tabs only
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={({ navigation, state }) => {
        return (
          <View style={styles.fixedFooterContainer} pointerEvents="box-none">
            <View style={styles.footerBar}>
              <View style={styles.topGlowBorder} />

              {state.routes.map((route) => {
                const isFocused =
                  state.index === state.routes.findIndex((r) => r.key === route.key)
                const config = TAB_CONFIG[route.name] || {
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

                  if (route.name === 'Home') {
                    const now = Date.now()
                    if (now - lastHomeTapRef.current < 400 && isFocused) {
                      router.replace('/Home')
                    } else if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name)
                    }
                    lastHomeTapRef.current = now
                  } else {
                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name)
                    }
                  }
                }

                return (
                  <AnimatedTabButton
                    key={route.key}
                    label={config.label}
                    icon={config.icon}
                    activeIcon={config.activeIcon}
                    badgeCount={config.badgeCount}
                    active={isFocused}
                    onPress={onPress}
                  />
                )
              })}
            </View>
          </View>
        )
      }}
    >
      <Tabs.Screen name="Home" />
      <Tabs.Screen name="Orders" />
      <Tabs.Screen name="Profile" />
    </Tabs>
  )
}

function AnimatedTabButton({
  label,
  icon,
  activeIcon,
  badgeCount,
  active,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  activeIcon: keyof typeof Ionicons.glyphMap
  badgeCount?: number
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
          {badgeCount && badgeCount > 0 ? (
            <View style={styles.badgeCircle}>
              <Text style={styles.badgeText}>{badgeCount}</Text>
            </View>
          ) : null}
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
    position: 'relative',
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
  badgeCircle: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#A3E635',
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#111813',
    paddingHorizontal: 1,
  },
  badgeText: {
    color: '#111813',
    fontSize: 8,
    fontWeight: '900',
  },
})