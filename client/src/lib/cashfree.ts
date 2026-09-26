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
//   1. Call `startCashfreePayment(...)` and await its result.
//   2. On `success === true` → navigate to the confirmation screen.

import { Platform } from "react-native";
import {
  CFPaymentGatewayService,
  CFSession,
} from "react-native-cashfree-pg-sdk";
import api from "./api";
import { CFEnvironment, CFThemeBuilder } from "cashfree-pg-api-contract";

/* ═════════════════════════════════════════════════════════════════
   BUSINESS RULES
   ═════════════════════════════════════════════════════════════════ */

export const ADVANCE_PERCENT = 45;

export const isAdvanceServiceType = (serviceType?: string): boolean => {
  const s = String(serviceType || "").toLowerCase().trim();
  return s === "catering" || s === "mealbox";
};

export const canUseCOD = (serviceType?: string): boolean => {
  const s = String(serviceType || "").toLowerCase().trim();
  return s === "quickbites" || s === "homemade";
};

/* ═════════════════════════════════════════════════════════════════
   AMOUNT HELPERS
   ═════════════════════════════════════════════════════════════════ */

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

  return { total: rounded, advance: rounded, pending: 0 };
};

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
  orderId: string;
  paymentSessionId: string;
  environment?: CFEnvironment;
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

export const openCashfreeCheckout = (
  params: CashfreeCheckoutParams
): Promise<CashfreeCheckoutResult> => {
  return new Promise<CashfreeCheckoutResult>((resolve) => {
    try {
      const onVerify = (response: any) => {
        try {
          CFPaymentGatewayService.removeCallback();
        } catch (_) {}
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
        } catch (_) {}

        const message = String(
          error?.message ||
            error?.status ||
            (typeof error === "string" ? error : "") ||
            "Payment failed"
        );

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

      const env = params.environment || CFEnvironment.SANDBOX;

      const session = new CFSession(
        params.paymentSessionId,
        params.orderId,
        env as any
      );

      const theme = new CFThemeBuilder()
        .setNavigationBarBackgroundColor(params.theme?.buttonBackgroundColor || "#2E7D32")
        .setNavigationBarTextColor(params.theme?.buttonTextColor || "#FFFFFF")
        .setButtonBackgroundColor(params.theme?.buttonBackgroundColor || "#2E7D32")
        .setButtonTextColor(params.theme?.buttonTextColor || "#FFFFFF")
        .setPrimaryTextColor(params.theme?.primaryTextColor || "#111827")
        .setSecondaryTextColor(params.theme?.secondaryTextColor || "#6B7280")
        .build();

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
  amount: number;
  chargeAmount: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: Record<string, string>;
}

export interface CreateCashfreeOrderResponse {
  orderId: string;
  paymentSessionId: string;
  amount: number;
}

export const createCashfreeOrder = async (
  payload: CreateCashfreeOrderPayload
): Promise<CreateCashfreeOrderResponse> => {
  const response = await api.post("/api/payments/create-order", {
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
  });

  const data = response?.data || {};
  const orderId = String(data.orderId || data.order_id || data?.data?.orderId || "");
  const paymentSessionId = String(
    data.paymentSessionId || data.payment_session_id || data?.data?.paymentSessionId || ""
  );

  if (!orderId || !paymentSessionId) {
    throw new Error("Cashfree order creation failed: missing orderId or paymentSessionId");
  }

  return {
    orderId,
    paymentSessionId,
    amount: Number(data.amount ?? payload.chargeAmount),
  };
};

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
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
    };
  } catch (err: any) {
    console.log("verifyCashfreePayment error:", err?.response?.data || err?.message || err);
    return { verified: false };
  }
};

/* ═════════════════════════════════════════════════════════════════
   CONVENIENCE: END-TO-END FLOW
   ═════════════════════════════════════════════════════════════════ */

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

    const sdkResult = await openCashfreeCheckout({
      orderId: created.orderId,
      paymentSessionId: created.paymentSessionId,
      environment:
        (process.env.EXPO_PUBLIC_CASHFREE_ENV || "").toLowerCase() === "production"
          ? CFEnvironment.PRODUCTION
          : CFEnvironment.SANDBOX,
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
    console.log("runCashfreePaymentFlow error:", err?.response?.data || err?.message || err);
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

/* ═════════════════════════════════════════════════════════════════
   ✅ COMPAT WRAPPER — startCashfreePayment
   ═════════════════════════════════════════════════════════════════
   Legacy convenience that returns { success, order, message }.
   Internally delegates to runCashfreePaymentFlow and POSTs the
   order to /api/orders/create with the verified payment metadata
   attached, so the backend can persist the correct payment status,
   chefStatus, and deliveryStatus.
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
    const { orderPayload, customerId } = params;
    const serviceType = String(orderPayload?.serviceType || "");
    const advanceService = serviceType === "catering" || serviceType === "mealbox";

    const flow = await runCashfreePaymentFlow({
      serviceType,
      totalAmount: Number(orderPayload?.totalAmount) || params.amount,
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

    const enriched = {
      ...orderPayload,
      cashfreeOrderId: flow.orderId,
      cashfreePaymentId: flow.paymentId,
      cashfreeSignature: flow.signature,
      chargedAmount: flow.chargeAmount,
      isAdvanceOrder: advanceService,
      advancePercent: advanceService ? 45 : 0,
    };

    const res = await api.post("/api/orders/create", enriched, {
      headers: { "Content-Type": "application/json" },
    });

    if (res.data?.success && res.data?.order) {
      return {
        success: true,
        order: res.data.order,
        orderId: res.data.order.orderId,
        paymentId: flow.paymentId,
      };
    }

    return {
      success: false,
      message: res.data?.message || "Failed to store order after payment.",
    };
  } catch (err: any) {
    console.log("startCashfreePayment error:", err?.response?.data || err?.message || err);
    return {
      success: false,
      message:
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong while processing the payment.",
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
  startCashfreePayment,
};