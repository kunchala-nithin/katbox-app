import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'
import { ClerkProvider } from '@clerk/clerk-expo'

import { getToken, removeToken, getUser } from '@/src/lib/authStorage'
import { subscribeAuth } from '@/src/lib/authEvents'
import { isTokenExpired, getTokenExpiry } from '@/src/lib/jwtUtils'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()


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
   * the normal cold-start screen.
   */
  const initialNavigationHandledRef = useRef(false)
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
   * NORMAL COLD-START NAVIGATION
   * ------------------------------------------------------------
   *
   * Resolve the user's role-based starting destination once after
   * authentication and the root navigator are ready. Notification
   * tap routing has been removed with the old notification system.
   */

  useEffect(() => {
    if (
      isAuthenticated !== true ||
      !rootNavigationState?.key ||
      !segments.length ||
      initialNavigationHandledRef.current
    ) {
      return
    }

    let isMounted = true
    initialNavigationHandledRef.current = true

    const resolveInitialNavigation = async () => {
      try {
        const initialRoute = await getRoleRoute()

        if (!isMounted) return

        console.log(
          '🚀 Normal cold launch. Opening role-based start route:',
          initialRoute
        )

        router.replace(initialRoute as any)
      } catch (error) {
        if (!isMounted) return

        console.log('❌ Initial navigation resolution error:', error)
        router.replace('/(tabs)/Home' as any)
      } finally {
        if (isMounted) {
          setInitialNavigationResolved(true)
        }
      }
    }

    void resolveInitialNavigation()

    return () => {
      isMounted = false
    }
  }, [
    router,
    isAuthenticated,
    rootNavigationState?.key,
    segments[0],
    getRoleRoute,
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

    // Wait until normal cold-start role navigation has been resolved.
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

          router.replace('/(tabs)/Home' as any)
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
