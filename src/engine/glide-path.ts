import type { Age } from "@/models/core";
import type { AssetAllocation, GlidePathPoint } from "@/models/account";

const ALLOCATION_KEYS: (keyof AssetAllocation)[] = [
  "usLargeCap",
  "usSmallCap",
  "intlDeveloped",
  "intlEmerging",
  "usBonds",
  "tips",
  "cash",
];

function lerpAllocation(a: AssetAllocation, b: AssetAllocation, t: number): AssetAllocation {
  const result: Partial<AssetAllocation> = {};
  for (const k of ALLOCATION_KEYS) {
    result[k] = a[k] + (b[k] - a[k]) * t;
  }
  return result as AssetAllocation;
}

// Linear interpolation between glide-path control points by age. Beyond the
// last point, the final allocation is held constant; before the first point,
// the initial allocation is used.
//
// Caller MUST pass `glidePath` already sorted by age. Precompute does this
// once per account so we don't re-sort per-year-per-iteration here.
export function interpolateGlidePath(
  age: Age,
  glidePath: GlidePathPoint[],
  fallback: AssetAllocation,
): AssetAllocation {
  if (glidePath.length === 0) return fallback;

  if (age <= glidePath[0].age) return { ...glidePath[0].allocation };
  if (age >= glidePath[glidePath.length - 1].age) {
    return { ...glidePath[glidePath.length - 1].allocation };
  }

  for (let i = 0; i < glidePath.length - 1; i++) {
    const lo = glidePath[i];
    const hi = glidePath[i + 1];
    if (age >= lo.age && age <= hi.age) {
      const span = hi.age - lo.age;
      const t = span === 0 ? 0 : (age - lo.age) / span;
      return lerpAllocation(lo.allocation, hi.allocation, t);
    }
  }

  return fallback;
}
