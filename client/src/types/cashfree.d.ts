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

  /* ═══════════════════════════════════════════════════════════
     ✅ NEW: Environment enum re-exported from this module.

     The real Cashfree SDK exports `CFEnvironment` at the
     top level of `react-native-cashfree-pg-sdk` (not only from
     `cashfree-pg-api-contract`). This augmentation makes the
     import:

         import { CFEnvironment } from "react-native-cashfree-pg-sdk";

     resolve cleanly at compile time.

     Numeric values match the runtime enum in the SDK:
         SANDBOX    = 1
         PRODUCTION = 2
     ═══════════════════════════════════════════════════════════ */
  export enum CFEnvironment {
    SANDBOX = 1,
    PRODUCTION = 2,
  }

  /* ═══════════════════════════════════════════════════════════
     ✅ NEW: Theme shape produced by CFThemeBuilder and accepted
     by CFPaymentGatewayService.doPayment(session, theme).

     All fields are optional — the SDK falls back to sensible
     defaults when omitted.
     ═══════════════════════════════════════════════════════════ */
  export interface CFTheme {
    backgroundColor?: string;
    primaryTextColor?: string;
    secondaryTextColor?: string;
    buttonBackgroundColor?: string;
    buttonTextColor?: string;
    navigationBarBackgroundColor?: string;
    navigationBarTextColor?: string;
  }

  /* ═══════════════════════════════════════════════════════════
     ✅ NEW: Fluent theme builder.

     The SDK ships a `CFThemeBuilder` class that produces the
     theme object. `lib/cashfree.ts` imports it as:

         import { CFThemeBuilder } from "react-native-cashfree-pg-sdk";

     Chain setters, then call `.build()` to obtain the final
     object to pass to `doPayment`.
     ═══════════════════════════════════════════════════════════ */
  export class CFThemeBuilder {
    setNavigationBarBackgroundColor(color: string): CFThemeBuilder;
    setNavigationBarTextColor(color: string): CFThemeBuilder;
    setButtonBackgroundColor(color: string): CFThemeBuilder;
    setButtonTextColor(color: string): CFThemeBuilder;
    setPrimaryTextColor(color: string): CFThemeBuilder;
    setSecondaryTextColor(color: string): CFThemeBuilder;
    setBackgroundColor(color: string): CFThemeBuilder;
    build(): CFTheme;
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
     * Opens the native checkout.
     *
     * ✅ UPDATED SIGNATURE:
     *   The second argument is a theme object (produced by
     *   CFThemeBuilder.build()) OR a payment-mode enum. Accepting
     *   a union lets both call styles compile without forcing
     *   callers to cast.
     */
    doPayment(session: any, themeOrMode?: CFTheme | any): void;
  };

  /**
   * Session class re-exported at the top level. Same class as the
   * one declared in the `cashfree-pg-api-contract` module — both
   * point at the runtime implementation.
   */
  export class CFSession {
    constructor(
      paymentSessionId: string,
      orderId: string,
      environment: CFEnvironment | string,
      paymentModes?: any[]
    );
  }
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

/* ═════════════════════════════════════════════════════════════════
   ✅ COMPAT WRAPPER — startCashfreePayment
   ═════════════════════════════════════════════════════════════════
   checkout.tsx calls:
       startCashfreePayment({
         amount,
         orderPayload,
         customerId,
       })
     → expects { success, order, message }

   Internally this delegates to `runCashfreePaymentFlow`. On success
   it POSTs the full order to the backend with the verified Cashfree
   payment metadata attached.
   ═════════════════════════════════════════════════════════════════ */

export const startCashfreePayment = async (params: {
  amount: number;
  orderPayload: Record<string, any>;
  customerId?: string;
}): Promise<{
  success: boolean;
  order?: any;
  message?: string;
  orderId?: string;
  paymentId?: string;
}> => {
  try {
    const { amount, orderPayload, customerId } = params;

    // Pull the service type out of the payload so `computeAdvanceSplit`
    // charges the correct amount (45% for catering/mealbox, full for others).
    const serviceType = String(orderPayload?.serviceType || "");
    const advanceService =
      serviceType === "catering" || serviceType === "mealbox";

    // Run the full Cashfree flow (create order → SDK → verify).
    const flow = await runCashfreePaymentFlow({
      serviceType,
      totalAmount: Number(orderPayload?.totalAmount) || amount,
      customerId,
      customerName: orderPayload?.userName,
      customerPhone: orderPayload?.userPhone,
    });

    if (!flow.ok) {
      return {
        success: false,
        message: flow.message || "Payment was not completed.",
      };
    }

    // Payment verified — now POST the order to the backend, attaching
    // the Cashfree metadata so the backend can persist paymentStatus,
    // chefStatus, deliveryStatus, and the payment badge correctly.
    const enrichedPayload: Record<string, any> = {
      ...orderPayload,
      // Cashfree reference fields
      cashfreeOrderId: flow.orderId,
      cashfreePaymentId: flow.paymentId,
      cashfreeSignature: flow.signature,
      // Amount actually charged (advance for catering/mealbox, full for others)
      chargedAmount: flow.chargeAmount,
      // Explicit flags the backend uses for the payment badge + gate
      isAdvanceOrder: advanceService,
      advancePercent: advanceService ? 45 : 0,
    };

    const res = await api.post("/api/orders/create", enrichedPayload, {
      headers: { "Content-Type": "application/json" },
    });

    if (res.data && res.data.success) {
      return {
        success: true,
        order: res.data.order,
        orderId: res.data.order?.orderId,
        paymentId: flow.paymentId,
      };
    }

    return {
      success: false,
      message: res.data?.message || "Failed to store order after payment.",
    };
  } catch (err: any) {
    console.log(
      "startCashfreePayment error:",
      err?.response?.data || err?.message || err
    );
    return {
      success: false,
      message:
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong while processing the payment.",
    };
  }
};