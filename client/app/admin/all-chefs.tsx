import { View, Text, StyleSheet } from 'react-native'
import React from 'react'

export default function AllChefsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Admin - All Chefs</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111813' },
  text: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }
})