
import { Image, StyleSheet, View } from 'react-native'

export default function Index() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/splash.png')}
        resizeMode="cover"
        style={styles.image}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#082a18',
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
