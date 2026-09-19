import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { ClerkProvider } from '@clerk/clerk-expo'

import { getToken, removeToken, getUser } from '@/src/lib/authStorage'
import { subscribeAuth } from '@/src/lib/authEvents'
import { isTokenExpired, getTokenExpiry } from '@/src/lib/jwtUtils'
import api from '@/src/lib/api'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

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
   ✅ NEW: COLD-START ANDROID CHANNEL BOOTSTRAP
   ─────────────────────────────────────────────────────────────
   The role-scoped channels are normally created by
   `useOrderNotifier` when the admin/chef tab group is first
   mounted. However, if a brand-new admin device receives its
   very first order BEFORE opening the admin tab group, the
   channel would not exist yet — and Android would fall back to
   a silent default channel.

   We proactively create BOTH alarm channels here at module load
   so the very first order is guaranteed to ring with the bundled
   alarm.mp3 sound, even if the user has never opened the tab.
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
            contentType: Notifications.AndroidAudioContentType?.SONIFICATION,
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
   * ──────────────────────────────────────────────────────────
   * LOGIN TRANSITION GUARD
   * ──────────────────────────────────────────────────────────
   *
   * When login.tsx calls notifyAuthChanged(), the layout's
   * checkAuth() runs asynchronously. During that window,
   * `isAuthenticated` is still `false`. If the user was on a
   * protected route (or navigating to one), the navigation
   * guard below would bounce them back to /login.
   *
   * We suppress the "logged-out → /login" rule for a short
   * window after an auth-change event to allow checkAuth() to
   * resolve.
   */
  const loginTransitionRef = useRef<boolean>(false)
  const loginTransitionTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

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
      throw fontError
    }
  }, [fontError])

  /*
   * ------------------------------------------------------------
   * GET ROLE-BASED ROUTE
   * ------------------------------------------------------------
   *
   * We use the Katbox user saved in authStorage.
   *
   * Admin:
   *     /admin/all-users
   *
   * Chef:
   *     /chefManagement/add-chefs
   *
   * Customer:
   *     /(tabs)/Home
   */

  const getRoleRoute = useCallback(async () => {
    try {
      const user = await getUser()

      if (!user) {
        console.log(
          '⚠️ No stored Katbox user found. Using customer Home route.'
        )

        return '/(tabs)/Home'
      }

      console.log('👤 Stored Katbox user:', {
        id: user.id,
        name: user.name,
        isChef: user.isChef,
        isAdmin: user.isAdmin,
      })

      /*
       * Admin gets priority if somehow both flags are true.
       */
      if (user.isAdmin) {
        return '/admin/all-users'
      }

      if (user.isChef) {
        return '/chefManagement/add-chefs'
      }

      return '/(tabs)/Home'
    } catch (error) {
      console.log('❌ Role route resolution error:', error)

      return '/(tabs)/Home'
    }
  }, [])

  /*
   * ------------------------------------------------------------
   * AUTHENTICATION CHECK
   * ------------------------------------------------------------
   *
   * This checks the Katbox JWT, NOT the Clerk session.
   *
   * The Katbox backend creates this token after successful
   * Google authentication.
   */

  const checkAuth = useCallback(async () => {
    try {
      const token = await getToken()

      /*
       * No Katbox JWT means the user is not authenticated
       * inside the Katbox application.
       */
      if (!token) {
        console.log('🔐 No Katbox token found.')

        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current)
          logoutTimerRef.current = null
        }

        setIsAuthenticated(false)
        return
      }

      /*
       * Check whether the JWT has expired.
       */
      if (isTokenExpired(token)) {
        console.log('⏰ Katbox JWT has expired.')

        if (logoutTimerRef.current) {
          clearTimeout(logoutTimerRef.current)
          logoutTimerRef.current = null
        }

        await removeToken()

        setIsAuthenticated(false)
        return
      }

      /*
       * Valid token.
       */
      console.log('✅ Valid Katbox JWT found.')

      setIsAuthenticated(true)

      /*
       * Schedule automatic logout exactly when the JWT expires.
       */
      const expiry = getTokenExpiry(token)

      if (!expiry) {
        return
      }

      const timeLeft = expiry - Date.now()

      if (timeLeft <= 0) {
        console.log('⏰ Katbox JWT expired while checking.')

        await removeToken()
        setIsAuthenticated(false)
        return
      }

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
      }

      logoutTimerRef.current = setTimeout(async () => {
        try {
          console.log('⏰ Katbox session expired.')

          await removeToken()

          setIsAuthenticated(false)
        } catch (error) {
          console.log(
            '❌ Error clearing expired Katbox session:',
            error
          )

          setIsAuthenticated(false)
        }
      }, timeLeft)
    } catch (error) {
      console.log('❌ Auth check error:', error)

      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
        logoutTimerRef.current = null
      }

      setIsAuthenticated(false)
    }
  }, [])

  /*
   * ------------------------------------------------------------
   * AUTH STATE LISTENER
   * ------------------------------------------------------------
   *
   * Login/logout screens call:
   *
   *     notifyAuthChanged()
   *
   * This causes the layout to immediately re-check the
   * Katbox JWT.
   *
   * We ALSO mark a short "login transition" window so the
   * navigation guard does not bounce the user while
   * checkAuth() is still resolving.
   */

  useEffect(() => {
    checkAuth()

    const unsubscribe = subscribeAuth(() => {
      /**
       * Mark a login transition in-flight so the navigation
       * guard does not immediately bounce the user.
       */
      loginTransitionRef.current = true

      if (loginTransitionTimerRef.current) {
        clearTimeout(loginTransitionTimerRef.current)
      }

      loginTransitionTimerRef.current = setTimeout(() => {
        loginTransitionRef.current = false
      }, 1500)

      checkAuth()
    })

    return () => {
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
    if (fontsLoaded && isAuthenticated !== null) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, isAuthenticated])

  /*
   * ------------------------------------------------------------
   * ROLE-AWARE EXPO PUSH NOTIFICATIONS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let isMounted = true

    const registerPushNotifications = async () => {
      try {
        /*
         * Expo Go on Android does not support remote push
         * notifications.
         */
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

    /*
     * Notification tap navigation.
     */
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          try {
            const data =
              response.notification.request.content.data

            const user = await getUser()

            /*
             * Explicit notification screen has priority.
             */
            if (data?.screen === 'chef-orders') {
              router.push(
                '/chefManagement/add-chefs' as any
              )

              return
            }

            if (data?.screen === 'admin-orders') {
              router.push(
                '/admin/all-orders' as any
              )

              return
            }

            /*
             * Otherwise use the user's role.
             */
            if (user?.isAdmin) {
              router.push(
                '/admin/all-orders' as any
              )

              return
            }

            if (user?.isChef) {
              router.push(
                '/chefManagement/add-chefs' as any
              )

              return
            }

            /*
             * Normal customer.
             */
            router.push(
              '/(tabs)/Orders' as any
            )
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
   * This is the important part for your login/logout problem.
   *
   * We DO NOT immediately force every authenticated user to
   * Home.
   *
   * Instead:
   *
   *   Customer -> Home
   *   Chef     -> Chef route
   *   Admin    -> Admin route
   *
   * AND we skip the "logged-out -> /login" rule while a login
   * transition is in-flight so we don't bounce the user back.
   */

  useEffect(() => {
    if (isAuthenticated === null) {
      return
    }

    const currentSegment = segments[0] as string | undefined

    /*
     * Protected route groups.
     */
    const inTabs = currentSegment === '(tabs)'
    const inScreens = currentSegment === 'screens'
    const inChef = currentSegment === 'chefManagement'
    const inAdmin = currentSegment === 'admin'

    /*
     * Public routes.
     */
    const isPublicRoute =
      currentSegment === undefined ||
      currentSegment === 'SlidingScreens' ||
      currentSegment === 'login' ||
      currentSegment === 'verify' ||
      currentSegment === 'oauth-callback'

    /*
     * ----------------------------------------------------------
     * USER IS LOGGED OUT
     * ----------------------------------------------------------
     *
     * If the local Katbox JWT does not exist, protected
     * screens must not remain accessible.
     *
     * SKIP while a login transition is in-flight. Otherwise we
     * would redirect the user back to /login between the moment
     * saveSession() completes and the moment checkAuth()
     * finishes resolving the new token.
     */

    if (
      !isAuthenticated &&
      !loginTransitionRef.current &&
      (inTabs ||
        inScreens ||
        inChef ||
        inAdmin)
    ) {
      console.log(
        '🔒 User is unauthenticated. Redirecting to login.'
      )

      router.replace('/login' as any)

      return
    }

    /*
     * ----------------------------------------------------------
     * USER IS LOGGED IN
     * ----------------------------------------------------------
     *
     * Only redirect when the user is sitting on a public
     * authentication/intro route.
     *
     * IMPORTANT:
     *
     * We do not redirect arbitrary authenticated routes.
     * This prevents the layout from fighting with screens such
     * as chef/admin pages.
     */

    if (isAuthenticated && isPublicRoute) {
      /*
       * Resolve the user's role from authStorage.
       */
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

          router.replace('/(tabs)/Home' as any)
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
   * WAIT FOR INITIAL AUTH + FONTS
   * ------------------------------------------------------------
   */

  if (
    !fontsLoaded ||
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
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="SlidingScreens"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="login"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="oauth-callback"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="verify/[phone]"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="screens"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="chefManagement"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="admin"
        options={{
          headerShown: false,
        }}
      />
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

    /*
     * getExpoPushTokenAsync() requires a valid EAS
     * projectId in a development/production build.
     *
     * Expo Go is handled before this function is called.
     */
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