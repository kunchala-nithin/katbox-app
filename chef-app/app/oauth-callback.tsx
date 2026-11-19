
import React from 'react';

/**
 * Clerk OAuth deep-link landing route.
 *
 * This route remains invisible and passive while Clerk completes
 * the browser callback and returns control to login.tsx.
 *
 * login.tsx activates the Clerk session and synchronizes it
 * with the KatBox backend.
 *
 * The existing root layout handles authenticated navigation.
 */
export default function OAuthCallback() {
  return null;
}
