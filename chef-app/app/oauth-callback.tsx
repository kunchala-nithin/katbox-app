import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

export default function OAuthCallback() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#166348" />
      <Text style={styles.text}>Completing secure sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  text: { marginTop: 14, color: '#166348', fontSize: 14, fontWeight: '600' },
});
