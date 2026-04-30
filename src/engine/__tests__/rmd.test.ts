import { describe, it, expect } from "vitest";
import { rmdStartAge, getUniformLifetimeDivisor, computeRMD } from "../rmd";

describe("rmdStartAge", () => {
  // Source: SECURE Act 2.0

  it("born 1950 or earlier → age 72", () => {
    expect(rmdStartAge(1950)).toBe(72);
    expect(rmdStartAge(1940)).toBe(72);
  });

  it("born 1951-1959 → age 73", () => {
    expect(rmdStartAge(1951)).toBe(73);
    expect(rmdStartAge(1955)).toBe(73);
    expect(rmdStartAge(1959)).toBe(73);
  });

  it("born 1960+ → age 75", () => {
    expect(rmdStartAge(1960)).toBe(75);
    expect(rmdStartAge(1990)).toBe(75);
    expect(rmdStartAge(2000)).toBe(75);
  });
});

describe("getUniformLifetimeDivisor", () => {
  // Source: IRS Publication 590-B, Table III

  it("returns 0 for ages below 72", () => {
    expect(getUniformLifetimeDivisor(60)).toBe(0);
    expect(getUniformLifetimeDivisor(71)).toBe(0);
  });

  it("returns correct divisors at key ages", () => {
    expect(getUniformLifetimeDivisor(72)).toBe(27.4);
    expect(getUniformLifetimeDivisor(73)).toBe(26.5);
    expect(getUniformLifetimeDivisor(75)).toBe(24.6);
    expect(getUniformLifetimeDivisor(80)).toBe(20.2);
    expect(getUniformLifetimeDivisor(85)).toBe(16.0);
    expect(getUniformLifetimeDivisor(90)).toBe(12.2);
    expect(getUniformLifetimeDivisor(95)).toBe(8.9);
    expect(getUniformLifetimeDivisor(100)).toBe(6.4);
    expect(getUniformLifetimeDivisor(110)).toBe(3.5);
    expect(getUniformLifetimeDivisor(120)).toBe(2.0);
  });

  it("returns 2.0 for ages beyond 120", () => {
    expect(getUniformLifetimeDivisor(121)).toBe(2.0);
    expect(getUniformLifetimeDivisor(150)).toBe(2.0);
  });
});

describe("computeRMD", () => {
  it("returns 0 before RMD start age", () => {
    expect(computeRMD(500_000, 72, 1960)).toBe(0); // born 1960 → starts at 75
    expect(computeRMD(500_000, 74, 1960)).toBe(0);
  });

  it("computes correct RMD at age 73 for born 1955", () => {
    // Born 1955 → starts at 73, divisor = 26.5
    const rmd = computeRMD(500_000, 73, 1955);
    expect(rmd).toBeCloseTo(500_000 / 26.5, 2);
    expect(rmd).toBeCloseTo(18_867.92, 0);
  });

  it("computes correct RMD at age 75 for born 1960", () => {
    // Born 1960 → starts at 75, divisor = 24.6
    const rmd = computeRMD(1_000_000, 75, 1960);
    expect(rmd).toBeCloseTo(1_000_000 / 24.6, 2);
    expect(rmd).toBeCloseTo(40_650.41, 0);
  });

  it("computes correct RMD at age 90", () => {
    // Divisor at 90 = 12.2
    const rmd = computeRMD(300_000, 90, 1950);
    expect(rmd).toBeCloseTo(300_000 / 12.2, 2);
    expect(rmd).toBeCloseTo(24_590.16, 0);
  });

  it("returns full balance when divisor is 0 or very small", () => {
    // At age > 120, divisor = 2.0
    const rmd = computeRMD(100_000, 120, 1940);
    expect(rmd).toBeCloseTo(100_000 / 2.0, 2);
  });

  it("returns 0 for zero balance", () => {
    expect(computeRMD(0, 75, 1960)).toBe(0);
  });

  it("RMD increases as a percentage of balance with age", () => {
    const balance = 500_000;
    const rmd75 = computeRMD(balance, 75, 1960);
    const rmd85 = computeRMD(balance, 85, 1960);
    const rmd95 = computeRMD(balance, 95, 1960);
    // As divisor decreases, RMD increases
    expect(rmd85).toBeGreaterThan(rmd75);
    expect(rmd95).toBeGreaterThan(rmd85);
  });
});
