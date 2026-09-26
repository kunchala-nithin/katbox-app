import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import {
  CodeField,
  Cursor,
  useBlurOnFulfill,
  useClearByFocusCell,
} from 'react-native-confirmation-code-field'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '@/src/lib/api'
import { saveSession } from '@/src/lib/authStorage'
import { notifyAuthChanged } from '@/src/lib/authEvents'

const CELL_COUNT = 6
const RESEND_TIME = 15

const Page = () => {
  const router = useRouter()

  const params = useLocalSearchParams<{
    phone: string
    name?: string
  }>()

  /*
   * ============================================================
   * ✅ NORMALIZE THE PHONE PARAM
   * ============================================================
   *
   * Depending on how the route was pushed (and whether the "+"
   * was URL-encoded), `params.phone` may arrive as:
   *
   *   "+919133450555"
   *   "%2B919133450555"   (still URL-encoded)
   *   "919133450555"
   *   "9133450555"
   *
   * We normalize everything into canonical E.164 (+91XXXXXXXXXX)
   * so the backend's `normalizeIndianPhone()` accepts it and the
   * OTP we send matches the number we verify against.
   * ============================================================
   */

  const rawPhone =
    typeof params.phone === 'string'
      ? params.phone
      : Array.isArray(params.phone)
      ? params.phone[0]
      : ''

  const decodedPhone = (() => {
    try {
      // In case the param is still URL-encoded
      return decodeURIComponent(rawPhone)
    } catch {
      return rawPhone
    }
  })()

  const phone = (() => {
    const digitsOnly = decodedPhone.replace(/\D/g, '')

    // 10 digits → bare Indian number
    if (digitsOnly.length === 10) {
      return `+91${digitsOnly}`
    }

    // 12 digits starting with 91 → +91XXXXXXXXXX
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return `+${digitsOnly}`
    }

    // Already has a country code and the right length
    if (decodedPhone.startsWith('+')) {
      return decodedPhone
    }

    // Fallback: prefix with +91
    return `+91${digitsOnly}`
  })()

  /*
   * Name passed from login.tsx via params. Used on verify so the
   * backend can create/update the user with the correct display
   * name instead of the "User" default.
   */
  const name =
    typeof params.name === 'string'
      ? params.name
      : Array.isArray(params.name)
      ? params.name[0]
      : undefined

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(RESEND_TIME)

  /*
   * ✅ Prevent duplicate verify calls.
   *
   * The `useEffect` below fires when `code.length === 6`, but
   * on some devices with fast typing this can fire twice before
   * `setLoading(true)` has rendered.
   */
  const verifyingRef = useRef(false)

  /*
   * ✅ Prevent duplicate resend taps.
   */
  const resendingRef = useRef(false)

  const ref = useBlurOnFulfill({
    value: code,
    cellCount: CELL_COUNT,
  })

  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value: code,
    setValue: setCode,
  })

  /*
   * ============================================================
   * AUTO-VERIFY WHEN 6 DIGITS ARE ENTERED
   * ============================================================
   */

  useEffect(() => {
    if (code.length === 6) {
      verifyOtp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  /*
   * ============================================================
   * RESEND COUNTDOWN
   * ============================================================
   */

  useEffect(() => {
    if (resendTimer === 0) return

    const interval = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(interval)
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [resendTimer])

  /*
   * ============================================================
   * VERIFY OTP
   * ============================================================
   */

  const verifyOtp = async () => {
    if (verifyingRef.current || loading) {
      console.log('⏳ verifyOtp ignored — already verifying')
      return
    }

    if (!phone) {
      Alert.alert(
        'Missing Phone Number',
        'Please go back and enter your mobile number again.'
      )
      return
    }

    try {
      verifyingRef.current = true
      setLoading(true)

      console.log('🔐 Verifying OTP for:', phone)

      const res = await api.post('/auth/verify-otp', {
        phone,
        otp: code,
        name: name ? String(name).trim() : undefined,
      })

      console.log('✅ /auth/verify-otp response:', res?.data)

      /*
       * Save the JWT + user into SecureStore.
       */
      await saveSession(res.data.token, res.data.user)

      /*
       * Notify the root layout so it re-checks auth and
       * navigates to the correct role-scoped route.
       */
      notifyAuthChanged()

      /*
       * Explicit navigation to the customer Home tab.
       *
       * NOTE: The root layout's role-aware guard will ALSO
       * redirect admin/chef users away from Home to their
       * role screens, so this line is safe for all roles.
       */
      router.replace('/(tabs)/Home' as any)
    } catch (error: any) {
      console.error('❌ /auth/verify-otp failed:', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
        code: error?.code,
      })

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error

      const networkMessage =
        error?.code === 'ECONNABORTED'
          ? 'Request timed out. Please check your internet connection.'
          : error?.message === 'Network Error'
          ? 'Cannot reach the server. Please check your internet connection.'
          : null

      const finalMessage =
        backendMessage ||
        networkMessage ||
        'Invalid OTP. Please try again.'

      Alert.alert('Verification Failed', finalMessage)

      /*
       * Clear the code so the user can retry.
       */
      setCode('')
    } finally {
      setLoading(false)
      verifyingRef.current = false
    }
  }

  /*
   * ============================================================
   * RESEND OTP
   * ============================================================
   */

  const resendOtp = async () => {
    if (resendingRef.current || loading) {
      console.log('⏳ resendOtp ignored — already sending')
      return
    }

    if (!phone) {
      Alert.alert(
        'Missing Phone Number',
        'Please go back and enter your mobile number again.'
      )
      return
    }

    try {
      resendingRef.current = true
      setLoading(true)

      console.log('📱 Resending OTP for:', phone)

      await api.post('/auth/send-otp', {
        phone,
        name: name ? String(name).trim() : undefined,
      })

      setResendTimer(RESEND_TIME)

      Alert.alert('OTP Sent', 'A new OTP has been sent to your mobile.')
    } catch (error: any) {
      console.error('❌ Resend OTP failed:', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
        code: error?.code,
      })

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error

      const networkMessage =
        error?.code === 'ECONNABORTED'
          ? 'Request timed out. Please check your internet connection.'
          : error?.message === 'Network Error'
          ? 'Cannot reach the server. Please check your internet connection.'
          : null

      const finalMessage =
        backendMessage ||
        networkMessage ||
        'Unable to resend OTP. Please try again.'

      Alert.alert('Resend Failed', finalMessage)
    } finally {
      setLoading(false)
      resendingRef.current = false
    }
  }

  /*
   * ============================================================
   * BACK BUTTON
   * ============================================================
   */

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/login')
    }
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#072C0D" />
          <Text style={styles.loadingText}>Please wait…</Text>
        </View>
      )}

      {/* Header with Chevron Back */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{
            top: 10,
            bottom: 10,
            left: 10,
            right: 10,
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color="#072C0D"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="shield-checkmark-outline"
            size={32}
            color="#072C0D"
          />
        </View>

        <Text style={styles.titleText}>
          Verification Code
        </Text>

        <Text style={styles.infoText}>
          We sent a verification code to
        </Text>

        <Text style={styles.phoneText}>
          {phone}
        </Text>

        <CodeField
          ref={ref}
          {...props}
          value={code}
          onChangeText={setCode}
          cellCount={CELL_COUNT}
          keyboardType="number-pad"
          renderCell={({ index, symbol, isFocused }) => (
            <View
              key={index}
              style={[
                styles.cell,
                symbol ? styles.filledCell : null,
                isFocused && styles.focusCell,
              ]}
              onLayout={getCellOnLayoutHandler(index)}
            >
              <Text style={styles.cellText}>
                {symbol ||
                  (isFocused ? <Cursor /> : null)}
              </Text>
            </View>
          )}
        />

        <View style={styles.resendContainer}>
          {resendTimer > 0 ? (
            <Text style={styles.timerText}>
              Resend code in{' '}
              <Text style={styles.timerHighlight}>
                {resendTimer}s
              </Text>
            </Text>
          ) : (
            <TouchableOpacity
              onPress={resendOtp}
              activeOpacity={0.75}
            >
              <Text style={styles.resendText}>
                Resend OTP
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

export default Page

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(7, 44, 13, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#072C0D',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
  },

  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(7, 44, 13, 0.08)',
    borderWidth: 1.5,
    borderColor: '#072C0D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  titleText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#072C0D',
    letterSpacing: 0.3,
    marginBottom: 6,
  },

  infoText: {
    fontSize: 14.5,
    color: 'rgba(7, 44, 13, 0.65)',
    fontWeight: '500',
  },

  phoneText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#072C0D',
    marginBottom: 36,
    marginTop: 2,
    letterSpacing: 0.4,
  },

  cell: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(7, 44, 13, 0.18)',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
    shadowColor: '#072C0D',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },

  filledCell: {
    borderColor: 'rgba(7, 44, 13, 0.45)',
    backgroundColor: '#FFFFFF',
  },

  focusCell: {
    borderColor: '#072C0D',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#072C0D',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },

  cellText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#072C0D',
  },

  resendContainer: {
    marginTop: 32,
  },

  timerText: {
    color: 'rgba(7, 44, 13, 0.55)',
    fontSize: 14,
    fontWeight: '500',
  },

  timerHighlight: {
    color: '#072C0D',
    fontWeight: '700',
  },

  resendText: {
    color: '#072C0D',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },

  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 248, 245, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  loadingText: {
    marginTop: 12,
    color: '#072C0D',
    fontSize: 14.5,
    fontWeight: '600',
  },
})