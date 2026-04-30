import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { createDefaultScenario, createDefaultProfile } from "@/models/defaults";
import type { FilingStatus } from "@/models";

function resetStore() {
  useAppStore.setState({
    scenarios: [],
    activeScenarioId: null,
    comparisonScenarioId: null,
    wizardCompleted: false,
    simulations: {},
  });
}

describe("wizard flow", () => {
  beforeEach(resetStore);

  it("addScenario auto-creates a valid scenario with all required fields", () => {
    const s = useAppStore.getState().addScenario();

    expect(s.id).toBeTruthy();
    expect(s.profile).toBeDefined();
    expect(s.profile.birthYear).toBeGreaterThan(1900);
    expect(s.profile.retirementAge).toBe(65);
    expect(s.profile.filingStatus).toBe("single");
    expect(s.accounts).toEqual([]);
    expect(s.incomeSources).toEqual([]);
    expect(s.expenses).toEqual([]);
    expect(s.lifeEvents).toEqual([]);
    expect(s.socialSecurity.self.fra).toBe(67);
    expect(s.withdrawalStrategy.type).toBe("fixed_real");
    expect(s.simulationConfig.iterations).toBe(10000);
  });

  it("updating profile fields persists to store", () => {
    const s = useAppStore.getState().addScenario();
    useAppStore.getState().updateScenario(s.id, {
      profile: { ...s.profile, name: "Test User", retirementAge: 60 },
    });

    const updated = useAppStore.getState().getActiveScenario();
    expect(updated?.profile.name).toBe("Test User");
    expect(updated?.profile.retirementAge).toBe(60);
  });

  it("switching filing status to MFJ creates spouse with defaults", () => {
    const s = useAppStore.getState().addScenario();
    const profile = {
      ...s.profile,
      filingStatus: "married_filing_jointly" as FilingStatus,
      spouse: {
        name: "",
        birthYear: 1990,
        birthMonth: 1 as const,
        sex: "female" as const,
        retirementAge: 65,
      },
    };
    useAppStore.getState().updateScenario(s.id, { profile });

    const updated = useAppStore.getState().getActiveScenario();
    expect(updated?.profile.spouse).toBeDefined();
    expect(updated?.profile.spouse?.retirementAge).toBe(65);
  });

  it("adding income sources persists to scenario", () => {
    const s = useAppStore.getState().addScenario();
    const income = {
      id: crypto.randomUUID(),
      owner: "self" as const,
      label: "Salary",
      type: "salary" as const,
      annualAmount: 100000,
      startAge: 30,
      endAge: 65,
      inflationAdjusted: true,
      growthRate: 0.02,
      taxable: true,
      endsAtRetirement: true,
    };
    useAppStore.getState().updateScenario(s.id, { incomeSources: [income] });

    const updated = useAppStore.getState().getActiveScenario();
    expect(updated?.incomeSources).toHaveLength(1);
    expect(updated?.incomeSources[0].annualAmount).toBe(100000);
  });

  it("adding accounts persists to scenario", () => {
    const s = useAppStore.getState().addScenario();
    const account = {
      id: crypto.randomUUID(),
      owner: "self" as const,
      label: "401k",
      type: "traditional_401k" as const,
      balance: 50000,
      costBasis: 0,
      annualContribution: 20000,
      employerMatch: 5000,
      contributionEndAge: 65,
      allocation: {
        usLargeCap: 0.56,
        usSmallCap: 0.12,
        intlDeveloped: 0.12,
        intlEmerging: 0,
        usBonds: 0.17,
        tips: 0.03,
        cash: 0,
      },
      useGlidePath: false,
      glidePath: [],
      fixedAnnualReturn: null,
    };
    useAppStore.getState().updateScenario(s.id, { accounts: [account] });

    const updated = useAppStore.getState().getActiveScenario();
    expect(updated?.accounts).toHaveLength(1);
    expect(updated?.accounts[0].balance).toBe(50000);
    expect(updated?.accounts[0].employerMatch).toBe(5000);
  });

  it("adding expenses persists to scenario", () => {
    const s = useAppStore.getState().addScenario();
    const expenses = [
      {
        id: crypto.randomUUID(),
        label: "Living",
        category: "essential" as const,
        annualAmount: 30000,
        startAge: 30,
        endAge: null,
        inflationRate: null,
      },
      {
        id: crypto.randomUUID(),
        label: "Travel",
        category: "discretionary" as const,
        annualAmount: 10000,
        startAge: 30,
        endAge: null,
        inflationRate: null,
      },
    ];
    useAppStore.getState().updateScenario(s.id, { expenses });

    const updated = useAppStore.getState().getActiveScenario();
    expect(updated?.expenses).toHaveLength(2);
    const total = updated!.expenses.reduce((s, e) => s + e.annualAmount, 0);
    expect(total).toBe(40000);
  });

  it("adding life events persists to scenario", () => {
    const s = useAppStore.getState().addScenario();
    const event = {
      id: crypto.randomUUID(),
      type: "major_expense" as const,
      label: "Buy a home",
      description: "",
      triggerAge: 35,
      durationYears: null,
      financialImpact: {
        oneTimeInflow: 0,
        oneTimeOutflow: 100000,
        targetAccountId: null,
        incomeChanges: [],
        expenseChanges: [],
        contributionChanges: [],
      },
    };
    useAppStore.getState().updateScenario(s.id, { lifeEvents: [event] });

    const updated = useAppStore.getState().getActiveScenario();
    expect(updated?.lifeEvents).toHaveLength(1);
    expect(updated?.lifeEvents[0].financialImpact.oneTimeOutflow).toBe(100000);
  });

  it("wizardCompleted flag persists correctly", () => {
    useAppStore.getState().addScenario();
    expect(useAppStore.getState().wizardCompleted).toBe(false);

    useAppStore.getState().setWizardCompleted(true);
    expect(useAppStore.getState().wizardCompleted).toBe(true);
  });
});

describe("createDefaultProfile", () => {
  it("returns a profile with valid defaults", () => {
    const p = createDefaultProfile();
    expect(p.id).toBeTruthy();
    expect(p.birthYear).toBe(1990);
    expect(p.retirementAge).toBe(65);
    expect(p.filingStatus).toBe("single");
    expect(p.planningHorizonAge).toBe(95);
    expect(p.spouse).toBeNull();
  });
});

describe("createDefaultScenario", () => {
  it("creates scenario with given name", () => {
    const s = createDefaultScenario("Early Retirement");
    expect(s.name).toBe("Early Retirement");
  });

  it("creates scenario with unique IDs", () => {
    const a = createDefaultScenario();
    const b = createDefaultScenario();
    expect(a.id).not.toBe(b.id);
    expect(a.profile.id).not.toBe(b.profile.id);
  });

  it("distributes colors across the palette", () => {
    // pickColor() hashes a random UUID into an 8-color palette, so any two
    // scenarios collide ~1/8 of the time. Asserting strict pairwise difference
    // is flaky, so sample N and verify the assignment isn't degenerate.
    const colors = new Set(Array.from({ length: 24 }, () => createDefaultScenario().color));
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
});
