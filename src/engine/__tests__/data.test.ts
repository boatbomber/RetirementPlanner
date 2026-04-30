import { describe, it, expect } from "vitest";
import federalRaw from "@/engine/data/federal-tax-2026.yaml";
import ssRaw from "@/engine/data/social-security-tax.yaml";
import payrollRaw from "@/engine/data/payroll-tax-2026.yaml";
import penaltiesRaw from "@/engine/data/early-withdrawal-penalties.yaml";
import stateRaw from "@/engine/data/state-income-tax-2026.yaml";
import {
  FederalTaxFile,
  SocialSecurityTaxFile,
  PayrollTaxFile,
  EarlyWithdrawalPenaltiesFile,
  StateIncomeTaxFile,
} from "@/engine/data/schemas";

describe("engine data YAML files", () => {
  it("federal-tax-2026 conforms to schema", () => {
    expect(() => FederalTaxFile.parse(federalRaw)).not.toThrow();
  });

  it("social-security-tax conforms to schema", () => {
    expect(() => SocialSecurityTaxFile.parse(ssRaw)).not.toThrow();
  });

  it("payroll-tax-2026 conforms to schema", () => {
    expect(() => PayrollTaxFile.parse(payrollRaw)).not.toThrow();
  });

  it("early-withdrawal-penalties conforms to schema", () => {
    expect(() => EarlyWithdrawalPenaltiesFile.parse(penaltiesRaw)).not.toThrow();
  });

  it("state-income-tax-2026 conforms to schema", () => {
    expect(() => StateIncomeTaxFile.parse(stateRaw)).not.toThrow();
  });

  it("federal ordinary brackets are sorted with monotonically increasing rates and thresholds", () => {
    const parsed = FederalTaxFile.parse(federalRaw);
    for (const [status, brackets] of Object.entries(parsed.ordinary_brackets)) {
      for (let i = 1; i < brackets.length; i++) {
        expect(brackets[i].threshold, `${status} threshold ${i} must exceed previous`).toBeGreaterThan(
          brackets[i - 1].threshold,
        );
        expect(brackets[i].rate, `${status} rate ${i} must exceed previous`).toBeGreaterThan(
          brackets[i - 1].rate,
        );
      }
      expect(brackets[0].threshold).toBe(0);
    }
  });

  it("LTCG brackets start at $0 and are sorted", () => {
    const parsed = FederalTaxFile.parse(federalRaw);
    for (const [status, brackets] of Object.entries(parsed.ltcg_brackets)) {
      expect(brackets[0].threshold, `${status} should start at 0`).toBe(0);
      for (let i = 1; i < brackets.length; i++) {
        expect(brackets[i].threshold).toBeGreaterThan(brackets[i - 1].threshold);
        expect(brackets[i].rate).toBeGreaterThan(brackets[i - 1].rate);
      }
    }
  });

  it("each state has monotonically increasing single and MFJ brackets", () => {
    const parsed = StateIncomeTaxFile.parse(stateRaw);
    for (const [code, entry] of Object.entries(parsed.states)) {
      for (const status of ["single", "mfj"] as const) {
        const brackets = entry.brackets[status];
        for (let i = 1; i < brackets.length; i++) {
          expect(
            brackets[i].threshold,
            `${code} ${status} threshold ${i} must exceed previous`,
          ).toBeGreaterThan(brackets[i - 1].threshold);
          expect(brackets[i].rate, `${code} ${status} rate ${i} must exceed previous`).toBeGreaterThan(
            brackets[i - 1].rate,
          );
        }
      }
    }
  });

  it("preferential LTCG states declare a treatment object", () => {
    const parsed = StateIncomeTaxFile.parse(stateRaw);
    const preferential = ["HI", "MT", "AR", "ND", "NM", "SC", "VT", "WI"];
    for (const code of preferential) {
      expect(parsed.states[code]?.ltcg_treatment, `${code} should have ltcg_treatment`).toBeDefined();
    }
  });
});
