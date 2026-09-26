// lib/cashfree.ts
//
// Cashfree Payment Gateway wrapper for KatBox.
//
// Responsibilities:
//   • Decide who is eligible for COD vs Online (service-type rules)
//   • Compute the 45% advance split for catering / mealbox orders
//   • Open the Cashfree SDK UI and await the payment result
//   • Verify the payment on the backend before the caller navigates
//
// The caller (checkout.tsx) only needs to:
//   1. Call `computeAdvanceSplit(total)` to know how much to charge.
//   2. Call `openCashfreeCheckout(...)` and await its result.
//   3. On `status === "SUCCESS"` → POST /api/orders/create with the
//      payment metadata attached, then navigate to the confirmation
//      screen.

import { Platform } from "react-native";
import {
  CFPaymentGatewayService,

  CFSession,

} from "react-native-cashfree-pg-sdk";
import api from "./api";
// ✅ FIX: `CFEnvironment` was a type-only enum from
//         `cashfree-pg-api-contract` — it does NOT exist at
//         runtime (no JS export), so `CFEnvironment.SANDBOX`
//         evaluated to `undefined` and crashed CFSession with
//         "Cannot read property 'prototype' of undefined".
//
//         The Cashfree SDK's own type signature accepts a
//         plain string `"SANDBOX" | "PRODUCTION"` for the
//         environment. We use that instead.
//
//         `CFThemeBuilder` IS a real runtime class, so we keep
//         importing it normally.
import { CFThemeBuilder } from "cashfree-pg-api-contract";

/**
 * ✅ Runtime-safe environment selector for the Cashfree SDK.
 *
 * The SDK accepts the string literals "SANDBOX" / "PRODUCTION".
 * We export this type so callers can still type their params
 * without importing the (type-only) CFEnvironment enum.
 */
export type CashfreeEnv = "SANDBOX" | "PRODUCTION";

/* ═════════════════════════════════════════════════════════════════
   BUSINESS RULES
   ═════════════════════════════════════════════════════════════════ */

/**
 * Advance percentage charged for catering and mealbox orders.
 * Stored here so both checkout + backend share one source of truth.
 */
export const ADVANCE_PERCENT = 45;

/**
 * Returns true when the given service type requires an online
 * advance payment (catering / mealbox).
 */
export const isAdvanceServiceType = (serviceType?: string): boolean => {
  const s = String(serviceType || "").toLowerCase().trim();
  return s === "catering" || s === "mealbox";
};

/**
 * Returns true when the given service type is eligible for
 * Cash-On-Delivery (quickbites / homemade only).
 *
 * Catering and mealbox MUST pay 45% online — COD radio is disabled
 * in the checkout UI and this helper is the runtime guard.
 */
export const canUseCOD = (serviceType?: string): boolean => {
  const s = String(serviceType || "").toLowerCase().trim();
  return s === "quickbites" || s === "homemade";
};

/* ═════════════════════════════════════════════════════════════════
   AMOUNT HELPERS
   ═════════════════════════════════════════════════════════════════ */

/**
 * Splits a grand total into the advance and pending amounts.
 *
 *   • Catering / Mealbox  → advance = 45% of total, pending = rest
 *   • QuickBites / HomeMade (online) → advance = total, pending = 0
 *   • QuickBites / HomeMade (COD)    → advance = 0, pending = total
 *
 * The rounding keeps two decimal places so the amounts match
 * exactly what the backend will persist.
 */
export const computeAdvanceSplit = (
  total: number,
  serviceType?: string,
  paymentMode?: "online" | "cod"
): { total: number; advance: number; pending: number } => {
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  const rounded = Math.round(safeTotal * 100) / 100;

  const advanceService = isAdvanceServiceType(serviceType);
  const mode = String(paymentMode || "online").toLowerCase();

  if (advanceService) {
    const advance = Math.round(rounded * (ADVANCE_PERCENT / 100) * 100) / 100;
    const pending = Math.round((rounded - advance) * 100) / 100;
    return { total: rounded, advance, pending };
  }

  if (mode === "cod") {
    return { total: rounded, advance: 0, pending: rounded };
  }

  // QuickBites / HomeMade + Online → full payment upfront.
  return { total: rounded, advance: rounded, pending: 0 };
};

/**
 * Human-readable badge label used on the merged top-right pill
 * on order cards and bill summaries.
 *
 * Matches the backend `paymentBadge` virtual's `label` values so
 * customer / chef / admin screens stay consistent.
 */
export const getPaymentBadgeLabel = (
  serviceType: string | undefined,
  paymentMode: "online" | "cod",
  chefStatus?: "pending" | "accepted" | "rejected"
): string => {
  const advanceService = isAdvanceServiceType(serviceType);
  const mode = String(paymentMode || "").toLowerCase();

  if (advanceService && mode === "online") {
    return "Advance Settled";
  }
  if (mode === "online") {
    return "Payment Settled";
  }
  return "Cash Pending";
};

/* ═════════════════════════════════════════════════════════════════
   CASHFREE SDK WRAPPER
   ═════════════════════════════════════════════════════════════════ */

export interface CashfreeCheckoutParams {
  /** Cashfree `order_id` returned by the backend create-order call. */
  orderId: string;
  /** Cashfree `payment_session_id` returned by the backend. */
  paymentSessionId: string;
  /** Environment — SANDBOX in dev, PRODUCTION in release. */
  environment?: CashfreeEnv;
  /** Optional colour customisation matching the app theme. */
  theme?: {
    backgroundColor?: string;
    primaryTextColor?: string;
    secondaryTextColor?: string;
    buttonBackgroundColor?: string;
    buttonTextColor?: string;
  };
}

export interface CashfreeCheckoutResult {
  status: "SUCCESS" | "CANCELLED" | "FAILED";
  orderId: string;
  paymentId?: string;
  signature?: string;
  message?: string;
}

/**
 * Opens the Cashfree SDK checkout UI and resolves when the user
 * completes / cancels / fails the payment.
 *
 * The caller is expected to have already created a Cashfree order
 * on the backend (via `createCashfreeOrder` below) and pass the
 * resulting `orderId` + `paymentSessionId` here.
 */
export const openCashfreeCheckout = (
  params: CashfreeCheckoutParams
): Promise<CashfreeCheckoutResult> => {
  return new Promise<CashfreeCheckoutResult>((resolve) => {
    try {
      // Wire the one-shot callbacks for this session. Cashfree's
      // SDK uses module-level listeners, so we set them right
      // before invoking `doPayment` and clear them afterwards.
      const onVerify = (response: any) => {
        try {
          CFPaymentGatewayService.removeCallback();
        } catch (_) {
          // silent
        }
        resolve({
          status: "SUCCESS",
          orderId: String(response?.orderID || response?.order_id || params.orderId),
          paymentId: String(response?.paymentID || response?.payment_id || ""),
          signature: String(response?.signature || ""),
        });
      };

      const onError = (error: any, orderId?: string) => {
        try {
          CFPaymentGatewayService.removeCallback();
        } catch (_) {
          // silent
        }

        const message = String(
          error?.message ||
            error?.status ||
            (typeof error === "string" ? error : "") ||
            "Payment failed"
        );

        // Cashfree reports user-initiated cancels as an error with
        // "USER_CANCELLED" or a status of "CANCELLED".
        const isCancel =
          /cancel/i.test(message) ||
          String(error?.status || "").toUpperCase() === "CANCELLED";

        resolve({
          status: isCancel ? "CANCELLED" : "FAILED",
          orderId: String(orderId || params.orderId),
          message,
        });
      };

      CFPaymentGatewayService.setCallback({ onVerify, onError });

      // ✅ FIX: Use the string literal instead of the type-only
      //         `CFEnvironment` enum. The SDK accepts the string
      //         directly and this eliminates the runtime
      //         `undefined` crash.
      const env: CashfreeEnv = params.environment || "SANDBOX";

      const session = new CFSession(
        params.paymentSessionId,
        params.orderId,
        env as any
      );

      const theme = new CFThemeBuilder()
        .setNavigationBarBackgroundColor(
          params.theme?.buttonBackgroundColor || "#2E7D32"
        )
        .setNavigationBarTextColor(
          params.theme?.buttonTextColor || "#FFFFFF"
        )
        .setButtonBackgroundColor(
          params.theme?.buttonBackgroundColor || "#2E7D32"
        )
        .setButtonTextColor(
          params.theme?.buttonTextColor || "#FFFFFF"
        )
        .setPrimaryTextColor(
          params.theme?.primaryTextColor || "#111827"
        )
        .setSecondaryTextColor(
          params.theme?.secondaryTextColor || "#6B7280"
        )
        .build();

      // ✅ Cast to `any` so TypeScript uses the wider
      //    `doPayment(session, theme?)` signature from our
      //    `src/types/cashfree.d.ts` augmentation instead of the
      //    1-arg signature from `cashfree-pg-api-contract`.
      (CFPaymentGatewayService as any).doPayment(session, theme);
    } catch (err: any) {
      resolve({
        status: "FAILED",
        orderId: params.orderId,
        message: err?.message || "Failed to open Cashfree checkout",
      });
    }
  });
};

/* ═════════════════════════════════════════════════════════════════
   BACKEND BRIDGE
   ═════════════════════════════════════════════════════════════════ */

export interface CreateCashfreeOrderPayload {
  /** Grand total for the order (what the customer owes in total). */
  amount: number;
  /** Amount to actually charge NOW (advance or full). */
  chargeAmount: number;
  /** Arbitrary metadata forwarded to Cashfree (order id, user id…). */
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  /** Free-form key/value pairs visible on the Cashfree dashboard. */
  notes?: Record<string, string>;
}

export interface CreateCashfreeOrderResponse {
  orderId: string;
  paymentSessionId: string;
  amount: number;
}

/**
 * Creates a Cashfree order on the backend and returns the
 * `orderId` + `paymentSessionId` needed to open the SDK.
 *
 * The backend endpoint is expected to:
 *   • validate the JWT
 *   • create the Cashfree order via the Cashfree REST API
 *   • return { orderId, paymentSessionId, amount }
 */
export const createCashfreeOrder = async (
  payload: CreateCashfreeOrderPayload
): Promise<CreateCashfreeOrderResponse> => {
  const response = await api.post(
    "/api/payments/create-order",
    {
      amount: payload.chargeAmount,
      currency: "INR",
      customerId: payload.customerId,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      notes: {
        ...(payload.notes || {}),
        grandTotal: String(payload.amount),
      },
    }
  );

  const data = response?.data || {};
  const orderId = String(
    data.orderId || data.order_id || data?.data?.orderId || ""
  );
  const paymentSessionId = String(
    data.paymentSessionId ||
      data.payment_session_id ||
      data?.data?.paymentSessionId ||
      ""
  );

  if (!orderId || !paymentSessionId) {
    throw new Error(
      "Cashfree order creation failed: missing orderId or paymentSessionId"
    );
  }

  return {
    orderId,
    paymentSessionId,
    amount: Number(data.amount ?? payload.chargeAmount),
  };
};

/**
 * Verifies a completed Cashfree payment on the backend. Returns
 * `true` only when the backend confirms the payment status via
 * Cashfree's REST API (no trust in the client response).
 *
 * The backend endpoint is expected to:
 *   • accept { orderId, paymentId, signature }
 *   • call Cashfree GET /orders/{orderId}/payments
 *   • return { verified: boolean, paymentId, amount }
 */
export const verifyCashfreePayment = async (params: {
  orderId: string;
  paymentId?: string;
  signature?: string;
}): Promise<{ verified: boolean; paymentId?: string; amount?: number }> => {
  try {
    const response = await api.post("/api/payments/verify", params);
    const data = response?.data || {};
    return {
      verified: Boolean(data.verified ?? data.success ?? false),
      paymentId: data.paymentId || params.paymentId,
      amount:
        data.amount !== undefined ? Number(data.amount) : undefined,
    };
  } catch (err: any) {
    console.log(
      "verifyCashfreePayment error:",
      err?.response?.data || err?.message || err
    );
    return { verified: false };
  }
};

/* ═════════════════════════════════════════════════════════════════
   CONVENIENCE: END-TO-END FLOW
   ═════════════════════════════════════════════════════════════════ */

/**
 * One-shot helper that runs the full flow:
 *   1. Create Cashfree order on backend.
 *   2. Open SDK and await result.
 *   3. On SUCCESS → verify on backend.
 *   4. Return a final `{ ok, orderId, paymentId }` shape.
 *
 * `checkout.tsx` can call this and only needs to branch on `ok`.
 */
export const runCashfreePaymentFlow = async (params: {
  serviceType?: string;
  totalAmount: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  theme?: CashfreeCheckoutParams["theme"];
}): Promise<{
  ok: boolean;
  status: "SUCCESS" | "CANCELLED" | "FAILED";
  orderId?: string;
  paymentId?: string;
  signature?: string;
  chargeAmount: number;
  advanceAmount: number;
  pendingAmount: number;
  message?: string;
}> => {
  const { advance, pending, total } = computeAdvanceSplit(
    params.totalAmount,
    params.serviceType,
    "online"
  );

  try {
    const created = await createCashfreeOrder({
      amount: total,
      chargeAmount: advance,
      customerId: params.customerId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail,
      notes: {
        serviceType: String(params.serviceType || ""),
        mode: "online",
      },
    });

    // ✅ FIX: Use string literals "PRODUCTION" / "SANDBOX" instead
    //         of the (undefined at runtime) CFEnvironment enum.
    const env: CashfreeEnv =
      (process.env.EXPO_PUBLIC_CASHFREE_ENV || "").toLowerCase() ===
      "production"
        ? "PRODUCTION"
        : "SANDBOX";

    const sdkResult = await openCashfreeCheckout({
      orderId: created.orderId,
      paymentSessionId: created.paymentSessionId,
      environment: env,
      theme: params.theme,
    });

    if (sdkResult.status !== "SUCCESS") {
      return {
        ok: false,
        status: sdkResult.status,
        orderId: created.orderId,
        chargeAmount: advance,
        advanceAmount: advance,
        pendingAmount: pending,
        message: sdkResult.message,
      };
    }

    const verification = await verifyCashfreePayment({
      orderId: created.orderId,
      paymentId: sdkResult.paymentId,
      signature: sdkResult.signature,
    });

    if (!verification.verified) {
      return {
        ok: false,
        status: "FAILED",
        orderId: created.orderId,
        paymentId: sdkResult.paymentId,
        signature: sdkResult.signature,
        chargeAmount: advance,
        advanceAmount: advance,
        pendingAmount: pending,
        message: "Payment verification failed on the server",
      };
    }

    return {
      ok: true,
      status: "SUCCESS",
      orderId: created.orderId,
      paymentId: verification.paymentId || sdkResult.paymentId,
      signature: sdkResult.signature,
      chargeAmount: advance,
      advanceAmount: advance,
      pendingAmount: pending,
    };
  } catch (err: any) {
    console.log(
      "runCashfreePaymentFlow error:",
      err?.response?.data || err?.message || err
    );
    return {
      ok: false,
      status: "FAILED",
      chargeAmount: advance,
      advanceAmount: advance,
      pendingAmount: pending,
      message: err?.message || "Payment failed unexpectedly",
    };
  }
};

export default {
  ADVANCE_PERCENT,
  isAdvanceServiceType,
  canUseCOD,
  computeAdvanceSplit,
  getPaymentBadgeLabel,
  openCashfreeCheckout,
  createCashfreeOrder,
  verifyCashfreePayment,
  runCashfreePaymentFlow,
};