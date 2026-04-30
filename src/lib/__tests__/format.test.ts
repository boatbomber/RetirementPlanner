import { describe, it, expect } from "vitest";
import { formatPercent5pp, formatCurrency, formatPercent, formatRange } from "../format";

describe("formatPercent5pp", () => {
  it("rounds to nearest 5pp", () => {
    expect(formatPercent5pp(0.83)).toBe("85%");
    expect(formatPercent5pp(0.82)).toBe("80%");
    expect(formatPercent5pp(0.875)).toBe("90%");
    expect(formatPercent5pp(0.5)).toBe("50%");
    expect(formatPercent5pp(0.97)).toBe("95%");
    expect(formatPercent5pp(1.0)).toBe("100%");
    expect(formatPercent5pp(0.0)).toBe("0%");
  });

  it("handles boundary values", () => {
    expect(formatPercent5pp(0.025)).toBe("5%");
    expect(formatPercent5pp(0.024)).toBe("0%");
    expect(formatPercent5pp(0.975)).toBe("100%");
  });
});

describe("formatCurrency", () => {
  it("formats whole dollars by default", () => {
    const result = formatCurrency(1234);
    expect(result).toContain("1,234");
  });

  it("formats compact", () => {
    const result = formatCurrency(1_500_000, { compact: true });
    expect(result).toContain("M");
    expect(result).toContain("$");
  });
});

describe("formatPercent", () => {
  it("formats with specified decimals", () => {
    expect(formatPercent(0.856, 1)).toBe("85.6%");
    expect(formatPercent(0.85, 0)).toBe("85%");
  });
});

describe("formatRange", () => {
  it("formats a range with default formatter", () => {
    const result = formatRange(100_000, 500_000);
    expect(result).toContain("–");
  });
});
