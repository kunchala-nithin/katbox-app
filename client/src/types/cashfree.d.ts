// types/cashfree.d.ts
//
// Type augmentations for the Cashfree React Native SDK.
// The published `@cashfreepayments/cashfree-react-native` and
// `cashfree-pg-api-contract` packages have incomplete typings for
// the callback registration API. This file fills those gaps so
// TypeScript stops complaining during development and production builds.

declare module "react-native-cashfree-pg-sdk" {
  /**
   * Callback interface passed to CFPaymentGatewayService.setCallback().
   * - onVerify: called by Cashfree SDK after user completes payment.
   *   We then hit our backend `/api/payments/verify` with the orderID
   *   to check with Cashfree server-side that the order is truly PAID.
   * - onError: called if the SDK itself fails (network, cancel, etc).
   */
  export interface CFCallback {
    onVerify: (orderID: string) => void;
    onError: (error: CFErrorResponse, orderID: string) => void;
  }

  /**
   * Error response object returned by Cashfree SDK on failures.
   * Fields are optional because different failure types surface
   * different subsets.
   */
  export interface CFErrorResponse {
    code?: string;
    message?: string;
    type?: string;
    status?: string;
    orderId?: string;
    [key: string]: any;
  }

  /**
   * Main payment gateway service. Singleton — do NOT instantiate.
   */
  export const CFPaymentGatewayService: {
    /**
     * Register the verification callbacks. Must be called BEFORE
     * opening any payment session.
     */
    setCallback(callback: CFCallback): void;

    /**
     * Unregister callbacks. Call on unmount to prevent leaks.
     */
    removeCallback(): void;

    /**
     * Opens the web-based hosted checkout. Recommended for Expo apps
     * because it doesn't require additional native UPI module linking.
     */
    doWebPayment(session: any): void;

    /**
     * Opens the native UPI-only checkout. Requires UPI intent apps
     * installed on the device; falls back to web if unavailable.
     * We use `doWebPayment` in KatBox because it's more reliable
     * across device types and shows all payment methods (UPI + cards).
     */
    doUPIPayment(session: any): void;

    /**
     * Opens the native checkout with a specific payment mode.
     * Not used in KatBox.
     */
    doPayment(session: any, paymentMode: any): void;
  };
}

declare module "cashfree-pg-api-contract" {
  /**
   * Environment enum. Use CFEnvironment.SANDBOX for testing and
   * CFEnvironment.PRODUCTION for live payments. Must match the
   * environment your backend used to create the order.
   */
  export enum CFEnvironment {
    SANDBOX = 1,
    PRODUCTION = 2,
  }

  /**
   * Payment modes recognized by the SDK. KatBox uses the default
   * "all methods" mode, but this enum exists in case we need to
   * restrict the checkout to specific modes later.
   */
  export enum CFPaymentModes {
    CARD = "CARD",
    UPI = "UPI",
    NB = "NB",
    WALLET = "WALLET",
    PAY_LATER = "PAY_LATER",
    PAYPAL = "PAYPAL",
  }

  /**
   * Session passed to CFPaymentGatewayService.doWebPayment().
   * Constructed from the payment_session_id returned by our backend.
   */
  export class CFSession {
    constructor(
      paymentSessionId: string,
      orderId: string,
      environment: CFEnvironment,
      paymentModes?: CFPaymentModes[]
    );
  }

  /**
   * Theme builder — this is how we skin Cashfree's checkout to match
   * Katbox's forest-green + cream palette. Chain setters, then call
   * .build() to get the theme object.
   */
  export class CFThemeBuilder {
    setNavigationBarBackgroundColor(color: string): CFThemeBuilder;
    setNavigationBarTextColor(color: string): CFThemeBuilder;
    setButtonBackgroundColor(color: string): CFThemeBuilder;
    setButtonTextColor(color: string): CFThemeBuilder;
    setPrimaryTextColor(color: string): CFThemeBuilder;
    setSecondaryTextColor(color: string): CFThemeBuilder;
    setBackgroundColor(color: string): CFThemeBuilder;
    build(): any;
  }
}