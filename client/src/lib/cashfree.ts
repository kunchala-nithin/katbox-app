// src/lib/cashfree.ts
//
// KatBox Cashfree Payment Integration
// -------------------------------------------------------------------
// This module is the single entry-point for Cashfree payments in the
// KatBox mobile app. It:
//
//   1. Creates a Cashfree order on our backend (/api/payments/create-order)
//   2. Registers success/failure callbacks with the native Cashfree SDK
//   3. Applies the KatBox brand theme (forest green + cream + gold) to
//      Cashfree's hosted checkout so it looks native to our app
//   4. Opens the SDK checkout (which surfaces UPI, PhonePe, GPay,
//      Paytm, cards, netbanking)
//   5. On successful payment, calls our backend
//      (/api/payments/verify) which in turn asks Cashfree
//      server-to-server whether the order is truly PAID.
//   6. Resolves with the created order document on success, or rejects
//      with a structured error on failure.
//
// NOTE: This is the ONLY file in the client that imports the Cashfree
// SDK directly. All other screens call `startCashfreePayment()`.

import {
  CFPaymentGatewayService,
  CFErrorResponse,
} from "react-native-cashfree-pg-sdk";
import {
  CFSession,
  CFEnvironment,
  CFThemeBuilder,
} from "cashfree-pg-api-contract";
import api from "./api";

// ==================== KATBOX BRAND PALETTE ====================
// These are the same colors used across CheckOutScreen, OrderConfirmation,
// and the rest of the app. Matching Cashfree's checkout to these values
// makes the payment flow feel native rather than third-party.
const KATBOX_THEME = {
  navBarBg: "#0F382A",      // dark forest green — KatBox primary dark
  navBarText: "#FAF8F5",    // cream — KatBox primary light
  buttonBg: "#166534",      // action green — KatBox CTA color
  buttonText: "#FAF8F5",    // cream
  primaryText: "#0B261D",   // near-black green — headings
  secondaryText: "#5B756C", // muted sage — body text
  bg: "#FAF8F5",            // cream background
};

// ==================== CASHFREE ENVIRONMENT ====================
// MUST match the environment used by the backend when creating the order.
// Backend reads CASHFREE_ENV from .env, we mirror the same value here.
// When going live, flip BOTH to PRODUCTION at the same time.
const CASHFREE_ENV = CFEnvironment.SANDBOX;
// ⬆️ Change to CFEnvironment.PRODUCTION when you go live.

// ==================== PUBLIC TYPES ====================

export interface StartCashfreePaymentOptions {
  /**
   * Amount in INR (rupees, not paise). This is the amount the user will
   * be charged — for KatBox this is the 40% advance, not the full total.
   */
  amount: number;

  /**
   * The full order payload that should be saved to MongoDB after
   * successful verification. Same shape as the old Razorpay flow's
   * `orderPayload` — the backend `/api/payments/verify` writes it
   * straight into the Order document.
   */
  orderPayload: Record<string, any>;

  /**
   * Optional customer identifier used by Cashfree for tracking
   * (usually the userId). Falls back to a random guest ID.
   */
  customerId?: string;
}

export interface CashfreeResult {
  success: boolean;
  order?: any;         // the created order document on success
  message?: string;    // human-readable status / error
  cfOrderId?: string;  // Cashfree's order_id, useful for support tickets
}

// ==================== CALLBACK REGISTRATION ====================
// The Cashfree SDK is a singleton — we register callbacks ONCE and they
// persist for the app's lifetime. We store the current promise resolvers
// in module-level variables so the onVerify/onError handlers (which are
// invoked by the native SDK, not by us) can resolve the correct promise.
//
// Only one payment can be in-flight at a time, which matches real usage.

let activeResolve: ((result: CashfreeResult) => void) | null = null;
let activeOrderPayload: Record<string, any> | null = null;

/**
 * Registers the SDK callbacks. Safe to call multiple times — the SDK
 * replaces the previous callback each time. Called once at app startup
 * is ideal, but we call it lazily before every payment for safety.
 */
function ensureCallbacksRegistered() {
  CFPaymentGatewayService.setCallback({
    /**
     * Called by Cashfree SDK after the user finishes the payment UI.
     * At this point the payment MAY or MAY NOT have actually succeeded —
     * we still need to verify server-side. The `orderID` is Cashfree's
     * order_id (the same one our backend created).
     */
    onVerify: async (orderID: string) => {
      console.log("[Cashfree] onVerify called with orderID:", orderID);

      const payload = activeOrderPayload;
      const resolve = activeResolve;

      // Reset module state immediately so we don't leak into the next payment.
      activeResolve = null;
      activeOrderPayload = null;

      if (!payload || !resolve) {
        console.warn(
          "[Cashfree] onVerify fired but no active payload/resolver."
        );
        return;
      }

      try {
        // Ask our backend to verify with Cashfree server-side.
        const res = await api.post("/api/payments/verify", {
          cf_order_id: orderID,
          orderPayload: payload,
        });

        if (res.data?.success && res.data?.order) {
          resolve({
            success: true,
            order: res.data.order,
            cfOrderId: orderID,
          });
        } else {
          resolve({
            success: false,
            message:
              res.data?.message ||
              "Payment could not be verified. Please contact support.",
            cfOrderId: orderID,
          });
        }
      } catch (err: any) {
        console.error("[Cashfree] verify request failed:", err);
        resolve({
          success: false,
          message:
            err?.response?.data?.message ||
            "Network error during verification. Please contact support.",
          cfOrderId: orderID,
        });
      }
    },

    /**
     * Called by Cashfree SDK when the payment flow itself fails
     * (user cancelled, network dropped, SDK error, etc.). No server
     * verification needed here — the payment never happened.
     */
    onError: (error: CFErrorResponse, orderID: string) => {
      console.log("[Cashfree] onError:", error, "orderID:", orderID);

      const resolve = activeResolve;
      activeResolve = null;
      activeOrderPayload = null;

      if (!resolve) {
        console.warn(
          "[Cashfree] onError fired but no active resolver."
        );
        return;
      }

      // Cashfree sends user-cancellation as a specific code; keep the
      // message friendly for that case.
      const code = String(error?.code || "");
      const isCancelled =
        code.toLowerCase().includes("cancel") ||
        String(error?.message || "").toLowerCase().includes("cancel");

      resolve({
        success: false,
        message: isCancelled
          ? "Payment cancelled."
          : error?.message || "Payment failed. Please try again.",
        cfOrderId: orderID,
      });
    },
  });
}

// ==================== PUBLIC API ====================

/**
 * Opens the Cashfree hosted checkout for the given amount + order payload.
 *
 * Returns a promise that resolves once the payment flow is fully complete
 * (either verified-success or failed). Never throws — always resolves with
 * a CashfreeResult.
 *
 * Example:
 *   const result = await startCashfreePayment({
 *     amount: 240.5,
 *     orderPayload: { userId, chefId, totalAmount, ... },
 *   });
 *   if (result.success) router.push(...);
 *   else Alert.alert("Payment failed", result.message);
 */
export function startCashfreePayment(
  options: StartCashfreePaymentOptions
): Promise<CashfreeResult> {
  return new Promise(async (resolve) => {
    // ----------------------------------------------------------------
    // 1. Validate input
    // ----------------------------------------------------------------
    const amount = Number(options.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return resolve({
        success: false,
        message: "Invalid payment amount.",
      });
    }

    // ----------------------------------------------------------------
    // 2. Register the callback ONCE before opening the session.
    //    Cashfree requires the callback to be set up before
    //    doWebPayment is called, otherwise onVerify never fires.
    // ----------------------------------------------------------------
    ensureCallbacksRegistered();

    // ----------------------------------------------------------------
    // 3. Ask our backend to create a Cashfree order. This returns
    //    the payment_session_id which the SDK needs.
    // ----------------------------------------------------------------
    let createRes;
    try {
      createRes = await api.post("/api/payments/create-order", {
        amount,
        orderId: options.customerId || "",
      });
    } catch (err: any) {
      console.error("[Cashfree] create-order request failed:", err);
      return resolve({
        success: false,
        message:
          err?.response?.data?.message ||
          "Could not start payment. Please check your connection.",
      });
    }

    if (!createRes.data?.success || !createRes.data?.paymentSessionId) {
      console.error("[Cashfree] create-order bad response:", createRes.data);
      return resolve({
        success: false,
        message:
          createRes.data?.message ||
          "Could not start payment. Please try again.",
      });
    }

    const { paymentSessionId, orderId: cfOrderId } = createRes.data;

    // ----------------------------------------------------------------
    // 4. Store the resolver + payload so the callbacks (invoked later
    //    by the native SDK) can find them.
    // ----------------------------------------------------------------
    activeResolve = resolve;
    activeOrderPayload = options.orderPayload;

    // ----------------------------------------------------------------
    // 5. Build the CFSession and KatBox theme, then open the checkout.
    // ----------------------------------------------------------------
    try {
      const session = new CFSession(
        paymentSessionId,
        cfOrderId,
        CASHFREE_ENV
      );

      // KatBox-branded theme. Every one of these maps to a real color
      // used elsewhere in the app so the Cashfree checkout feels native.
      const theme = new CFThemeBuilder()
        .setNavigationBarBackgroundColor(KATBOX_THEME.navBarBg)
        .setNavigationBarTextColor(KATBOX_THEME.navBarText)
        .setButtonBackgroundColor(KATBOX_THEME.buttonBg)
        .setButtonTextColor(KATBOX_THEME.buttonText)
        .setPrimaryTextColor(KATBOX_THEME.primaryText)
        .setSecondaryTextColor(KATBOX_THEME.secondaryText)
        .setBackgroundColor(KATBOX_THEME.bg)
        .build();

      // doWebPayment opens Cashfree's hosted checkout as a modal. The
      // user sees UPI (with PhonePe / GPay / Paytm deep-links and a QR
      // code), plus Cards / Netbanking / Wallets. The theme above is
      // applied automatically.
      CFPaymentGatewayService.doWebPayment(session);
      // ⬆️ The SDK takes over from here. onVerify / onError fire when
      //    the user finishes or the flow errors out. The promise we
      //    returned stays pending until then.
    } catch (err: any) {
      console.error("[Cashfree] SDK open failed:", err);
      activeResolve = null;
      activeOrderPayload = null;
      return resolve({
        success: false,
        message:
          err?.message ||
          "Could not open payment window. Please try again.",
      });
    }
  });
}

/**
 * Removes the Cashfree callback registration. Call this on app shutdown
 * or when logging out to avoid stale callbacks firing after a user
 * change. Safe to call multiple times.
 */
export function teardownCashfree() {
  try {
    CFPaymentGatewayService.removeCallback();
  } catch (err) {
    // Silent — removeCallback throws if no callback is set, which is fine.
  }
  activeResolve = null;
  activeOrderPayload = null;
}