import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'

/**
 * Deep-link landing page for Clerk OAuth.
 *
 * The WebBrowser flow in login.tsx intercepts the redirect
 * before this screen is normally shown, but Expo Router
 * requires the route to exist so it can register the scheme.
 *
 * This screen is intentionally minimal — no UI, no logic,
 * just a spinner in case the user momentarily lands here.
 */
export default function OAuthCallback() {
  useEffect(() => {
    // no-op — Clerk's WebBrowser handles the session.
  }, [])

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FAF8F5',
      }}
    >
      <ActivityIndicator size="large" color="#166538" />
    </View>
  )
}