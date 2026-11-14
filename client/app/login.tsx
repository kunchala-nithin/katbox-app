import Colors from '@/constants/Colors'

import { api } from '@/src/lib/api'

import { Ionicons } from '@expo/vector-icons'

import { useAuth, useOAuth, useClerk } from '@clerk/clerk-expo'

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

  // Switches the primary authentication action between Google and OTP.
  const [isOtpLoginMode, setIsOtpLoginMode] = useState(false)



  const router = useRouter()

  const { bottom } = useSafeAreaInsets()



  const nameRef = useRef<TextInput>(null)

  const phoneRef = useRef<TextInput>(null)



  /*

   * ==========================================================

   * CLERK GOOGLE OAUTH

   * ==========================================================

   */



  const { isLoaded: isClerkLoaded, getToken } = useAuth()

  const { startOAuthFlow } = useOAuth({

    strategy: 'oauth_google',

  })

  // Keep the latest Clerk loading state available inside async login handlers.
  // A ref is necessary because the value captured by an async handler does not
  // automatically update while that handler is waiting.
  const clerkLoadedRef = useRef(isClerkLoaded)

  useEffect(() => {
    clerkLoadedRef.current = isClerkLoaded
  }, [isClerkLoaded])



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
   * TWILIO SEND OTP FUNCTION
   * ============================================================
   */

  const sendOTP = async () => {
    if (!name.trim()) {
      setNameError('Please enter your username')
      nameRef.current?.focus()
      return
    }

    if (phoneNumber.length !== 10) {
      alert('Please enter a valid 10-digit mobile number')
      phoneRef.current?.focus()
      return
    }

    try {
      setLoading(true)

      await api.post('/auth/send-otp', {
        phone: `+91${phoneNumber}`,
        name: name.trim(),
      })

      router.push({
        pathname: '/verify/[phone]',
        params: {
          phone: `+91${phoneNumber}`,
          name: name.trim(),
        },
      } as any)
    } catch (error: any) {
      console.error(
        'KatBox OTP send error:',
        error?.response?.data?.code || error?.message
      )

      alert(
        error?.response?.data?.message ||
          'Failed to send OTP. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

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



    // Production Clerk can take a moment to initialize on a cold app launch.
    // Wait briefly for the provider instead of immediately showing an alert.
    if (!clerkLoadedRef.current) {
      setLoading(true)
      console.log('⏳ Waiting for Clerk Production to finish initializing...')

      let attempts = 0
      while (!clerkLoadedRef.current && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        attempts += 1
      }

      setLoading(false)

      if (!clerkLoadedRef.current) {
        console.error(
          '❌ Clerk did not finish initializing within 10 seconds. Check the Production publishable key, Clerk custom-domain DNS/SSL, and network access.'
        )
        alert(
          'KatBox authentication is taking too long to connect. Please check your internet connection and try again. If this continues, the Production Clerk connection needs to be checked.'
        )
        return
      }
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



      const redirectUrl = 'clerk://com.katbox.app.callback'



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

       *

       * ────────────────────────────────────────────────────────

       * RELIABILITY NOTE

       * ────────────────────────────────────────────────────────

       *

       * `clerk.user` is React-state backed and can be stale

       * inside an async closure. `clerk.client.activeSessions[0].user`

       * is the authoritative source immediately after setActive().

       *

       * We prefer the activeSessions source, fall back to clerk.user,

       * and poll a bit longer on slow Android devices.

       */



      const resolveClerkUser = (): any => {

        try {

          const activeSession =

            (clerk as any)?.client?.activeSessions?.[0]



          const sessionUser =

            activeSession?.user



          if (sessionUser) {

            return sessionUser

          }

        } catch (_) {}



        return clerk.user

      }



      let currentClerkUser =

        resolveClerkUser()



      for (

        let attempt = 0;

        attempt < 25 &&

        !currentClerkUser;

        attempt++

      ) {

        console.log(

          `⏳ Waiting for Clerk user... attempt ${attempt + 1}/25`

        )



        await new Promise(

          (resolve) =>

            setTimeout(

              resolve,

              200

            )

        )



        /*

         * Re-read the current Clerk user.

         */

        currentClerkUser =

          resolveClerkUser()

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

        const clerkSessionToken = await getToken()

        if (!clerkSessionToken) {
          throw new Error('Your Google sign-in session expired. Please try again.')
        }

        res = await api.post(
          '/auth/clerk-login',
          {
            name: name.trim(),
            phone: `+91${phoneNumber}`,
          },
          {
            headers: {
              Authorization: `Bearer ${clerkSessionToken}`,
            },
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



      /* Google registration / OTP-only account linking requires phone proof. */
      if (res?.data?.requiresPhoneVerification && res?.data?.challengeToken) {
        router.push({
          pathname: '/verify/[phone]',
          params: {
            phone: `+91${phoneNumber}`,
            name: name.trim(),
            mode: 'google',
            challengeToken: res.data.challengeToken,
          },
        } as any)
        // Keep the loading state active during the route transition.
        return
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



        /*
         * ------------------------------------------------------
         * KEEP THE LOADING STATE DURING THE AUTH TRANSITION
         * ------------------------------------------------------
         *
         * Do not set loading to false here. Keeping the loading
         * overlay visible prevents the login form from flashing
         * while app/_layout.tsx re-reads the saved KatBox JWT.
         *
         * Do not call router.replace() from this screen. The root
         * layout owns authenticated navigation and chooses the
         * correct destination from the saved MongoDB user role:
         *   Admin    -> /admin/all-users
         *   Chef     -> /(tabs)/Home (chef management is in the standalone Chef app)
         *   Customer -> /(tabs)/Home
         *
         * This avoids competing navigation calls between login.tsx
         * and app/_layout.tsx.
         */
        console.log(
          '🚀 Session saved. Waiting for app/_layout.tsx to navigate.'
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

      // Temporary diagnostics: capture the real OAuth failure before
      // showing the friendly alert. Do not log credentials or tokens.
      console.error('GOOGLE OAUTH ERROR MESSAGE:', error?.message)
      console.error('GOOGLE OAUTH ERROR CODE:', error?.code)
      console.error('GOOGLE OAUTH ERROR DETAILS:', error?.errors)
      try {
        console.error(
          'GOOGLE OAUTH ERROR FULL:',
          JSON.stringify(error, Object.getOwnPropertyNames(error))
        )
      } catch (loggingError) {
        console.error('Could not serialize Google OAuth error:', loggingError)
        console.error('Google OAuth error object:', error)
      }

      setLoading(false)

      console.error(

        '❌ Clerk Google login error:',

        error

      )



      /*

       * --------------------------------------------------------

       * CLEAN UP CLERK SESSION — ONLY ON REAL AUTH REJECTIONS

       * --------------------------------------------------------

       *

       * Network timeouts / Render cold-start failures must NOT

       * sign the user out of Clerk. Doing so forces them to redo

       * the entire Google OAuth flow even though nothing was

       * wrong with their Google account.

       */



      const httpStatus =

        error?.response?.status



      const isAuthRejection =

        httpStatus === 401 ||

        httpStatus === 403



      if (isAuthRejection) {

        try {

          await clerk.signOut()

        } catch (signOutError) {

          console.log(

            '⚠️ Clerk cleanup error:',

            signOutError

          )

        }

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

       * FRIENDLY ERROR MESSAGES

       * --------------------------------------------------------

       *

       * We translate low-level network errors into language

       * users can actually act on.

       */



      const errCode =

        error?.code ||

        error?.response?.data?.code



      let friendlyMessage =

        'Google Sign-In failed. Please try again.'



      const lowerErrorMessage =

        String(errorMessage).toLowerCase()

      const isClerkNetworkOrOAuthInitializationError =

        lowerErrorMessage.includes('network') ||

        lowerErrorMessage.includes('failed to fetch') ||

        lowerErrorMessage.includes('toString') ||

        lowerErrorMessage.includes('request failed')

      if (isClerkNetworkOrOAuthInitializationError) {

        friendlyMessage =

          'Google sign-in could not connect to Clerk. Check your internet connection. If this continues on the production build, verify that Clerk Production is reachable and its custom domain/DNS and SSL certificate are fully verified.'

      } else if (

        errCode === 'ECONNABORTED' ||

        errCode === 'ETIMEDOUT' ||

        errCode === 'ERR_NETWORK'

      ) {

        friendlyMessage =

          'KatBox could not reach its server. Please check your internet connection and try again.'

      } else if (httpStatus === 500) {

        friendlyMessage =

          'Something went wrong on our side. Please try again in a moment.'

      } else if (httpStatus === 409) {

        friendlyMessage =

          error?.response?.data?.message ||

          'This account is already registered with a different Google account.'

      }



      alert(friendlyMessage)

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

              Please wait...

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

                  Username <Text style={styles.required}>*</Text>

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

                  Mobile Number <Text style={styles.required}>*</Text>

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



            {/* PRIMARY AUTHENTICATION BUTTON
                Google mode: continue with Google.
                OTP mode: send an OTP to the entered mobile number. */}

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
                  isOtpLoginMode ? sendOTP : handleGoogleLogin
                }
                accessibilityRole="button"
                accessibilityLabel={
                  isOtpLoginMode ? 'Send OTP' : 'Continue with Google'
                }
              >
                <Animated.View
                  style={[
                    styles.buttonInner,
                    animatedButtonStyle,
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator
                      size="small"
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                  ) : (
                    <Ionicons
                      name={isOtpLoginMode ? 'chatbox-ellipses-outline' : 'logo-google'}
                      size={18}
                      color="#fff"
                      style={{
                        marginRight: 8,
                      }}
                    />
                  )}

                  <Text
                    style={styles.buttonText}
                  >
                    {loading
                      ? (isOtpLoginMode ? 'Sending OTP...' : 'Please wait...')
                      : (isOtpLoginMode ? 'Send OTP' : 'Continue with Google')}
                  </Text>

                  {!loading ? (
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color="#fff"
                      style={
                        styles.buttonIcon
                      }
                    />
                  ) : null}
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

            {/* SWITCH BETWEEN GOOGLE AND MOBILE OTP LOGIN */}

            <Animated.View
              entering={FadeInUp
                .delay(550)
                .duration(450)}
              style={{
                alignItems: 'center',
                marginTop: 2,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: '#999',
                  fontSize: 11,
                  fontWeight: '600',
                  marginBottom: 7,
                }}
              >
                OR
              </Text>

              <TouchableOpacity
                activeOpacity={0.7}
                disabled={loading}
                onPress={() => {
                  setIsOtpLoginMode((currentMode) => !currentMode)
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  isOtpLoginMode
                    ? 'Use Google sign in instead'
                    : 'Use mobile number instead'
                }
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  opacity: loading ? 0.45 : 1,
                }}
              >
                <Text
                  style={{
                    color: '#38512F',
                    fontSize: 13,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                  }}
                >
                  {isOtpLoginMode
                    ? 'Use Google instead?'
                    : 'Use mobile number instead?'}
                </Text>
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

                {isOtpLoginMode
                  ? 'Secure mobile verification powered by Twilio. Your details remain completely private and safe.'
                  : 'Secure authentication powered by Clerk and Google. Your details remain completely private and safe.'}

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

            {/* LEGAL LINKS — open the official KatBox website pages */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 12,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  void WebBrowser.openBrowserAsync('https://katbox.in/terms-and-conditions')
                }}
                accessibilityRole="link"
                accessibilityLabel="Terms and Conditions"
              >
                <Text style={{ color: '#38512F', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                  Terms & Conditions
                </Text>
              </TouchableOpacity>

              <Text style={{ color: '#94A3B8', fontSize: 12, paddingHorizontal: 8 }}>•</Text>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  void WebBrowser.openBrowserAsync('https://katbox.in/privacy-policy')
                }}
                accessibilityRole="link"
                accessibilityLabel="Privacy Policy"
              >
                <Text style={{ color: '#38512F', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                  Privacy Policy
                </Text>
              </TouchableOpacity>

              <Text style={{ color: '#94A3B8', fontSize: 12, paddingHorizontal: 8 }}>•</Text>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  void WebBrowser.openBrowserAsync('https://katbox.in/refund-cancellation-policy')
                }}
                accessibilityRole="link"
                accessibilityLabel="Refund and Cancellation Policy"
              >
                <Text style={{ color: '#38512F', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                  Refund Policy
                </Text>
              </TouchableOpacity>
            </View>

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



  required: {

    color: '#E23744',

    fontSize: 10,

    fontWeight: '700',

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