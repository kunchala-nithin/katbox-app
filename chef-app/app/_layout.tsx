import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Platform, AppState } from 'react-native'
import { io as createSocket } from 'socket.io-client'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { ClerkProvider } from '@clerk/clerk-expo'

import { getToken, removeToken, verifyUserFromBackend } from '@/src/lib/authStorage'
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
      // A font asset failure must not keep the native splash screen visible.
      // Continue with platform fallback fonts for unavailable font assets.
      console.log('⚠️ Font loading failed; continuing with fallback fonts:', fontError)
    }
  }, [fontError])

  /*
   * ------------------------------------------------------------
   * GET ROLE-BASED ROUTE
   * ------------------------------------------------------------
   *
   * We verify the latest KatBox user role through /auth/me.
   * This standalone Chef app allows only MongoDB users whose
   * isChef flag is exactly true to enter Chef screens.
   */

  const getRoleRoute = useCallback(async (): Promise<string | null> => {
    const verification = await verifyUserFromBackend()
    if (verification.status === 'error') {
      console.log('⚠️ Role verification unavailable; keeping the current screen until the backend can be reached.')
      return null
    }
    if (verification.status === 'unauthorized') return '/unauthorized'

    const user = verification.user
    console.log('👤 Verified KatBox user from MongoDB:', {
      id: user.id || user._id,
      name: user.name,
      isChef: user.isChef,
      isAdmin: user.isAdmin,
    })
    return user.isChef === true ? '/chefManagement/add-chefs' : '/unauthorized'
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
   * LIVE CHEF ROLE CHANGES + APP RESUME VERIFICATION
   * ------------------------------------------------------------
   */
  const segmentsRef = useRef(segments)

  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  useEffect(() => {
    let mounted = true
    let socket: ReturnType<typeof createSocket> | null = null
    let appState = AppState.currentState
    let roleCheckId = 0

    const routeForVerifiedRole = (isChef: boolean) => {
      if (!mounted) return
      const currentRoot = segmentsRef.current[0]

      if (isChef) {
        // Do not reset a Chef who is already using another Chef Management screen.
        // Approval while on Unauthorized (or login after a still-valid session) opens Chef home.
        if (currentRoot !== 'chefManagement') {
          router.replace('/chefManagement/add-chefs' as any)
        }
        return
      }

      // Only redirect when the user is actually inside protected Chef screens.
      // A non-Chef already on Unauthorized remains there; logout goes to login.
      if (currentRoot === 'chefManagement') {
        router.replace('/unauthorized' as any)
      } else if (currentRoot !== 'unauthorized' && currentRoot !== 'login') {
        router.replace('/unauthorized' as any)
      }
    }

    const verifyAndRoute = async () => {
      const checkId = ++roleCheckId
      try {
        const token = await getToken()
        if (!mounted || checkId !== roleCheckId || !token) return

        const result = await verifyUserFromBackend()
        if (!mounted || checkId !== roleCheckId || result.status === 'error') return

        if (result.status === 'unauthorized') {
          routeForVerifiedRole(false)
          return
        }

        routeForVerifiedRole(result.user.isChef === true)
      } catch (error) {
        // A network/storage error is not evidence that Chef access was revoked.
        console.log('Role verification failed temporarily:', error)
      }
    }

    const connectRoleSocket = async () => {
      const token = await getToken()
      if (!mounted || !token || !api.defaults.baseURL) return

      socket?.removeAllListeners()
      socket?.disconnect()
      socket = createSocket(api.defaults.baseURL, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
      })

      socket.on('connect', () => { void verifyAndRoute() })
      socket.on('chef-access-changed', (payload: { isChef?: boolean }) => {
        if (!mounted || typeof payload?.isChef !== 'boolean') return
        // Re-fetch MongoDB's authoritative role rather than trusting event payload alone.
        void verifyAndRoute()
      })
      socket.on('connect_error', (error) =>
        console.log('Role socket connection error:', error?.message || error)
      )
    }

    void connectRoleSocket()

    const unsubscribeAuth = subscribeAuth(() => {
      // On logout the token is already cleared before this event; do not route to Unauthorized.
      socket?.removeAllListeners()
      socket?.disconnect()
      socket = null
      void connectRoleSocket()
    })

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.match(/inactive|background/) && nextState === 'active') {
        void verifyAndRoute()
      }
      appState = nextState
    })

    return () => {
      mounted = false
      roleCheckId += 1
      subscription.remove()
      unsubscribeAuth()
      socket?.removeAllListeners()
      socket?.disconnect()
    }
  }, [router])

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

            const verification = await verifyUserFromBackend()
            if (verification.status === 'error') return
            if (verification.status !== 'verified' || verification.user.isChef !== true) {
              router.replace('/unauthorized' as any)
              return
            }

            // This is a standalone Chef app. Only a backend-verified
            // Chef may open the Chef order destination from a notification.
            if (data?.screen === 'chef-orders' || data?.screen === undefined) {
              router.push('/chefManagement/all-orders' as any)
              return
            }
            router.replace('/chefManagement/add-chefs' as any)
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
      currentSegment === 'index' ||
      currentSegment === 'login' ||
      currentSegment === 'verify' ||
      currentSegment === 'oauth-callback'

    // Expo Router can initially report an empty segment array.
    // Treat both an undefined segment and the index route as the app entry point.
    // This is essential because app/index.tsx intentionally renders null.
    if (
      !isAuthenticated &&
      (currentSegment === undefined || currentSegment === 'index')
    ) {
      console.log('🔒 Unauthenticated entry route. Redirecting to login.')
      router.replace('/login' as any)
      return
    }

    // Chef app: a valid KatBox JWT is not sufficient; the MongoDB user
    // must also have isChef === true before Chef routes can be opened.
    if (isAuthenticated && inChef) {
      let isActive = true

      verifyUserFromBackend()
        .then((result) => {
          if (!isActive) return
          if (result.status === 'unauthorized' || (result.status === 'verified' && result.user.isChef !== true)) {
            console.log('🚫 Chef route blocked by the latest MongoDB role.')
            router.replace('/unauthorized' as any)
          } else if (result.status === 'error') {
            console.log('⚠️ Chef role check unavailable; waiting for a successful retry.')
          }
        })

      return () => {
        isActive = false
      }
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
          if (!route) return
          console.log('🚀 Authenticated user role route:', route)
          router.replace(route as any)
        })
        .catch((error) => {
          console.log(
            '❌ Failed to resolve authenticated route:',
            error
          )

          // A transient verification error must not be interpreted as
          // a role denial. A foreground/reconnect check will retry.
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
   *
   * IMPORTANT:
   *
   * null means:
   *
   *   "Authentication is currently being checked."
   *
   * We intentionally render nothing here so the login screen
   * cannot appear during a successful login transition.
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