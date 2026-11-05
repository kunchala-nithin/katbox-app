import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/clerk-expo';
import { removeToken } from '@/src/lib/authStorage';
import { notifyAuthChanged } from '@/src/lib/authEvents';

export default function UnauthorizedScreen() {
  const router = useRouter();
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try { await removeToken(); } catch (e) { console.log('Local session clear failed:', e); }
    try { await clerk.signOut(); } catch (e) { console.log('Clerk sign-out failed:', e); }
    notifyAuthChanged();
    router.replace('/login' as any);
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chef access required</Text>
      <Text style={styles.message}>This app is only available to approved KatBox Chef accounts. Your account does not currently have Chef access.</Text>
      <TouchableOpacity style={styles.button} onPress={leave} disabled={busy}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign out</Text>}
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7FAF8' },
  title: { fontSize: 23, fontWeight: '800', color: '#073B1E', marginBottom: 12 },
  message: { fontSize: 15, lineHeight: 23, textAlign: 'center', color: '#475569', marginBottom: 24 },
  button: { minWidth: 150, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#166348', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
