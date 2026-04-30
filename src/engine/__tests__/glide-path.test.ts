import { describe, it, expect } from "vitest";
import { interpolateGlidePath } from "../glide-path";
import type { AssetAllocation, GlidePathPoint } from "@/models/account";

const FALLBACK: AssetAllocation = {
  usLargeCap: 0.6,
  usSmallCap: 0,
  intlDeveloped: 0,
  intlEmerging: 0,
  usBonds: 0.4,
  tips: 0,
  cash: 0,
};

function alloc(stocks: number): AssetAllocation {
  return {
    usLargeCap: stocks,
    usSmallCap: 0,
    intlDeveloped: 0,
    intlEmerging: 0,
    usBonds: 1 - stocks,
    tips: 0,
    cash: 0,
  };
}

describe("interpolateGlidePath", () => {
  it("returns fallback when glide path is empty", () => {
    const result = interpolateGlidePath(40, [], FALLBACK);
    expect(result).toEqual(FALLBACK);
  });

  it("returns first allocation when age is at or before first point", () => {
    const path: GlidePathPoint[] = [
      { age: 40, allocation: alloc(0.9) },
      { age: 65, allocation: alloc(0.4) },
    ];
    expect(interpolateGlidePath(35, path, FALLBACK)).toEqual(alloc(0.9));
    expect(interpolateGlidePath(40, path, FALLBACK)).toEqual(alloc(0.9));
  });

  it("returns last allocation when age is at or past last point", () => {
    const path: GlidePathPoint[] = [
      { age: 40, allocation: alloc(0.9) },
      { age: 65, allocation: alloc(0.4) },
    ];
    expect(interpolateGlidePath(65, path, FALLBACK)).toEqual(alloc(0.4));
    expect(interpolateGlidePath(80, path, FALLBACK)).toEqual(alloc(0.4));
  });

  it("interpolates linearly between two points", () => {
    const path: GlidePathPoint[] = [
      { age: 40, allocation: alloc(0.9) },
      { age: 60, allocation: alloc(0.5) },
    ];
    // Halfway through: 40→60, age 50 ⇒ stocks = 0.7
    const mid = interpolateGlidePath(50, path, FALLBACK);
    expect(mid.usLargeCap).toBeCloseTo(0.7, 6);
    expect(mid.usBonds).toBeCloseTo(0.3, 6);
  });

  it("interpolates correctly across multiple segments", () => {
    const path: GlidePathPoint[] = [
      { age: 30, allocation: alloc(1.0) },
      { age: 50, allocation: alloc(0.6) },
      { age: 70, allocation: alloc(0.4) },
    ];
    // First segment midpoint
    expect(interpolateGlidePath(40, path, FALLBACK).usLargeCap).toBeCloseTo(0.8, 6);
    // Second segment midpoint
    expect(interpolateGlidePath(60, path, FALLBACK).usLargeCap).toBeCloseTo(0.5, 6);
  });

  it("handles a single-point glide path", () => {
    const path: GlidePathPoint[] = [{ age: 50, allocation: alloc(0.5) }];
    // Below
    expect(interpolateGlidePath(30, path, FALLBACK)).toEqual(alloc(0.5));
    // At
    expect(interpolateGlidePath(50, path, FALLBACK)).toEqual(alloc(0.5));
    // Above
    expect(interpolateGlidePath(70, path, FALLBACK)).toEqual(alloc(0.5));
  });
});
