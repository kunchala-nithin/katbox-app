import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

export type YoupiPaymentStatus = {
  success: boolean;
  orderId: string;
  paymentStatus: string;
  paymentCaptured: boolean;
  paidAt: string | null;
  utrNumber: string;
  totalAmount: number;
};

/**
 * Launches the hosted YouPI checkout for an already-created KatBox order.
 * The browser return is NOT proof of payment. Call getYoupiPaymentStatus and
 * only trust paymentCaptured/paymentStatus after the signed backend webhook.
 */
export async function openYoupiCheckout(orderId: string): Promise<void> {
  const cleanOrderId = String(orderId || "").trim();
  if (!cleanOrderId) throw new Error("A KatBox order ID is required to start YouPI checkout.");

  const response = await api.post("/api/payments/youpi/create", { orderId: cleanOrderId });
  if (!response.data?.success || !response.data?.checkoutUrl) {
    throw new Error(response.data?.message || "Could not start YouPI checkout.");
  }

  // User may close the browser without paying; this does not change payment status.
  await WebBrowser.openBrowserAsync(String(response.data.checkoutUrl));
}

/** Query MongoDB-backed status; the server webhook is the only success authority. */
export async function getYoupiPaymentStatus(orderId: string): Promise<YoupiPaymentStatus> {
  const cleanOrderId = String(orderId || "").trim();
  if (!cleanOrderId) throw new Error("A KatBox order ID is required to check payment status.");
  const response = await api.get(`/api/payments/youpi/status/${encodeURIComponent(cleanOrderId)}`);
  return response.data as YoupiPaymentStatus;
}
