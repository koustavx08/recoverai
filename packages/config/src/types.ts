export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly isProduction: boolean;
  readonly appUrl: string;
  readonly database: {
    readonly url?: string;
  };
  readonly payments: {
    readonly provider: "simulator" | "razorpay";
    readonly razorpay?: {
      readonly keyId: string;
      readonly keySecret: string;
    };
  };
  readonly ai: {
    readonly provider: "anthropic";
    readonly apiKey?: string;
    readonly model?: string;
    /** True only when both apiKey and model are set — i.e. an LLM-backed agent can actually run. */
    readonly isConfigured: boolean;
  };
}
