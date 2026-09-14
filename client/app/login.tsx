import Colors from '@/constants/Colors'
import { api } from '@/src/lib/api'
import { Ionicons } from '@expo/vector-icons'
import { useOAuth, useClerk } from '@clerk/clerk-expo'
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
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import {
  getLastUsedEmail,
  saveSession,
} from '@/src/lib/authStorage'
import { notifyAuthChanged } from '@/src/lib/authEvents'

WebBrowser.maybeCompleteAuthSession()

const INDIA_PHONE_MASK = [
  /\d/, /\d/, /\d/, /\d/, /\d/,
  /\d/, /\d/, /\d/, /\d/, /\d/,
]

const Login = () => {
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState('')

  /*
   * Previously used Google email.
   */
  const [lastUsedEmail, setLastUsedEmail] = useState('')

  const router = useRouter()
  const { bottom } = useSafeAreaInsets()

  const nameRef = useRef<TextInput>(null)
  const phoneRef = useRef<TextInput>(null)

  /*
   * ==========================================================
   * CLERK GOOGLE OAUTH
   * ==========================================================
   */

  const { startOAuthFlow } = useOAuth({
    strategy: 'oauth_google',
  })

  /*
   * We use the Clerk instance directly.
   *
   * This gives us:
   *
   *     clerk.user
   *
   * after the OAuth session has been activated.
   *
   * It also gives us:
   *
   *     signOut()
   *
   * which is used when the Katbox backend rejects the login.
   */

  const clerk = useClerk()

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
   * LOAD PREVIOUS GOOGLE EMAIL FOR THIS MOBILE NUMBER
   * ============================================================
   */

  const loadRememberedEmail = async (phone: string) => {
    try {
      if (phone.length !== 10) {
        setLastUsedEmail('')
        return
      }

      const email = await getLastUsedEmail(`+91${phone}`)
      setLastUsedEmail(email || '')
    } catch (error) {
      console.log('Could not load remembered Google email:', error)
      setLastUsedEmail('')
    }
  }

  useEffect(() => {
    void loadRememberedEmail(phoneNumber)
  }, [phoneNumber])

  /*
   * ============================================================
   * TWILIO SEND OTP FUNCTION
   * COMMENTED OUT FOR FUTURE USE
   * ============================================================
   */

  /*
  const sendOTP = async () => {
    if (!name.trim()) {
      setNameError('Please enter your name')
      nameRef.current?.focus()
      return
    }

    try {
      setLoading(true)

      await api.post('/auth/send-otp', {
        phone: `+91${phoneNumber}`,
        name: name.trim(),
      })

      setLoading(false)

      router.push({
        pathname: `/verify/+91${phoneNumber}` as any,
        params: {
          name: name.trim(),
        },
      })
    } catch (error: any) {
      setLoading(false)

      console.error(error)

      alert(
        'Failed to send OTP. Please try again.'
      )
    }
  }
  */

  /*
   * ============================================================
   * GOOGLE SOCIAL LOGIN VIA CLERK
   * ============================================================
   */

  const handleGoogleLogin = async () => {
    /*
     * ----------------------------------------------------------
     * VALIDATE NAME
     * ----------------------------------------------------------
     */

    if (!name.trim()) {
      setNameError(
        'Please enter your username'
      )

      nameRef.current?.focus()

      return
    }

    /*
     * ----------------------------------------------------------
     * VALIDATE PHONE
     * ----------------------------------------------------------
     */

    if (phoneNumber.length !== 10) {
      alert(
        'Please enter a valid 10-digit mobile number'
      )

      phoneRef.current?.focus()

      return
    }

    try {
      setLoading(true)

      console.log(
        '🔐 Starting Google OAuth...'
      )

      /*
       * --------------------------------------------------------
       * NATIVE CLERK OAUTH REDIRECT
       * --------------------------------------------------------
       *
       * We use a dedicated oauth callback redirect path.
       * Pointing redirectUrl directly to root '/' causes Expo Router
       * to reset to /login on callback before session setup completes.
       */

      const redirectUrl =
        Linking.createURL('/oauth-callback')

      console.log(
        '🔗 Google OAuth redirect URL:',
        redirectUrl
      )

      /*
       * --------------------------------------------------------
       * START CLERK GOOGLE OAUTH
       * --------------------------------------------------------
       */

      const {
        createdSessionId,
        setActive,
      } = await startOAuthFlow({
        redirectUrl,
      })

      /*
       * --------------------------------------------------------
       * USER CANCELLED / NO SESSION
       * --------------------------------------------------------
       */

      if (
        !createdSessionId ||
        !setActive
      ) {
        console.log(
          '⚠️ Google OAuth was cancelled or no Clerk session was created.'
        )

        setLoading(false)

        return
      }

      console.log(
        '✅ Clerk session created:',
        createdSessionId
      )

      /*
       * --------------------------------------------------------
       * ACTIVATE CLERK SESSION
       * --------------------------------------------------------
       */

      await setActive({
        session: createdSessionId,
      })

      console.log(
        '✅ Clerk session activated.'
      )

      /*
       * --------------------------------------------------------
       * WAIT FOR CLERK USER
       * --------------------------------------------------------
       *
       * We DO NOT fabricate:
       *
       *     user@gmail.com
       *
       * and we DO NOT fabricate:
       *
       *     clerk_123456
       *
       * We wait for the actual Clerk user.
       */

      let currentClerkUser =
        clerk.user

      for (
        let attempt = 0;
        attempt < 20 &&
        !currentClerkUser;
        attempt++
      ) {
        console.log(
          `⏳ Waiting for Clerk user... attempt ${attempt + 1}/20`
        )

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              150
            )
        )

        /*
         * Re-read the current Clerk instance.
         */
        currentClerkUser =
          clerk.user
      }

      /*
       * --------------------------------------------------------
       * ENSURE CLERK USER EXISTS
       * --------------------------------------------------------
       */

      if (!currentClerkUser) {
        console.error(
          '❌ Clerk user was not available after Google OAuth.'
        )

        try {
          await clerk.signOut()
        } catch (signOutError) {
          console.log(
            '⚠️ Clerk cleanup error:',
            signOutError
          )
        }

        setLoading(false)

        alert(
          'Google account information could not be retrieved. Please try again.'
        )

        return
      }

      /*
       * --------------------------------------------------------
       * GET REAL GOOGLE EMAIL
       * --------------------------------------------------------
       */

      const userEmail =
        currentClerkUser
          .primaryEmailAddress
          ?.emailAddress
          ?.trim()
          ?.toLowerCase() ||
        currentClerkUser
          .emailAddresses?.[0]
          ?.emailAddress
          ?.trim()
          ?.toLowerCase() ||
        ''

      /*
       * --------------------------------------------------------
       * GET REAL CLERK USER ID
       * --------------------------------------------------------
       */

      const clerkUserId =
        currentClerkUser.id ||
        ''

      console.log(
        '📧 Google email received:',
        userEmail
      )

      console.log(
        '🆔 Clerk user ID received:',
        clerkUserId
      )

      /*
       * --------------------------------------------------------
       * NEVER USE FAKE EMAIL / CLERK ID
       * --------------------------------------------------------
       */

      if (
        !userEmail ||
        !clerkUserId
      ) {
        console.error(
          '❌ Missing real Clerk email or Clerk user ID.',
          {
            userEmail,
            clerkUserId,
          }
        )

        try {
          await clerk.signOut()
        } catch (signOutError) {
          console.log(
            '⚠️ Clerk cleanup error:',
            signOutError
          )
        }

        setLoading(false)

        alert(
          'Your Google account information could not be verified. Please try again.'
        )

        return
      }

      /*
       * --------------------------------------------------------
       * KATBOX BACKEND AUTHENTICATION
       * --------------------------------------------------------
       *
       * The backend will:
       *
       * 1. Normalize the mobile number.
       * 2. Search mobile number FIRST.
       * 3. If mobile already exists:
       *       - matching email -> login
       *       - different email -> 409 EMAIL_MISMATCH
       *
       * 4. If mobile doesn't exist:
       *       - create the user
       *
       * The backend changes for this are handled separately in
       * auth.routes.ts.
       */

      let res

      try {
        res = await api.post(
          '/auth/clerk-login',
          {
            email: userEmail,
            name: name.trim(),
            phone: `+91${phoneNumber}`,
            clerkId: clerkUserId,
          }
        )
      } catch (backendError: any) {
        /*
         * ------------------------------------------------------
         * BACKEND ERROR INFORMATION
         * ------------------------------------------------------
         */

        const status =
          backendError?.response?.status

        const backendData =
          backendError?.response?.data

        console.log(
          '❌ Katbox backend authentication error:',
          {
            status,
            backendData,
          }
        )

        /*
         * ------------------------------------------------------
         * MOBILE NUMBER ALREADY REGISTERED WITH DIFFERENT EMAIL
         * ------------------------------------------------------
         */

        if (
          status === 409 &&
          backendData?.code ===
            'EMAIL_MISMATCH'
        ) {
          const registeredEmail =
            backendData?.registeredEmail ||
            'another Google account'

          console.log(
            '⚠️ Mobile belongs to another Google account:',
            registeredEmail
          )

          /*
           * We must not leave the newly selected Google account
           * signed into Clerk when Katbox rejects it.
           */

          try {
            await clerk.signOut()
          } catch (signOutError) {
            console.log(
              '⚠️ Clerk sign-out after email mismatch failed:',
              signOutError
            )
          }

          setLoading(false)

          alert(
            `This mobile number is already registered with ${registeredEmail}. Please continue with that Google account.`
          )

          return
        }

        /*
         * ------------------------------------------------------
         * GOOGLE EMAIL ALREADY USED BY ANOTHER MOBILE
         * ------------------------------------------------------
         */

        if (
          status === 409 &&
          backendData?.code ===
            'EMAIL_ALREADY_USED'
        ) {
          try {
            await clerk.signOut()
          } catch (signOutError) {
            console.log(
              '⚠️ Clerk sign-out after email conflict failed:',
              signOutError
            )
          }

          setLoading(false)

          alert(
            backendData?.message ||
              'This Google email is already registered with another mobile number.'
          )

          return
        }

        /*
         * Any other backend error should go to the outer
         * authentication error handler.
         */

        throw backendError
      }

      /*
       * --------------------------------------------------------
       * VALIDATE BACKEND SUCCESS
       * --------------------------------------------------------
       */

      if (
        res?.data?.token &&
        res?.data?.user
      ) {
        console.log(
          '✅ Katbox backend authentication successful.'
        )

        /*
         * ------------------------------------------------------
         * SAVE KATBOX SESSION
         * ------------------------------------------------------
         *
         * This stores:
         *
         *     JWT
         *     MongoDB user
         *
         * Remembered Google email is stored separately above.
         */

        await saveSession(
          res.data.token,
          res.data.user
        )

        console.log(
          '💾 Katbox session saved.'
        )

        /*
         * ------------------------------------------------------
         * NOTIFY ROOT LAYOUT FIRST
         * ------------------------------------------------------
         *
         * We immediately notify the root layout of auth state
         * change so isAuthenticated resolves synchronously.
         */

        notifyAuthChanged()

        console.log(
          '📢 Auth state change notified.'
        )

        /*
         * Log the backend user so we can easily verify the role.
         */

        console.log(
          '👤 Katbox user:',
          {
            id: res.data.user.id,
            name: res.data.user.name,
            email: res.data.user.email,
            phone: res.data.user.phone,
            isChef: res.data.user.isChef,
            isAdmin: res.data.user.isAdmin,
          }
        )

        setLoading(false)

        /*
         * ------------------------------------------------------
         * DIRECT ROLE NAVIGATION
         * ------------------------------------------------------
         */

        if (
          res.data.user.isAdmin
        ) {
          console.log(
            '👑 Admin login detected.'
          )

          console.log(
            '🚀 Navigating to /admin/all-users'
          )

          router.replace(
            '/admin/all-users' as any
          )

          return
        }

        if (
          res.data.user.isChef
        ) {
          console.log(
            '👨‍🍳 Chef login detected.'
          )

          console.log(
            '🚀 Navigating to /chefManagement/add-chefs'
          )

          router.replace(
            '/chefManagement/add-chefs' as any
          )

          return
        }

        console.log(
          '👤 Normal customer login detected.'
        )

        console.log(
          '🚀 Navigating to /(tabs)/Home'
        )

        router.replace(
          '/(tabs)/Home' as any
        )

        return
      }

      /*
       * --------------------------------------------------------
       * INVALID BACKEND RESPONSE
       * --------------------------------------------------------
       */

      console.error(
        '❌ Backend did not return a valid Katbox session.',
        res?.data
      )

      setLoading(false)

      try {
        await clerk.signOut()
      } catch (signOutError) {
        console.log(
          '⚠️ Clerk cleanup error:',
          signOutError
        )
      }

      alert(
        'Authentication synchronization failed. Please try again.'
      )
    } catch (error: any) {
      /*
       * --------------------------------------------------------
       * GENERAL GOOGLE LOGIN ERROR
       * --------------------------------------------------------
       */

      setLoading(false)

      console.error(
        '❌ Clerk Google login error:',
        error
      )

      /*
       * --------------------------------------------------------
       * CLEAN UP CLERK SESSION
       * --------------------------------------------------------
       *
       * If Google succeeded but Katbox authentication failed,
       * do not leave the Clerk session active.
       */

      try {
        await clerk.signOut()
      } catch (signOutError) {
        console.log(
          '⚠️ Clerk cleanup error:',
          signOutError
        )
      }

      /*
       * --------------------------------------------------------
       * CHECK FOR USER CANCELLATION
       * --------------------------------------------------------
       */

      const errorMessage =
        error?.message ||
        error?.errors?.[0]?.message ||
        ''

      if (
        errorMessage
          .toLowerCase()
          .includes('cancel')
      ) {
        console.log(
          'ℹ️ Google login was cancelled by the user.'
        )

        return
      }

      /*
       * --------------------------------------------------------
       * GENERIC ERROR
       * --------------------------------------------------------
       */

      alert(
        'Google Sign-In failed. Please try again.'
      )
    }
  }

  /*
   * ============================================================
   * GOOGLE BUTTON ENABLED ONLY WHEN NAME + MOBILE ARE VALID
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
              Signing in with Google...
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

            {/* PREVIOUSLY USED GOOGLE ACCOUNT */}

            {lastUsedEmail ? (
              <Animated.View
                entering={FadeInUp
                  .delay(450)
                  .duration(400)}
              >
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={loading}
                  onPress={() => {
                    if (!name.trim()) {
                      setNameError(
                        'Please enter your username'
                      )
                      nameRef.current?.focus()
                      return
                    }

                    if (phoneNumber.length !== 10) {
                      alert(
                        'Please enter a valid 10-digit mobile number'
                      )
                      phoneRef.current?.focus()
                      return
                    }

                    handleGoogleLogin()
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `Sign in with ${lastUsedEmail}`
                  }
                  style={
                    styles.rememberedEmailContainer
                  }
                >
                  <Ionicons
                    name="mail-outline"
                    size={14}
                    color="#38512F"
                    style={
                      styles.rememberedEmailIcon
                    }
                  />

                  <View
                    style={
                      styles.rememberedEmailContent
                    }
                  >
                    <Text
                      style={
                        styles.rememberedEmailLabel
                      }
                    >
                      Previously used Google account
                    </Text>

                    <Text
                      style={
                        styles.rememberedEmailText
                      }
                      numberOfLines={1}
                    >
                      {lastUsedEmail}
                    </Text>
                  </View>

                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={20}
                    color="#38512F"
                    style={
                      styles.rememberedEmailArrow
                    }
                  />
                </TouchableOpacity>
              </Animated.View>
            ) : null}

            {/* GOOGLE SOCIAL LOGIN BUTTON VIA CLERK
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
                onPress={
                  handleGoogleLogin
                }
              >
                <Animated.View
                  style={[
                    styles.buttonInner,
                    animatedButtonStyle,
                  ]}
                >
                  <Ionicons
                    name="logo-google"
                    size={18}
                    color="#fff"
                    style={{
                      marginRight: 8,
                    }}
                  />

                  <Text
                    style={styles.buttonText}
                  >
                    Continue with Google
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

            {/* TWILIO BUTTON & UI
                COMMENTED OUT - KEPT FOR FUTURE USE */}

            {/*
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
                onPress={sendOTP}
              >
                <View
                  style={styles.buttonInner}
                >
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
                </View>
              </TouchableOpacity>
            </Animated.View>
            */}

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
                Clerk and Google. Your details remain
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
   * PREVIOUS GOOGLE EMAIL
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
   * GOOGLE BUTTON
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