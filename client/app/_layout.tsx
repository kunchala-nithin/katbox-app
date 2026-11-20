import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router'
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
  handleNotification: async (notification) => {
    const content: any = notification?.request?.content || {}
    const data: any = content.data || {}
    const channelId = String(content.channelId || data.channelId || "")
    const isOrderAlarm =
      channelId === "admin_orders_alarm_v2" ||
      channelId === "chef_orders_alarm_v2" ||
      content.sound === "alarm_10s.mp3" ||
      content.sound === "alarm_10s" ||
      content.sound === "alarm.mp3" ||
      content.sound === "alarm"

    return {
      shouldShowAlert: true,
      // In the foreground use the role hook's singleton audio alarm. This
      // avoids Android playing both notification-channel sound and JS audio.
      // In background/terminated states Android still plays channel sound.
      shouldPlaySound: !isOrderAlarm,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }
  },
})

/* ─────────────────────────────────────────────────────────────
   ✅ NEW: COLD-START ANDROID CHANNEL BOOTSTRAP
   ─────────────────────────────────────────────────────────────
   The role-scoped channels are normally created by
   `useOrderNotifier` when the admin/chef tab group is first
   mounted. However, if a brand-new admin device receives its
   very first order BEFORE opening the admin tab group, the
   channel would not exist yet — and Android would fall back
   to a silent default channel.

   We proactively create BOTH alarm channels here at module load
   so the very first order is guaranteed to ring with the bundled
   alarm.mp3 sound, even if the user has never opened the tab.
   ───────────────────────────────────────────────────────────── */
if (Platform.OS === 'android') {
  ;(async () => {
    try {
      const alarmChannels = [
        { id: 'admin_orders_alarm_v2', name: 'Admin Order Alarms' },
        { id: 'chef_orders_alarm_v2', name: 'Chef Order Alarms' },
      ]

      for (const ch of alarmChannels) {
        await Notifications.setNotificationChannelAsync(ch.id, {
          name: ch.name,
          importance: Notifications.AndroidImportance?.MAX ?? 5,
          vibrationPattern: [0, 600, 300, 600, 300],
          sound: 'alarm_10s',
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

const LAST_HANDLED_NOTIFICATION_RESPONSE_KEY =
  'katbox_last_handled_notification_response'

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
  const rootNavigationState = useRootNavigationState()

  const logoutTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Prevent overlapping authentication checks from applying stale
   * results. This is especially important when the initial check
   * overlaps a login-triggered check after saveSession().
   */
  const authCheckIdRef = useRef(0)

  /**
   * ──────────────────────────────────────────────────────────
   * LOGIN TRANSITION GUARD
   * ──────────────────────────────────────────────────────────
   *
   * When login.tsx calls notifyAuthChanged(), the layout's
   * checkAuth() runs asynchronously. During that window,
   * `isAuthenticated` is temporarily changed to `null`.
   *
   * While authentication is being re-checked, the layout
   * returns `null` below instead of allowing Expo Router
   * to display the login screen.
   *
   * Once checkAuth() finishes:
   *
   *   valid JWT   -> true  -> role route
   *   no JWT      -> false -> login
   *
   * This prevents the login screen from flashing for 1–2 sec
   * after a successful Google login.
   */
  const loginTransitionRef = useRef<boolean>(false)

  const loginTransitionTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isAuthenticated, setIsAuthenticated] =
    useState<boolean | null>(null)

  /**
   * Resolve the first authenticated destination only once per app
   * launch. This prevents a restored Orders/Profile tab from becoming
   * the normal cold-start screen, while preserving notification taps.
   */
  const initialNavigationHandledRef = useRef(false)
  const startupNotificationRouteRef = useRef(false)
  const [initialNavigationResolved, setInitialNavigationResolved] =
    useState(false)

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
   * Chef accounts use the Customer app like customers.
   * Chef management is available only in the standalone Chef app.
   *
   * Customer:
   *     /(tabs)/
   */

  const getRoleRoute = useCallback(async () => {
    try {
      const user = await getUser()

      if (!user) {
        console.log(
          '⚠️ No stored Katbox user found. Using customer Home route.'
        )

        return '/(tabs)/'
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

      return '/(tabs)/'
    } catch (error) {
      console.log('❌ Role route resolution error:', error)

      return '/(tabs)/'
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
   *
   * IMPORTANT:
   *
   * During a login transition, this function is awaited by
   * the auth listener before the transition is considered
   * complete.
   */

  const checkAuth = useCallback(async () => {
    // Every check supersedes any older in-flight check.
    const checkId = ++authCheckIdRef.current

    const isLatestCheck = () =>
      checkId === authCheckIdRef.current

    try {
      const token = await getToken()

      // An older read must never overwrite a newer login/logout result.
      if (!isLatestCheck()) {
        return false
      }

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

        return false
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

        // Do not delete a session if a newer check has started.
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

      /*
       * Valid token.
       */
      console.log('✅ Valid Katbox JWT found.')

      if (!isLatestCheck()) {
        return false
      }

      setIsAuthenticated(true)

      /*
       * Schedule automatic logout exactly when the JWT expires.
       */
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
        // A newer auth check means this timer belongs to an old session.
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
      // Ignore errors from a superseded check.
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
   *
   * Login/logout screens call:
   *
   *     notifyAuthChanged()
   *
   * This causes the layout to immediately re-check the
   * Katbox JWT.
   *
   * IMPORTANT FIX:
   *
   * Before checking the newly-created JWT, we set
   * isAuthenticated back to null.
   *
   * The rendering logic below already treats null as
   * "authentication is being checked" and returns null.
   *
   * Therefore Expo Router does not get a chance to show
   * the login screen during the short authentication window.
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

      /*
       * Mark authentication transition as active.
       */
      loginTransitionRef.current = true

      /*
       * Clear any previous transition timer.
       */
      if (loginTransitionTimerRef.current) {
        clearTimeout(loginTransitionTimerRef.current)
        loginTransitionTimerRef.current = null
      }

      /*
       * IMPORTANT FIX:
       *
       * Keep the current screen mounted while the new KatBox JWT
       * is being checked. login.tsx keeps its loading overlay visible
       * after saveSession(), so leaving isAuthenticated unchanged
       * avoids rendering a blank root layout during this short wait.
       *
       * checkAuth() below will update isAuthenticated to true once
       * it confirms the saved JWT. The navigation guard will then
       * send the user directly to the correct role-based destination.
       */

      try {
        /*
         * Wait until the Katbox JWT has actually been checked.
         */
        await checkAuth()
      } catch (error) {
        console.log(
          '❌ Authentication transition check error:',
          error
        )
      } finally {
        if (isMounted) {
          /*
           * Authentication check has completed.
           *
           * We no longer need the transition guard.
           */
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
    if (fontsLoaded && isAuthenticated !== null && rootNavigationState?.key) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, isAuthenticated, rootNavigationState?.key])

  /*
   * ------------------------------------------------------------
   * ROLE-AWARE EXPO PUSH NOTIFICATIONS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (
      isAuthenticated !== true ||
      !rootNavigationState?.key
    ) {
      return
    }

    let isMounted = true
    let startupCheckCompleted = false
    let subscription: Notifications.Subscription | null = null

    const shouldResolveInitialNavigation =
      !initialNavigationHandledRef.current

    // Claim this one-time startup check before awaiting any asynchronous work.
    if (shouldResolveInitialNavigation) {
      initialNavigationHandledRef.current = true
    }

    const registerPushNotifications = async () => {
      try {
        const isExpoGo = Constants.appOwnership === 'expo'
        if (isExpoGo) return

        const token = await registerForPushNotificationsAsync()

        if (token && isMounted) {
          await api.post('/api/auth/notification-token', {
            token,
            role: 'customer',
          })
        }
      } catch (err) {
        console.log('❌ Customer push registration error:', err)
      }
    }

    /**
     * Returns true only when this response was successfully handled.
     *
     * The response is cleared immediately so an old response cannot be
     * replayed on the next launch if user lookup or navigation fails.
     * The notification identifier is also persisted to protect against
     * Expo returning the same already-consumed response again.
     */
    const handleNotificationResponse = async (
      response: Notifications.NotificationResponse,
      isColdStart = false
    ): Promise<boolean> => {
      try {
        const responseId = response.notification.request.identifier

        await Notifications.clearLastNotificationResponseAsync().catch(
          () => undefined
        )

        if (responseId) {
          const previouslyHandledId = await SecureStore.getItemAsync(
            LAST_HANDLED_NOTIFICATION_RESPONSE_KEY
          )

          if (previouslyHandledId === responseId) {
            console.log(
              'ℹ️ Ignoring an already handled customer notification response.'
            )
            return false
          }
        }

        const data: any =
          response.notification.request.content.data || {}
        const user = await getUser()

        if (!isMounted || !user) return false

        const role = String(data.role || '').toLowerCase()

        if (
          (data?.screen === 'admin-orders' || role === 'admin') &&
          user.isAdmin === true
        ) {
          if (isColdStart) {
            router.replace('/admin/all-orders' as any)
          } else {
            router.push('/admin/all-orders' as any)
          }
        } else {
          // Chef notifications opened in the Customer app fall back to the
          // user's customer order history; Chef operations stay in Chef app.
          if (isColdStart) {
            router.replace('/(tabs)/orders' as any)
          } else {
            router.push('/(tabs)/orders' as any)
          }
        }

        if (responseId) {
          await SecureStore.setItemAsync(
            LAST_HANDLED_NOTIFICATION_RESPONSE_KEY,
            responseId
          ).catch((storageError) => {
            console.log(
              'Customer notification response persistence error:',
              storageError
            )
          })
        }

        return true
      } catch (err) {
        console.log('❌ Notification navigation error:', err)
        return false
      }
    }

    const initializeStartupNavigation = async () => {
      // After the first startup decision, auth changes only need to
      // re-register the live notification listener.
      if (!shouldResolveInitialNavigation) {
        subscription =
          Notifications.addNotificationResponseReceivedListener(
            (response) => {
              void handleNotificationResponse(response, false)
            }
          )

        startupCheckCompleted = true

        if (isMounted) {
          setInitialNavigationResolved(true)
        }

        return
      }

      try {
        let lastResponse: Notifications.NotificationResponse | null = null

        const currentRootSegment = String(segments[0] ?? '')
        const isAuthenticationFlow =
          currentRootSegment === 'login' ||
          currentRootSegment === 'oauth-callback' ||
          currentRootSegment === 'verify'

        if (isAuthenticationFlow) {
          // A response left over from an earlier session must not override
          // the normal post-login destination. Real notification taps that
          // arrive after authentication are still handled by the live
          // notification-response listener below.
          await Notifications.clearLastNotificationResponseAsync().catch(
            () => undefined
          )
          console.log(
            'ℹ️ Ignoring a pending notification response during authentication.'
          )
        } else {
          lastResponse =
            await Notifications.getLastNotificationResponseAsync()
        }

        if (!isMounted) return

        let openedFromNotification = false

        if (lastResponse) {
          openedFromNotification = await handleNotificationResponse(
            lastResponse,
            true
          )

          if (openedFromNotification) {
            startupNotificationRouteRef.current = true
          }
        }

        if (!isMounted) return

        /*
         * A notification tap has priority over the restored navigation
         * state. Otherwise, a cold launch restored inside the customer
         * tabs always starts at Home instead of Orders or Profile.
         *
         * Public routes are left to the existing authentication guard,
         * and admin/screens deep links are not overwritten here.
         */
        if (
          !openedFromNotification &&
          segments[0] === '(tabs)'
        ) {
          router.replace('/(tabs)/' as any)
        }

        // Listen for new notification taps only after the cold-start
        // response has been consumed, avoiding duplicate handling.
        subscription =
          Notifications.addNotificationResponseReceivedListener(
            (response) => {
              void handleNotificationResponse(response, false)
            }
          )

        startupCheckCompleted = true

        if (isMounted) {
          setInitialNavigationResolved(true)
        }
      } catch (err) {
        console.log(
          'Customer notification cold-start error:',
          err
        )

        if (isMounted) {
          // Fail safely to Home for a restored customer tab route.
          if (segments[0] === '(tabs)') {
            router.replace('/(tabs)/' as any)
          }

          setInitialNavigationResolved(true)
        }

        startupCheckCompleted = true
      }
    }

    void registerPushNotifications()

    const pushTokenRefreshSubscription =
      Notifications.addPushTokenListener(() => {
        if (isMounted) {
          void registerPushNotifications()
        }
      })

    void initializeStartupNavigation()

    return () => {
      isMounted = false

      subscription?.remove()
      pushTokenRefreshSubscription.remove()

      // If the effect was interrupted before completing, allow a later
      // authenticated render to retry the startup decision.
      if (!startupCheckCompleted) {
        initialNavigationHandledRef.current = false
      }
    }
  }, [
    router,
    isAuthenticated,
    segments,
    rootNavigationState?.key,
  ])

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
   *   Chef     -> Customer Home (chef management is in the standalone Chef app)
   *   Admin    -> Admin route
   *
   * AND we skip the "logged-out -> /login" rule while a login
   * transition is in-flight.
   *
   * IMPORTANT:
   *
   * When isAuthenticated === null, this effect returns before
   * making any navigation decision.
   *
   * This is what prevents the login flash.
   */

  useEffect(() => {
    // Do not dispatch router.replace until the root Stack is mounted.
    // Returning null before mounting Stack used to let auth redirects race
    // Expo Router's initial route registration.
    if (!rootNavigationState?.key || isAuthenticated === null) {
      return
    }

    // Wait until cold-start notification handling has decided whether to
    // open Orders/Admin or use the normal Home destination.
    if (isAuthenticated && !initialNavigationResolved) {
      return
    }

    const currentSegment = segments[0] as string | undefined

    /*
     * Protected route groups.
     */
    const inTabs = currentSegment === '(tabs)'
    const inScreens = currentSegment === 'screens'
    const inAdmin = currentSegment === 'admin'

    /*
     * Public routes.
     */
    const isPublicRoute =
      currentSegment === undefined ||
      currentSegment === 'index' ||
      currentSegment === 'SlidingScreens' ||
      currentSegment === 'login' ||
      currentSegment === 'verify' ||
      currentSegment === 'oauth-callback'

    if (isAuthenticated && startupNotificationRouteRef.current) {
      if (isPublicRoute) {
        return
      }

      startupNotificationRouteRef.current = false
    }

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
      (currentSegment === undefined || currentSegment === 'index')
    ) {
      console.log('🔒 Unauthenticated entry route. Redirecting to onboarding.')
      router.replace('/SlidingScreens' as any)
      return
    }

    if (
      !isAuthenticated &&
      !loginTransitionRef.current &&
      (inTabs ||
        inScreens ||
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

          router.replace('/(tabs)/' as any)
        })
    }
  }, [
    isAuthenticated,
    segments,
    router,
    getRoleRoute,
    rootNavigationState?.key,
    initialNavigationResolved,
  ])

  /*
   * ------------------------------------------------------------
   * WAIT FOR INITIAL AUTH + FONTS
   * ------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * The root Stack stays mounted during initialization so Expo Router
   * can register routes before the auth guard dispatches navigation.
   * The native splash screen remains visible until auth and fonts are ready.
   */

  /*
   * ------------------------------------------------------------
   * STACK ROUTES
   * ------------------------------------------------------------
   * Keep the root navigator mounted during auth/font initialization.
   * The native splash screen remains visible until both are ready.
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