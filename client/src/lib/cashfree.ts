// src/lib/cashfree.ts
//
// Cashfree Payment Gateway wrapper for KatBox.
import { Platform } from "react-native";
import {
  CFPaymentGatewayService,
  CFSession,
} from "react-native-cashfree-pg-sdk";
import { CFThemeBuilder } from "cashfree-pg-api-contract";
import api from "./api";

export type CashfreeEnv = "SANDBOX" | "PRODUCTION";

export const ADVANCE_PERCENT = 45;

export const isAdvanceServiceType = (serviceType?: string): boolean => {
  const s = String(serviceType || "").toLowerCase().trim();
  return s === "catering" || s === "mealbox";
};

export const canUseCOD = (serviceType?: string): boolean => {
  const s = String(serviceType || "").toLowerCase().trim();
  return s === "quickbites" || s === "homemade";
};

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
    const advance = Math.round((rounded * (ADVANCE_PERCENT / 100)) * 100) / 100;
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

export interface CashfreeCheckoutParams {
  orderId: string;
  paymentSessionId: string;
  environment?: CashfreeEnv;
  theme?: {
    backgroundColor?: string;
    primaryTextColor?: string;
    secondaryTextColor?: string;
    buttonBackgroundColor?: string;
    buttonTextColor?: string;
  };
}

export interface CashfreeCheckoutResult {
  ok: boolean;
  status: "SUCCESS" | "CANCELLED" | "FAILED";
  orderId: string;
  paymentId?: string;
  signature?: string;
  message?: string;
}

export interface RunCashfreeFlowParams {
  serviceType: string;
  totalAmount: number;
  customerld?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  orderPayload?: Record<string, any>;
}

export const openCashfreeCheckout = (
  params: CashfreeCheckoutParams
): Promise<CashfreeCheckoutResult> => {
  return new Promise<CashfreeCheckoutResult>((resolve) => {
    try {
      const onVerify = (response: any) => {
        try {
          CFPaymentGatewayService.removeCallback();
        } catch (e) {}
        const retOrderId = String(
          response?.orderID || response?.order_id || params.orderId
        );
        resolve({
          ok: true,
          status: "SUCCESS",
          orderId: retOrderId,
          paymentId: String(response?.paymentID || response?.payment_id || ""),
          signature: String(response?.signature || ""),
        });
      };

      const onError = (error: any, orderId?: string) => {
        try {
          CFPaymentGatewayService.removeCallback();
        } catch (e) {}
        const message = String(
          error?.message ||
            error?.status ||
            (typeof error === "string" ? error : "") ||
            "Payment failed or cancelled."
        );
        const isCancel =
          /cancel/i.test(message) ||
          String(error?.status || "").toUpperCase() === "CANCELLED";

        resolve({
          ok: false,
          status: isCancel ? "CANCELLED" : "FAILED",
          orderId: String(orderId || params.orderId),
          message,
        });
      };

      CFPaymentGatewayService.setCallback({ onVerify, onError });

      const env: CashfreeEnv = params.environment || "SANDBOX";
      const session = new CFSession(
        params.paymentSessionId,
        params.orderId,
        env as any
      );

      CFPaymentGatewayService.doPayment(session);
    } catch (err: any) {
      resolve({
        ok: false,
        status: "FAILED",
        orderId: params.orderId,
        message: err?.message || "Could not launch payment Gateway.",
      });
    }
  });
};

export const runCashfreePaymentFlow = async (
  params: RunCashfreeFlowParams
): Promise<CashfreeCheckoutResult> => {
  try {
    const createRes = await api.post("/api/payments/cashfree/create-order", {
      orderAmount: params.totalAmount,
      orderCurrency: "INR",
      customerId: params.customerld || "GUEST_USER",
      customerName: params.customerName || "Customer",
      customerEmail: params.customerEmail || "customer@example.com",
      customerPhone: params.customerPhone || "9999999999",
      serviceType: params.serviceType,
      orderPayload: params.orderPayload || {},
    });

    if (!createRes.data || !createRes.data.success || !createRes.data.paymentSessionId) {
      return {
        ok: false,
        status: "FAILED",
        orderId: createRes.data?.orderId || "",
        message: createRes.data?.message || "Failed to initialize payment session with Cashfree.",
      };
    }

    const { orderId, paymentSessionId, environment } = createRes.data;

    const checkoutResult = await openCashfreeCheckout({
      orderId,
      paymentSessionId,
      environment: environment || "SANDBOX",
    });

    if (checkoutResult.ok && checkoutResult.status === "SUCCESS") {
      try {
        const verifyRes = await api.post("/api/payments/cashfree/verify", {
          orderId: checkoutResult.orderId,
          paymentId: checkoutResult.paymentId,
          signature: checkoutResult.signature,
          orderPayload: params.orderPayload || {},
        });

        if (verifyRes.data && verifyRes.data.success) {
          return {
            ...checkoutResult,
            orderId: verifyRes.data.orderId || checkoutResult.orderId,
          };
        } else {
          return {
            ok: false,
            status: "FAILED",
            orderId: checkoutResult.orderId,
            message: verifyRes.data?.message || "Payment verification failed on server.",
          };
        }
      } catch (verifyErr: any) {
        return {
          ok: false,
          status: "FAILED",
          orderId: checkoutResult.orderId,
          message: verifyErr?.message || "Server error while verifying payment.",
        };
      }
    }

    return checkoutResult;
  } catch (error: any) {
    return {
      ok: false,
      status: "FAILED",
      orderId: "",
      message: error?.response?.data?.message || error?.message || "Error starting payment flow.",
    };
  }
};

const startCashfreePayment = {
  computeAdvanceSplit,
  isAdvanceServiceType,
  canUseCOD,
  getPaymentBadgeLabel,
  openCashfreeCheckout,
  runCashfreePaymentFlow,
};

export default startCashfreePayment;