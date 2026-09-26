import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'

import { getToken, removeToken, getUser, savePushToken } from '@/src/lib/authStorage'
import { subscribeAuth } from '@/src/lib/authEvents'
import { isTokenExpired, getTokenExpiry } from '@/src/lib/jwtUtils'
import api from '@/src/lib/api'
// ✅ NEW: Socket.IO client used to join role-scoped rooms for realtime
//         chef-accept / stepper updates. Never throws if unavailable.
import { socket } from '@/src/lib/socket'

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
   ✅ COLD-START ANDROID CHANNEL BOOTSTRAP
   ─────────────────────────────────────────────────────────────
   The role-scoped channels are normally created by
   `useOrderNotifier` when the admin/chef tab group is first
   mounted. However, if a brand-new admin device receives its
   very first order BEFORE opening the admin tab group, the
   channel would not exist yet — and Android would fall back to
   a silent default channel.

   We proactively create ALL three alarm channels here at
   module load so the very first order is guaranteed to ring
   with the bundled alarm.mp3 sound, even if the user has never
   opened the relevant tab.

   Channel IDs MUST match:
     • lib/orderAlarm.ts     (client constant)
     • server/utils/expoPush.ts  (backend constant)
   ───────────────────────────────────────────────────────────── */
if (Platform.OS === 'android') {
  ;(async () => {
    try {
      const alarmChannels = [
        { id: 'orders-alarm-admin', name: 'Admin Order Alarms' },
        { id: 'orders-alarm-chef', name: 'Chef Order Alarms' },
        { id: 'orders-customer', name: 'Order Updates' },
      ]

      for (const ch of alarmChannels) {
        await Notifications.setNotificationChannelAsync(ch.id, {
          name: ch.name,
          importance:
            ch.id === 'orders-customer'
              ? (Notifications.AndroidImportance?.HIGH ?? 4)
              : (Notifications.AndroidImportance?.MAX ?? 5),
          vibrationPattern: [0, 600, 300, 600, 300],
          sound: ch.id === 'orders-customer' ? 'default' : 'alarm.mp3',
          enableVibrate: true,
          bypassDnd: ch.id !== 'orders-customer',
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

export default function RootLayout() {
  return <InitialLayout />
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
   * When login.tsx / verify/[phone].tsx calls notifyAuthChanged(),
   * the layout's checkAuth() runs asynchronously. During that
   * window, `isAuthenticated` is still `false`. If the user was
   * on a protected route (or navigating to one), the navigation
   * guard below would bounce them back to /login.
   *
   * We suppress BOTH navigation rules (the "logged-out → /login"
   * rule AND the "logged-in → role route" rule) for a short
   * window after an auth-change event to allow checkAuth() to
   * resolve.
   *
   * ✅ INCREASED FROM 1500ms TO 4000ms
   *
   * The old 1.5s window was too short: checkAuth() has to do a
   * SecureStore read for the token + a SecureStore read for the
   * user + (optionally) parse the JWT. On slow Android devices
   * this can easily exceed 1.5s, letting the navigation guard
   * fire and bounce the user back to /login before the JWT is
   * observed. 4s gives plenty of headroom without being
   * noticeable to the user.
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
   * This checks the Katbox JWT issued by our own backend after
   * a successful Twilio OTP verification (POST /auth/verify-otp).
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
   * ✅ ROLE-SCOPED SOCKET ROOM JOIN
   * ------------------------------------------------------------
   *
   * After authentication succeeds, we ask the socket client to
   * join the appropriate realtime rooms:
   *
   *   • userId      → customer's private room (order updates)
   *   • "admins"    → shared admin broadcast room
   *   • "chefs"     → shared chef broadcast room
   *
   * This is what makes chef-accept / stepper-changed events
   * reach the correct devices in real time.
   *
   * Safe to call multiple times; the server ignores duplicates.
   */
  const joinRoleSocketRooms = useCallback(async () => {
    try {
      if (!socket) return

      const user = await getUser()
      const userId = user?.id || user?._id

      if (userId) {
        socket.emit('join', String(userId))
      }

      if (user?.isAdmin) {
        socket.emit('join', 'admins')
      }

      if (user?.isChef) {
        socket.emit('join', 'chefs')
      }

      console.log('🔌 Socket joined rooms for role:', {
        userId,
        isAdmin: !!user?.isAdmin,
        isChef: !!user?.isChef,
      })
    } catch (err) {
      console.log('Socket join rooms error:', err)
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
       *
       * ✅ Extended to 4s to comfortably exceed the typical
       *    SecureStore read latency on cold devices.
       */
      loginTransitionRef.current = true

      if (loginTransitionTimerRef.current) {
        clearTimeout(loginTransitionTimerRef.current)
      }

      loginTransitionTimerRef.current = setTimeout(() => {
        loginTransitionRef.current = false
      }, 4000)

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
   * ✅ ROLE-AWARE SOCKET ROOM JOIN (fires whenever auth flips
   * to authenticated).
   * ------------------------------------------------------------
   */
  useEffect(() => {
    if (isAuthenticated === true) {
      joinRoleSocketRooms()
    }
  }, [isAuthenticated, joinRoleSocketRooms])

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
          // ✅ Persist locally first so checkout.tsx can read it
          //    immediately when creating an order.
          try {
            await savePushToken(token)
          } catch (localErr) {
            console.log(
              '⚠️ Local push token cache write failed:',
              localErr
            )
          }

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
     *
     * Extended for the new lifecycle events:
     *   • chef_accepted_order → customer's Orders tab
     *   • chef_rejected_order → customer's Orders tab
     *   • stepper_updated     → customer's Orders tab
     *   • delivery_status_updated → customer's Orders tab
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
             * ✅ NEW: Customer order lifecycle events all deep-link
             *         to the customer's Orders tab.
             */
            if (data?.screen === 'orders') {
              router.push('/(tabs)/Orders' as any)
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
   *
   * ✅ ALSO skip the "authenticated on a public route ->
   *    role route" redirect during the login transition, so the
   *    user can finish landing on /verify or /(tabs) without
   *    the guard firing mid-flight.
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
      currentSegment === 'verify'

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
     * ✅ SKIP this redirect while a login transition is in-
     *    flight. Otherwise, right after notifyAuthChanged()
     *    fires, isAuthenticated briefly flips to true while the
     *    user is still on /verify — and this guard would try to
     *    yank them to /(tabs)/Home before they've even entered
     *    the OTP.
     */

    if (
      isAuthenticated &&
      isPublicRoute &&
      !loginTransitionRef.current
    ) {
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