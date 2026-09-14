declare module "react-native-razorpay" {
  export interface RazorpayOptions {
    description?: string;
    image?: string;
    currency: string;
    key: string;
    amount: number | string;
    name: string;
    order_id: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
    };
    method?: string;
    theme?: {
      color?: string;
    };
    [key: string]: any;
  }

  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  export interface RazorpayErrorResponse {
    code: number;
    description: string;
    field?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: any;
  }

  export default class RazorpayCheckout {
    static open(
      options: RazorpayOptions
    ): Promise<RazorpaySuccessResponse>;
  }
}