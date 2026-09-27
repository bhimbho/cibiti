import { randomBytes } from "node:crypto";

/**
 * Seeded randomness for exam papers.
 *
 * Two properties are wanted at once, and they pull apart:
 *
 * - **Unpredictable.** A candidate must not be able to work out which questions
 *   they will be given. So the seed comes from the OS CSPRNG, not `Math.random`,
 *   whose xorshift128+ state can be reconstructed from observed output.
 * - **Reproducible.** When a candidate disputes their paper, staff must be able to
 *   show how it was built. So the seed is stored with the attempt and the draw is
 *   a pure function of it.
 *
 * The generator below is not itself cryptographic — it does not need to be. All
 * the entropy is in the seed; the generator only spreads it deterministically.
 */

/** A fresh, unguessable seed. 128 bits, hex-encoded for storage and display. */
export function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * A deterministic generator from a seed string. Same seed, same sequence, on any
 * machine and any Node version — which is what makes a paper replayable.
 *
 * mulberry32: one 32-bit state word, a good scramble, and fast. The seed string
 * is folded into that word with FNV-1a.
 */
export function seededRandom(seed: string): () => number {
  let state = fnv1a(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the seed's bytes, so every character affects the state. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
