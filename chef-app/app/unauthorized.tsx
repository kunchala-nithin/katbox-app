import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Platform,
  Linking,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useClerk } from '@clerk/clerk-expo';
import { removeToken, refreshUser } from '@/src/lib/authStorage';
import { notifyAuthChanged } from '@/src/lib/authEvents';

// Polling interval while on this screen (ms)
const ROLE_POLL_INTERVAL = 2000;

export default function UnauthorizedScreen() {
  const router = useRouter();
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);

  // Ref to prevent overlapping polls
  const pollInFlightRef = useRef(false);
  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  // Ref to store the polling interval
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /*
   * ──────────────────────────────────────────────────────────
   * ROLE CHECK — Detect when admin grants chef access
   * ──────────────────────────────────────────────────────────
   * When this screen is focused, we periodically call /auth/me
   * to check if the user's isChef flag has been set to true.
   * If so, we navigate to the chef management screens.
   */
  const checkRoleAndNavigate = useCallback(async () => {
    if (pollInFlightRef.current || !isMountedRef.current) {
      return;
    }

    pollInFlightRef.current = true;

    try {
      const user = await refreshUser();

      if (!isMountedRef.current) {
        return;
      }

      if (user?.isChef === true) {
        console.log(
          '✅ [Unauthorized] Chef access granted! Navigating to chef management...'
        );

        // Stop polling immediately
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Notify auth change so _layout.tsx re-evaluates
        notifyAuthChanged();

        // Navigate to chef management
        router.replace('/chefManagement/add-chefs' as any);
      }
    } catch (error) {
      // Silent — user stays on unauthorized screen
      console.log('[Unauthorized] Role check error:', error);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [router]);

  /*
   * ──────────────────────────────────────────────────────────
   * START/STOP POLLING BASED ON FOCUS
   * ──────────────────────────────────────────────────────────
   */
  useFocusEffect(
    useCallback(() => {
      console.log('[Unauthorized] Screen focused — starting role polling');
      isMountedRef.current = true;

      // Immediate check on focus
      checkRoleAndNavigate();

      // Start polling
      pollIntervalRef.current = setInterval(
        checkRoleAndNavigate,
        ROLE_POLL_INTERVAL
      );

      return () => {
        console.log('[Unauthorized] Screen unfocused — stopping role polling');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }, [checkRoleAndNavigate])
  );

  /*
   * ──────────────────────────────────────────────────────────
   * CHECK ROLE ON APP FOREGROUND
   * ──────────────────────────────────────────────────────────
   * When user returns to the app (e.g., from background),
   * immediately check if role has changed.
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[Unauthorized] App became active — checking role');
        checkRoleAndNavigate();
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [checkRoleAndNavigate]);

  /*
   * ──────────────────────────────────────────────────────────
   * CLEANUP ON UNMOUNT
   * ──────────────────────────────────────────────────────────
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const openExternalLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.log('Unable to open external link:', error);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  };

  /*
   * ──────────────────────────────────────────────────────────
   * LOGOUT — Clear session and navigate to login
   * ──────────────────────────────────────────────────────────
   * This performs a full logout:
   *   1. Clears local KatBox session (token + user)
   *   2. Signs out of Clerk
   *   3. Notifies auth change so _layout.tsx updates state
   *   4. Navigates directly to login
   */
  const leave = async () => {
    if (busy) return;

    // Stop polling immediately
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setBusy(true);

    let localSessionCleared = false;

    try {
      // Step 1: Clear the KatBox JWT and cached MongoDB user first.
      await removeToken();
      localSessionCleared = true;
      console.log('[Unauthorized] Local session cleared');
    } catch (e) {
      console.log('Local session clear failed:', e);
    }

    // Step 2: Notify the root auth guard and navigate immediately.
    // Do not wait for Clerk's network sign-out before leaving this screen.
    notifyAuthChanged();
    router.replace('/login' as any);

    // Step 3: Clerk cleanup is best-effort and happens after navigation.
    try {
      await clerk.signOut();
      console.log('[Unauthorized] Clerk sign-out complete');
    } catch (e) {
      console.log('Clerk sign-out failed:', e);
    }

    if (!localSessionCleared) {
      console.log(
        '[Unauthorized] Warning: local KatBox session could not be fully cleared.'
      );
    }
  };

  const manualRefresh = async () => {
    if (checkingRole) return;

    setCheckingRole(true);

    try {
      const user = await refreshUser();

      if (user?.isChef === true) {
        console.log('[Unauthorized] Manual check: Chef access granted!');
        notifyAuthChanged();
        router.replace('/chefManagement/add-chefs' as any);
        return;
      }

      Alert.alert(
        'Access Status',
        'Your account does not have Chef Partner access yet. Please contact KatBox support if you believe this is an error.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.log('[Unauthorized] Manual refresh error:', error);
      Alert.alert('Error', 'Unable to check your access status. Please try again.');
    } finally {
      setCheckingRole(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        translucent={false}
        backgroundColor="#F4F7F4"
        barStyle="dark-content"
        hidden={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior="automatic"
      >

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoLetter}>K</Text>
            </View>

            <View>
              <Text style={styles.logoText}>KatBox</Text>
              <Text style={styles.logoSubtitle}>
                HOMEMADE WITH LOVE
              </Text>
            </View>
          </View>

          <View style={styles.partnerBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.partnerBadgeText}>
              CHEF PARTNER
            </Text>
          </View>
        </View>

        {/* HERO SECTION */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconOuter}>
            <View style={styles.heroIconInner}>
              <Text style={styles.heroEmoji}>👨‍🍳</Text>
            </View>

            <View style={styles.lockBadge}>
              <Text style={styles.lockEmoji}>🔒</Text>
            </View>
          </View>

          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              ACCESS RESTRICTED
            </Text>
          </View>

          <Text style={styles.title}>
            Welcome to the{'\n'}
            <Text style={styles.titleHighlight}>
              KatBox Chef Partner
            </Text>
          </Text>

          <Text style={styles.description}>
            Your account is currently not authorized to access
            the KatBox Chef Partner application.
          </Text>

          <Text style={styles.autoRefreshHint}>
            We check your access status automatically every few seconds.
            Once approved, you will be redirected immediately.
          </Text>
        </View>

        {/* ACCESS INFORMATION CARD */}
        <View style={styles.accessCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>!</Text>
            </View>

            <View style={styles.cardHeaderContent}>
              <Text style={styles.cardTitle}>
                Chef Partner Access Required
              </Text>

              <Text style={styles.cardSubtitle}>
                Account verification needed
              </Text>
            </View>
          </View>

          <Text style={styles.cardDescription}>
            The KatBox Chef Partner app is exclusively
            available to registered and approved chefs,
            caterers and food business partners.
          </Text>

          <View style={styles.divider} />

          <Text style={styles.requirementTitle}>
            To access your Chef Dashboard:
          </Text>

          <View style={styles.requirementRow}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkText}>1</Text>
            </View>
            <Text style={styles.requirementText}>
              Register your account with KatBox.
            </Text>
          </View>

          <View style={styles.requirementRow}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkText}>2</Text>
            </View>
            <Text style={styles.requirementText}>
              Complete the chef and business onboarding process.
            </Text>
          </View>

          <View style={styles.requirementRow}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkText}>3</Text>
            </View>
            <Text style={styles.requirementText}>
              Submit the required business and food safety
              information for verification.
            </Text>
          </View>

          <View style={styles.requirementRow}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkText}>4</Text>
            </View>
            <Text style={styles.requirementText}>
              Receive approval and Chef Partner access from
              the KatBox team.
            </Text>
          </View>
        </View>

        {/* ABOUT KATBOX */}
        <View style={styles.aboutSection}>
          <Text style={styles.sectionEyebrow}>
            DISCOVER KATBOX
          </Text>

          <Text style={styles.sectionTitle}>
            More than just a food platform.
          </Text>

          <Text style={styles.aboutDescription}>
            KatBox connects talented home chefs, professional
            caterers and food businesses with customers looking
            for fresh, authentic and quality food.
          </Text>

          {/* FEATURE 1 */}
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#E7F3EA' }]}>
              <Text style={styles.featureEmoji}>🏪</Text>
            </View>

            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                Your Own Food Storefront
              </Text>
              <Text style={styles.featureDescription}>
                Showcase your food business, manage your menu
                and reach customers through your own KatBox
                partner presence.
              </Text>
            </View>
          </View>

          {/* FEATURE 2 */}
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#FFF3E5' }]}>
              <Text style={styles.featureEmoji}>📦</Text>
            </View>

            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                Manage Orders Easily
              </Text>
              <Text style={styles.featureDescription}>
                Receive customer orders, track order details
                and manage your food business operations
                from one place.
              </Text>
            </View>
          </View>

          {/* FEATURE 3 */}
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#EAF0FF' }]}>
              <Text style={styles.featureEmoji}>📈</Text>
            </View>

            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                Grow Your Business
              </Text>
              <Text style={styles.featureDescription}>
                Expand your customer reach and build your
                food business with the KatBox platform.
              </Text>
            </View>
          </View>

          {/* FEATURE 4 */}
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#F5EAFE' }]}>
              <Text style={styles.featureEmoji}>🍱</Text>
            </View>

            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                Multiple Food Categories
              </Text>
              <Text style={styles.featureDescription}>
                Serve customers through homemade meals,
                meal boxes, quick bites, catering and
                platter services.
              </Text>
            </View>
          </View>
        </View>

        {/* BRAND MESSAGE */}
        <View style={styles.brandMessage}>
          <Text style={styles.brandQuote}>
            "Good food deserves a bigger audience."
          </Text>

          <Text style={styles.brandMessageText}>
            At KatBox, we believe every talented chef deserves
            an opportunity to grow, connect and serve.
          </Text>

          <Text style={styles.brandSignature}>
            Made with love. Powered by KatBox.
          </Text>
        </View>

        {/* MANUAL REFRESH BUTTON */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={manualRefresh}
          disabled={checkingRole}
          activeOpacity={0.85}
        >
          {checkingRole ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.refreshIcon}>↻</Text>
              <Text style={styles.refreshText}>
                Check Access Status
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* SIGN OUT */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.logoutButton,
              busy && styles.logoutButtonDisabled,
            ]}
            onPress={leave}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.logoutIcon}>↪</Text>
                <Text style={styles.logoutText}>
                  Sign Out
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            Signed in with an account that does not have
            Chef Partner permissions?
          </Text>

          {/* KATBOX SUPPORT CONTACTS */}
          <View style={styles.contactCard}>
            <View style={styles.contactCardHeader}>
              <Text style={styles.contactCardTitle}>Need assistance?</Text>
              <Text style={styles.contactCardSubtitle}>
                Reach the KatBox team through any of these channels.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.contactRow}
              activeOpacity={0.75}
              onPress={() => openExternalLink('https://katbox.in')}
              accessibilityRole="link"
              accessibilityLabel="Visit KatBox website"
            >
              <View style={[styles.contactIcon, styles.websiteIcon]}>
                <Text style={styles.contactIconText}>◎</Text>
              </View>
              <View style={styles.contactDetails}>
                <Text style={styles.contactLabel}>WEBSITE</Text>
                <Text style={styles.contactValue}>katbox.in</Text>
              </View>
              <Text style={styles.contactArrow}>↗</Text>
            </TouchableOpacity>

            <View style={styles.contactDivider} />

            <TouchableOpacity
              style={styles.contactRow}
              activeOpacity={0.75}
              onPress={() => openExternalLink('tel:8886444041')}
              accessibilityRole="link"
              accessibilityLabel="Call KatBox at 8886444041"
            >
              <View style={[styles.contactIcon, styles.phoneIcon]}>
                <Text style={styles.contactIconText}>☎</Text>
              </View>
              <View style={styles.contactDetails}>
                <Text style={styles.contactLabel}>PHONE SUPPORT</Text>
                <Text style={styles.contactValue}>8886444041</Text>
              </View>
              <Text style={styles.contactArrow}>↗</Text>
            </TouchableOpacity>

            <View style={styles.contactDivider} />

            <TouchableOpacity
              style={styles.contactRow}
              activeOpacity={0.75}
              onPress={() => openExternalLink('mailto:katbox.in@gmail.com')}
              accessibilityRole="link"
              accessibilityLabel="Email KatBox at katbox.in@gmail.com"
            >
              <View style={[styles.contactIcon, styles.emailIcon]}>
                <Text style={styles.contactIconText}>✉</Text>
              </View>
              <View style={styles.contactDetails}>
                <Text style={styles.contactLabel}>EMAIL SUPPORT</Text>
                <Text style={styles.contactValue}>katbox.in@gmail.com</Text>
              </View>
              <Text style={styles.contactArrow}>↗</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerCopyright}>
            © 2026 KatBox. All rights reserved.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F4',
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 18 : 22,
    paddingBottom: 42,
    flexGrow: 1,
  },

  // HEADER

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },

  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  logoIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#073B24',
    justifyContent: 'center',
    alignItems: 'center',
  },

  logoLetter: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
  },

  logoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#073B24',
    letterSpacing: -0.8,
  },

  logoSubtitle: {
    fontSize: 8,
    fontWeight: '800',
    color: '#789184',
    letterSpacing: 1.4,
    marginTop: 1,
  },

  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F1EA',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },

  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#166348',
  },

  partnerBadgeText: {
    color: '#166348',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // HERO

  heroSection: {
    alignItems: 'center',
    marginBottom: 30,
  },

  heroIconOuter: {
    width: 112,
    height: 112,
    borderRadius: 36,
    backgroundColor: '#E5F0E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 19,
  },

  heroIconInner: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroEmoji: {
    fontSize: 43,
  },

  lockBadge: {
    position: 'absolute',
    bottom: -4,
    right: -5,
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },

  lockEmoji: {
    fontSize: 16,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 7,
    marginBottom: 17,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#DC4545',
  },

  statusText: {
    color: '#BE3333',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  title: {
    fontSize: 29,
    fontWeight: '900',
    color: '#163B2B',
    textAlign: 'center',
    lineHeight: 37,
    letterSpacing: -0.8,
  },

  titleHighlight: {
    color: '#16704C',
  },

  description: {
    fontSize: 14,
    lineHeight: 22,
    color: '#687B70',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },

  autoRefreshHint: {
    fontSize: 11,
    lineHeight: 16,
    color: '#8A9990',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
    fontStyle: 'italic',
  },

  // ACCESS CARD

  accessCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 21,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#E5ECE6',
    elevation: 2,
    shadowColor: '#153C29',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.045,
    shadowRadius: 14,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },

  cardIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#FFF0E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  cardIconText: {
    color: '#D46B35',
    fontSize: 23,
    fontWeight: '900',
  },

  cardHeaderContent: {
    flex: 1,
  },

  cardTitle: {
    color: '#183B2B',
    fontSize: 16,
    fontWeight: '900',
  },

  cardSubtitle: {
    color: '#87958D',
    fontSize: 12,
    marginTop: 4,
  },

  cardDescription: {
    color: '#64766B',
    fontSize: 13,
    lineHeight: 21,
  },

  divider: {
    height: 1,
    backgroundColor: '#EDF1EE',
    marginVertical: 19,
  },

  requirementTitle: {
    color: '#193D2C',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 17,
  },

  requirementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },

  checkCircle: {
    width: 25,
    height: 25,
    borderRadius: 9,
    backgroundColor: '#E8F3EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  checkText: {
    color: '#166348',
    fontSize: 12,
    fontWeight: '900',
  },

  requirementText: {
    flex: 1,
    color: '#5C7064',
    fontSize: 12,
    lineHeight: 20,
    paddingTop: 2,
  },

  // ABOUT KATBOX

  aboutSection: {
    marginBottom: 28,
  },

  sectionEyebrow: {
    color: '#25835A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 9,
  },

  sectionTitle: {
    color: '#153D2A',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 10,
  },

  aboutDescription: {
    color: '#718078',
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 19,
  },

  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 19,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAF0EB',
    alignItems: 'flex-start',
  },

  featureIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },

  featureEmoji: {
    fontSize: 22,
  },

  featureContent: {
    flex: 1,
    paddingTop: 2,
  },

  featureTitle: {
    color: '#183C2B',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 5,
  },

  featureDescription: {
    color: '#7A8980',
    fontSize: 12,
    lineHeight: 19,
  },

  // BRAND MESSAGE

  brandMessage: {
    backgroundColor: '#073B24',
    borderRadius: 24,
    padding: 25,
    marginBottom: 25,
    alignItems: 'center',
  },

  brandQuote: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 11,
  },

  brandMessageText: {
    color: '#C4D9CC',
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'center',
  },

  brandSignature: {
    color: '#91C9A7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 17,
  },

  // MANUAL REFRESH BUTTON

  refreshButton: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: '#16704C',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#16704C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },

  refreshIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginRight: 8,
  },

  refreshText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // FOOTER

  footer: {
    alignItems: 'center',
  },

  logoutButton: {
    width: '100%',
    height: 56,
    borderRadius: 17,
    backgroundColor: '#D83C3C',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#B72F2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
  },

  logoutButtonDisabled: {
    opacity: 0.7,
  },

  logoutIcon: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
    marginRight: 10,
  },

  logoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  footerNote: {
    color: '#8A9990',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 10,
  },

  contactCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 17,
    paddingTop: 17,
    paddingBottom: 8,
    marginTop: 22,
    borderWidth: 1,
    borderColor: '#E6EDE7',
    shadowColor: '#153C29',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    elevation: 2,
  },

  contactCardHeader: {
    marginBottom: 8,
  },

  contactCardTitle: {
    color: '#173D2B',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.25,
  },

  contactCardSubtitle: {
    color: '#849188',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  contactRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },

  contactIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  websiteIcon: {
    backgroundColor: '#E8F3EB',
  },

  phoneIcon: {
    backgroundColor: '#EEF2FF',
  },

  emailIcon: {
    backgroundColor: '#FFF2E8',
  },

  contactIconText: {
    color: '#176044',
    fontSize: 19,
    fontWeight: '800',
  },

  contactDetails: {
    flex: 1,
  },

  contactLabel: {
    color: '#8B9990',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 4,
  },

  contactValue: {
    color: '#1B4934',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: '#A5C4AE',
  },

  contactArrow: {
    color: '#6B8C78',
    fontSize: 19,
    fontWeight: '700',
    marginLeft: 8,
  },

  contactDivider: {
    height: 1,
    backgroundColor: '#EEF2EF',
    marginLeft: 51,
  },

  footerCopyright: {
    color: '#A5B0A9',
    fontSize: 10,
    marginTop: 20,
    fontWeight: '600',
  },
});