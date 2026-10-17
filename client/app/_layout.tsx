
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Image,
  Platform,
  StyleSheet,
  View,
} from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { ClerkProvider } from '@clerk/clerk-expo'

import {
  getToken,
  removeToken,
  getUser,
} from '@/src/lib/authStorage'
import { subscribeAuth } from '@/src/lib/authEvents'
import { isTokenExpired, getTokenExpiry } from '@/src/lib/jwtUtils'
import api from '@/src/lib/api'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync().catch(() => {})

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/*
 * Create the role-specific Android alarm channels.
 * The bundled notification sound must be configured in the
 * Expo notifications plugin and included in the native build.
 */
if (Platform.OS === 'android') {
  ;(async () => {
    try {
      const alarmChannels = [
        { id: 'admin_orders_alarm', name: 'Admin Order Alarms' },
        { id: 'chef_orders_alarm', name: 'Chef Order Alarms' },
      ]

      for (const channel of alarmChannels) {
        await Notifications.setNotificationChannelAsync(
          channel.id,
          {
            name: channel.name,
            importance: Notifications.AndroidImportance?.MAX ?? 5,
            vibrationPattern: [0, 600, 300, 600, 300],
            sound: 'alarm',
            enableVibrate: true,
            bypassDnd: true,
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility?.PUBLIC,
            audioAttributes: {
              usage: Notifications.AndroidAudioUsage?.NOTIFICATION,
              contentType:
                Notifications.AndroidAudioContentType?.SONIFICATION,
            },
          }
        )
      }

      console.log('Android alarm channels ready')
    } catch (error) {
      console.log('Android notification channel error:', error)
    }
  })()
}

const CLERK_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key)
    } catch (error) {
      console.log('Clerk token read error:', error)
      return null
    }
  },

  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch (error) {
      console.log('Clerk token save error:', error)
    }
  },
}

export default function RootLayout() {
  if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file'
    )
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <InitialLayout />
    </ClerkProvider>
  )
}

function InitialLayout() {
  const router = useRouter()
  const segments = useSegments()

  const logoutTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  const authCheckIdRef = useRef(0)
  const loginTransitionRef = useRef(false)
  const authNavigationIdRef = useRef(0)

  const [isAuthenticated, setIsAuthenticated] =
    useState<boolean | null>(null)

  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  })

  useEffect(() => {
    if (fontError) {
      throw fontError
    }
  }, [fontError])

  /*
   * Resolve the correct landing page from the saved KatBox user.
   */
  const getRoleRoute = useCallback(async () => {
    try {
      const user = await getUser()

      if (!user) {
        console.log(
          'No stored KatBox user. Using customer Home route.'
        )
        return '/(tabs)/Home'
      }

      console.log('Stored KatBox user:', {
        id: user.id,
        name: user.name,
        isChef: user.isChef,
        isAdmin: user.isAdmin,
      })

      if (user.isAdmin) {
        return '/admin/all-users'
      }

      if (user.isChef) {
        return '/chefManagement/add-chefs'
      }

      return '/(tabs)/Home'
    } catch (error) {
      console.log('Role route resolution error:', error)
      return '/(tabs)/Home'
    }
  }, [])

  /*
   * Check the KatBox JWT and arrange automatic logout at expiry.
   * A newer check invalidates any older asynchronous check.
   */
  const checkAuth = useCallback(async () => {
    const checkId = ++authCheckIdRef.current
    const isLatestCheck = () =>
      checkId === authCheckIdRef.current

    try {
      const token = await getToken()

      if (!isLatestCheck()) {
        return false
      }

      if (!token) {
        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current)
          logoutTimerRef.current = null
        }

        setIsAuthenticated(false)
        return false
      }

      if (isTokenExpired(token)) {
        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current)
          logoutTimerRef.current = null
        }

        if (!isLatestCheck()) {
          return false
        }

        await removeToken()

        if (!isLatestCheck()) {
          return false
        }

        setIsAuthenticated(false)
        return false
      }

      setIsAuthenticated(true)

      const expiry = getTokenExpiry(token)

      if (!expiry) {
        return true
      }

      const timeLeft = expiry - Date.now()

      if (timeLeft <= 0) {
        if (!isLatestCheck()) {
          return false
        }

        await removeToken()

        if (!isLatestCheck()) {
          return false
        }

        setIsAuthenticated(false)
        return false
      }

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
      }

      logoutTimerRef.current = setTimeout(async () => {
        if (!isLatestCheck()) {
          return
        }

        try {
          console.log('KatBox session expired')
          await removeToken()

          if (isLatestCheck()) {
            setIsAuthenticated(false)
          }
        } catch (error) {
          console.log('Error clearing expired session:', error)

          if (isLatestCheck()) {
            setIsAuthenticated(false)
          }
        }
      }, timeLeft)

      return true
    } catch (error) {
      if (!isLatestCheck()) {
        return false
      }

      console.log('KatBox auth check error:', error)

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
        logoutTimerRef.current = null
      }

      setIsAuthenticated(false)
      return false
    }
  }, [])

  /*
   * Initial authentication and later login/logout notifications.
   * Do not unmount the root Stack while this check is in progress.
   */
  useEffect(() => {
    let isMounted = true

    void checkAuth()

    const unsubscribe = subscribeAuth(async () => {
      console.log('Authentication change detected')

      loginTransitionRef.current = true

      try {
        await checkAuth()
      } catch (error) {
        console.log('Auth transition check error:', error)
      } finally {
        if (isMounted) {
          loginTransitionRef.current = false
        }
      }
    })

    return () => {
      isMounted = false
      unsubscribe()

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
        logoutTimerRef.current = null
      }
    }
  }, [checkAuth])

  /*
   * Hide the native splash when fonts are ready.
   * The in-app splash remains visible until auth has been checked.
   */
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch((error) => {
        console.log('Native splash hide error:', error)
      })
    }
  }, [fontsLoaded])

  /*
   * Push notification registration and notification-tap navigation.
   * Expo Go skips remote push token registration.
   */
  useEffect(() => {
    let isMounted = true

    const registerPushNotifications = async () => {
      try {
        const isExpoGo = Constants.appOwnership === 'expo'

        if (isExpoGo) {
          console.log(
            'Expo Go detected: skipping remote push registration'
          )
          return
        }

        const pushToken = await registerForPushNotificationsAsync()

        if (pushToken && isMounted) {
          api
            .patch('/api/auth/update-profile', {
              pushToken,
            })
            .catch((error) => {
              console.log('Push token save error:', error)
            })
        }
      } catch (error) {
        console.log('Push notification registration error:', error)
      }
    }

    void registerPushNotifications()

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          try {
            const data =
              response.notification.request.content.data

            const user = await getUser()

            if (data?.screen === 'chef-orders') {
              router.push('/chefManagement/add-chefs' as any)
              return
            }

            if (data?.screen === 'admin-orders') {
              router.push('/admin/all-orders' as any)
              return
            }

            if (user?.isAdmin) {
              router.push('/admin/all-orders' as any)
              return
            }

            if (user?.isChef) {
              router.push('/chefManagement/add-chefs' as any)
              return
            }

            router.push('/(tabs)/Orders' as any)
          } catch (error) {
            console.log('Notification navigation error:', error)
          }
        }
      )

    return () => {
      isMounted = false
      subscription.remove()
    }
  }, [router])

  /*
   * Navigation guard.
   *
   * The root Stack remains mounted at all times. While authentication
   * is unresolved, the splash overlay covers it instead of returning null.
   */
  useEffect(() => {
    if (isAuthenticated === null) {
      return
    }

    const currentSegment = segments[0] as string | undefined

    const inTabs = currentSegment === '(tabs)'
    const inScreens = currentSegment === 'screens'
    const inChef = currentSegment === 'chefManagement'
    const inAdmin = currentSegment === 'admin'

    const isIndexRoute =
      currentSegment === undefined ||
      currentSegment === 'index'

    const isPublicRoute =
      isIndexRoute ||
      currentSegment === 'SlidingScreens' ||
      currentSegment === 'login' ||
      currentSegment === 'verify' ||
      currentSegment === 'oauth-callback'

    /*
     * Prevent stale asynchronous role lookups from navigating
     * after the route or authentication state has changed.
     */
    const navigationId = ++authNavigationIdRef.current

    if (!isAuthenticated) {
      if (isIndexRoute) {
        router.replace('/SlidingScreens' as any)
        return
      }

      if (
        !loginTransitionRef.current &&
        (inTabs || inScreens || inChef || inAdmin)
      ) {
        router.replace('/login' as any)
      }

      return
    }

    if (isAuthenticated && isPublicRoute) {
      void getRoleRoute().then((route) => {
        if (
          navigationId !== authNavigationIdRef.current
        ) {
          return
        }

        console.log('Authenticated role route:', route)
        router.replace(route as any)
      }).catch((error) => {
        console.log('Failed to resolve role route:', error)

        if (
          navigationId === authNavigationIdRef.current
        ) {
          router.replace('/(tabs)/Home' as any)
        }
      })
    }
  }, [
    isAuthenticated,
    segments,
    router,
    getRoleRoute,
  ])

  /*
   * IMPORTANT:
   * Always render Stack first so Expo Router mounts correctly.
   * The splash is an overlay, not a replacement for the navigator.
   */
  return (
    <View style={styles.root}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="SlidingScreens"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="login"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="oauth-callback"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="verify/[phone]"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="screens"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="chefManagement"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="admin"
          options={{ headerShown: false }}
        />
      </Stack>

      {(!fontsLoaded || isAuthenticated === null) && (
        <View style={styles.splashOverlay}>
          <Image
            source={require('../assets/images/splash.png')}
            resizeMode="cover"
            style={styles.splashImage}
          />
        </View>
      )}
    </View>
  )
}

async function registerForPushNotificationsAsync() {
  let token: string | undefined

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync()

    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } =
        await Notifications.requestPermissionsAsync()

      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted')
      return
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId

    if (!projectId) {
      console.log(
        'No EAS projectId found. Push token registration skipped.'
      )
      return
    }

    token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data

    console.log('Expo push token:', token)
  }

  return token
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    backgroundColor: '#082a18',
  },
  splashImage: {
    width: '100%',
    height: '100%',
  },
})
