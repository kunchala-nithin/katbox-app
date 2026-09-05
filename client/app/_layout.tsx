import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFonts } from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useCallback } from 'react'

import { getToken, removeToken } from '@/src/lib/authStorage'
import { subscribeAuth } from '@/src/lib/authEvents'
import { isTokenExpired, getTokenExpiry } from '@/src/lib/jwtUtils'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  return <InitialLayout />
}

function InitialLayout() {
  const router = useRouter()
  const segments = useSegments()

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  })

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  const checkAuth = useCallback(async () => {
    const token = await getToken()

    if (!token || isTokenExpired(token)) {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current)
        logoutTimerRef.current = null
      }

      await removeToken()
      setIsAuthenticated(false)
      return
    }

    setIsAuthenticated(true)

    const expiry = getTokenExpiry(token)
    if (!expiry) return

    const timeLeft = expiry - Date.now()

    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current)
    }

    logoutTimerRef.current = setTimeout(async () => {
      await removeToken()
      setIsAuthenticated(false)
    }, timeLeft)
  }, [])

  useEffect(() => {
    checkAuth()
    const unsubscribe = subscribeAuth(checkAuth)
    return () => {
      unsubscribe()
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    }
  }, [checkAuth])

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  // ⭐ NAVIGATION GUARD WITH ONBOARDING & SPLASH SAFETY
  useEffect(() => {
    if (isAuthenticated === null) return

    const currentSegment = segments[0]
    const inTabs = currentSegment === '(tabs)'
    const inScreens = currentSegment === 'screens' 
    const inChef = currentSegment === 'chefManagement'
    const isPublicIntro = currentSegment === undefined || currentSegment === 'SlidingScreens' || currentSegment === 'login' || currentSegment === 'verify'

    // If unauthenticated and inside protected areas, send to login
    if (!isAuthenticated && (inTabs || inScreens || inChef)) {
      router.replace('/login')
    }

    // If authenticated and sitting on public intro/auth screens, send to Home
    if (isAuthenticated && isPublicIntro) {
      router.replace('/(tabs)/Home')
    }
  }, [isAuthenticated, segments, router])

  if (!fontsLoaded || isAuthenticated === null) {
    return null
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="SlidingScreens" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="verify/[phone]" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="screens" options={{ headerShown: false }} />
      <Stack.Screen name="chefManagement" options={{ headerShown: false }} />
    </Stack>
  )
}