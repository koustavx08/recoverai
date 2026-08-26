/**
 * Deterministic, seedable pseudo-random helpers used by the simulator so
 * that runs against the same input data are reproducible — important for
 * tests and demos, and for keeping "simulated" clearly distinguishable
 * from a real, non-reproducible payment outcome.
 *
 * This is a small FNV-1a hash, not a cryptographic PRNG — it is only ever
 * used to generate fake sandbox outcomes, never for anything security
 * sensitive.
 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Returns a deterministic float in [0, 1) derived from `seed`. */
export function seededFloat(seed: string): number {
  return hashSeed(seed) / 0xffffffff;
}
