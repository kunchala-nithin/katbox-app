declare module "react-native-cashfree-pg-sdk" {
  export class CFSession {
    constructor(
      paymentSessionId: string,
      orderId: string,
      environment: string
    );
  }

  export interface CFCallback {
    onVerify(orderID: string): void;
    onError(error: any, orderID: string): void;
  }

  export class CFPaymentGatewayService {
    static setCallback(callback: CFCallback): void;
    static removeCallback(): void;
    static doPayment(session: CFSession): void;
    static doWebPayment(session: CFSession): void;
  }
}

declare module "cashfree-pg-api-contract" {
  export class CFThemeBuilder {
    setNavigationBarBackgroundColor(color: string): this;
    setNavigationBarTextColor(color: string): this;
    setButtonBackgroundColor(color: string): this;
    setButtonTextColor(color: string): this;
    setPrimaryTextColor(color: string): this;
    setSecondaryTextColor(color: string): this;
    build(): any;
  }
}