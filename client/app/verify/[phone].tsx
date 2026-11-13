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
const RESEND_TIME = 30

const Page = () => {
  const router = useRouter()

  const { phone, name, mode, challengeToken } = useLocalSearchParams<{
    phone: string
    name?: string
    mode?: string
    challengeToken?: string
  }>()

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(RESEND_TIME)

  // Prevent duplicate verification requests when React renders more than once
  // while the six-digit code is present.
  const verificationInProgress = useRef(false)

  const ref = useBlurOnFulfill({
    value: code,
    cellCount: CELL_COUNT,
  })

  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value: code,
    setValue: setCode,
  })

  const verifyOtp = async () => {
    if (
      code.length !== CELL_COUNT ||
      verificationInProgress.current
    ) {
      return
    }

    verificationInProgress.current = true

    try {
      setLoading(true)

      const isGoogleLink = mode === 'google'

      if (isGoogleLink && !challengeToken) {
        throw new Error('Google verification session is missing. Please start again.')
      }

      const res = isGoogleLink
        ? await api.post('/auth/verify-google-otp', {
            challengeToken: String(challengeToken),
            otp: code,
          })
        : await api.post('/auth/verify-otp', {
            phone,
            otp: code,
            name: name ? String(name).trim() : undefined,
          })

      if (!res?.data?.token || !res?.data?.user) {
        throw new Error('The server returned an invalid login response.')
      }

      await saveSession(res.data.token, res.data.user)

      // The root layout listens for this event and selects the correct
      // destination based on the MongoDB role (admin or customer home).
      notifyAuthChanged()
    } catch (error: any) {
      Alert.alert(
        'Verification Failed',
        error?.response?.data?.message ||
          error?.message ||
          'Invalid OTP. Please try again.'
      )

      setCode('')
    } finally {
      setLoading(false)
      verificationInProgress.current = false
    }
  }

  useEffect(() => {
    if (code.length === CELL_COUNT) {
      void verifyOtp()
    }
  }, [code])

  useEffect(() => {
    if (resendTimer === 0) return

    const interval = setInterval(
      () => setResendTimer(t => Math.max(0, t - 1)),
      1000
    )

    return () => clearInterval(interval)
  }, [resendTimer])

  const resendOtp = async () => {
    if (loading || resendTimer > 0) return

    try {
      setLoading(true)

      await api.post('/auth/send-otp', {
        phone,
        name: name ? String(name).trim() : undefined,
      })

      setCode('')
      setResendTimer(RESEND_TIME)

      Alert.alert('OTP Sent', 'A new verification code has been sent.')
    } catch (error: any) {
      const retryAfter = Number(
        error?.response?.data?.retryAfterSeconds
      )

      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setResendTimer(retryAfter)
      }

      Alert.alert(
        'Resend Blocked',
        error?.response?.data?.message ||
          'Too many requests. Please wait before trying again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/login')
    }
  }

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
          disabled={loading}
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
          onChangeText={value => {
            if (!loading) {
              setCode(value.replace(/\D/g, '').slice(0, CELL_COUNT))
            }
          }}
          cellCount={CELL_COUNT}
          keyboardType="number-pad"
          editable={!loading}
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
              disabled={loading}
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
