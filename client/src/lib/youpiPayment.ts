import * as WebBrowser from "expo-web-browser";
import api from "@/src/lib/api";

export type YoupiPaymentStatus = {
  success: boolean;
  orderId: string;
  paymentStatus: string;
  paymentCaptured: boolean;
  paidAt: string | null;
  utrNumber: string;
  totalAmount: number;
};

export async function openYoupiCheckout(orderId: string): Promise<void> {
  const cleanOrderId = String(orderId || "").trim();

  if (!cleanOrderId) {
    throw new Error("A KatBox order ID is required.");
  }

  const response = await api.post("/api/payments/youpi/create", {
    orderId: cleanOrderId,
  });

  if (!response.data?.success || !response.data?.checkoutUrl) {
    throw new Error(
      response.data?.message || "Could not start YouPI checkout."
    );
  }

  await WebBrowser.openBrowserAsync(
    String(response.data.checkoutUrl)
  );
}

export async function getYoupiPaymentStatus(
  orderId: string
): Promise<YoupiPaymentStatus> {
  const cleanOrderId = String(orderId || "").trim();

  if (!cleanOrderId) {
    throw new Error("A KatBox order ID is required.");
  }

  const response = await api.get(
    `/api/payments/youpi/status/${encodeURIComponent(cleanOrderId)}`
  );

  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Could not check payment status."
    );
  }

  return response.data as YoupiPaymentStatus;
}