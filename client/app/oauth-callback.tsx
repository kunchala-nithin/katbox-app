import React from 'react';

/**
 * Clerk returns to this registered Expo Router route after Google OAuth.
 *
 * Keep this screen invisible and passive.
 *
 * startOAuthFlow() in login.tsx receives the OAuth result, activates
 * the Clerk session, and the root layout performs the existing
 * MongoDB-role-based navigation after KatBox authentication.
 *
 * Do not navigate or modify authentication state from this route.
 */
export default function OAuthCallback() {
  return null;
}
