import Colors from '@/constants/Colors'
import { api } from '@/src/lib/api'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MaskInput from 'react-native-mask-input'
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const INDIA_PHONE_MASK = [
  /\d/, /\d/, /\d/, /\d/, /\d/,
  /\d/, /\d/, /\d/, /\d/, /\d/,
]

const Login = () => {
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState('')

  const router = useRouter()
  const { bottom } = useSafeAreaInsets()

  const nameRef = useRef<TextInput>(null)
  const phoneRef = useRef<TextInput>(null)

  /*
   * ✅ Guards against double-tap / double-submission while an
   *    OTP request is already in-flight. This is critical because
   *    a second request would:
   *      • trigger a second SMS
   *      • hit Twilio's per-number rate limit
   *      • still take the full round-trip time
   */
  const submittingRef = useRef(false)

  /*
   * Premium button scale animation value
   */
  const buttonScale = useSharedValue(1)

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }))

  /*
   * ============================================================
   * AUTO FOCUS NAME FIRST
   * ============================================================
   */

  useEffect(() => {
    const timer = setTimeout(() => {
      nameRef.current?.focus()
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  /*
   * ============================================================
   * SEND OTP VIA TWILIO
   * ============================================================
   *
   * Validates the entered name + 10-digit mobile number, then
   * asks the Katbox backend to trigger a Twilio Verify OTP to
   * the given number.
   *
   * On success, we navigate to the /verify/[phone] screen where
   * the user enters the 6-digit code. The verify screen is the
   * one that actually calls /auth/verify-otp, saves the session,
   * and notifies the root layout.
   * ============================================================
   */

  const sendOTP = async () => {
    /*
     * ✅ Guard against concurrent submissions.
     */
    if (submittingRef.current || loading) {
      console.log('⏳ sendOTP ignored — request already in-flight')
      return
    }

    if (!name.trim()) {
      setNameError('Please enter your name')
      nameRef.current?.focus()
      return
    }

    if (phoneNumber.length !== 10) {
      alert('Please enter a valid 10-digit mobile number')
      phoneRef.current?.focus()
      return
    }

    /*
     * ✅ Build the E.164 phone string exactly ONCE.
     *
     * The backend's `normalizeIndianPhone()` accepts:
     *   • "9133450555"       (10-digit bare)
     *   • "+919133450555"    (E.164)
     *   • "919133450555"     (12-digit with country code)
     *
     * We send the E.164 form so the verify screen's path param
     * and the backend's stored `phone` field are byte-identical.
     */
    const e164Phone = `+91${phoneNumber}`

    try {
      submittingRef.current = true
      setLoading(true)

      console.log('📱 Sending OTP request for:', e164Phone)

      const response = await api.post('/auth/send-otp', {
        phone: e164Phone,
        name: name.trim(),
      })

      console.log('✅ /auth/send-otp response:', response?.data)

      setLoading(false)
      submittingRef.current = false

      /*
       * ✅ URL-encode the phone so the "+" does not get mangled
       *    when Expo Router builds the path.
       */
      const encodedPhone = encodeURIComponent(e164Phone)

      router.push({
        pathname: `/verify/${encodedPhone}` as any,
        params: {
          name: name.trim(),
          phone: e164Phone,
        },
      })
    } catch (error: any) {
      setLoading(false)
      submittingRef.current = false

      /*
       * ✅ Surface the FULL error to Metro so we can see what the
       *    backend actually returned. This is the single most
       *    important part for debugging the OTP problem.
       */
      console.error(
        '❌ /auth/send-otp failed:',
        {
          message: error?.message,
          status: error?.response?.status,
          data: error?.response?.data,
          code: error?.code,
        }
      )

      /*
       * ✅ Pick the most specific message available:
       *      1. Backend-provided message ("Invalid mobile number",
       *         "SMS service configuration error", etc.)
       *      2. Axios-level message (network errors)
       *      3. Generic fallback
       */
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
        'Failed to send OTP. Please try again.'

      alert(finalMessage)
    }
  }

  /*
   * ============================================================
   * BUTTON ENABLED ONLY WHEN NAME + MOBILE ARE VALID
   * ============================================================
   */

  const isEnabled =
    phoneNumber.length === 10 &&
    name.trim().length > 0

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={
        Platform.OS === 'ios' ? 0 : 0
      }
      style={styles.keyboardView}
    >
      <ImageBackground
        source={require('@/assets/images/login.png')}
        style={styles.backgroundImage}
        imageStyle={styles.backgroundImageStyle}
        resizeMode="cover"
      >
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator
              size="large"
              color={Colors.primary}
            />

            <Text style={styles.loadingText}>
              Sending OTP...
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={
            styles.scrollContainer
          }
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* ANIMATED UNIFIED CARD CONTAINER COVERING TILL SCREEN END */}

          <Animated.View
            entering={FadeInDown
              .duration(700)
              .springify()
              .damping(15)}
            style={[
              styles.cardContainer,
              {
                paddingBottom: Math.max(
                  bottom + 10,
                  28
                ),
              },
            ]}
          >
            {/* HEADER BRANDING */}

            <Animated.View
              entering={FadeInUp
                .delay(200)
                .duration(500)}
              style={styles.brandHeader}
            >
              <View style={styles.badgeCircle}>
                <Ionicons
                  name="restaurant"
                  size={24}
                  color="#38512F"
                />
              </View>

              <Text style={styles.brandTitle}>
                Welcome to Katbox
              </Text>

              <Text style={styles.brandSubtitle}>
                Login to continue your delicious journey
              </Text>
            </Animated.View>

            {/* NAME CARD */}

            <Animated.View
              entering={FadeInUp
                .delay(300)
                .duration(500)}
              style={styles.inputCard}
            >
              <View style={styles.iconBox}>
                <Ionicons
                  name="person-outline"
                  size={16}
                  color="#555"
                />
              </View>

              <View style={styles.inputInnerRow}>
                <Text style={styles.inputLabel}>
                  Username (Mandatory)
                </Text>

                <TextInput
                  ref={nameRef}
                  value={name}
                  placeholder="Enter your username"
                  placeholderTextColor="#999"
                  style={styles.input}
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() =>
                    phoneRef.current?.focus()
                  }
                  onChangeText={(text) => {
                    const cleaned =
                      text.replace(
                        /[^a-zA-Z\s]/g,
                        ''
                      )

                    setName(cleaned)

                    if (cleaned.trim()) {
                      setNameError('')
                    } else {
                      setNameError(
                        'Name cannot be empty'
                      )
                    }
                  }}
                />
              </View>
            </Animated.View>

            {/* ERROR MESSAGE */}

            {nameError ? (
              <Text style={styles.error}>
                {nameError}
              </Text>
            ) : null}

            {/* PHONE CARD */}

            <Animated.View
              entering={FadeInUp
                .delay(400)
                .duration(500)}
              style={styles.inputCard}
            >
              <View style={styles.iconBox}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={16}
                  color="#555"
                />
              </View>

              <View style={styles.inputInnerRow}>
                <Text style={styles.inputLabel}>
                  Mobile Number (Mandatory)
                </Text>

                <View style={styles.phoneInputRow}>
                  <MaskInput
                    ref={phoneRef}
                    value={phoneNumber}
                    mask={INDIA_PHONE_MASK}
                    keyboardType="phone-pad"
                    style={styles.input}
                    placeholder="Enter your 10-digit mobile number"
                    placeholderTextColor="#999"
                    editable={!loading}
                    onChangeText={(
                      _,
                      unmasked
                    ) => {
                      setPhoneNumber(unmasked)
                    }}
                  />

                  <View style={styles.countryPicker}>
                    <Text style={styles.code}>
                      +91
                    </Text>

                    <Ionicons
                      name="chevron-down"
                      size={12}
                      color="#555"
                    />
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* LOGIN VIA OTP BUTTON (Twilio)
                Disabled until Name & Mobile are filled */}

            <Animated.View
              entering={FadeInUp
                .delay(500)
                .duration(500)}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.button,
                  isEnabled &&
                    styles.buttonEnabled,
                ]}
                disabled={
                  !isEnabled ||
                  loading
                }
                onPressIn={() => {
                  buttonScale.value =
                    withSpring(0.96)
                }}
                onPressOut={() => {
                  buttonScale.value =
                    withSpring(1)
                }}
                onPress={sendOTP}
              >
                <Animated.View
                  style={[
                    styles.buttonInner,
                    animatedButtonStyle,
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color="#fff"
                    style={{
                      marginRight: 8,
                    }}
                  />

                  <Text
                    style={styles.buttonText}
                  >
                    Login via OTP
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color="#fff"
                    style={
                      styles.buttonIcon
                    }
                  />
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

            {/* INFO TEXT BANNER */}

            <Animated.View
              entering={FadeInUp
                .delay(550)
                .duration(500)}
              style={styles.infoContainer}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color="#666"
                style={styles.infoIcon}
              />

              <Text style={styles.infoText}>
                Secure authentication powered by
                Twilio SMS. Your details remain
                completely private and safe.
              </Text>
            </Animated.View>

            {/* FOOTER BADGES HIGHLIGHTS */}

            <Animated.View
              entering={FadeInUp
                .delay(700)
                .duration(500)}
              style={styles.featuresRow}
            >
              <View style={styles.featureItem}>
                <View
                  style={
                    styles.featureBadge
                  }
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color="#38512F"
                  />
                </View>

                <Text
                  style={
                    styles.featureTitle
                  }
                >
                  100% Hygienic
                </Text>

                <Text
                  style={
                    styles.featureSub
                  }
                >
                  Fresh & Safe
                </Text>
              </View>

              <View
                style={
                  styles.featureDivider
                }
              />

              <View style={styles.featureItem}>
                <View
                  style={
                    styles.featureBadge
                  }
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={14}
                    color="#38512F"
                  />
                </View>

                <Text
                  style={
                    styles.featureTitle
                  }
                >
                  Homemade
                </Text>

                <Text
                  style={
                    styles.featureSub
                  }
                >
                  With Love
                </Text>
              </View>

              <View
                style={
                  styles.featureDivider
                }
              />

              <View style={styles.featureItem}>
                <View
                  style={
                    styles.featureBadge
                  }
                >
                  <Ionicons
                    name="leaf-outline"
                    size={14}
                    color="#38512F"
                  />
                </View>

                <Text
                  style={
                    styles.featureTitle
                  }
                >
                  Quality
                </Text>

                <Text
                  style={
                    styles.featureSub
                  }
                >
                  Always Fresh
                </Text>
              </View>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </ImageBackground>
    </KeyboardAvoidingView>
  )
}

export default Login

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },

  backgroundImageStyle: {
    width: '100%',
    height: '100%',
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },

  cardContainer: {
    backgroundColor:
      'rgba(255, 255, 255, 0.98)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 22,
    paddingTop: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    width: '100%',
    marginBottom: 0,
  },

  brandHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },

  badgeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FAF7F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
    shadowColor: '#38512F',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C3E2D',
    textAlign: 'center',
    marginBottom: 4,
    fontFamily:
      Platform.OS === 'ios'
        ? 'Georgia'
        : 'serif',
  },

  brandSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },

  inputCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    backgroundColor: '#FAF8F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },

  error: {
    color: '#E23744',
    marginBottom: 6,
    marginLeft: 4,
    fontSize: 10,
  },

  iconBox: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  inputInnerRow: {
    flex: 1,
  },

  inputLabel: {
    fontSize: 10,
    color: '#777',
    marginBottom: 2,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },

  code: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
    color: '#333',
  },

  input: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    padding: 0,
  },

  /*
   * ==========================================================
   * PREVIOUS GOOGLE EMAIL (kept for style-preservation only)
   * ==========================================================
   */

  rememberedEmailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F8F2',
    borderWidth: 1,
    borderColor: '#E1E8DC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },

  rememberedEmailIcon: {
    marginRight: 8,
  },

  rememberedEmailArrow: {
    marginLeft: 8,
  },

  rememberedEmailContent: {
    flex: 1,
  },

  rememberedEmailLabel: {
    fontSize: 9,
    color: '#777',
    marginBottom: 2,
    fontWeight: '600',
  },

  rememberedEmailText: {
    fontSize: 11,
    color: '#2C402E',
    fontWeight: '600',
  },

  /*
   * ==========================================================
   * LOGIN BUTTON
   * ==========================================================
   */

  button: {
    backgroundColor: '#2C402E',
    borderRadius: 12,
    opacity: 0.5,
    marginTop: 4,
    marginBottom: 12,
    shadowColor: '#2C402E',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },

  buttonEnabled: {
    opacity: 1,
  },

  buttonInner: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },

  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 6,
  },

  buttonIcon: {
    marginLeft: 2,
  },

  /*
   * ==========================================================
   * INFO
   * ==========================================================
   */

  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 16,
  },

  infoIcon: {
    marginRight: 6,
  },

  infoText: {
    flex: 1,
    fontSize: 11,
    color: '#777',
    lineHeight: 15,
    textAlign: 'center',
  },

  /*
   * ==========================================================
   * FOOTER
   * ==========================================================
   */

  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0EFEF',
    paddingTop: 12,
  },

  featureItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },

  featureBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FAF7F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },

  featureTitle: {
    fontSize: 9,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },

  featureSub: {
    fontSize: 8,
    color: '#777',
    textAlign: 'center',
  },

  featureDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#EEEEEE',
  },

  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffffcc',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#2C402E',
    fontWeight: '600',
  },
})