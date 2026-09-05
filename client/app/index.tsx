import { router } from 'expo-router'
import { useEffect } from 'react'
import { Image, StatusBar, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getToken } from '@/src/lib/authStorage'
import { isTokenExpired } from '@/src/lib/jwtUtils'

export default function Splash() {
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const token = await getToken()
        if (token && !isTokenExpired(token)) {
          router.replace('/(tabs)/Home')
        } else {
          router.replace('/SlidingScreens')
        }
      } catch {
        router.replace('/SlidingScreens')
      }
    }, 2500)

    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <StatusBar
        translucent
        backgroundColor="#0F382A"
        barStyle="light-content"
      />

      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.container}>
          <Image
            source={require('../assets/images/splash.png')}
            resizeMode="contain"
            style={styles.image}
          />
        </View>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F382A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F382A',
  },
  image: {
    width: '100%',
    height: '100%',
  },
})