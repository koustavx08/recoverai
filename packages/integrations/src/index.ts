/**
 * @recoverai/integrations
 *
 * Vendor-agnostic PaymentProvider / RecoveryActionProvider abstractions,
 * plus a deterministic simulator implementation that requires no real
 * merchant or payment credentials, and a (currently unimplemented)
 * Razorpay-backed implementation.
 */
export * from "./interfaces/index.js";
export * from "./simulator/index.js";
export * from "./razorpay/index.js";
