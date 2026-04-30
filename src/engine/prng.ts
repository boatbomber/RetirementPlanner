// xoshiro128**: a fast, high-quality seeded PRNG implemented with 32-bit
// integer math (Math.imul + unsigned shifts). Outputs are produced in the
// canonical xoshiro128** scrambler order. Period is 2^128 - 1, well past
// anything Monte Carlo with 10⁵ iterations × 10² years × ~10 draws/year
// will ever consume. 32-bit math (vs. a 64-bit variant in BigInt) keeps
// nextU32 in V8's fast path, which matters because this is the simulation's
// hottest loop.

// Used when scenario.simulationConfig.seed is null. Pinning a literal keeps
// runs deterministic across sessions even when the user hasn't set a seed,
// so re-running the same scenario twice gives the same number.
export const SEED_FALLBACK = 0xc0ffee;

// SplitMix32 expands a single user seed into four 32-bit words for the
// xoshiro128** state, ensuring even small seeds produce well-mixed state.
function splitmix32(s: number): number {
  s = (s + 0x9e3779b9) | 0;
  let z = s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

function rotl32(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class PRNG {
  // Four 32-bit words held as JS numbers in the Uint32 range. Member fields
  // (rather than a typed array) so V8 keeps them in fast slots.
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private hasSpare = false;
  private spare = 0;

  constructor(seed: number) {
    // SplitMix32 produces zero output if the input cycles back to zero;
    // chain successive seeds to seed all four words.
    let s = seed | 0;
    s = (s + 1) | 0;
    this.s0 = splitmix32(s);
    s = (s + 0x9e3779b9) | 0;
    this.s1 = splitmix32(s);
    s = (s + 0x9e3779b9) | 0;
    this.s2 = splitmix32(s);
    s = (s + 0x9e3779b9) | 0;
    this.s3 = splitmix32(s);
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      // xoshiro is undefined for the all-zero state.
      this.s0 = 1;
    }
  }

  // Returns an unsigned 32-bit integer in [0, 2^32).
  nextU32(): number {
    const result = Math.imul(rotl32(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl32(this.s3, 11);
    return result;
  }

  // Returns a uniform float in [0, 1) with full 53-bit precision by combining
  // the top 27 bits of one draw with the top 26 bits of the next.
  nextFloat(): number {
    const a = this.nextU32() >>> 5; // 27 bits
    const b = this.nextU32() >>> 6; // 26 bits
    return (a * 67108864 + b) / 9007199254740992;
  }

  // Marsaglia polar method. Generates pairs of independent N(0,1) draws and
  // caches the spare. Same algorithm as the previous implementation; only
  // the underlying nextFloat() got faster.
  nextGaussian(): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }

    let u: number, v: number, s: number;
    do {
      u = this.nextFloat() * 2 - 1;
      v = this.nextFloat() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);

    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * mul;
    this.hasSpare = true;
    return u * mul;
  }

  nextGaussianArray(n: number): number[] {
    const arr = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      arr[i] = this.nextGaussian();
    }
    return arr;
  }
}
