import { describe, it, expect } from "vitest";
import { importSchema, scenarioSchema } from "@/store/schema";
import { createDefaultScenario } from "@/models/defaults";

describe("Zod import schema validation", () => {
  it("accepts a valid scenario", () => {
    const scenario = createDefaultScenario("Test");
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("accepts a valid import payload", () => {
    const scenario = createDefaultScenario("Test");
    const payload = {
      scenarios: [scenario],
      activeScenarioId: scenario.id,
      wizardCompleted: false,
    };
    const result = importSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects import with empty scenarios array", () => {
    const payload = {
      scenarios: [],
      activeScenarioId: null,
      wizardCompleted: false,
    };
    const result = importSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects import with missing required fields", () => {
    const result = importSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects scenario with missing profile", () => {
    const scenario = createDefaultScenario("Test");
    const { profile: _, ...noProfile } = scenario;
    const result = scenarioSchema.safeParse(noProfile);
    expect(result.success).toBe(false);
  });

  it("rejects scenario with invalid filing status", () => {
    const scenario = createDefaultScenario("Test");
    const mangled = {
      ...scenario,
      profile: { ...scenario.profile, filingStatus: "invalid_status" },
    };
    const result = scenarioSchema.safeParse(mangled);
    expect(result.success).toBe(false);
  });

  it("rejects scenario with invalid account type", () => {
    const scenario = createDefaultScenario("Test");
    const mangled = {
      ...scenario,
      accounts: [
        {
          id: "test",
          owner: "self",
          label: "Bad",
          type: "not_a_type",
          balance: 0,
          costBasis: 0,
          annualContribution: 0,
          employerMatch: 0,
          contributionEndAge: 65,
          allocation: {
            usLargeCap: 1,
            usSmallCap: 0,
            intlDeveloped: 0,
            intlEmerging: 0,
            usBonds: 0,
            tips: 0,
            cash: 0,
          },
          useGlidePath: false,
          glidePath: [],
          fixedAnnualReturn: null,
        },
      ],
    };
    const result = scenarioSchema.safeParse(mangled);
    expect(result.success).toBe(false);
  });

  it("rejects scenario with invalid birth month", () => {
    const scenario = createDefaultScenario("Test");
    const mangled = {
      ...scenario,
      profile: { ...scenario.profile, birthMonth: 13 },
    };
    const result = scenarioSchema.safeParse(mangled);
    expect(result.success).toBe(false);
  });

  it("accepts scenario with null spouse", () => {
    const scenario = createDefaultScenario("Test");
    expect(scenario.profile.spouse).toBeNull();
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("accepts scenario with valid spouse", () => {
    const scenario = createDefaultScenario("Test");
    scenario.profile.spouse = {
      name: "Spouse",
      birthYear: 1992,
      birthMonth: 6,
      sex: "female",
      retirementAge: 65,
    };
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("accepts scenario without a goal (goal is optional)", () => {
    const scenario = createDefaultScenario("Test");
    expect(scenario.goal).toBeUndefined();
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("accepts scenario with a fully-populated goal", () => {
    const scenario = createDefaultScenario("Test");
    scenario.goal = {
      cache: {
        earliest_retirement_age: {
          question: "earliest_retirement_age",
          solvedValue: 64,
          achievedSuccessRate: 0.91,
          converged: true,
          searchBoundsLo: 60,
          searchBoundsHi: 70,
        },
      },
      fingerprint: "abc123",
      lastSolvedAt: new Date().toISOString(),
    };
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("accepts scenario with a goal but no cache entries yet", () => {
    const scenario = createDefaultScenario("Test");
    scenario.goal = {
      cache: {},
      fingerprint: null,
      lastSolvedAt: null,
    };
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it("rejects solver result with unknown question type", () => {
    const scenario = createDefaultScenario("Test");
    scenario.goal = {
      cache: {
        // @ts-expect-error: invalid question for negative test
        not_a_real_question: {
          question: "not_a_real_question",
          solvedValue: 64,
          achievedSuccessRate: 0.91,
          converged: true,
          searchBoundsLo: 60,
          searchBoundsHi: 70,
        },
      },
      fingerprint: null,
      lastSolvedAt: null,
    };
    const result = scenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });
});
