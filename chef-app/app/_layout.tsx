import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Platform, AppState, AppStateStatus } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { ClerkProvider } from '@clerk/clerk-expo'

import { getToken, removeToken, getUser, refreshUser } from '@/src/lib/authStorage'
import { subscribeAuth } from '@/src/lib/authEvents'
import { isTokenExpired, getTokenExpiry } from '@/src/lib/jwtUtils'
import api from '@/src/lib/api'

export { ErrorBoundary } from 'expo-router'

void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.log('Could not prevent splash screen auto-hide:', error)
})

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/* ─────────────────────────────────────────────────────────────
   ✅ COLD-START ANDROID CHANNEL BOOTSTRAP
   ───────────────────────────────────────────────────────────── */
if (Platform.OS === 'android') {
  ;(async () => {
    try {
      const alarmChannels = [
        { id: 'admin_orders_alarm', name: 'Admin Order Alarms' },
        { id: 'chef_orders_alarm', name: 'Chef Order Alarms' },
      ]

      for (const ch of alarmChannels) {
        await Notifications.setNotificationChannelAsync(ch.id, {
          name: ch.name,
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
        })
      }

      console.log('✅ Cold-start Android alarm channels ready')
    } catch (err) {
      console.log('Cold-start Android channel error:', err)
    }
  })()
}

const CLERK_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key)
    } catch (err) {
      console.log('Clerk token read error:', err)
      return null
    }
  },

  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch (err) {
      console.log('Clerk token save error:', err)
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

  /**
   * Prevent overlapping authentication checks from applying stale
   * results.
   */
  const authCheckIdRef = useRef(0)

  /**
   * LOGIN TRANSITION GUARD
   */
  const loginTransitionRef = useRef<boolean>(false)

  const loginTransitionTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Role check in-flight guard to prevent overlapping role checks
   */
  const roleCheckInFlightRef = useRef<boolean>(false)

  /**
   * Last known role state - used to detect changes
   */
  const lastKnownRoleRef = useRef<{
    isChef: boolean
    isAdmin: boolean
  } | null>(null)

  const [isAuthenticated, setIsAuthenticated] =
    useState<boolean | null>(null)

  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  })

  /*
   * ------------------------------------------------------------
   * FONT ERROR
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (fontError) {
      console.log('⚠️ Font loading failed; continuing with fallback fonts:', fontError)
    }
  }, [fontError])

  /*
   * ------------------------------------------------------------
   * GET ROLE-BASED ROUTE
   * ------------------------------------------------------------
   */

  const getRoleRoute = useCallback(async () => {
    try {
      const user = await refreshUser()

      if (!user) {
        console.log(
          '⚠️ Could not verify the KatBox user with the backend.'
        )
        return '/unauthorized'
      }

      console.log('👤 Verified KatBox user from MongoDB:', {
        id: user.id || user._id,
        name: user.name,
        isChef: user.isChef,
        isAdmin: user.isAdmin,
      })

      // Track role for change detection
      lastKnownRoleRef.current = {
        isChef: user.isChef === true,
        isAdmin: user.isAdmin === true,
      }

      // This is a standalone Chef app: only MongoDB isChef === true
      // is allowed to enter the Chef application.
      if (user.isChef === true) {
        return '/chefManagement/add-chefs'
      }

      return '/unauthorized'
    } catch (error) {
      console.log('❌ Role route resolution error:', error)
      return '/unauthorized'
    }
  }, [])

  /*
   * ------------------------------------------------------------
   * AUTHENTICATION CHECK
   * ------------------------------------------------------------
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
        console.log('🔐 No Katbox token found.')

        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current)
          logoutTimerRef.current = null
        }

        setIsAuthenticated(false)

        return false
      }

      if (isTokenExpired(token)) {
        console.log('⏰ Katbox JWT has expired.')

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

      console.log('✅ Valid Katbox JWT found.')

      if (!isLatestCheck()) {
        return false
      }

      setIsAuthenticated(true)

      const expiry = getTokenExpiry(token)

      if (!expiry) {
        return true
      }

      const timeLeft = expiry - Date.now()

      if (timeLeft <= 0) {
        console.log('⏰ Katbox JWT expired while checking.')

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

      if (!isLatestCheck()) {
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
          console.log('⏰ Katbox session expired.')

          await removeToken()

          if (isLatestCheck()) {
            setIsAuthenticated(false)
          }
        } catch (error) {
          console.log(
            '❌ Error clearing expired Katbox session:',
            error
          )

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

      console.log('❌ Auth check error:', error)

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
        logoutTimerRef.current = null
      }

      setIsAuthenticated(false)

      return false
    }
  }, [])

  /*
   * ------------------------------------------------------------
   * AUTH STATE LISTENER
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      try {
        await checkAuth()
      } catch (error) {
        console.log(
          '❌ Initial authentication initialization error:',
          error
        )
      }
    }

    initializeAuth()

    const unsubscribe = subscribeAuth(async () => {
      console.log('🔄 Authentication change detected')

      loginTransitionRef.current = true

      if (loginTransitionTimerRef.current) {
        clearTimeout(loginTransitionTimerRef.current)
        loginTransitionTimerRef.current = null
      }

      try {
        await checkAuth()
      } catch (error) {
        console.log(
          '❌ Authentication transition check error:',
          error
        )
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

      if (loginTransitionTimerRef.current) {
        clearTimeout(loginTransitionTimerRef.current)
        loginTransitionTimerRef.current = null
      }
    }
  }, [checkAuth])

  /*
   * ------------------------------------------------------------
   * SPLASH SCREEN
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if ((fontsLoaded || !!fontError) && isAuthenticated !== null) {
      void SplashScreen.hideAsync().catch((error) => {
        console.log('Could not hide splash screen:', error)
      })
    }
  }, [fontsLoaded, fontError, isAuthenticated])

  /*
   * ------------------------------------------------------------
   * ROLE-AWARE EXPO PUSH NOTIFICATIONS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let isMounted = true

    const registerPushNotifications = async () => {
      try {
        const isExpoGo = Constants.appOwnership === 'expo'

        if (isExpoGo) {
          console.log(
            '📱 Running in Expo Go - skipping remote push token registration'
          )

          return
        }

        const token = await registerForPushNotificationsAsync()

        if (token && isMounted) {
          api
            .patch('/api/auth/update-profile', {
              pushToken: token,
            })
            .catch((err) => {
              console.log(
                '❌ Push token save error:',
                err
              )
            })
        }
      } catch (err) {
        console.log(
          '❌ Push notification registration error:',
          err
        )
      }
    }

    registerPushNotifications()

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          try {
            const data =
              response.notification.request.content.data

            const user = await refreshUser()

            if (data?.screen === 'chef-orders') {
              router.push(
                '/chefManagement/all-orders' as any
              )

              return
            }

            if (data?.screen === 'admin-orders') {
              router.replace('/unauthorized' as any)

              return
            }

            if (user?.isAdmin) {
              router.replace('/unauthorized' as any)

              return
            }

            if (user?.isChef) {
              router.push(
                '/chefManagement/all-orders' as any
              )

              return
            }

            router.replace('/unauthorized' as any)
          } catch (err) {
            console.log(
              '❌ Notification navigation error:',
              err
            )
          }
        }
      )

    return () => {
      isMounted = false
      subscription.remove()
    }
  }, [router])

  /*
   * ------------------------------------------------------------
   * NAVIGATION GUARD
   * ------------------------------------------------------------
   *
   * Rules:
   *   1. If not authenticated -> login (except during transition)
   *   2. If authenticated + on public route -> redirect to role route
   *   3. If authenticated + isChef + on non-chef route -> redirect to chef
   *   4. If authenticated + !isChef + on chef route -> redirect to unauthorized
   *   5. If authenticated + !isChef + on unauthorized -> stay
   *   6. If authenticated + isChef + on unauthorized -> redirect to chef
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
    const inUnauthorized = currentSegment === 'unauthorized'

    const isPublicRoute =
      currentSegment === undefined ||
      currentSegment === 'index' ||
      currentSegment === 'login' ||
      currentSegment === 'verify' ||
      currentSegment === 'oauth-callback'

    // Handle unauthenticated entry route
    if (
      !isAuthenticated &&
      (currentSegment === undefined || currentSegment === 'index')
    ) {
      console.log('🔒 Unauthenticated entry route. Redirecting to login.')
      router.replace('/login' as any)
      return
    }

    // Chef route protection - must verify isChef from backend
    if (isAuthenticated && inChef) {
      // Skip if a role check is already in flight
      if (roleCheckInFlightRef.current) {
        return
      }

      roleCheckInFlightRef.current = true
      let isActive = true

      refreshUser()
        .then((freshUser) => {
          if (!isActive) return
          roleCheckInFlightRef.current = false

          if (!freshUser) {
            console.log('🚫 Could not verify user. Redirecting to unauthorized.')
            router.replace('/unauthorized' as any)
            return
          }

          if (freshUser.isChef !== true) {
            console.log(
              '🚫 Chef route blocked: MongoDB does not confirm isChef === true.'
            )
            router.replace('/unauthorized' as any)
            return
          }

          // User is confirmed chef - update last known role
          lastKnownRoleRef.current = {
            isChef: true,
            isAdmin: freshUser.isAdmin === true,
          }
        })
        .catch((error) => {
          if (!isActive) return
          roleCheckInFlightRef.current = false
          console.log('❌ Could not verify Chef route access:', error)
          router.replace('/unauthorized' as any)
        })

      return () => {
        isActive = false
        roleCheckInFlightRef.current = false
      }
    }

    // If user is on unauthorized but is actually a chef, redirect to chef
    if (isAuthenticated && inUnauthorized) {
      if (roleCheckInFlightRef.current) {
        return
      }

      roleCheckInFlightRef.current = true
      let isActive = true

      refreshUser()
        .then((freshUser) => {
          if (!isActive) return
          roleCheckInFlightRef.current = false

          if (freshUser?.isChef === true) {
            console.log(
              '✅ User is now a chef! Redirecting from unauthorized to chef management.'
            )
            router.replace('/chefManagement/add-chefs' as any)
          }
        })
        .catch((error) => {
          if (!isActive) return
          roleCheckInFlightRef.current = false
          console.log('❌ Role check on unauthorized screen error:', error)
        })

      return () => {
        isActive = false
        roleCheckInFlightRef.current = false
      }
    }

    /*
     * USER IS LOGGED OUT
     */
    if (
      !isAuthenticated &&
      !loginTransitionRef.current &&
      (inTabs ||
        inScreens ||
        inChef ||
        inAdmin ||
        inUnauthorized)
    ) {
      console.log(
        '🔒 User is unauthenticated. Redirecting to login.'
      )

      router.replace('/login' as any)

      return
    }

    /*
     * USER IS LOGGED IN + on public route
     */
    if (isAuthenticated && isPublicRoute) {
      getRoleRoute()
        .then((route) => {
          console.log(
            '🚀 Authenticated user role route:',
            route
          )

          router.replace(route as any)
        })
        .catch((error) => {
          console.log(
            '❌ Failed to resolve authenticated route:',
            error
          )

          router.replace('/unauthorized' as any)
        })
    }
  }, [
    isAuthenticated,
    segments,
    router,
    getRoleRoute,
  ])

  /*
   * ------------------------------------------------------------
   * APP FOREGROUND ROLE REFRESH
   * ------------------------------------------------------------
   * When app returns to foreground from background:
   *   - If on unauthorized -> check if role changed
   *   - If on chef screen -> check if role still valid
   */
  useEffect(() => {
    if (isAuthenticated !== true) {
      return
    }

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') {
        return
      }

      const currentSegment = segments[0] as string | undefined
      const inChef = currentSegment === 'chefManagement'
      const inUnauthorized = currentSegment === 'unauthorized'

      if (!inChef && !inUnauthorized) {
        return
      }

      if (roleCheckInFlightRef.current) {
        return
      }

      try {
        const user = await refreshUser()

        if (!user) {
          return
        }

        // On unauthorized screen - check if user became chef
        if (inUnauthorized && user.isChef === true) {
          console.log(
            '✅ [Foreground] User is now a chef! Redirecting...'
          )
          router.replace('/chefManagement/add-chefs' as any)
          return
        }

        // On chef screen - check if user lost chef role
        if (inChef && user.isChef !== true) {
          console.log(
            '🚫 [Foreground] User lost chef access! Redirecting to unauthorized.'
          )
          router.replace('/unauthorized' as any)
          return
        }
      } catch (error) {
        console.log('[Foreground] Role check error:', error)
      }
    }

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    )

    return () => {
      subscription.remove()
    }
  }, [isAuthenticated, segments, router])

  /*
   * ------------------------------------------------------------
   * WAIT FOR INITIAL AUTH + FONTS
   * ------------------------------------------------------------
   */

  if (
    (!fontsLoaded && !fontError) ||
    isAuthenticated === null
  ) {
    return null
  }

  /*
   * ------------------------------------------------------------
   * STACK ROUTES
   * ------------------------------------------------------------
   */

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="oauth-callback" />
      <Stack.Screen name="unauthorized" />
      <Stack.Screen name="chefManagement" />
    </Stack>
  )
}

/*
 * ============================================================
 * EXPO PUSH NOTIFICATION REGISTRATION
 * ============================================================
 */

async function registerForPushNotificationsAsync() {
  let token

  if (Device.isDevice) {
    const {
      status: existingStatus,
    } = await Notifications.getPermissionsAsync()

    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } =
        await Notifications.requestPermissionsAsync()

      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      console.log(
        '📵 Push notification permission was not granted'
      )

      return
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId

    if (!projectId) {
      console.log(
        '⚠️ No EAS projectId found. Push token registration skipped.'
      )

      return
    }

    token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data

    console.log(
      '📲 Expo push token:',
      token
    )
  }

  return token
}