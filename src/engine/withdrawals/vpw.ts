import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Variable Percentage Withdrawal (Bogleheads VPW).
// Spending = balance × table[age][equityWeight]. Table values come from the
// published Bogleheads VPW spreadsheet (https://bogleheads.org/wiki/VPW), which
// derives the percentage from a PMT-style annuity over remaining lifetime
// using a real return that depends on the chosen equity allocation. Higher
// equity → higher expected real return → lower withdrawal % at young ages
// (more growth still ahead) but eventually catching up.
//
// Three rate columns are published; we interpolate between equity weights
// 0.20 / 0.50 / 0.80 to support arbitrary allocations.

interface VpwRow {
  age: number;
  rate20: number; // 20% equity / 80% bonds
  rate50: number; // 50% / 50%
  rate80: number; // 80% / 20%
}

// Excerpted from the Bogleheads VPW table (ages 50-100). Beyond age 100 the
// table caps near 50%, but the engine clamps to 1.0 anyway.
// Source: Bogleheads VPW spreadsheet v2.9 (retrieved 2026-04-25). When the
// upstream table is updated, refresh this snapshot and bump the version tag.
const VPW_TABLE: VpwRow[] = [
  { age: 50, rate20: 0.034, rate50: 0.038, rate80: 0.043 },
  { age: 51, rate20: 0.034, rate50: 0.039, rate80: 0.043 },
  { age: 52, rate20: 0.035, rate50: 0.039, rate80: 0.044 },
  { age: 53, rate20: 0.035, rate50: 0.04, rate80: 0.044 },
  { age: 54, rate20: 0.036, rate50: 0.04, rate80: 0.045 },
  { age: 55, rate20: 0.036, rate50: 0.041, rate80: 0.046 },
  { age: 56, rate20: 0.037, rate50: 0.041, rate80: 0.046 },
  { age: 57, rate20: 0.038, rate50: 0.042, rate80: 0.047 },
  { age: 58, rate20: 0.038, rate50: 0.043, rate80: 0.048 },
  { age: 59, rate20: 0.039, rate50: 0.043, rate80: 0.048 },
  { age: 60, rate20: 0.04, rate50: 0.044, rate80: 0.049 },
  { age: 61, rate20: 0.041, rate50: 0.045, rate80: 0.05 },
  { age: 62, rate20: 0.042, rate50: 0.046, rate80: 0.051 },
  { age: 63, rate20: 0.043, rate50: 0.047, rate80: 0.052 },
  { age: 64, rate20: 0.043, rate50: 0.048, rate80: 0.053 },
  { age: 65, rate20: 0.044, rate50: 0.049, rate80: 0.054 },
  { age: 66, rate20: 0.045, rate50: 0.05, rate80: 0.055 },
  { age: 67, rate20: 0.046, rate50: 0.051, rate80: 0.056 },
  { age: 68, rate20: 0.048, rate50: 0.052, rate80: 0.058 },
  { age: 69, rate20: 0.049, rate50: 0.054, rate80: 0.059 },
  { age: 70, rate20: 0.05, rate50: 0.055, rate80: 0.06 },
  { age: 71, rate20: 0.052, rate50: 0.057, rate80: 0.062 },
  { age: 72, rate20: 0.053, rate50: 0.058, rate80: 0.063 },
  { age: 73, rate20: 0.055, rate50: 0.06, rate80: 0.065 },
  { age: 74, rate20: 0.057, rate50: 0.062, rate80: 0.067 },
  { age: 75, rate20: 0.059, rate50: 0.064, rate80: 0.069 },
  { age: 76, rate20: 0.061, rate50: 0.066, rate80: 0.071 },
  { age: 77, rate20: 0.063, rate50: 0.068, rate80: 0.073 },
  { age: 78, rate20: 0.066, rate50: 0.071, rate80: 0.076 },
  { age: 79, rate20: 0.069, rate50: 0.074, rate80: 0.078 },
  { age: 80, rate20: 0.072, rate50: 0.077, rate80: 0.081 },
  { age: 81, rate20: 0.075, rate50: 0.08, rate80: 0.085 },
  { age: 82, rate20: 0.079, rate50: 0.084, rate80: 0.088 },
  { age: 83, rate20: 0.083, rate50: 0.088, rate80: 0.092 },
  { age: 84, rate20: 0.088, rate50: 0.092, rate80: 0.097 },
  { age: 85, rate20: 0.093, rate50: 0.098, rate80: 0.102 },
  { age: 86, rate20: 0.099, rate50: 0.103, rate80: 0.108 },
  { age: 87, rate20: 0.106, rate50: 0.11, rate80: 0.115 },
  { age: 88, rate20: 0.114, rate50: 0.118, rate80: 0.122 },
  { age: 89, rate20: 0.123, rate50: 0.127, rate80: 0.131 },
  { age: 90, rate20: 0.134, rate50: 0.137, rate80: 0.141 },
  { age: 91, rate20: 0.146, rate50: 0.149, rate80: 0.153 },
  { age: 92, rate20: 0.16, rate50: 0.163, rate80: 0.166 },
  { age: 93, rate20: 0.177, rate50: 0.18, rate80: 0.183 },
  { age: 94, rate20: 0.198, rate50: 0.2, rate80: 0.202 },
  { age: 95, rate20: 0.222, rate50: 0.224, rate80: 0.226 },
  { age: 96, rate20: 0.252, rate50: 0.254, rate80: 0.255 },
  { age: 97, rate20: 0.29, rate50: 0.291, rate80: 0.291 },
  { age: 98, rate20: 0.336, rate50: 0.336, rate80: 0.336 },
  { age: 99, rate20: 0.394, rate50: 0.394, rate80: 0.394 },
  { age: 100, rate20: 0.466, rate50: 0.466, rate80: 0.466 },
];

function rowFor(age: number): VpwRow {
  if (age <= VPW_TABLE[0].age) return VPW_TABLE[0];
  if (age >= VPW_TABLE[VPW_TABLE.length - 1].age) return VPW_TABLE[VPW_TABLE.length - 1];
  return VPW_TABLE[age - VPW_TABLE[0].age];
}

function interpRate(row: VpwRow, equityWeight: number): number {
  const w = Math.max(0, Math.min(1, equityWeight));
  if (w <= 0.2) return row.rate20;
  if (w <= 0.5) {
    const t = (w - 0.2) / 0.3;
    return row.rate20 + t * (row.rate50 - row.rate20);
  }
  if (w <= 0.8) {
    const t = (w - 0.5) / 0.3;
    return row.rate50 + t * (row.rate80 - row.rate50);
  }
  return row.rate80;
}

export function vpw(totalBalance: Dollars, state: WithdrawalState, _strategy: WithdrawalStrategy): Dollars {
  const row = rowFor(state.currentAge);
  // Use the true portfolio equity weight (sum of equity-class allocations
  // across risk-bearing accounts). Falling back to a CMA-derived heuristic
  // would couple VPW behavior to expected-return tweaks rather than to the
  // user's actual allocation.
  const equityWeight = Math.max(0.2, Math.min(0.8, state.portfolioEquityWeight));
  const rate = interpRate(row, equityWeight);
  return totalBalance * Math.min(1, rate);
}
